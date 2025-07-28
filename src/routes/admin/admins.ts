import { Context } from 'hono';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WorkerEnv } from '../../types/env';
import { AdminJWTPayload, AdminRole } from '../../types/admin';
import { AppError, HttpStatusCode } from '../../utils/error';
import { adminAuthMiddleware, requireAdminRole, requirePermission } from '../../middleware/adminAuth';
import { createAdminAuditLog } from './auth';
import { hashPassword } from '../../utils/crypto';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Apply admin authentication to all routes
app.use('*', adminAuthMiddleware);

// Schema for creating admins
const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(100),
  role: z.enum(['admin', 'superadmin', 'moderator', 'curator', 'support']),
  permissions: z.array(z.string()).optional()
});

// Schema for updating admins
const updateAdminSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  role: z.enum(['admin', 'superadmin', 'moderator', 'curator', 'support']).optional(),
  permissions: z.array(z.string()).optional(),
  active: z.boolean().optional()
});

/**
 * @route GET /admin/admins
 * @desc Get all admins with pagination and filtering
 * @access Admin, SuperAdmin
 */
app.get('/', requireAdminRole(['admin', 'superadmin']), async (c) => {
  const { page = '1', limit = '20', role, active, search } = c.req.query();
  
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100); // Max 100 per page
  const offset = (pageNum - 1) * limitNum;
  
  // List all admin keys
  const adminsList = await c.env.ADMINS_KV.list({ prefix: 'admin:' });
  let admins = [];
  
  // Get admin data for each key
  for (const key of adminsList.keys) {
    // Skip email index entries
    if (key.name.startsWith('admin:email:')) continue;
    
    const adminData = await c.env.ADMINS_KV.get(key.name);
    if (adminData) {
      const admin = JSON.parse(adminData);
      
      // Apply filters if provided
      if (role && admin.role !== role) continue;
      if (active !== undefined && admin.active !== (active === 'true')) continue;
      if (search && !(
        admin.email.toLowerCase().includes(search.toLowerCase()) ||
        admin.fullName.toLowerCase().includes(search.toLowerCase())
      )) continue;
      
      // Remove sensitive data
      const { password, ...safeAdmin } = admin;
      admins.push(safeAdmin);
    }
  }
  
  // Sort by creation date (newest first)
  admins.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  // Apply pagination
  const paginatedAdmins = admins.slice(offset, offset + limitNum);
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'admin_list_view',
    'admin',
    null,
    { count: paginatedAdmins.length, filters: { role, active, search } }
  );
  
  return c.json({
    success: true,
    admins: paginatedAdmins,
    pagination: {
      total: admins.length,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(admins.length / limitNum)
    }
  });
});

/**
 * @route GET /admin/admins/:id
 * @desc Get a specific admin by ID
 * @access Admin, SuperAdmin
 */
app.get('/:id', requireAdminRole(['admin', 'superadmin']), async (c) => {
  const adminId = c.req.param('id');
  
  // Get admin data
  const adminData = await c.env.ADMINS_KV.get(`admin:${adminId}`);
  
  if (!adminData) {
    throw new AppError('Admin not found', HttpStatusCode.NOT_FOUND);
  }
  
  const admin = JSON.parse(adminData);
  
  // Remove sensitive data
  const { password, ...safeAdmin } = admin;
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'admin_view',
    'admin',
    adminId,
    { email: admin.email }
  );
  
  return c.json({
    success: true,
    admin: safeAdmin
  });
});

/**
 * @route POST /admin/admins
 * @desc Create a new admin
 * @access SuperAdmin
 */
app.post('/', requirePermission('admin:create'), zValidator('json', createAdminSchema), async (c) => {
  const { email, password, fullName, role, permissions = [] } = c.req.valid('json');
  const currentAdmin = c.get('admin') as AdminJWTPayload;
  
  // Only superadmins can create other superadmins
  if (role === 'superadmin' && currentAdmin.role !== 'superadmin') {
    throw new AppError('Only superadmins can create superadmin accounts', HttpStatusCode.FORBIDDEN);
  }
  
  // Check if email already exists
  const existingAdminId = await c.env.ADMINS_KV.get(`admin:email:${email.toLowerCase()}`);
  
  if (existingAdminId) {
    throw new AppError('Admin with this email already exists', HttpStatusCode.CONFLICT);
  }
  
  // Create new admin
  const adminId = crypto.randomUUID();
  const hashedPassword = await hashPassword(password);
  
  const newAdmin = {
    id: adminId,
    email: email.toLowerCase(),
    password: hashedPassword,
    fullName,
    role,
    permissions,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: currentAdmin.id,
    lastLogin: null
  };
  
  // Save admin data
  await c.env.ADMINS_KV.put(`admin:${adminId}`, JSON.stringify(newAdmin));
  
  // Save email index
  await c.env.ADMINS_KV.put(`admin:email:${email.toLowerCase()}`, adminId);
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'admin_create',
    'admin',
    adminId,
    { email, role, permissions }
  );
  
  // Remove sensitive data from response
  const { password: _, ...safeAdmin } = newAdmin;
  
  return c.json({
    success: true,
    message: 'Admin created successfully',
    admin: safeAdmin
  }, 201);
});

/**
 * @route PUT /admin/admins/:id
 * @desc Update an admin
 * @access Admin, SuperAdmin
 */
app.put('/:id', requirePermission('admin:write'), zValidator('json', updateAdminSchema), async (c) => {
  const adminId = c.req.param('id');
  const updates = c.req.valid('json');
  const currentAdmin = c.get('admin') as AdminJWTPayload;
  
  // Get admin data
  const adminData = await c.env.ADMINS_KV.get(`admin:${adminId}`);
  
  if (!adminData) {
    throw new AppError('Admin not found', HttpStatusCode.NOT_FOUND);
  }
  
  const admin = JSON.parse(adminData);
  
  // Prevent self-demotion or deactivation
  if (adminId === currentAdmin.id) {
    if (updates.role && updates.role !== admin.role) {
      throw new AppError('You cannot change your own role', HttpStatusCode.FORBIDDEN);
    }
    
    if (updates.active === false) {
      throw new AppError('You cannot deactivate your own account', HttpStatusCode.FORBIDDEN);
    }
  }
  
  // Only superadmins can modify superadmin role
  if ((admin.role === 'superadmin' || updates.role === 'superadmin') && currentAdmin.role !== 'superadmin') {
    throw new AppError('Only superadmins can modify superadmin accounts', HttpStatusCode.FORBIDDEN);
  }
  
  // Track changes for audit log
  const changes: Record<string, { from: any, to: any }> = {};
  
  // Apply updates
  if (updates.fullName !== undefined && updates.fullName !== admin.fullName) {
    changes.fullName = { from: admin.fullName, to: updates.fullName };
    admin.fullName = updates.fullName;
  }
  
  if (updates.role !== undefined && updates.role !== admin.role) {
    changes.role = { from: admin.role, to: updates.role };
    admin.role = updates.role;
  }
  
  if (updates.permissions !== undefined) {
    changes.permissions = { from: admin.permissions, to: updates.permissions };
    admin.permissions = updates.permissions;
  }
  
  if (updates.active !== undefined && updates.active !== admin.active) {
    changes.active = { from: admin.active, to: updates.active };
    admin.active = updates.active;
  }
  
  // Update timestamp
  admin.updatedAt = new Date().toISOString();
  
  // Save updated admin
  await c.env.ADMINS_KV.put(`admin:${adminId}`, JSON.stringify(admin));
  
  // Create audit log if changes were made
  if (Object.keys(changes).length > 0) {
    await createAdminAuditLog(
      c,
      'admin_update',
      'admin',
      adminId,
      { changes, email: admin.email }
    );
  }
  
  // Remove sensitive data from response
  const { password, ...safeAdmin } = admin;
  
  return c.json({
    success: true,
    message: 'Admin updated successfully',
    admin: safeAdmin
  });
});

/**
 * @route DELETE /admin/admins/:id
 * @desc Delete an admin
 * @access SuperAdmin
 */
app.delete('/:id', requireAdminRole(['superadmin']), async (c) => {
  const adminId = c.req.param('id');
  const currentAdmin = c.get('admin') as AdminJWTPayload;
  
  // Prevent self-deletion
  if (adminId === currentAdmin.id) {
    throw new AppError('You cannot delete your own account', HttpStatusCode.FORBIDDEN);
  }
  
  // Get admin data for audit log
  const adminData = await c.env.ADMINS_KV.get(`admin:${adminId}`);
  
  if (!adminData) {
    throw new AppError('Admin not found', HttpStatusCode.NOT_FOUND);
  }
  
  const admin = JSON.parse(adminData);
  
  // Delete admin
  await c.env.ADMINS_KV.delete(`admin:${adminId}`);
  
  // Also delete from email index
  await c.env.ADMINS_KV.delete(`admin:email:${admin.email.toLowerCase()}`);
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'admin_delete',
    'admin',
    adminId,
    { email: admin.email, fullName: admin.fullName, role: admin.role }
  );
  
  return c.json({
    success: true,
    message: 'Admin deleted successfully'
  });
});

export { app as adminRoutes };