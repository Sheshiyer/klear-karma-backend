// Admin product management routes
import { Hono } from 'hono';
import { WorkerEnv } from '../../types/env';
import { adminKeyAuthMiddleware } from '../../middleware/adminKeyAuth';
import { adminAuthMiddleware } from '../../middleware/adminAuth';
import { 
  validateQueryParams,
  validateRequired,
  sanitizeString,
  cleanObject
} from '../../utils/validation';
import { AppError, NotFoundError, ValidationError, AuthorizationError, asyncHandler } from '../../middleware/errorHandler';

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

// List all products (admin only)
app.get('/', asyncHandler(async (c) => {
  const { page, limit, search, status, verified, category } = validateQueryParams(c.req.query());
  
  const productsList = await c.env.PRODUCTS_KV.list({
    prefix: 'product:',
    limit: 1000
  });
  
  const products = [];
  
  for (const key of productsList.keys) {
    const productData = await c.env.PRODUCTS_KV.get(key.name);
    if (productData) {
      const product = JSON.parse(productData);
      
      // Apply filters
      let includeInResults = true;
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        includeInResults = includeInResults && (
          product.name.toLowerCase().includes(searchLower) ||
          product.description?.toLowerCase().includes(searchLower) ||
          product.category.toLowerCase().includes(searchLower)
        );
      }
      
      // Status filter
      if (status && product.status !== status) {
        includeInResults = false;
      }
      
      // Verified filter
      if (verified !== undefined) {
        const isVerified = verified === 'true';
        if (product.verified !== isVerified) {
          includeInResults = false;
        }
      }
      
      // Category filter
      if (category && product.category !== category) {
        includeInResults = false;
      }
      
      if (includeInResults) {
        products.push(product);
      }
    }
  }
  
  // Sort by creation date (newest first)
  products.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedProducts = products.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedProducts,
    pagination: {
      page,
      limit,
      total: products.length,
      totalPages: Math.ceil(products.length / limit)
    }
  });
}));

// Verify product (admin only)
app.put('/:id/verify', asyncHandler(async (c) => {
  const productId = c.req.param('id');
  const body = await c.req.json();
  
  const { verified, notes } = body;
  
  if (typeof verified !== 'boolean') {
    throw new ValidationError('verified field must be a boolean');
  }
  
  const product = await c.env.PRODUCTS_KV.get(`product:${productId}`);
  if (!product) {
    throw new NotFoundError('Product not found');
  }
  
  const productData = JSON.parse(product);
  
  const updatedProduct = {
    ...productData,
    verified,
    verificationNotes: notes ? sanitizeString(notes) : undefined,
    verifiedAt: verified ? new Date().toISOString() : null,
    verifiedBy: c.get('user').id,
    updatedAt: new Date().toISOString()
  };
  
  await c.env.PRODUCTS_KV.put(`product:${productId}`, JSON.stringify(updatedProduct));
  
  return c.json({
    success: true,
    message: `Product ${verified ? 'verified' : 'unverified'} successfully`,
    data: updatedProduct
  });
}));

export { app as productRoutes };