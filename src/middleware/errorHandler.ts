import type { ErrorHandler } from 'hono';
import type { WorkerEnv } from '../types/env';

// Custom error classes
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public field?: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}

// Error response interface
interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  timestamp: string;
  requestId?: string;
  details?: any;
}

// Main error handler
export const errorHandler: ErrorHandler = (err, c) => {
  console.error('Error occurred:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    url: c.req.url,
    method: c.req.method,
    timestamp: new Date().toISOString()
  });

  // Default error response
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details: any = undefined;

  // Handle different error types
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code || err.name.toUpperCase();
    message = err.message;
  } else if (err instanceof SyntaxError) {
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
  } else if (err.name === 'TypeError' && err.message.includes('fetch')) {
    statusCode = 503;
    errorCode = 'SERVICE_UNAVAILABLE';
    message = 'External service unavailable';
  }

  // Don't expose internal errors in production
  const isProduction = c.env?.ENVIRONMENT === 'production';
  if (isProduction && statusCode === 500) {
    message = 'Internal server error';
    details = undefined;
  } else if (!isProduction) {
    details = {
      stack: err.stack,
      name: err.name
    };
  }

  const errorResponse: ErrorResponse = {
    error: errorCode,
    message,
    code: errorCode,
    timestamp: new Date().toISOString(),
    requestId: c.get('requestId') || crypto.randomUUID(),
    ...(details && { details })
  };

  return c.json(errorResponse, statusCode as any);
};

// Helper function to throw errors
export const throwError = (message: string, statusCode: number = 500, code?: string): never => {
  throw new AppError(message, statusCode, code);
};

// Async error wrapper
import type { Context, Next } from 'hono';

export const asyncHandler = <T = any>(fn: (c: Context<{ Bindings: WorkerEnv }>, next?: Next) => Promise<T>) => {
  return async (c: Context<{ Bindings: WorkerEnv }>, next?: Next) => {
    try {
      return await fn(c, next);
    } catch (error) {
      throw error;
    }
  };
};