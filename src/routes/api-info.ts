import { Hono } from 'hono';
import type { WorkerEnv } from '../types/env';

const app = new Hono<{ Bindings: WorkerEnv }>();

// API Info endpoint
app.get('/', (c) => {
  return c.json({
    success: true,
    data: {
      name: 'Klear Karma API',
      version: c.env.API_VERSION || '1.0.0',
      environment: c.env.ENVIRONMENT || 'development',
      timestamp: new Date().toISOString(),
      endpoints: [
        { path: '/api/v1/auth', description: 'Authentication endpoints' },
        { path: '/api/v1/users', description: 'User management endpoints' },
        { path: '/api/v1/practitioners', description: 'Practitioner endpoints' },
        { path: '/api/v1/appointments', description: 'Appointment booking endpoints' },
        { path: '/api/v1/messages', description: 'Messaging endpoints' },
        { path: '/api/v1/services', description: 'Service listing endpoints' },
        { path: '/api/v1/reviews', description: 'Review management endpoints' },
        { path: '/api/v1/analytics', description: 'Analytics endpoints (admin only)' },
        { path: '/api/v1/categories', description: 'Category listing endpoints' }
      ]
    }
  });
});

export { app as apiInfoRoutes };