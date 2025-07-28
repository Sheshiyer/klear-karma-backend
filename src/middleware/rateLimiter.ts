import type { MiddlewareHandler } from 'hono';
import type { WorkerEnv } from '../types/env';
import { RateLimitError } from './errorHandler';

// Rate limit configuration
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (c: any) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

// Default rate limit configurations for different endpoints
const rateLimitConfigs: Record<string, RateLimitConfig> = {
  // Authentication endpoints - stricter limits
  '/api/v1/auth/login': {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 50, // 50 attempts per 15 minutes (increased for testing)
  },
  '/api/v1/auth/register': {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50, // 50 registrations per hour (increased for testing)
  },
  '/api/v1/auth/forgot-password': {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50, // 50 password reset requests per hour (increased for testing)
  },
  
  // API endpoints - moderate limits
  '/api/v1/appointments': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute
  },
  '/api/v1/messages': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 messages per minute
  },
  
  // Default for all other endpoints
  default: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  }
};

// Generate rate limit key
const generateKey = (c: any, config: RateLimitConfig): string => {
  if (config.keyGenerator) {
    return config.keyGenerator(c);
  }
  
  // Use IP address as default key
  const ip = c.req.header('CF-Connecting-IP') || 
             c.req.header('X-Forwarded-For') || 
             c.req.header('X-Real-IP') || 
             'unknown';
  
  const path = c.req.path;
  return `rate_limit:${ip}:${path}`;
};

// Get rate limit configuration for a path
const getRateLimitConfig = (path: string): RateLimitConfig => {
  // Check for exact match first
  if (rateLimitConfigs[path]) {
    return rateLimitConfigs[path];
  }
  
  // Check for pattern matches
  for (const [pattern, config] of Object.entries(rateLimitConfigs)) {
    if (pattern !== 'default' && path.startsWith(pattern)) {
      return config;
    }
  }
  
  return rateLimitConfigs.default;
};

// Rate limiter middleware
export const rateLimiter: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  // Skip rate limiting in development mode
  if (c.env.ENVIRONMENT === 'development') {
    await next();
    return;
  }
  
  const path = c.req.path;
  const config = getRateLimitConfig(path);
  const key = generateKey(c, config);
  
  try {
    // Get current count from KV
    const currentData = await c.env.ANALYTICS_KV.get(key);
    const now = Date.now();
    
    let requestCount = 0;
    let windowStart = now;
    
    if (currentData) {
      const data = JSON.parse(currentData);
      const timeSinceWindowStart = now - data.windowStart;
      
      if (timeSinceWindowStart < config.windowMs) {
        // Still within the current window
        requestCount = data.count;
        windowStart = data.windowStart;
      }
      // If outside window, reset count (requestCount = 0, windowStart = now)
    }
    
    // Check if limit exceeded
    if (requestCount >= config.maxRequests) {
      // Set rate limit headers
      c.header('X-RateLimit-Limit', config.maxRequests.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', (windowStart + config.windowMs).toString());
      
      throw new RateLimitError(`Rate limit exceeded. Maximum ${config.maxRequests} requests per ${config.windowMs / 1000} seconds.`);
    }
    
    // Increment counter
    const newCount = requestCount + 1;
    const rateLimitData = {
      count: newCount,
      windowStart,
      lastRequest: now
    };
    
    // Store updated count with TTL
    const ttl = Math.ceil(config.windowMs / 1000) + 10; // Add 10 seconds buffer
    await c.env.ANALYTICS_KV.put(key, JSON.stringify(rateLimitData), {
      expirationTtl: ttl
    });
    
    // Set rate limit headers
    c.header('X-RateLimit-Limit', config.maxRequests.toString());
    c.header('X-RateLimit-Remaining', (config.maxRequests - newCount).toString());
    c.header('X-RateLimit-Reset', (windowStart + config.windowMs).toString());
    
    await next();
    
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    
    // If KV is unavailable, log error but don't block requests
    console.error('Rate limiter error:', error);
    await next();
  }
};

// Create custom rate limiter for specific endpoints
export const createRateLimiter = (config: RateLimitConfig): MiddlewareHandler<{ Bindings: Env }> => {
  return async (c, next) => {
    // Skip rate limiting in development mode
    if (c.env.ENVIRONMENT === 'development') {
      await next();
      return;
    }
    
    const key = generateKey(c, config);
    
    try {
      const currentData = await c.env.ANALYTICS_KV.get(key);
      const now = Date.now();
      
      let requestCount = 0;
      let windowStart = now;
      
      if (currentData) {
        const data = JSON.parse(currentData);
        const timeSinceWindowStart = now - data.windowStart;
        
        if (timeSinceWindowStart < config.windowMs) {
          requestCount = data.count;
          windowStart = data.windowStart;
        }
      }
      
      if (requestCount >= config.maxRequests) {
        c.header('X-RateLimit-Limit', config.maxRequests.toString());
        c.header('X-RateLimit-Remaining', '0');
        c.header('X-RateLimit-Reset', (windowStart + config.windowMs).toString());
        
        throw new RateLimitError(`Rate limit exceeded. Maximum ${config.maxRequests} requests per ${config.windowMs / 1000} seconds.`);
      }
      
      const newCount = requestCount + 1;
      const rateLimitData = {
        count: newCount,
        windowStart,
        lastRequest: now
      };
      
      const ttl = Math.ceil(config.windowMs / 1000) + 10;
      await c.env.ANALYTICS_KV.put(key, JSON.stringify(rateLimitData), {
        expirationTtl: ttl
      });
      
      c.header('X-RateLimit-Limit', config.maxRequests.toString());
      c.header('X-RateLimit-Remaining', (config.maxRequests - newCount).toString());
      c.header('X-RateLimit-Reset', (windowStart + config.windowMs).toString());
      
      await next();
      
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      
      console.error('Rate limiter error:', error);
      await next();
    }
  };
};