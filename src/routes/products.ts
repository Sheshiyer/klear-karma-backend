// Product management routes
import { Hono } from 'hono';
import { WorkerEnv } from '../types/env';
import { requireAuth, requirePractitioner, requireOwnership } from '../middleware/auth';
// import { rateLimiter } from '../middleware/rateLimiter';
import { 
  validateRequired,
  sanitizeString,
  validateEmail,
  validatePhone,
  cleanObject,
  validateQueryParams
} from '../utils/validation';
import { generateSecureRandom } from '../utils/crypto';
import { AppError, NotFoundError, ConflictError, ValidationError, AuthorizationError } from '../middleware/errorHandler';
import { Product, ProductCreationData, ProductUpdateData, ProductSearchParams, getProductKey } from '../types/product';
import { validateProductCreation, validateProductUpdate } from '../utils/validation';

const products = new Hono<{ Bindings: WorkerEnv }>(); 

// Get all products (public, with filters and pagination)
products.get('/', async (c) => {
  try {
    if (!c.env.PRODUCTS_KV) {
      return c.json({
        success: false,
        error: 'Products KV namespace not available',
        message: 'Database connection error'
      }, 500);
    }

    const queryParams = c.req.query();
    
    // Validate query parameters
    const allowedParams = [
      'page', 'limit', 'search', 'sort', 'order', 'category', 
      'priceMin', 'priceMax', 'modality', 'verifiedOnly'
    ];
    
    const invalidParams = Object.keys(queryParams).filter(param => !allowedParams.includes(param));
    if (invalidParams.length > 0) {
      throw new ValidationError(`Invalid query parameters: ${invalidParams.join(', ')}`);
    }
    
    // Validate specific parameter values
    if (queryParams.priceMin && (isNaN(Number(queryParams.priceMin)) || Number(queryParams.priceMin) < 0)) {
      throw new ValidationError('priceMin must be a positive number');
    }
    
    if (queryParams.priceMax && (isNaN(Number(queryParams.priceMax)) || Number(queryParams.priceMax) < 0)) {
      throw new ValidationError('priceMax must be a positive number');
    }
    
    if (queryParams.sort && !['price', 'rating', 'name', 'createdAt'].includes(queryParams.sort)) {
      throw new ValidationError('sort must be one of: price, rating, name, createdAt');
    }
    
    if (queryParams.order && !['asc', 'desc'].includes(queryParams.order)) {
      throw new ValidationError('order must be either asc or desc');
    }
    
    if (queryParams.modality && !['physical', 'digital', 'service'].includes(queryParams.modality)) {
      throw new ValidationError('modality must be one of: physical, digital, service');
    }
    
    if (queryParams.verifiedOnly && !['true', 'false'].includes(queryParams.verifiedOnly)) {
      throw new ValidationError('verifiedOnly must be either true or false');
    }

    const query = validateQueryParams(queryParams);
    const { page = 1, limit = 20, search, sort = 'name', order = 'asc' } = query;
    const priceMinStr = queryParams.priceMin;
     const priceMaxStr = queryParams.priceMax;
     const params: ProductSearchParams = {
       category: c.req.query('category'),
       priceMin: priceMinStr ? parseFloat(priceMinStr) : undefined,
       priceMax: priceMaxStr ? parseFloat(priceMaxStr) : undefined,
       verifiedOnly: c.req.query('verifiedOnly') === 'true',
       modality: c.req.query('modality'),
       page,
       limit,
       sortBy: sort as 'price' | 'rating' | 'name',
       order: order as 'asc' | 'desc'
     };
    
    // List all products
    const productsList = await c.env.PRODUCTS_KV.list({ prefix: 'product:' });
  
  let productData: Product[] = [];
  for (const key of productsList.keys) {
    const data = await c.env.PRODUCTS_KV.get(key.name);
    if (data) {
      const product: Product = JSON.parse(data);
      if (product.isActive && (!params.verifiedOnly || product.verificationStatus === 'verified')) {
        productData.push(product);
      }
    }
  }
  
  // Apply filters
  productData = productData.filter(product => {
    let include = true;
    if (search) {
      const searchLower = search.toLowerCase();
      include = include && (
        product.name.toLowerCase().includes(searchLower) ||
        product.description.toLowerCase().includes(searchLower) ||
        product.categories.some(cat => cat.toLowerCase().includes(searchLower))
      );
    }
    if (params.category) {
      include = include && product.categories.includes(params.category);
    }
    if (params.priceMin) {
      include = include && product.price >= params.priceMin;
    }
    if (params.priceMax) {
      include = include && product.price <= params.priceMax;
    }
    if (params.modality) {
      include = include && product.modality === params.modality;
    }
    return include;
  });
  
  // Sort
  productData.sort((a, b) => {
    let comparison = 0;
    switch (params.sortBy) {
      case 'price':
        comparison = a.price - b.price;
        break;
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'rating':
        const aRating = a.ratings?.average || 0;
        const bRating = b.ratings?.average || 0;
        comparison = aRating - bRating;
        break;
      default:
        comparison = a.name.localeCompare(b.name);
    }
    return params.order === 'asc' ? comparison : -comparison;
  });
  
  // Paginate
  const start = (page - 1) * limit;
  const paginated = productData.slice(start, start + limit);
  
    return c.json({
      success: true,
      data: paginated,
      pagination: { page, limit, total: productData.length, totalPages: Math.ceil(productData.length / limit) }
    });
  } catch (error) {
    console.error('Error in products GET route:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch products',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Get product by ID (public)
products.get('/:id', async (c) => {
  const productId = c.req.param('id');
  const data = await c.env.PRODUCTS_KV.get(getProductKey(productId));
  if (!data) {
    throw new NotFoundError('Product not found');
  }
  const product: Product = JSON.parse(data);
  if (!product.isActive) {
    throw new NotFoundError('Product not found');
  }
  return c.json({ success: true, data: product });
});

// Create product (practitioner only)
products.post('/', requireAuth, requirePractitioner, async (c) => {
  const body: ProductCreationData = await c.req.json();
  validateProductCreation(body);
  
  const productId = generateSecureRandom(16);
  const product: Product = {
    id: productId,
    ...body,
    curatorPractitionerId: c.var.user.id,
    verificationStatus: 'pending',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ratings: { average: 0, count: 0 }
  };
  
  await c.env.PRODUCTS_KV.put(getProductKey(productId), JSON.stringify(product));
  return c.json({ success: true, data: product }, 201);
});

// Update product (owner only)
products.put('/:id', requireAuth, requirePractitioner, async (c) => {
  const productId = c.req.param('id');
  const data = await c.env.PRODUCTS_KV.get(getProductKey(productId));
  if (!data) {
    throw new NotFoundError('Product not found');
  }
  const product: Product = JSON.parse(data);
  if (product.curatorPractitionerId !== c.var.user.id) {
    throw new AuthorizationError('Not authorized to update this product');
  }
  const updates: ProductUpdateData = await c.req.json();
  Object.assign(product, cleanObject(updates));
  product.updatedAt = new Date().toISOString();
  validateProductUpdate(updates);
  await c.env.PRODUCTS_KV.put(getProductKey(productId), JSON.stringify(product));
  return c.json({ success: true, data: product });
});

// Verify product (curator or admin)
products.post('/:id/verify', requireAuth, requirePractitioner, async (c) => {
  const productId = c.req.param('id');
  const data = await c.env.PRODUCTS_KV.get(getProductKey(productId));
  if (!data) {
    throw new NotFoundError('Product not found');
  }
  const product: Product = JSON.parse(data);
  if (product.curatorPractitionerId !== c.var.user.id && c.var.user.role !== 'admin') {
    throw new AuthorizationError('Not authorized to verify this product');
  }
  if (product.verificationStatus === 'verified') {
    throw new ConflictError('Product already verified');
  }
  product.verificationStatus = 'verified';
  product.verifiedAt = new Date().toISOString();
  product.updatedAt = new Date().toISOString();
  await c.env.PRODUCTS_KV.put(getProductKey(productId), JSON.stringify(product));
  return c.json({ success: true, data: product });
});

// Delete product (owner or admin)
products.delete('/:id', requireAuth, requirePractitioner, async (c) => {
  const productId = c.req.param('id');
  const data = await c.env.PRODUCTS_KV.get(getProductKey(productId));
  if (!data) {
    throw new NotFoundError('Product not found');
  }
  const product: Product = JSON.parse(data);
  if (product.curatorPractitionerId !== c.var.user.id && c.var.user.role !== 'admin') {
    throw new AuthorizationError('Not authorized to delete this product');
  }
  await c.env.PRODUCTS_KV.delete(getProductKey(productId));
  return c.json({ success: true });
});

export default products;