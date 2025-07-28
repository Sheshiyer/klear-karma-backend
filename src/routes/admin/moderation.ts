import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WorkerEnv } from '../../types/env';
import { adminAuthMiddleware, requirePermission } from '../../middleware/adminAuth';
import { createAdminAuditLog } from './auth';
import { AppError, HttpStatusCode } from '../../utils/error';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Apply admin authentication to all routes
app.use('*', adminAuthMiddleware);

// Schema for updating review moderation status
const updateReviewModerationSchema = z.object({
  status: z.enum(['approved', 'rejected', 'pending']),
  moderationNotes: z.string().optional(),
  rejectionReason: z.string().optional().nullable()
});

/**
 * @route GET /admin/moderation/reviews
 * @desc Get reviews for moderation with pagination and filtering
 * @access Admin with content:moderate permission
 */
app.get('/reviews', requirePermission('content:moderate'), async (c) => {
  const { 
    page = '1', 
    limit = '20', 
    status, 
    practitionerId, 
    userId,
    search
  } = c.req.query();
  
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100); // Max 100 per page
  const offset = (pageNum - 1) * limitNum;
  
  // List all reviews
  const reviewsList = await c.env.REVIEWS_KV.list({ prefix: 'review:' });
  let reviews = [];
  
  // Get review data for each key
  for (const key of reviewsList.keys) {
    // Skip index entries
    if (key.name.includes(':user:') || key.name.includes(':practitioner:')) continue;
    
    const reviewData = await c.env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      
      // Apply filters if provided
      if (status && review.moderationStatus !== status) continue;
      if (practitionerId && review.practitionerId !== practitionerId) continue;
      if (userId && review.userId !== userId) continue;
      if (search && !(
        review.content.toLowerCase().includes(search.toLowerCase()) ||
        review.title?.toLowerCase().includes(search.toLowerCase())
      )) continue;
      
      reviews.push(review);
    }
  }
  
  // Sort by creation date (newest first)
  reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  // Apply pagination
  const paginatedReviews = reviews.slice(offset, offset + limitNum);
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'review_view',
    'review',
    null,
    { count: paginatedReviews.length, filters: { status, practitionerId, userId, search } }
  );
  
  return c.json({
    success: true,
    reviews: paginatedReviews,
    pagination: {
      total: reviews.length,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(reviews.length / limitNum)
    }
  });
});

/**
 * @route GET /admin/moderation/reviews/:id
 * @desc Get a specific review for moderation
 * @access Admin with content:moderate permission
 */
app.get('/reviews/:id', requirePermission('content:moderate'), async (c) => {
  const reviewId = c.req.param('id');
  
  // Get review data
  const reviewData = await c.env.REVIEWS_KV.get(`review:${reviewId}`);
  
  if (!reviewData) {
    throw new AppError('Review not found', HttpStatusCode.NOT_FOUND);
  }
  
  const review = JSON.parse(reviewData);
  
  // Get associated user and practitioner for context
  const [userData, practitionerData] = await Promise.all([
    c.env.USERS_KV.get(`user:${review.userId}`),
    c.env.USERS_KV.get(`user:${review.practitionerId}`)
  ]);
  
  const user = userData ? JSON.parse(userData) : null;
  const practitioner = practitionerData ? JSON.parse(practitionerData) : null;
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'review_view',
    'review',
    reviewId,
    { reviewId }
  );
  
  return c.json({
    success: true,
    review,
    context: {
      user: user ? {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        verified: user.verified
      } : null,
      practitioner: practitioner ? {
        id: practitioner.id,
        email: practitioner.email,
        fullName: practitioner.fullName,
        verified: practitioner.verified
      } : null
    }
  });
});

/**
 * @route PUT /admin/moderation/reviews/:id
 * @desc Update a review's moderation status
 * @access Admin with content:moderate permission
 */
app.put('/reviews/:id', requirePermission('content:moderate'), zValidator('json', updateReviewModerationSchema), async (c) => {
  const reviewId = c.req.param('id');
  const { status, moderationNotes, rejectionReason } = c.req.valid('json');
  
  // Get review data
  const reviewData = await c.env.REVIEWS_KV.get(`review:${reviewId}`);
  
  if (!reviewData) {
    throw new AppError('Review not found', HttpStatusCode.NOT_FOUND);
  }
  
  const review = JSON.parse(reviewData);
  
  // Track changes for audit log
  const changes: Record<string, { from: any, to: any }> = {};
  
  // Apply updates
  if (status !== review.moderationStatus) {
    changes.moderationStatus = { from: review.moderationStatus, to: status };
    review.moderationStatus = status;
    review.moderatedAt = new Date().toISOString();
    review.moderatedBy = c.get('admin').id;
  }
  
  if (moderationNotes !== undefined && moderationNotes !== review.moderationNotes) {
    changes.moderationNotes = { from: review.moderationNotes, to: moderationNotes };
    review.moderationNotes = moderationNotes;
  }
  
  if (rejectionReason !== undefined && rejectionReason !== review.rejectionReason) {
    changes.rejectionReason = { from: review.rejectionReason, to: rejectionReason };
    review.rejectionReason = rejectionReason;
  }
  
  // Save updated review
  await c.env.REVIEWS_KV.put(`review:${reviewId}`, JSON.stringify(review));
  
  // Create audit log if changes were made
  if (Object.keys(changes).length > 0) {
    await createAdminAuditLog(
      c,
      status === 'approved' ? 'review_approve' : status === 'rejected' ? 'review_reject' : 'review_update',
      'review',
      reviewId,
      { changes, reviewId }
    );
  }
  
  return c.json({
    success: true,
    message: `Review ${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'updated'} successfully`,
    review
  });
});

/**
 * @route DELETE /admin/moderation/reviews/:id
 * @desc Delete a review
 * @access Admin with content:delete permission
 */
app.delete('/reviews/:id', requirePermission('content:delete'), async (c) => {
  const reviewId = c.req.param('id');
  
  // Get review data for audit log
  const reviewData = await c.env.REVIEWS_KV.get(`review:${reviewId}`);
  
  if (!reviewData) {
    throw new AppError('Review not found', HttpStatusCode.NOT_FOUND);
  }
  
  const review = JSON.parse(reviewData);
  
  // Delete review
  await c.env.REVIEWS_KV.delete(`review:${reviewId}`);
  
  // Also delete from indexes
  await c.env.REVIEWS_KV.delete(`review:user:${review.userId}:${reviewId}`);
  await c.env.REVIEWS_KV.delete(`review:practitioner:${review.practitionerId}:${reviewId}`);
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'review_delete',
    'review',
    reviewId,
    { reviewId, userId: review.userId, practitionerId: review.practitionerId }
  );
  
  return c.json({
    success: true,
    message: 'Review deleted successfully'
  });
});

/**
 * @route GET /admin/moderation/stats
 * @desc Get moderation statistics
 * @access Admin with content:moderate permission
 */
app.get('/stats', requirePermission('content:moderate'), async (c) => {
  // List all reviews
  const reviewsList = await c.env.REVIEWS_KV.list({ prefix: 'review:' });
  
  let totalReviews = 0;
  let pendingReviews = 0;
  let approvedReviews = 0;
  let rejectedReviews = 0;
  let flaggedContent = 0;
  let totalRating = 0;
  let ratingCount = 0;
  
  // Get review data for each key
  for (const key of reviewsList.keys) {
    // Skip index entries
    if (key.name.includes(':user:') || key.name.includes(':practitioner:')) continue;
    
    const reviewData = await c.env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      totalReviews++;
      
      if (review.moderationStatus === 'pending') {
        pendingReviews++;
      } else if (review.moderationStatus === 'approved') {
        approvedReviews++;
      } else if (review.moderationStatus === 'rejected') {
        rejectedReviews++;
      }
      
      if (review.flagged) {
        flaggedContent++;
      }
      
      if (review.rating) {
        totalRating += review.rating;
        ratingCount++;
      }
    }
  }
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'moderation_stats_view',
    'system',
    null,
    {}
  );
  
  return c.json({
    success: true,
    stats: {
      totalReviews,
      pendingReviews,
      approvedReviews,
      rejectedReviews,
      flaggedContent,
      averageRating: ratingCount > 0 ? totalRating / ratingCount : 0,
      pendingPercentage: totalReviews > 0 ? (pendingReviews / totalReviews) * 100 : 0,
      approvalRate: (approvedReviews + rejectedReviews) > 0 ? (approvedReviews / (approvedReviews + rejectedReviews)) * 100 : 0
    }
  });
});

export { app as moderationRoutes };