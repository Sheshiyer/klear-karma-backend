import { Context } from 'hono';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WorkerEnv } from '../../types/env';
import { AdminJWTPayload, AdminRole, AuditAction, AuditLog } from '../../types/admin';
import { AppError, HttpStatusCode } from '../../utils/error';
import { adminAuthMiddleware } from '../../middleware/adminAuth';
import bcrypt from 'bcryptjs';
// import { rateLimiter } from '../../middleware/rateLimiter';

const app = new Hono<{ Bindings: WorkerEnv }>();

/**
 * Create an audit log entry for admin actions
 */
async function createAdminAuditLog(
  c: Context<{ Bindings: WorkerEnv }>,
  action: AuditAction,
  targetType: string,
  targetId: string | null,
  details: Record<string, any> = {}
): Promise<void> {
  const admin = c.get('admin') as AdminJWTPayload;
  
  if (!admin) {
    return;
  }
  
  const auditLog: AuditLog = {
    id: crypto.randomUUID(),
    adminId: admin.id,
    adminEmail: admin.email,
    action,
    targetType: targetType as any,
    targetId,
    details,
    ipAddress: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown',
    userAgent: c.req.header('User-Agent') || 'unknown',
    timestamp: new Date().toISOString()
  };
  
  await c.env.AUDIT_LOGS_KV.put(
    `audit:${auditLog.id}`,
    JSON.stringify(auditLog)
  );
  
  // Also store in time-based index
  await c.env.AUDIT_LOGS_KV.put(
    `audit:time:${auditLog.timestamp}:${auditLog.id}`,
    auditLog.id,
    { expirationTtl: 60 * 60 * 24 * 90 } // 90 days retention
  );
  
  // Store in admin index
  await c.env.AUDIT_LOGS_KV.put(
    `audit:admin:${auditLog.adminId}:${auditLog.timestamp}:${auditLog.id}`,
    auditLog.id,
    { expirationTtl: 60 * 60 * 24 * 90 } // 90 days retention
  );
}

// Login schema validation
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

/**
 * @route POST /admin/auth/login
 * @desc Login as admin
 * @access Public
 */
app.post('/login', /* rateLimiter, */ zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  
  // Get admin from KV
  const adminKey = `admin:email:${email.toLowerCase()}`;
  const adminId = await c.env.ADMINS_KV.get(adminKey);
  
  if (!adminId) {
    throw new AppError('Invalid credentials', HttpStatusCode.UNAUTHORIZED);
  }
  
  const adminData = await c.env.ADMINS_KV.get(`admin:${adminId}`);
  
  if (!adminData) {
    throw new AppError('Admin account not found', HttpStatusCode.UNAUTHORIZED);
  }
  
  const admin = JSON.parse(adminData);
  
  // Check if admin is active
  if (!admin.isActive) {
    throw new AppError('Admin account is inactive', HttpStatusCode.UNAUTHORIZED);
  }
  
  // Verify password
  const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
  
  if (!isPasswordValid) {
    throw new AppError('Invalid credentials', HttpStatusCode.UNAUTHORIZED);
  }
  
  // Update last login time
  admin.lastLogin = new Date().toISOString();
  await c.env.ADMINS_KV.put(`admin:${admin.id}`, JSON.stringify(admin));
  
  // Generate JWT token
  const payload: AdminJWTPayload = {
    id: admin.id,
    email: admin.email,
    role: admin.role as AdminRole,
    permissions: admin.permissions,
    exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60) // 8 hours from now
  };

  const token = await sign(payload, c.env.JWT_SECRET);
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'login',
    'admin',
    admin.id,
    { email: admin.email }
  );
  
  return c.json({
    success: true,
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
      permissions: admin.permissions
    }
  });
});

/**
 * @route GET /admin/auth/me
 * @desc Get current admin profile
 * @access Private
 */
app.get('/me', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as AdminJWTPayload;
  
  // Get full admin data
  const adminData = await c.env.ADMINS_KV.get(`admin:${admin.id}`);
  
  if (!adminData) {
    throw new AppError('Admin account not found', HttpStatusCode.NOT_FOUND);
  }
  
  const adminFull = JSON.parse(adminData);
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'admin_view',
    'admin',
    admin.id,
    { self: true }
  );
  
  return c.json({
    success: true,
    admin: {
      id: adminFull.id,
      email: adminFull.email,
      fullName: adminFull.fullName,
      role: adminFull.role,
      permissions: adminFull.permissions,
      lastLogin: adminFull.lastLogin,
      createdAt: adminFull.createdAt
    }
  });
});

/**
 * @route GET /admin/auth/debug
 * @desc Debug admin data (temporary)
 * @access Public
 */
app.get('/debug', async (c) => {
  const adminKey = `admin:email:admin@klearkarma.com`;
  const adminId = await c.env.ADMINS_KV.get(adminKey);
  
  if (!adminId) {
    return c.json({ error: 'Admin not found by email' });
  }
  
  const adminData = await c.env.ADMINS_KV.get(`admin:${adminId}`);
  
  if (!adminData) {
    return c.json({ error: 'Admin data not found by ID', adminId });
  }
  
  const admin = JSON.parse(adminData);
  
  return c.json({
    adminId,
    admin: {
      ...admin,
      passwordHash: admin.passwordHash ? admin.passwordHash.substring(0, 20) + '...' : 'missing'
    }
  });
});

export { app as authRoutes, createAdminAuditLog };