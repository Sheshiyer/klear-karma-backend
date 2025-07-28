import { Context } from 'hono';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WorkerEnv } from '../../types/env';
// import { AdminJWTPayload, AdminRole } from '../../types/admin'; // Not needed for admin key auth
import { AppError, HttpStatusCode } from '../../utils/error';
import { adminKeyAuthMiddleware } from '../../middleware/adminKeyAuth';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Test endpoint without auth to check basic functionality
app.get('/test', async (c) => {
  try {
    return c.json({
      success: true,
      message: 'Basic route is working!',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test route error:', error);
    return c.json({ error: 'Test route failed', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Even simpler test
app.get('/simple', (c) => {
  return c.text('Simple route works');
});

// Apply admin key authentication to all other routes
app.use('*', adminKeyAuthMiddleware);

// Schema for updating users
const updateUserSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  verified: z.boolean().optional(),
  active: z.boolean().optional(),
  role: z.enum(['user', 'practitioner']).optional()
});

/**
 * @route GET /admin/users
 * @desc Get all users with pagination and filtering
 * @access Admin
 */
app.get('/', async (c) => {
  const { page = '1', limit = '20', role, verified, active, search } = c.req.query();
  
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100); // Max 100 per page
  const offset = (pageNum - 1) * limitNum;
  
  // List all user keys
  const usersList = await c.env.USERS_KV.list({ prefix: 'user:' });
  let users = [];
  
  // Get user data for each key
  for (const key of usersList.keys) {
    const userData = await c.env.USERS_KV.get(key.name);
    if (userData) {
      const user = JSON.parse(userData);
      
      // Apply filters if provided
      if (role && user.role !== role) continue;
      if (verified !== undefined && user.verified !== (verified === 'true')) continue;
      if (active !== undefined && user.active !== (active === 'true')) continue;
      if (search && !(
        user.email.toLowerCase().includes(search.toLowerCase()) ||
        user.fullName.toLowerCase().includes(search.toLowerCase())
      )) continue;
      
      users.push({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        verified: user.verified,
        active: user.active,
        createdAt: user.createdAt
      });
    }
  }
  
  // Sort by creation date (newest first)
  users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  // Apply pagination
  const paginatedUsers = users.slice(offset, offset + limitNum);
  
  // TODO: Create audit log for admin key authentication
  
  return c.json({
    success: true,
    users: paginatedUsers,
    pagination: {
      total: users.length,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(users.length / limitNum)
    }
  });
});

/**
 * @route GET /admin/users/:id
 * @desc Get a specific user by ID
 * @access Admin
 */
app.get('/:id', async (c) => {
  const userId = c.req.param('id');
  
  // Get user data
  const userData = await c.env.USERS_KV.get(`user:${userId}`);
  
  if (!userData) {
    throw new AppError('User not found', HttpStatusCode.NOT_FOUND);
  }
  
  const user = JSON.parse(userData);
  
  // TODO: Create audit log for admin key authentication
  
  return c.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      verified: user.verified,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLogin: user.lastLogin || null
    }
  });
});

/**
 * @route PUT /admin/users/:id
 * @desc Update a user
 * @access Admin
 */
app.put('/:id', zValidator('json', updateUserSchema), async (c) => {
  const userId = c.req.param('id');
  const updates = c.req.valid('json');
  
  // Get user data
  const userData = await c.env.USERS_KV.get(`user:${userId}`);
  
  if (!userData) {
    throw new AppError('User not found', HttpStatusCode.NOT_FOUND);
  }
  
  const user = JSON.parse(userData);
  
  // Track changes for audit log
  const changes: Record<string, { from: any, to: any }> = {};
  
  // Apply updates
  if (updates.fullName !== undefined && updates.fullName !== user.fullName) {
    changes.fullName = { from: user.fullName, to: updates.fullName };
    user.fullName = updates.fullName;
  }
  
  if (updates.verified !== undefined && updates.verified !== user.verified) {
    changes.verified = { from: user.verified, to: updates.verified };
    user.verified = updates.verified;
    
    // If verifying a user, record the verification
    if (updates.verified) {
      user.verifiedBy = 'admin-key';
      user.verifiedAt = new Date().toISOString();
    } else {
      user.verifiedBy = null;
      user.verifiedAt = null;
    }
  }
  
  if (updates.active !== undefined && updates.active !== user.active) {
    changes.active = { from: user.active, to: updates.active };
    user.active = updates.active;
  }
  
  // Role changes (admin key has full permissions)
  if (updates.role !== undefined && updates.role !== user.role) {
    changes.role = { from: user.role, to: updates.role };
    user.role = updates.role;
  }
  
  // Update timestamp
  user.updatedAt = new Date().toISOString();
  
  // Save updated user
  await c.env.USERS_KV.put(`user:${userId}`, JSON.stringify(user));
  
  // TODO: Create audit log for admin key authentication if changes were made
  
  return c.json({
    success: true,
    message: 'User updated successfully',
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      verified: user.verified,
      active: user.active,
      updatedAt: user.updatedAt
    }
  });
});

/**
 * @route DELETE /admin/users/:id
 * @desc Delete a user
 * @access Admin
 */
app.delete('/:id', async (c) => {
  const userId = c.req.param('id');
  
  // Get user data for audit log
  const userData = await c.env.USERS_KV.get(`user:${userId}`);
  
  if (!userData) {
    throw new AppError('User not found', HttpStatusCode.NOT_FOUND);
  }
  
  const user = JSON.parse(userData);
  
  // Delete user
  await c.env.USERS_KV.delete(`user:${userId}`);
  
  // Also delete from email index
  await c.env.USERS_KV.delete(`user:email:${user.email.toLowerCase()}`);
  
  // TODO: Create audit log for admin key authentication
  
  return c.json({
    success: true,
    message: 'User deleted successfully'
  });
});

export { app as userRoutes };