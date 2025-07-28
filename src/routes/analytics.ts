// Analytics and reporting routes
import { Hono } from 'hono';
import { WorkerEnv } from '../types/env';
import { requireAuth, requireAdmin, UserContext } from '../middleware/auth';
// import { rateLimiter } from '../middleware/rateLimiter';
import { 
  validateQueryParams,
  validateRequired,
  validateRange,
  sanitizeString
} from '../utils/validation';
import { generateSecureRandom } from '../utils/crypto';
import { AppError, NotFoundError, ValidationError, AuthorizationError } from '../middleware/errorHandler';

// Extend Hono context with user-related variables
declare module 'hono' {
  interface ContextVariableMap {
    user: UserContext;
  }
}

interface Variables {
  userId?: string;
  userRole?: string;
  practitionerId?: string;
}

const analytics = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();

// Track event (internal use)
analytics.post('/track', async (c) => {
  const { event, data, userId, sessionId } = await c.req.json();
  
  validateRequired({ event }, ['event']);
  
  const eventData = {
    id: generateSecureRandom(16),
    event: sanitizeString(event),
    data: data || {},
    userId: userId || null,
    sessionId: sessionId || null,
    ip: c.req.header('CF-Connecting-IP') || 'unknown',
    userAgent: c.req.header('User-Agent') || 'unknown',
    country: c.req.header('CF-IPCountry') || 'unknown',
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0] // YYYY-MM-DD format
  };
  
  // Store event with multiple keys for efficient querying
  const promises = [
    c.env.ANALYTICS_KV.put(`event:${eventData.id}`, JSON.stringify(eventData), {
      expirationTtl: 90 * 24 * 60 * 60 // 90 days
    }),
    c.env.ANALYTICS_KV.put(`daily_events:${eventData.date}:${eventData.id}`, JSON.stringify(eventData), {
      expirationTtl: 90 * 24 * 60 * 60
    }),
    c.env.ANALYTICS_KV.put(`event_type:${event}:${eventData.id}`, JSON.stringify(eventData), {
      expirationTtl: 90 * 24 * 60 * 60
    })
  ];
  
  if (userId) {
    promises.push(
      c.env.ANALYTICS_KV.put(`user_events:${userId}:${eventData.id}`, JSON.stringify(eventData), {
        expirationTtl: 90 * 24 * 60 * 60
      })
    );
  }
  
  await Promise.all(promises);
  
  return c.json({
    success: true,
    message: 'Event tracked successfully'
  });
});

// Get dashboard overview (admin only)
analytics.get('/dashboard', requireAuth, requireAdmin, async (c) => {
  const { period = '7d' } = c.req.query();
  
  const now = new Date();
  let startDate: Date;
  
  switch (period) {
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  
  const dashboard = {
    overview: {
      totalUsers: 0,
      activePractitioners: 0,
      totalAppointments: 0,
      totalRevenue: 0,
      averageRating: 0,
      totalReviews: 0
    },
    trends: {
      newUsers: 0,
      newAppointments: 0,
      completedAppointments: 0,
      cancelledAppointments: 0,
      newReviews: 0
    },
    topPractitioners: [],
    topServices: [],
    recentActivity: []
  };
  
  // Get total counts
  const [usersList, practitionersList, appointmentsList, reviewsList] = await Promise.all([
    c.env.USERS_KV.list({ prefix: 'user:', limit: 1000 }),
    c.env.PRACTITIONERS_KV.list({ prefix: 'practitioner:', limit: 1000 }),
    c.env.APPOINTMENTS_KV.list({ prefix: 'appointment:', limit: 1000 }),
    c.env.REVIEWS_KV.list({ prefix: 'review:', limit: 1000 })
  ]);
  
  // Count active users and practitioners
  for (const key of usersList.keys) {
    const userData = await c.env.USERS_KV.get(key.name);
    if (userData) {
      const user = JSON.parse(userData);
      if (user.status === 'active') {
        dashboard.overview.totalUsers++;
        
        // Check if user registered in period
        if (new Date(user.createdAt) >= startDate) {
          dashboard.trends.newUsers++;
        }
      }
    }
  }
  
  // Count active practitioners and calculate ratings
  let totalRating = 0;
  let ratedPractitioners = 0;
  const practitionerStats: { [key: string]: any } = {};
  
  for (const key of practitionersList.keys) {
    const practitionerData = await c.env.PRACTITIONERS_KV.get(key.name);
    if (practitionerData) {
      const practitioner = JSON.parse(practitionerData);
      if (practitioner.status === 'active') {
        dashboard.overview.activePractitioners++;
        
        if (practitioner.rating && practitioner.rating.average > 0) {
          totalRating += practitioner.rating.average;
          ratedPractitioners++;
        }
        
        practitionerStats[practitioner.id] = {
          id: practitioner.id,
          name: practitioner.fullName,
          rating: practitioner.rating?.average || 0,
          reviewCount: practitioner.rating?.count || 0,
          appointmentCount: 0,
          revenue: 0
        };
      }
    }
  }
  
  dashboard.overview.averageRating = ratedPractitioners > 0 ? 
    Math.round((totalRating / ratedPractitioners) * 10) / 10 : 0;
  
  // Process appointments
  let totalRevenue = 0;
  const serviceStats: { [key: string]: any } = {};
  
  for (const key of appointmentsList.keys) {
    const appointmentData = await c.env.APPOINTMENTS_KV.get(key.name);
    if (appointmentData) {
      const appointment = JSON.parse(appointmentData);
      dashboard.overview.totalAppointments++;
      
      const appointmentDate = new Date(appointment.createdAt);
      
      if (appointmentDate >= startDate) {
        dashboard.trends.newAppointments++;
        
        if (appointment.status === 'completed') {
          dashboard.trends.completedAppointments++;
        } else if (appointment.status === 'cancelled') {
          dashboard.trends.cancelledAppointments++;
        }
      }
      
      if (appointment.status === 'completed' && appointment.payment?.amount) {
        totalRevenue += appointment.payment.amount;
        
        if (practitionerStats[appointment.practitionerId]) {
          practitionerStats[appointment.practitionerId].revenue += appointment.payment.amount;
          practitionerStats[appointment.practitionerId].appointmentCount++;
        }
      }
      
      // Track service usage
      if (appointment.serviceId) {
        if (!serviceStats[appointment.serviceId]) {
          serviceStats[appointment.serviceId] = {
            id: appointment.serviceId,
            name: appointment.serviceName || 'Unknown Service',
            bookingCount: 0,
            revenue: 0
          };
        }
        
        serviceStats[appointment.serviceId].bookingCount++;
        if (appointment.status === 'completed' && appointment.payment?.amount) {
          serviceStats[appointment.serviceId].revenue += appointment.payment.amount;
        }
      }
    }
  }
  
  dashboard.overview.totalRevenue = totalRevenue;
  
  // Process reviews
  for (const key of reviewsList.keys) {
    const reviewData = await c.env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      if (review.status === 'published') {
        dashboard.overview.totalReviews++;
        
        if (new Date(review.createdAt) >= startDate) {
          dashboard.trends.newReviews++;
        }
      }
    }
  }
  
  // Get top practitioners
  dashboard.topPractitioners = Object.values(practitionerStats)
    .sort((a: any, b: any) => b.revenue - a.revenue)
    .slice(0, 10) as Array<any>;
  
  // Get top services
  dashboard.topServices = Object.values(serviceStats)
    .sort((a: any, b: any) => b.revenue - a.revenue)
    .slice(0, 10) as Array<any>;
  
  return c.json({
    success: true,
    data: dashboard
  });
});

// Get user analytics (admin only)
analytics.get('/users', requireAuth, requireAdmin, async (c) => {
  const { period = '30d', groupBy = 'day' } = c.req.query();
  
  const now = new Date();
  let startDate: Date;
  
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  
  const usersList = await c.env.USERS_KV.list({ prefix: 'user:', limit: 1000 });
  
  const analytics = {
    registrations: {} as { [key: string]: number },
    activeUsers: {} as { [key: string]: number },
    usersByRole: { user: 0, practitioner: 0, admin: 0 },
    usersByStatus: { active: 0, inactive: 0, suspended: 0 },
    totalUsers: 0
  };
  
  for (const key of usersList.keys) {
    const userData = await c.env.USERS_KV.get(key.name);
    if (userData) {
      const user = JSON.parse(userData);
      analytics.totalUsers++;
      
      // Count by role
      analytics.usersByRole[user.role as keyof typeof analytics.usersByRole]++;
      
      // Count by status
      analytics.usersByStatus[user.status as keyof typeof analytics.usersByStatus]++;
      
      const createdDate = new Date(user.createdAt);
      if (createdDate >= startDate) {
        const dateKey = groupBy === 'day' ? 
          createdDate.toISOString().split('T')[0] :
          `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
        
        analytics.registrations[dateKey] = (analytics.registrations[dateKey] || 0) + 1;
      }
      
      // Check for recent activity (last login)
      if (user.lastLoginAt) {
        const lastLogin = new Date(user.lastLoginAt);
        if (lastLogin >= startDate) {
          const dateKey = groupBy === 'day' ? 
            lastLogin.toISOString().split('T')[0] :
            `${lastLogin.getFullYear()}-${String(lastLogin.getMonth() + 1).padStart(2, '0')}`;
          
          analytics.activeUsers[dateKey] = (analytics.activeUsers[dateKey] || 0) + 1;
        }
      }
    }
  }
  
  return c.json({
    success: true,
    data: analytics
  });
});

// Get appointment analytics (admin only)
analytics.get('/appointments', requireAuth, requireAdmin, async (c) => {
  const { period = '30d', groupBy = 'day' } = c.req.query();
  
  const now = new Date();
  let startDate: Date;
  
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  
  const appointmentsList = await c.env.APPOINTMENTS_KV.list({ prefix: 'appointment:', limit: 1000 });
  
  const analytics = {
    bookings: {} as { [key: string]: number },
    completions: {} as { [key: string]: number },
    cancellations: {} as { [key: string]: number },
    revenue: {} as { [key: string]: number },
    byStatus: { scheduled: 0, confirmed: 0, completed: 0, cancelled: 0, 'no-show': 0 },
    byService: {} as { [key: string]: number },
    byPractitioner: {} as { [key: string]: number },
    totalAppointments: 0,
    totalRevenue: 0
  };
  
  for (const key of appointmentsList.keys) {
    const appointmentData = await c.env.APPOINTMENTS_KV.get(key.name);
    if (appointmentData) {
      const appointment = JSON.parse(appointmentData);
      analytics.totalAppointments++;
      
      // Count by status
      analytics.byStatus[appointment.status as keyof typeof analytics.byStatus]++;
      
      // Count by service
      if (appointment.serviceName) {
        analytics.byService[appointment.serviceName] = (analytics.byService[appointment.serviceName] || 0) + 1;
      }
      
      // Count by practitioner
      if (appointment.practitionerName) {
        analytics.byPractitioner[appointment.practitionerName] = (analytics.byPractitioner[appointment.practitionerName] || 0) + 1;
      }
      
      const createdDate = new Date(appointment.createdAt);
      if (createdDate >= startDate) {
        const dateKey = groupBy === 'day' ? 
          createdDate.toISOString().split('T')[0] :
          `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
        
        analytics.bookings[dateKey] = (analytics.bookings[dateKey] || 0) + 1;
        
        if (appointment.status === 'completed') {
          analytics.completions[dateKey] = (analytics.completions[dateKey] || 0) + 1;
          
          if (appointment.payment?.amount) {
            analytics.revenue[dateKey] = (analytics.revenue[dateKey] || 0) + appointment.payment.amount;
            analytics.totalRevenue += appointment.payment.amount;
          }
        } else if (appointment.status === 'cancelled') {
          analytics.cancellations[dateKey] = (analytics.cancellations[dateKey] || 0) + 1;
        }
      }
    }
  }
  
  return c.json({
    success: true,
    data: analytics
  });
});

// Get revenue analytics (admin only)
analytics.get('/revenue', requireAuth, requireAdmin, async (c) => {
  const { period = '30d', groupBy = 'day' } = c.req.query();
  
  const now = new Date();
  let startDate: Date;
  
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  
  const appointmentsList = await c.env.APPOINTMENTS_KV.list({ prefix: 'appointment:', limit: 1000 });
  
  const analytics = {
    revenue: {} as { [key: string]: number },
    byService: {} as { [key: string]: number },
    byPractitioner: {} as { [key: string]: number },
    totalRevenue: 0,
    averageOrderValue: 0,
    totalTransactions: 0
  };
  
  for (const key of appointmentsList.keys) {
    const appointmentData = await c.env.APPOINTMENTS_KV.get(key.name);
    if (appointmentData) {
      const appointment = JSON.parse(appointmentData);
      
      if (appointment.status === 'completed' && appointment.payment?.amount) {
        const amount = appointment.payment.amount;
        analytics.totalRevenue += amount;
        analytics.totalTransactions++;
        
        const completedDate = new Date(appointment.updatedAt);
        if (completedDate >= startDate) {
          const dateKey = groupBy === 'day' ? 
            completedDate.toISOString().split('T')[0] :
            `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, '0')}`;
          
          analytics.revenue[dateKey] = (analytics.revenue[dateKey] || 0) + amount;
        }
        
        // Revenue by service
        if (appointment.serviceName) {
          analytics.byService[appointment.serviceName] = (analytics.byService[appointment.serviceName] || 0) + amount;
        }
        
        // Revenue by practitioner
        if (appointment.practitionerName) {
          analytics.byPractitioner[appointment.practitionerName] = (analytics.byPractitioner[appointment.practitionerName] || 0) + amount;
        }
      }
    }
  }
  
  analytics.averageOrderValue = analytics.totalTransactions > 0 ? 
    Math.round((analytics.totalRevenue / analytics.totalTransactions) * 100) / 100 : 0;
  
  return c.json({
    success: true,
    data: analytics
  });
});

// Get practitioner analytics (practitioner or admin)
analytics.get('/practitioner/:id?', requireAuth, async (c) => {
  const user = c.get('user');
  const practitionerId = c.req.param('id') || user.id;
  const userRole = user.role;
  const requestingUserId = user.id;
  
  // Check authorization
  if (userRole !== 'admin' && practitionerId !== requestingUserId) {
    throw new AuthorizationError('Access denied');
  }
  
  const { period = '30d' } = c.req.query();
  
  const now = new Date();
  let startDate: Date;
  
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  
  // Get practitioner appointments
  const appointmentsList = await c.env.APPOINTMENTS_KV.list({
    prefix: `practitioner_appointments:${practitionerId}:`,
    limit: 1000
  });
  
  // Get practitioner reviews
  const reviewsList = await c.env.REVIEWS_KV.list({
    prefix: `practitioner_reviews:${practitionerId}:`,
    limit: 1000
  });
  
  const analytics = {
    appointments: {
      total: 0,
      scheduled: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0
    },
    revenue: {
      total: 0,
      thisMonth: 0,
      lastMonth: 0,
      byService: {} as { [key: string]: number }
    },
    reviews: {
      total: 0,
      averageRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      recentReviews: []
    },
    trends: {
      appointmentsByDay: {} as { [key: string]: number },
      revenueByDay: {} as { [key: string]: number }
    }
  };
  
  // Process appointments
  for (const key of appointmentsList.keys) {
    const appointmentData = await c.env.APPOINTMENTS_KV.get(key.name);
    if (appointmentData) {
      const appointment = JSON.parse(appointmentData);
      analytics.appointments.total++;
      analytics.appointments[appointment.status as keyof typeof analytics.appointments]++;
      
      const appointmentDate = new Date(appointment.createdAt);
      if (appointmentDate >= startDate) {
        const dateKey = appointmentDate.toISOString().split('T')[0];
        analytics.trends.appointmentsByDay[dateKey] = (analytics.trends.appointmentsByDay[dateKey] || 0) + 1;
      }
      
      if (appointment.status === 'completed' && appointment.payment?.amount) {
        const amount = appointment.payment.amount;
        analytics.revenue.total += amount;
        
        const completedDate = new Date(appointment.updatedAt);
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        if (completedDate >= thisMonth) {
          analytics.revenue.thisMonth += amount;
        } else if (completedDate >= lastMonth && completedDate < thisMonth) {
          analytics.revenue.lastMonth += amount;
        }
        
        if (completedDate >= startDate) {
          const dateKey = completedDate.toISOString().split('T')[0];
          analytics.trends.revenueByDay[dateKey] = (analytics.trends.revenueByDay[dateKey] || 0) + amount;
        }
        
        // Revenue by service
        if (appointment.serviceName) {
          analytics.revenue.byService[appointment.serviceName] = 
            (analytics.revenue.byService[appointment.serviceName] || 0) + amount;
        }
      }
    }
  }
  
  // Process reviews
  let totalRating = 0;
  const recentReviews = [];
  
  for (const key of reviewsList.keys) {
    const reviewData = await c.env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      if (review.status === 'published') {
        analytics.reviews.total++;
        totalRating += review.rating;
        analytics.reviews.ratingDistribution[review.rating as keyof typeof analytics.reviews.ratingDistribution]++;
        
        // Collect recent reviews
        if (recentReviews.length < 10) {
          recentReviews.push({
            id: review.id,
            rating: review.rating,
            title: review.title,
            comment: review.comment,
            customerName: review.isAnonymous ? 'Anonymous' : review.customerName,
            serviceName: review.serviceName,
            createdAt: review.createdAt
          });
        }
      }
    }
  }
  
  analytics.reviews.averageRating = analytics.reviews.total > 0 ? 
    Math.round((totalRating / analytics.reviews.total) * 10) / 10 : 0;
  
  // Sort recent reviews by date
  analytics.reviews.recentReviews = recentReviews
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as Array<any>;
  
  return c.json({
    success: true,
    data: analytics
  });
});

// Get system health metrics (public endpoint)
analytics.get('/health', async (c) => {
  const health = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    services: {
      kv: 'healthy',
      api: 'healthy'
    },
    metrics: {
      responseTime: 0,
      memoryUsage: 0,
      requestCount: 0,
      errorRate: 0
    },
    storage: {
      users: 0,
      practitioners: 0,
      appointments: 0,
      messages: 0,
      services: 0,
      reviews: 0,
      analytics: 0
    }
  };
  
  const startTime = Date.now();
  
  try {
    // Test KV operations
    const testKey = `health_check:${Date.now()}`;
    await c.env.ANALYTICS_KV.put(testKey, 'test', { expirationTtl: 60 });
    const testValue = await c.env.ANALYTICS_KV.get(testKey);
    await c.env.ANALYTICS_KV.delete(testKey);
    
    if (testValue !== 'test') {
      health.services.kv = 'unhealthy';
      health.status = 'degraded';
    }
  } catch (error) {
    health.services.kv = 'unhealthy';
    health.status = 'unhealthy';
  }
  
  // Get storage counts
  try {
    const [users, practitioners, appointments, messages, services, reviews, analytics] = await Promise.all([
      c.env.USERS_KV.list({ prefix: 'user:', limit: 1 }),
      c.env.PRACTITIONERS_KV.list({ prefix: 'practitioner:', limit: 1 }),
      c.env.APPOINTMENTS_KV.list({ prefix: 'appointment:', limit: 1 }),
      c.env.MESSAGES_KV.list({ prefix: 'message:', limit: 1 }),
      c.env.SERVICES_KV.list({ prefix: 'service:', limit: 1 }),
      c.env.REVIEWS_KV.list({ prefix: 'review:', limit: 1 }),
      c.env.ANALYTICS_KV.list({ prefix: 'event:', limit: 1 })
    ]);
    
    health.storage = {
      users: users.keys.length,
      practitioners: practitioners.keys.length,
      appointments: appointments.keys.length,
      messages: messages.keys.length,
      services: services.keys.length,
      reviews: reviews.keys.length,
      analytics: analytics.keys.length
    };
  } catch (error) {
    health.status = 'degraded';
  }
  
  health.metrics.responseTime = Date.now() - startTime;
  
  return c.json({
    success: true,
    data: health
  });
});

export default analytics;