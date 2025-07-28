import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';

// Import route handlers
import { authRoutes } from './routes/auth';
import userRoutes from './routes/users';
import practitionerRoutes from './routes/practitioners';
import appointmentRoutes from './routes/appointments';
import messageRoutes from './routes/messages';
import serviceRoutes from './routes/services';
import reviewsRoutes from './routes/reviews';
import analyticsRoutes from './routes/analytics';
import categoriesRoutes from './routes/categories';
import { apiInfoRoutes } from './routes/api-info';
import productsRoutes from './routes/products';
import adminRoutes from './routes/admin';
import { bootstrap } from './routes/bootstrap';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { authMiddleware } from './middleware/auth';

// Import types
import type { WorkerEnv } from './types/env';

// Import mock data population
import { populateMockData } from './populate-mock-data';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Global middleware
app.use('*', logger());
app.use('*', timing());
app.use('*', prettyJSON());
app.use('*', secureHeaders());
app.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Rate limiting - temporarily disabled due to KV limits on free tier
// app.use('*', rateLimiter);

// Root API info endpoint
app.get('/', (c) => {
  return c.json({
    success: true,
    data: {
      name: 'Klear Karma API',
      version: c.env.API_VERSION || '1.0.0',
      environment: c.env.ENVIRONMENT || 'development',
      timestamp: new Date().toISOString(),
      endpoints: [
        { path: '/health', description: 'Health check endpoint' },
        { path: '/api/v1', description: 'API v1 info and endpoints' },
        { path: '/api/v1/auth', description: 'Authentication endpoints' },
        { path: '/api/v1/users', description: 'User management endpoints' },
        { path: '/api/v1/practitioners', description: 'Practitioner endpoints' },
        { path: '/api/v1/appointments', description: 'Appointment booking endpoints' },
        { path: '/api/v1/messages', description: 'Messaging endpoints' },
        { path: '/api/v1/services', description: 'Service listing endpoints' },
        { path: '/api/v1/reviews', description: 'Review management endpoints' },
        { path: '/api/v1/analytics', description: 'Analytics endpoints (admin only)' },
        { path: '/api/v1/categories', description: 'Category listing endpoints' },
        { path: '/api/v1/products', description: 'Product marketplace endpoints' },
        { path: '/api/v1/admin', description: 'Admin endpoints' }
      ]
    }
  });
});

// Health check endpoints
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: c.env.API_VERSION || '1.0.0',
    environment: c.env.ENVIRONMENT || 'development'
  });
});

app.get('/api/v1/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: c.env.API_VERSION || '1.0.0',
    environment: c.env.ENVIRONMENT || 'development'
  });
});

// Mock data population endpoint
app.post('/populate-mock-data', async (c) => {
  try {
    console.log('🎯 Manual mock data population triggered');
    const summary = await populateMockData(c.env);
    
    return c.json({
      success: true,
      message: 'Mock data populated successfully',
      summary
    });
  } catch (error) {
    console.error('💥 Mock data population failed:', error);
    
    return c.json({
      success: false,
      message: 'Mock data population failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Bootstrap routes (for initial setup)
app.route('/bootstrap', bootstrap);

// API routes
app.route('/api/v1', apiInfoRoutes);
app.route('/api/v1/auth', authRoutes);

// Public routes (no authentication required)
app.route('/api/v1/practitioners', practitionerRoutes);
app.route('/api/v1/services', serviceRoutes);
app.route('/api/v1/categories', categoriesRoutes);
app.route('/api/v1/products', productsRoutes);

// Apply auth middleware to protected routes
app.use('/api/v1/users/*', authMiddleware);
app.use('/api/v1/appointments/*', authMiddleware);
app.use('/api/v1/messages/*', authMiddleware);
app.use('/api/v1/reviews/*', authMiddleware);
// Note: Admin routes handle their own authentication (JWT or API key)

app.route('/api/v1/users', userRoutes);
app.route('/api/v1/appointments', appointmentRoutes);
app.route('/api/v1/messages', messageRoutes);
app.route('/api/v1/reviews', reviewsRoutes);
app.route('/api/v1/analytics', analyticsRoutes);
app.route('/api/v1/admin', adminRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', message: 'The requested resource was not found' }, 404);
});

// Error handler
app.onError(errorHandler);

export default app;
