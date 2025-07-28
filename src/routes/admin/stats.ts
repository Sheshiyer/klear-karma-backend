// Admin statistics routes
import { Hono } from 'hono';
import { WorkerEnv } from '../../types/env';
import { adminKeyAuthMiddleware } from '../../middleware/adminKeyAuth';
import { adminAuthMiddleware } from '../../middleware/adminAuth';
import { asyncHandler } from '../../middleware/errorHandler';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Apply admin authentication (supports both X-Admin-Key and JWT)
app.use('*', async (c, next) => {
  const adminKey = c.req.header('X-Admin-Key');
  
  if (adminKey) {
    // Use admin key authentication
    await adminKeyAuthMiddleware(c, next);
  } else {
    // Use JWT admin authentication
    await adminAuthMiddleware(c, next);
  }
});

// Get basic admin statistics
app.get('/', asyncHandler(async (c) => {
  // Get counts for various entities
  const [usersList, practitionersList, appointmentsList, productsList] = await Promise.all([
    c.env.USERS_KV.list({ prefix: 'user:', limit: 1000 }),
    c.env.PRACTITIONERS_KV.list({ prefix: 'practitioner:', limit: 1000 }),
    c.env.APPOINTMENTS_KV.list({ prefix: 'appointment:', limit: 1000 }),
    c.env.PRODUCTS_KV.list({ prefix: 'product:', limit: 1000 })
  ]);
  
  // Count verified vs unverified practitioners
  let verifiedPractitioners = 0;
  let unverifiedPractitioners = 0;
  
  for (const key of practitionersList.keys) {
    const practitionerData = await c.env.PRACTITIONERS_KV.get(key.name);
    if (practitionerData) {
      const practitioner = JSON.parse(practitionerData);
      if (practitioner.verified) {
        verifiedPractitioners++;
      } else {
        unverifiedPractitioners++;
      }
    }
  }
  
  // Count verified vs unverified products
  let verifiedProducts = 0;
  let unverifiedProducts = 0;
  
  for (const key of productsList.keys) {
    const productData = await c.env.PRODUCTS_KV.get(key.name);
    if (productData) {
      const product = JSON.parse(productData);
      if (product.verified) {
        verifiedProducts++;
      } else {
        unverifiedProducts++;
      }
    }
  }
  
  return c.json({
    success: true,
    data: {
      users: {
        total: usersList.keys.length
      },
      practitioners: {
        total: practitionersList.keys.length,
        verified: verifiedPractitioners,
        unverified: unverifiedPractitioners
      },
      appointments: {
        total: appointmentsList.keys.length
      },
      products: {
        total: productsList.keys.length,
        verified: verifiedProducts,
        unverified: unverifiedProducts
      }
    }
  });
}));

export { app as statsRoutes };