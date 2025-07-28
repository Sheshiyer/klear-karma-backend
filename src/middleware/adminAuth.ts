import type { Context, Next } from 'hono';
import type { WorkerEnv } from '../types/env';
import type { AdminJWTPayload, AdminRole, Permission } from '../types/admin';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { AppError } from '../utils/error';
import { HttpStatusCode } from '../utils/error';

// Extend Hono context with admin variables
declare module 'hono' {
  interface ContextVariableMap {
    admin?: AdminJWTPayload;
  }
}

/**
 * Extract and verify the admin JWT token from the request
 */
async function extractAndVerifyToken(c: Context<{ Bindings: WorkerEnv }>): Promise<AdminJWTPayload | null> {
  // Check for token in Authorization header
  const authHeader = c.req.header('Authorization');
  let token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  
  // If no token in header, check cookies
  if (!token) {
    token = getCookie(c, 'admin_token') || null;
  }
  
  // If still no token, return null
  if (!token) {
    return null;
  }
  
  try {
    // Verify the token
    const payload = await verify(token, c.env.JWT_SECRET);
    return payload as unknown as AdminJWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Check if the admin exists and is active
 */
async function checkAdminExists(c: Context<{ Bindings: WorkerEnv }>, adminId: string): Promise<boolean> {
  const adminData = await c.env.ADMINS_KV.get(`admin:${adminId}`);
  
  if (!adminData) {
    return false;
  }
  
  const admin = JSON.parse(adminData);
  return admin.active === true;
}

/**
 * Middleware to authenticate admin users
 */
export async function adminAuthMiddleware(c: Context<{ Bindings: WorkerEnv }>, next: Next) {
  const payload = await extractAndVerifyToken(c);
  
  if (!payload) {
    throw new AuthenticationError('Authentication required');
  }
  
  // Check if admin still exists and is active
  const adminExists = await checkAdminExists(c, payload.id);
  
  if (!adminExists) {
    throw new AuthenticationError('Admin account not found or inactive');
  }
  
  // Set admin data in context variables
  c.set('admin', payload);
  
  await next();
}

/**
 * Optional admin authentication middleware
 * Will set admin data if token is valid, but won't throw if missing
 */
export async function optionalAdminAuthMiddleware(c: Context<{ Bindings: WorkerEnv }>, next: Next) {
  const payload = await extractAndVerifyToken(c);
  
  if (payload) {
    // Check if admin still exists and is active
    const adminExists = await checkAdminExists(c, payload.id);
    
    if (adminExists) {
      // Set admin data in context variables
      c.set('admin', payload);
    }
  }
  
  await next();
}

/**
 * Middleware to require a specific admin role
 */
export function requireAdminRole(role: AdminRole) {
  return async function(c: Context<{ Bindings: WorkerEnv }>, next: Next) {
    const admin = c.get('admin') as AdminJWTPayload;
    
    if (!admin) {
      throw new AuthenticationError('Unauthorized');
    }
    
    // Check if admin has the required role
    if (admin.role !== role && admin.role !== 'superadmin') {
      throw new AuthorizationError('Insufficient permissions');
    }
    
    await next();
  };
}

/**
 * Middleware to require superadmin role
 */
export function requireSuperAdmin() {
  return async function(c: Context<{ Bindings: WorkerEnv }>, next: Next) {
    const admin = c.get('admin') as AdminJWTPayload;
    
    if (!admin) {
      throw new AuthenticationError('Unauthorized');
    }
    
    // Check if admin has superadmin role
    if (admin.role !== 'superadmin') {
      throw new AuthorizationError('Insufficient permissions');
    }
    
    await next();
  };
}

/**
 * Middleware to require admin role or higher
 */
export function requireAdmin() {
  return async function(c: Context<{ Bindings: WorkerEnv }>, next: Next) {
    const admin = c.get('admin') as AdminJWTPayload;
    
    if (!admin) {
      throw new AuthenticationError('Unauthorized');
    }
    
    // Check if admin has admin or superadmin role
    if (admin.role !== 'admin' && admin.role !== 'superadmin') {
      throw new AuthorizationError('Insufficient permissions');
    }
    
    await next();
  };
}

/**
 * Middleware to require moderator role or higher
 */
export function requireModerator() {
  return async function(c: Context<{ Bindings: WorkerEnv }>, next: Next) {
    const admin = c.get('admin') as AdminJWTPayload;
    
    if (!admin) {
      throw new AuthenticationError('Unauthorized');
    }
    
    // Check if admin has moderator, admin or superadmin role
    if (admin.role !== 'moderator' && admin.role !== 'admin' && admin.role !== 'superadmin') {
      throw new AuthorizationError('Insufficient permissions');
    }
    
    await next();
  };
}

/**
 * Middleware to require curator role or higher
 */
export function requireCurator() {
  return async function(c: Context<{ Bindings: WorkerEnv }>, next: Next) {
    const admin = c.get('admin') as AdminJWTPayload;
    
    if (!admin) {
      throw new AuthenticationError('Unauthorized');
    }
    
    // Check if admin has curator, moderator, admin or superadmin role
    if (admin.role !== 'curator' && admin.role !== 'moderator' && admin.role !== 'admin' && admin.role !== 'superadmin') {
      throw new AuthorizationError('Insufficient permissions');
    }
    
    await next();
  };
}

/**
 * Middleware to require support role or higher
 */
export function requireSupport() {
  return async function(c: Context<{ Bindings: WorkerEnv }>, next: Next) {
    const admin = c.get('admin') as AdminJWTPayload;
    
    if (!admin) {
      throw new AuthenticationError('Unauthorized');
    }
    
    // All admin roles have at least support level access
    await next();
  };
}

/**
 * Middleware to require a specific permission
 */
export function requirePermission(permission: Permission) {
  return async function(c: Context<{ Bindings: WorkerEnv }>, next: Next) {
    const admin = c.get('admin') as AdminJWTPayload;
    
    if (!admin) {
      throw new AppError('Unauthorized', HttpStatusCode.UNAUTHORIZED);
    }
    
    // Superadmins bypass permission checks
    if (admin.role === 'superadmin') {
      await next();
      return;
    }
    
    // Check if admin has the required permission
    if (!admin.permissions.includes(permission)) {
      throw new AppError(`Missing required permission: ${permission}`, HttpStatusCode.FORBIDDEN);
    }
    
    await next();
  };
}

/**
 * Middleware to require all specified permissions
 */
export function requireAllPermissions(permissions: Permission[]) {
  return async function(c: Context<{ Bindings: WorkerEnv }>, next: Next) {
    const admin = c.get('admin') as AdminJWTPayload;
    
    if (!admin) {
      throw new AppError('Unauthorized', HttpStatusCode.UNAUTHORIZED);
    }
    
    // Superadmins bypass permission checks
    if (admin.role === 'superadmin') {
      await next();
      return;
    }
    
    // Check if admin has all required permissions
    const hasAllPermissions = permissions.every(permission => 
      admin.permissions.includes(permission)
    );
    
    if (!hasAllPermissions) {
      throw new AppError('Insufficient permissions', HttpStatusCode.FORBIDDEN);
    }
    
    await next();
  };
}

/**
 * Middleware to require any of the specified permissions
 */
export function requireAnyPermission(permissions: Permission[]) {
  return async function(c: Context<{ Bindings: WorkerEnv }>, next: Next) {
    const admin = c.get('admin') as AdminJWTPayload;
    
    if (!admin) {
      throw new AppError('Unauthorized', HttpStatusCode.UNAUTHORIZED);
    }
    
    // Superadmins bypass permission checks
    if (admin.role === 'superadmin') {
      await next();
      return;
    }
    
    // Check if admin has any of the required permissions
    const hasAnyPermission = permissions.some(permission => 
      admin.permissions.includes(permission)
    );
    
    if (!hasAnyPermission) {
      throw new AppError('Insufficient permissions', HttpStatusCode.FORBIDDEN);
    }
    
    await next();
  };
}