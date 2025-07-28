// Admin practitioner management routes
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

// List all practitioners (admin only)
app.get('/', asyncHandler(async (c) => {
  const { page, limit, search, status, verified } = validateQueryParams(c.req.query());
  
  const practitionersList = await c.env.PRACTITIONERS_KV.list({
    prefix: 'practitioner:',
    limit: 1000
  });
  
  const practitioners = [];
  
  for (const key of practitionersList.keys) {
    const practitionerData = await c.env.PRACTITIONERS_KV.get(key.name);
    if (practitionerData) {
      const practitioner = JSON.parse(practitionerData);
      
      // Apply filters
      let includeInResults = true;
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        includeInResults = includeInResults && (
          practitioner.fullName.toLowerCase().includes(searchLower) ||
          practitioner.email.toLowerCase().includes(searchLower) ||
          practitioner.specializations.some((s: string) => s.toLowerCase().includes(searchLower))
        );
      }
      
      // Status filter
      if (status && practitioner.status !== status) {
        includeInResults = false;
      }
      
      // Verified filter
      if (verified !== undefined) {
        const isVerified = verified === 'true';
        if (practitioner.verified !== isVerified) {
          includeInResults = false;
        }
      }
      
      if (includeInResults) {
        practitioners.push(practitioner);
      }
    }
  }
  
  // Sort by creation date (newest first)
  practitioners.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedPractitioners = practitioners.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedPractitioners,
    pagination: {
      page,
      limit,
      total: practitioners.length,
      totalPages: Math.ceil(practitioners.length / limit)
    }
  });
}));

// Verify practitioner (admin only)
app.put('/:id/verify', asyncHandler(async (c) => {
  const practitionerId = c.req.param('id');
  const body = await c.req.json();
  
  const { verified, notes } = body;
  
  if (typeof verified !== 'boolean') {
    throw new ValidationError('verified field must be a boolean');
  }
  
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const practitionerData = JSON.parse(practitioner);
  
  const updatedPractitioner = {
    ...practitionerData,
    verified,
    verificationNotes: notes ? sanitizeString(notes) : undefined,
    verifiedAt: verified ? new Date().toISOString() : null,
    verifiedBy: c.get('user').id,
    updatedAt: new Date().toISOString()
  };
  
  await c.env.PRACTITIONERS_KV.put(`practitioner:${practitionerId}`, JSON.stringify(updatedPractitioner));
  
  return c.json({
    success: true,
    message: `Practitioner ${verified ? 'verified' : 'unverified'} successfully`,
    data: updatedPractitioner
  });
}));

export { app as practitionerRoutes };