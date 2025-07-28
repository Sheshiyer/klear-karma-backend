import type { MiddlewareHandler } from 'hono';
import type { WorkerEnv } from '../types/env';
import { AuthenticationError } from './errorHandler';

// Extend Hono context with admin key auth flag
declare module 'hono' {
  interface ContextVariableMap {
    adminKeyAuth: boolean;
  }
}

/**
 * Admin API Key Authentication Middleware
 * 
 * This middleware validates the X-Admin-Key header against the ADMIN_API_KEY environment variable.
 * This is used for admin endpoints that need simple API key authentication instead of JWT tokens.
 */
export const adminKeyAuthMiddleware: MiddlewareHandler<{ Bindings: WorkerEnv }> = async (c, next) => {
  const adminKey = c.req.header('X-Admin-Key');
  
  console.log('🔑 Admin Key Auth Debug:');
  console.log('  Received key:', adminKey);
  console.log('  Expected key:', c.env.ADMIN_API_KEY);
  console.log('  Keys match:', adminKey === c.env.ADMIN_API_KEY);
  
  if (!adminKey) {
    throw new AuthenticationError('Admin API key required');
  }
  
  if (adminKey !== c.env.ADMIN_API_KEY) {
    throw new AuthenticationError('Invalid admin API key');
  }
  
  // Set a flag to indicate admin key authentication was successful
  c.set('adminKeyAuth', true);
  
  await next();
};

/**
 * Optional admin key authentication middleware
 * Will set admin key auth flag if key is valid, but won't throw if missing
 */
export const optionalAdminKeyAuthMiddleware: MiddlewareHandler<{ Bindings: WorkerEnv }> = async (c, next) => {
  const adminKey = c.req.header('X-Admin-Key');
  
  if (adminKey && adminKey === c.env.ADMIN_API_KEY) {
    c.set('adminKeyAuth', true);
  }
  
  await next();
}