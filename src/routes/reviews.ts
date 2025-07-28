// Review management routes
import { Hono } from 'hono';
import { WorkerEnv } from '../types/env';
import { requireAuth, requireAdmin } from '../middleware/auth';
// import { rateLimiter } from '../middleware/rateLimiter';
import { 
  validateReview,
  validateQueryParams,
  validateRequired,
  validateUUID,
  sanitizeString,
  cleanObject
} from '../utils/validation';
import { generateSecureRandom } from '../utils/crypto';
import { AppError, NotFoundError, ValidationError, AuthorizationError, ConflictError } from '../middleware/errorHandler';

interface Variables {
  userId?: string;
  userRole?: string;
}

const reviews = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();

// Create new review
reviews.post('/', requireAuth, /* rateLimiter, */ async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  
  const validatedReview = validateReview(body);
  
  // Verify appointment exists and user has access
  const appointment = await c.env.APPOINTMENTS_KV.get(`appointment:${validatedReview.appointmentId}`);
  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }
  
  const appointmentData = JSON.parse(appointment);
  
  // Only the customer can review the appointment
  if (appointmentData.customerId !== userId) {
    throw new AuthorizationError('Only the customer can review this appointment');
  }
  
  // Appointment must be completed
  if (appointmentData.status !== 'completed') {
    throw new ValidationError('Can only review completed appointments');
  }
  
  // Check if review already exists for this appointment
  const existingReview = await c.env.REVIEWS_KV.get(`appointment_review:${validatedReview.appointmentId}`);
  if (existingReview) {
    throw new ConflictError('Review already exists for this appointment');
  }
  
  // Get user and practitioner data
  const user = await c.env.USERS_KV.get(`user:${userId}`);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${appointmentData.practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const service = await c.env.SERVICES_KV.get(`service:${appointmentData.serviceId}`);
  if (!service) {
    throw new NotFoundError('Service not found');
  }
  
  const userData = JSON.parse(user);
  const practitionerData = JSON.parse(practitioner);
  const serviceData = JSON.parse(service);
  
  // Create review
  const reviewId = generateSecureRandom(16);
  const review = {
    id: reviewId,
    appointmentId: validatedReview.appointmentId,
    customerId: userId,
    customerName: userData.fullName,
    practitionerId: appointmentData.practitionerId,
    practitionerName: practitionerData.fullName,
    serviceId: appointmentData.serviceId,
    serviceName: serviceData.name,
    rating: validatedReview.rating,
    title: validatedReview.title ? sanitizeString(validatedReview.title) : null,
    comment: validatedReview.comment ? sanitizeString(validatedReview.comment) : null,
    categories: {
      overall: validatedReview.rating,
      communication: validatedReview.categories?.communication || validatedReview.rating,
      professionalism: validatedReview.categories?.professionalism || validatedReview.rating,
      effectiveness: validatedReview.categories?.effectiveness || validatedReview.rating,
      environment: validatedReview.categories?.environment || validatedReview.rating,
      value: validatedReview.categories?.value || validatedReview.rating
    },
    wouldRecommend: validatedReview.wouldRecommend !== false,
    isAnonymous: validatedReview.isAnonymous === true,
    isVerified: true, // Always verified since it's based on completed appointment
    status: 'published',
    helpfulCount: 0,
    reportCount: 0,
    practitionerResponse: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Store review with multiple keys for efficient querying
  await Promise.all([
    c.env.REVIEWS_KV.put(`review:${reviewId}`, JSON.stringify(review)),
    c.env.REVIEWS_KV.put(`appointment_review:${validatedReview.appointmentId}`, JSON.stringify(review)),
    c.env.REVIEWS_KV.put(`practitioner_reviews:${appointmentData.practitionerId}:${reviewId}`, JSON.stringify(review)),
    c.env.REVIEWS_KV.put(`service_reviews:${appointmentData.serviceId}:${reviewId}`, JSON.stringify(review)),
    c.env.REVIEWS_KV.put(`user_reviews:${userId}:${reviewId}`, JSON.stringify(review))
  ]);
  
  // Update practitioner rating
  await updatePractitionerRating(c.env, appointmentData.practitionerId);
  
  // Update service rating
  await updateServiceRating(c.env, appointmentData.serviceId);
  
  return c.json({
    success: true,
    message: 'Review created successfully',
    data: review
  }, 201);
});

// Get review by ID
reviews.get('/:id', async (c) => {
  const reviewId = c.req.param('id');
  
  const review = await c.env.REVIEWS_KV.get(`review:${reviewId}`);
  if (!review) {
    throw new NotFoundError('Review not found');
  }
  
  const reviewData = JSON.parse(review);
  
  // Hide customer name if anonymous
  if (reviewData.isAnonymous) {
    reviewData.customerName = 'Anonymous';
  }
  
  return c.json({
    success: true,
    data: reviewData
  });
});

// Update review (customer only, within 30 days)
reviews.put('/:id', requireAuth, /* rateLimiter, */ async (c) => {
  const reviewId = c.req.param('id');
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  const body = await c.req.json();
  
  const review = await c.env.REVIEWS_KV.get(`review:${reviewId}`);
  if (!review) {
    throw new NotFoundError('Review not found');
  }
  
  const reviewData = JSON.parse(review);
  
  // Check authorization
  if (userRole !== 'admin' && reviewData.customerId !== userId) {
    throw new AuthorizationError('Access denied');
  }
  
  // Check if review can be edited (within 30 days for customers)
  if (userRole !== 'admin') {
    const reviewDate = new Date(reviewData.createdAt);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    if (reviewDate < thirtyDaysAgo) {
      throw new ValidationError('Reviews can only be edited within 30 days of creation');
    }
  }
  
  // Validate updates
  const validatedReview = validateReview(body, true); // partial validation for updates
  
  // Update review
  const updatedReview = {
    ...reviewData,
    ...cleanObject({
      rating: validatedReview.rating,
      title: validatedReview.title ? sanitizeString(validatedReview.title) : undefined,
      comment: validatedReview.comment ? sanitizeString(validatedReview.comment) : undefined,
      categories: validatedReview.categories ? {
        overall: validatedReview.rating || reviewData.rating,
        communication: validatedReview.categories.communication || reviewData.categories.communication,
        professionalism: validatedReview.categories.professionalism || reviewData.categories.professionalism,
        effectiveness: validatedReview.categories.effectiveness || reviewData.categories.effectiveness,
        environment: validatedReview.categories.environment || reviewData.categories.environment,
        value: validatedReview.categories.value || reviewData.categories.value
      } : undefined,
      wouldRecommend: validatedReview.wouldRecommend,
      isAnonymous: validatedReview.isAnonymous
    }),
    updatedAt: new Date().toISOString()
  };
  
  // Update all review keys
  await Promise.all([
    c.env.REVIEWS_KV.put(`review:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`appointment_review:${reviewData.appointmentId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`practitioner_reviews:${reviewData.practitionerId}:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`service_reviews:${reviewData.serviceId}:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`user_reviews:${reviewData.customerId}:${reviewId}`, JSON.stringify(updatedReview))
  ]);
  
  // Update practitioner and service ratings if rating changed
  if (validatedReview.rating && validatedReview.rating !== reviewData.rating) {
    await Promise.all([
      updatePractitionerRating(c.env, reviewData.practitionerId),
      updateServiceRating(c.env, reviewData.serviceId)
    ]);
  }
  
  return c.json({
    success: true,
    message: 'Review updated successfully',
    data: updatedReview
  });
});

// Add practitioner response
reviews.put('/:id/response', requireAuth, /* rateLimiter, */ async (c) => {
  const reviewId = c.req.param('id');
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  const { response } = await c.req.json();
  
  validateRequired({ response }, ['response']);
  
  if (typeof response !== 'string' || response.length > 1000) {
    throw new ValidationError('Response must be a string with maximum 1000 characters');
  }
  
  const review = await c.env.REVIEWS_KV.get(`review:${reviewId}`);
  if (!review) {
    throw new NotFoundError('Review not found');
  }
  
  const reviewData = JSON.parse(review);
  
  // Check authorization - only the practitioner being reviewed can respond
  if (userRole !== 'admin' && reviewData.practitionerId !== userId) {
    throw new AuthorizationError('Only the practitioner can respond to this review');
  }
  
  // Check if response already exists
  if (reviewData.practitionerResponse) {
    throw new ConflictError('Practitioner response already exists');
  }
  
  // Add response
  const updatedReview = {
    ...reviewData,
    practitionerResponse: {
      content: sanitizeString(response),
      respondedAt: new Date().toISOString(),
      respondedBy: userId
    },
    updatedAt: new Date().toISOString()
  };
  
  // Update all review keys
  await Promise.all([
    c.env.REVIEWS_KV.put(`review:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`appointment_review:${reviewData.appointmentId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`practitioner_reviews:${reviewData.practitionerId}:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`service_reviews:${reviewData.serviceId}:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`user_reviews:${reviewData.customerId}:${reviewId}`, JSON.stringify(updatedReview))
  ]);
  
  return c.json({
    success: true,
    message: 'Response added successfully',
    data: updatedReview
  });
});

// Mark review as helpful
reviews.post('/:id/helpful', requireAuth, async (c) => {
  const reviewId = c.req.param('id');
  const userId = c.get('userId');
  
  const review = await c.env.REVIEWS_KV.get(`review:${reviewId}`);
  if (!review) {
    throw new NotFoundError('Review not found');
  }
  
  const reviewData = JSON.parse(review);
  
  // Check if user already marked as helpful
  const helpfulKey = `review_helpful:${reviewId}:${userId}`;
  const existingHelpful = await c.env.REVIEWS_KV.get(helpfulKey);
  
  if (existingHelpful) {
    throw new ConflictError('Already marked as helpful');
  }
  
  // Mark as helpful
  await c.env.REVIEWS_KV.put(helpfulKey, 'true', { expirationTtl: 365 * 24 * 60 * 60 }); // 1 year
  
  // Update helpful count
  const updatedReview = {
    ...reviewData,
    helpfulCount: reviewData.helpfulCount + 1,
    updatedAt: new Date().toISOString()
  };
  
  // Update all review keys
  await Promise.all([
    c.env.REVIEWS_KV.put(`review:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`appointment_review:${reviewData.appointmentId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`practitioner_reviews:${reviewData.practitionerId}:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`service_reviews:${reviewData.serviceId}:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`user_reviews:${reviewData.customerId}:${reviewId}`, JSON.stringify(updatedReview))
  ]);
  
  return c.json({
    success: true,
    message: 'Marked as helpful',
    data: { helpfulCount: updatedReview.helpfulCount }
  });
});

// Report review
reviews.post('/:id/report', requireAuth, /* rateLimiter, */ async (c) => {
  const reviewId = c.req.param('id');
  const userId = c.get('userId');
  const { reason } = await c.req.json();
  
  validateRequired({ reason }, ['reason']);
  
  const review = await c.env.REVIEWS_KV.get(`review:${reviewId}`);
  if (!review) {
    throw new NotFoundError('Review not found');
  }
  
  const reviewData = JSON.parse(review);
  
  // Check if user already reported
  const reportKey = `review_report:${reviewId}:${userId}`;
  const existingReport = await c.env.REVIEWS_KV.get(reportKey);
  
  if (existingReport) {
    throw new ConflictError('Already reported');
  }
  
  // Create report
  const report = {
    reviewId,
    reportedBy: userId,
    reason: sanitizeString(reason),
    reportedAt: new Date().toISOString()
  };
  
  await c.env.REVIEWS_KV.put(reportKey, JSON.stringify(report));
  
  // Update report count
  const updatedReview = {
    ...reviewData,
    reportCount: reviewData.reportCount + 1,
    updatedAt: new Date().toISOString()
  };
  
  // If report count reaches threshold, hide review
  if (updatedReview.reportCount >= 5) {
    updatedReview.status = 'hidden';
  }
  
  // Update all review keys
  await Promise.all([
    c.env.REVIEWS_KV.put(`review:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`appointment_review:${reviewData.appointmentId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`practitioner_reviews:${reviewData.practitionerId}:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`service_reviews:${reviewData.serviceId}:${reviewId}`, JSON.stringify(updatedReview)),
    c.env.REVIEWS_KV.put(`user_reviews:${reviewData.customerId}:${reviewId}`, JSON.stringify(updatedReview))
  ]);
  
  return c.json({
    success: true,
    message: 'Review reported successfully'
  });
});

// Get reviews with filtering
reviews.get('/', async (c) => {
  const { 
    page, 
    limit, 
    practitionerId, 
    serviceId, 
    customerId, 
    rating, 
    sortBy, 
    sortOrder 
  } = validateQueryParams(c.req.query());
  
  let prefix = 'review:';
  
  // Use specific prefix for more efficient querying
  if (practitionerId) {
    prefix = `practitioner_reviews:${practitionerId}:`;
  } else if (serviceId) {
    prefix = `service_reviews:${serviceId}:`;
  } else if (customerId) {
    prefix = `user_reviews:${customerId}:`;
  }
  
  const reviewsList = await c.env.REVIEWS_KV.list({
    prefix,
    limit: 1000
  });
  
  const reviews = [];
  
  for (const key of reviewsList.keys) {
    const reviewData = await c.env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      
      // Only include published reviews
      if (review.status !== 'published') {
        continue;
      }
      
      // Apply filters
      let include = true;
      
      if (rating && review.rating !== parseInt(rating)) {
        include = false;
      }
      
      if (include) {
        // Hide customer name if anonymous
        if (review.isAnonymous) {
          review.customerName = 'Anonymous';
        }
        
        reviews.push(review);
      }
    }
  }
  
  // Remove duplicates (since we might have multiple keys for same review)
  const uniqueReviews = reviews.filter((review, index, self) => 
    index === self.findIndex(r => r.id === review.id)
  );
  
  // Sort reviews
  uniqueReviews.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'rating':
        comparison = b.rating - a.rating;
        break;
      case 'helpful':
        comparison = b.helpfulCount - a.helpfulCount;
        break;
      case 'oldest':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'newest':
      default:
        comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        break;
    }
    
    return sortOrder === 'asc' ? -comparison : comparison;
  });
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedReviews = uniqueReviews.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedReviews,
    pagination: {
      page,
      limit,
      total: uniqueReviews.length,
      totalPages: Math.ceil(uniqueReviews.length / limit)
    }
  });
});

// Get review statistics
reviews.get('/stats/:practitionerId', async (c) => {
  const practitionerId = c.req.param('practitionerId');
  
  // Verify practitioner exists
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const reviewsList = await c.env.REVIEWS_KV.list({
    prefix: `practitioner_reviews:${practitionerId}:`,
    limit: 1000
  });
  
  const stats = {
    totalReviews: 0,
    averageRating: 0,
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    categoryAverages: {
      communication: 0,
      professionalism: 0,
      effectiveness: 0,
      environment: 0,
      value: 0
    },
    recommendationRate: 0,
    responseRate: 0
  };
  
  let totalRating = 0;
  let totalCommunication = 0;
  let totalProfessionalism = 0;
  let totalEffectiveness = 0;
  let totalEnvironment = 0;
  let totalValue = 0;
  let recommendCount = 0;
  let responseCount = 0;
  
  for (const key of reviewsList.keys) {
    const reviewData = await c.env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      
      if (review.status === 'published') {
        stats.totalReviews++;
        totalRating += review.rating;
        stats.ratingDistribution[review.rating]++;
        
        totalCommunication += review.categories.communication;
        totalProfessionalism += review.categories.professionalism;
        totalEffectiveness += review.categories.effectiveness;
        totalEnvironment += review.categories.environment;
        totalValue += review.categories.value;
        
        if (review.wouldRecommend) {
          recommendCount++;
        }
        
        if (review.practitionerResponse) {
          responseCount++;
        }
      }
    }
  }
  
  if (stats.totalReviews > 0) {
    stats.averageRating = Math.round((totalRating / stats.totalReviews) * 10) / 10;
    stats.categoryAverages.communication = Math.round((totalCommunication / stats.totalReviews) * 10) / 10;
    stats.categoryAverages.professionalism = Math.round((totalProfessionalism / stats.totalReviews) * 10) / 10;
    stats.categoryAverages.effectiveness = Math.round((totalEffectiveness / stats.totalReviews) * 10) / 10;
    stats.categoryAverages.environment = Math.round((totalEnvironment / stats.totalReviews) * 10) / 10;
    stats.categoryAverages.value = Math.round((totalValue / stats.totalReviews) * 10) / 10;
    stats.recommendationRate = Math.round((recommendCount / stats.totalReviews) * 100);
    stats.responseRate = Math.round((responseCount / stats.totalReviews) * 100);
  }
  
  return c.json({
    success: true,
    data: stats
  });
});

// Helper function to update practitioner rating
async function updatePractitionerRating(env: WorkerEnv, practitionerId: string) {
  const reviewsList = await env.REVIEWS_KV.list({
    prefix: `practitioner_reviews:${practitionerId}:`,
    limit: 1000
  });
  
  let totalRating = 0;
  let reviewCount = 0;
  
  for (const key of reviewsList.keys) {
    const reviewData = await env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      if (review.status === 'published') {
        totalRating += review.rating;
        reviewCount++;
      }
    }
  }
  
  const practitioner = await env.PRACTITIONERS_KV.get(`practitioner:${practitionerId}`);
  if (practitioner) {
    const practitionerData = JSON.parse(practitioner);
    practitionerData.rating = {
      average: reviewCount > 0 ? Math.round((totalRating / reviewCount) * 10) / 10 : 0,
      count: reviewCount
    };
    practitionerData.updatedAt = new Date().toISOString();
    
    await env.PRACTITIONERS_KV.put(`practitioner:${practitionerId}`, JSON.stringify(practitionerData));
  }
}

// Helper function to update service rating
async function updateServiceRating(env: WorkerEnv, serviceId: string) {
  const reviewsList = await env.REVIEWS_KV.list({
    prefix: `service_reviews:${serviceId}:`,
    limit: 1000
  });
  
  let totalRating = 0;
  let reviewCount = 0;
  
  for (const key of reviewsList.keys) {
    const reviewData = await env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      if (review.status === 'published') {
        totalRating += review.rating;
        reviewCount++;
      }
    }
  }
  
  const service = await env.SERVICES_KV.get(`service:${serviceId}`);
  if (service) {
    const serviceData = JSON.parse(service);
    serviceData.rating = {
      average: reviewCount > 0 ? Math.round((totalRating / reviewCount) * 10) / 10 : 0,
      count: reviewCount
    };
    serviceData.updatedAt = new Date().toISOString();
    
    await Promise.all([
      env.SERVICES_KV.put(`service:${serviceId}`, JSON.stringify(serviceData)),
      env.SERVICES_KV.put(`practitioner_services:${serviceData.practitionerId}:${serviceId}`, JSON.stringify(serviceData)),
      env.SERVICES_KV.put(`category_services:${serviceData.category}:${serviceId}`, JSON.stringify(serviceData))
    ]);
  }
}

export default reviews;