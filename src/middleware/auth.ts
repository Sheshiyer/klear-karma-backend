import type { MiddlewareHandler } from 'hono';
import type { WorkerEnv } from '../types/env';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { verifyJWT, decodeJWT } from '../utils/jwt';

// User context interface
export interface UserContext {
  id: string;
  email: string;
  role: 'user' | 'practitioner' | 'admin';
  verified: boolean;
  iat: number;
  exp: number;
}

// Extend Hono context with user
declare module 'hono' {
  interface ContextVariableMap {
    user: UserContext;
  }
}

// Extract token from request
const extractToken = (c: any): string | null => {
  const authHeader = c.req.header('Authorization');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token;
  }
  
  // Also check for token in cookies (for web clients)
  const cookieToken = c.req.header('Cookie');
  if (cookieToken) {
    const match = cookieToken.match(/token=([^;]+)/);
    if (match) {
      return match[1];
    }
  }
  
  return null;
};

// Verify user exists and is active
const verifyUserExists = async (userId: string, env: Env): Promise<any> => {
  const userKey = `user:${userId}`;
  const userData = await env.USERS_KV.get(userKey);
  
  if (!userData) {
    throw new AuthenticationError('User not found');
  }
  
  const user = JSON.parse(userData);
  
  if (!user.active) {
    throw new AuthenticationError('Account is deactivated');
  }
  
  return user;
};

// Main authentication middleware
export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const token = extractToken(c);
  
  if (!token) {
    throw new AuthenticationError('Authentication token required');
  }
  
  try {
    // Verify JWT token
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    
    // Verify user still exists and is active
    const user = await verifyUserExists(payload.sub, c.env);
    
    // Set user context
    const userContext: UserContext = {
      id: payload.sub,
      email: user.email,
      role: user.role,
      verified: user.verified,
      iat: payload.iat,
      exp: payload.exp
    };
    
    c.set('user', userContext);
    
    await next();
    
  } catch (error: any) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    
    // Handle JWT-specific errors
    if (error.message && error.message.includes('expired')) {
      throw new AuthenticationError('Token has expired');
    }
    
    if (error.message && error.message.includes('invalid')) {
      throw new AuthenticationError('Invalid token');
    }
    
    throw new AuthenticationError('Authentication failed');
  }
};

// Optional authentication middleware (doesn't throw if no token)
export const optionalAuthMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const token = extractToken(c);
  
  if (token) {
    try {
      const payload = await verifyJWT(token, c.env.JWT_SECRET);
      const user = await verifyUserExists(payload.sub, c.env);
      
      const userContext: UserContext = {
        id: payload.sub,
        email: user.email,
        role: user.role,
        verified: user.verified,
        iat: payload.iat,
        exp: payload.exp
      };
      
      c.set('user', userContext);
    } catch (error: any) {
      // Silently ignore authentication errors for optional auth
      console.warn('Optional auth failed:', error.message);
    }
  }
  
  await next();
};

// Role-based authorization middleware
export const requireRole = (allowedRoles: string[]): MiddlewareHandler<{ Bindings: Env }> => {
  return async (c, next) => {
    const user = c.get('user');
    
    if (!user) {
      throw new AuthenticationError('Authentication required');
    }
    
    if (!allowedRoles.includes(user.role)) {
      throw new AuthorizationError(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
    }
    
    await next();
  };
};

// Require verified email
export const requireVerified: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const user = c.get('user');
  
  if (!user) {
    throw new AuthenticationError('Authentication required');
  }
  
  if (!user.verified) {
    throw new AuthorizationError('Email verification required');
  }
  
  await next();
};

// Admin only middleware
export const requireAdmin = requireRole(['admin']);

// Practitioner or admin middleware
export const requirePractitioner = requireRole(['practitioner', 'admin']);

// User, practitioner, or admin middleware
export const requireUser = requireRole(['user', 'practitioner', 'admin']);

// General authentication requirement (alias for requireUser)
export const requireAuth = requireUser;

// Resource ownership middleware (for accessing own resources)
export const requireOwnership = (resourceIdParam: string = 'id'): MiddlewareHandler<{ Bindings: Env }> => {
  return async (c, next) => {
    const user = c.get('user');
    const resourceId = c.req.param(resourceIdParam);
    
    if (!user) {
      throw new AuthenticationError('Authentication required');
    }
    
    // Admins can access any resource
    if (user.role === 'admin') {
      await next();
      return;
    }
    
    // Users can only access their own resources
    if (user.id !== resourceId) {
      throw new AuthorizationError('Access denied. You can only access your own resources.');
    }
    
    await next();
  };
};

// Practitioner ownership middleware (for practitioner-specific resources)
export const requirePractitionerOwnership = (practitionerIdParam: string = 'practitionerId'): MiddlewareHandler<{ Bindings: Env }> => {
  return async (c, next) => {
    const user = c.get('user');
    const practitionerId = c.req.param(practitionerIdParam);
    
    if (!user) {
      throw new AuthenticationError('Authentication required');
    }
    
    // Admins can access any practitioner resource
    if (user.role === 'admin') {
      await next();
      return;
    }
    
    // Practitioners can only access their own resources
    if (user.role === 'practitioner' && user.id === practitionerId) {
      await next();
      return;
    }
    
    throw new AuthorizationError('Access denied. You can only access your own practitioner resources.');
  };
};