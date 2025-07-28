/**
 * Bootstrap Routes
 * 
 * These routes are used for initial setup and should be removed or secured in production
 */

import { Hono } from 'hono';
import { WorkerEnv } from '../types/env';
import { createInitialAdmin, createCustomAdmin } from '../../scripts/create-initial-admin';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const bootstrap = new Hono<{ Bindings: WorkerEnv }>();

// Schema for custom admin creation
const customAdminSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  adminKey: z.string().min(1, 'Admin key is required')
});

/**
 * Create initial superadmin user
 * GET /bootstrap/create-admin
 * 
 * This endpoint creates the first admin user if none exist
 * Should be secured or removed in production
 */
bootstrap.get('/create-admin', async (c) => {
  try {
    const result = await createInitialAdmin(c.env);
    
    if (result.success) {
      return c.json({
        success: true,
        message: result.message,
        admin: result.admin,
        credentials: result.credentials,
        warning: 'Please change the password after first login and remove this endpoint in production!'
      }, 201);
    } else {
      return c.json({
        success: false,
        message: result.message
      }, 400);
    }
  } catch (error) {
    console.error('Bootstrap create admin error:', error);
    return c.json({
      success: false,
      message: 'Failed to create initial admin',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * Create custom admin user
 * POST /bootstrap/create-custom-admin
 * 
 * This endpoint allows creating a custom admin user with provided credentials
 * Requires the ADMIN_API_KEY for security
 */
bootstrap.post('/create-custom-admin', 
  zValidator('json', customAdminSchema),
  async (c) => {
    try {
      const { email, password, fullName, adminKey } = c.req.valid('json');
      
      // Verify admin key
      if (adminKey !== c.env.ADMIN_API_KEY) {
        return c.json({
          success: false,
          message: 'Invalid admin key'
        }, 401);
      }
      
      const result = await createCustomAdmin(c.env, email, password, fullName);
      
      if (result.success) {
        return c.json({
          success: true,
          message: result.message,
          admin: result.admin
        }, 201);
      } else {
        return c.json({
          success: false,
          message: result.message
        }, 400);
      }
    } catch (error) {
      console.error('Bootstrap create custom admin error:', error);
      return c.json({
        success: false,
        message: 'Failed to create custom admin',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  }
);

/**
 * Check if any admin users exist
 * GET /bootstrap/check-admins
 */
bootstrap.get('/check-admins', async (c) => {
  try {
    const adminList = await c.env.ADMINS_KV.list({ prefix: 'admin:' });
    const adminCount = adminList.keys.length;
    
    return c.json({
      success: true,
      data: {
        adminCount,
        hasAdmins: adminCount > 0,
        needsBootstrap: adminCount === 0
      }
    });
  } catch (error) {
    console.error('Bootstrap check admins error:', error);
    return c.json({
      success: false,
      message: 'Failed to check admin status',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export { bootstrap };