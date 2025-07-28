import { Hono } from 'hono';
import { WorkerEnv } from '../../types/env';
import { adminAuthMiddleware, requirePermission } from '../../middleware/adminAuth';
import { adminKeyAuthMiddleware, optionalAdminKeyAuthMiddleware } from '../../middleware/adminKeyAuth';
import { createAdminAuditLog } from './auth';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Apply admin key authentication first (for X-Admin-Key header)
// Then apply JWT admin authentication as fallback
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

// Custom permission middleware that works with both admin key and JWT auth
function requirePermissionOrAdminKey(permission: string) {
  return async function(c: any, next: any) {
    // If admin key auth was successful, bypass permission checks
    const adminKeyAuth = c.get('adminKeyAuth');
    if (adminKeyAuth) {
      await next();
      return;
    }
    
    // Otherwise, use normal permission checking
    await requirePermission(permission as any)(c, next);
  };
}

/**
 * Collect user statistics from KV store
 */
async function collectUserStats(env: WorkerEnv) {
  const usersList = await env.USERS_KV.list({ prefix: 'user:' });
  let totalUsers = 0;
  let activeUsers = 0;
  let verifiedUsers = 0;
  let newUsersLast30Days = 0;
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  for (const key of usersList.keys) {
    if (!key.name.startsWith('user:email:')) {
      const userData = await env.USERS_KV.get(key.name);
      if (userData) {
        const user = JSON.parse(userData);
        totalUsers++;
        
        if (user.active) activeUsers++;
        if (user.verified) verifiedUsers++;
        
        const createdAt = new Date(user.createdAt);
        if (createdAt >= thirtyDaysAgo) {
          newUsersLast30Days++;
        }
      }
    }
  }
  
  return {
    total: totalUsers,
    active: activeUsers,
    verified: verifiedUsers,
    newLast30Days: newUsersLast30Days,
    verificationRate: totalUsers > 0 ? (verifiedUsers / totalUsers) * 100 : 0
  };
}

/**
 * Collect practitioner statistics from KV store
 */
async function collectPractitionerStats(env: WorkerEnv) {
  const usersList = await env.USERS_KV.list({ prefix: 'user:' });
  let totalPractitioners = 0;
  let activePractitioners = 0;
  let verifiedPractitioners = 0;
  
  for (const key of usersList.keys) {
    if (!key.name.startsWith('user:email:')) {
      const userData = await env.USERS_KV.get(key.name);
      if (userData) {
        const user = JSON.parse(userData);
        
        if (user.role === 'practitioner') {
          totalPractitioners++;
          if (user.active) activePractitioners++;
          if (user.verified) verifiedPractitioners++;
        }
      }
    }
  }
  
  return {
    total: totalPractitioners,
    active: activePractitioners,
    verified: verifiedPractitioners,
    verificationRate: totalPractitioners > 0 ? (verifiedPractitioners / totalPractitioners) * 100 : 0
  };
}

/**
 * Collect booking statistics from KV store
 */
async function collectBookingStats(env: WorkerEnv) {
  const bookingsList = await env.BOOKINGS_KV.list({ prefix: 'booking:' });
  let totalBookings = 0;
  let completedBookings = 0;
  let upcomingBookings = 0;
  let cancelledBookings = 0;
  
  const now = new Date();
  
  for (const key of bookingsList.keys) {
    const bookingData = await env.BOOKINGS_KV.get(key.name);
    if (bookingData) {
      const booking = JSON.parse(bookingData);
      totalBookings++;
      
      const bookingDate = new Date(booking.date);
      
      if (booking.status === 'completed') {
        completedBookings++;
      } else if (booking.status === 'cancelled') {
        cancelledBookings++;
      } else if (bookingDate > now) {
        upcomingBookings++;
      }
    }
  }
  
  return {
    total: totalBookings,
    completed: completedBookings,
    upcoming: upcomingBookings,
    cancelled: cancelledBookings,
    cancellationRate: totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0
  };
}

/**
 * Collect product statistics from KV store
 */
async function collectProductStats(env: WorkerEnv) {
  const productsList = await env.PRODUCTS_KV.list({ prefix: 'product:' });
  let totalProducts = 0;
  let activeProducts = 0;
  let totalInventory = 0;
  
  for (const key of productsList.keys) {
    const productData = await env.PRODUCTS_KV.get(key.name);
    if (productData) {
      const product = JSON.parse(productData);
      totalProducts++;
      
      if (product.active) {
        activeProducts++;
      }
      
      if (product.inventory) {
        totalInventory += product.inventory;
      }
    }
  }
  
  return {
    total: totalProducts,
    active: activeProducts,
    inventory: totalInventory
  };
}

/**
 * Collect recent activity from audit logs
 */
async function collectRecentActivity(env: WorkerEnv, limit = 10) {
  const auditLogs = await env.AUDIT_LOGS_KV.list({ prefix: 'audit:time:', limit });
  const activities = [];
  
  for (const key of auditLogs.keys) {
    const logId = await env.AUDIT_LOGS_KV.get(key.name);
    if (logId) {
      const logData = await env.AUDIT_LOGS_KV.get(`audit:${logId}`);
      if (logData) {
        activities.push(JSON.parse(logData));
      }
    }
  }
  
  // Sort by timestamp (newest first)
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  return activities.slice(0, limit);
}

/**
 * Generate user timeline data
 */
async function generateUserTimeline(env: WorkerEnv, interval = 'day', days = 30) {
  const usersList = await env.USERS_KV.list({ prefix: 'user:' });
  const timeline: Record<string, number> = {};
  
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  
  // Initialize timeline with zeros
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const key = interval === 'day' 
      ? date.toISOString().split('T')[0]
      : interval === 'week'
        ? `Week ${Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7)}`
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!timeline[key]) {
      timeline[key] = 0;
    }
  }
  
  // Count users by creation date
  for (const key of usersList.keys) {
    if (!key.name.startsWith('user:email:')) {
      const userData = await env.USERS_KV.get(key.name);
      if (userData) {
        const user = JSON.parse(userData);
        const createdAt = new Date(user.createdAt);
        
        if (createdAt >= startDate && createdAt <= now) {
          const timeKey = interval === 'day' 
            ? createdAt.toISOString().split('T')[0]
            : interval === 'week'
              ? `Week ${Math.ceil((createdAt.getDate() + new Date(createdAt.getFullYear(), createdAt.getMonth(), 1).getDay()) / 7)}`
              : `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
          
          if (timeline[timeKey] !== undefined) {
            timeline[timeKey]++;
          }
        }
      }
    }
  }
  
  // Convert to array format
  return Object.entries(timeline).map(([date, count]) => ({ date, count }));
}

/**
 * Generate booking timeline data
 */
async function generateBookingTimeline(env: WorkerEnv, interval = 'day', days = 30) {
  const bookingsList = await env.BOOKINGS_KV.list({ prefix: 'booking:' });
  const timeline: Record<string, number> = {};
  
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  
  // Initialize timeline with zeros
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const key = interval === 'day' 
      ? date.toISOString().split('T')[0]
      : interval === 'week'
        ? `Week ${Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7)}`
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!timeline[key]) {
      timeline[key] = 0;
    }
  }
  
  // Count bookings by creation date
  for (const key of bookingsList.keys) {
    const bookingData = await env.BOOKINGS_KV.get(key.name);
    if (bookingData) {
      const booking = JSON.parse(bookingData);
      const createdAt = new Date(booking.createdAt);
      
      if (createdAt >= startDate && createdAt <= now) {
        const timeKey = interval === 'day' 
          ? createdAt.toISOString().split('T')[0]
          : interval === 'week'
            ? `Week ${Math.ceil((createdAt.getDate() + new Date(createdAt.getFullYear(), createdAt.getMonth(), 1).getDay()) / 7)}`
            : `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
        
        if (timeline[timeKey] !== undefined) {
          timeline[timeKey]++;
        }
      }
    }
  }
  
  // Convert to array format
  return Object.entries(timeline).map(([date, count]) => ({ date, count }));
}

/**
 * @route GET /admin/analytics/dashboard
 * @desc Get dashboard overview data
 * @access Admin
 */
app.get('/analytics/dashboard', requirePermissionOrAdminKey('analytics:read'), async (c) => {
  // Collect stats in parallel
  const [userStats, practitionerStats, bookingStats, productStats, recentActivity] = await Promise.all([
    collectUserStats(c.env),
    collectPractitionerStats(c.env),
    collectBookingStats(c.env),
    collectProductStats(c.env),
    collectRecentActivity(c.env, 5)
  ]);
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'settings_view',
    'system',
    null,
    {}
  );
  
  return c.json({
    success: true,
    dashboard: {
      users: userStats,
      practitioners: practitionerStats,
      bookings: bookingStats,
      products: productStats,
      recentActivity,
      // Placeholder for revenue statistics
      revenue: {
        total: 0,
        thisMonth: 0,
        lastMonth: 0,
        growth: 0
      }
    }
  });
});

/**
 * @route GET /admin/dashboard
 * @desc Get dashboard overview data (alias)
 * @access Admin
 */
app.get('/dashboard', requirePermissionOrAdminKey('analytics:read'), async (c) => {
  // Collect stats in parallel
  const [userStats, practitionerStats, bookingStats, productStats, recentActivity] = await Promise.all([
    collectUserStats(c.env),
    collectPractitionerStats(c.env),
    collectBookingStats(c.env),
    collectProductStats(c.env),
    collectRecentActivity(c.env, 5)
  ]);
  
  // Create audit log
  await createAdminAuditLog(
      c,
      'settings_view',
      'system',
      null,
      {}
    );
  
  return c.json({
    success: true,
    users: userStats,
    practitioners: practitionerStats,
    appointments: bookingStats,
    products: productStats,
    recentActivity
  });
});

/**
 * @route GET /admin/analytics/users
 * @desc Get detailed user analytics
 * @access Admin
 */
app.get('/analytics/users', requirePermissionOrAdminKey('analytics:read'), async (c) => {
  const { interval = 'day', days = '30' } = c.req.query();
  const daysNum = parseInt(days, 10) || 30;
  
  // Get user stats and timeline
  const [userStats, timeline] = await Promise.all([
    collectUserStats(c.env),
    generateUserTimeline(c.env, interval as 'day' | 'week' | 'month', daysNum)
  ]);
  
  // Calculate retention rate (placeholder - would need actual login data)
  const retentionRate = 0.75; // 75% placeholder
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'settings_view',
    'analytics',
    null,
    { type: 'users', interval, days: daysNum }
  );
  
  return c.json({
    success: true,
    analytics: {
      totalUsers: userStats.total,
      activeUsers: userStats.active,
      verifiedUsers: userStats.verified,
      newUsersLast30Days: userStats.newLast30Days,
      verificationRate: userStats.verificationRate,
      retentionRate: retentionRate * 100,
      timeline
    }
  });
});

/**
 * @route GET /admin/analytics/bookings
 * @desc Get detailed booking analytics
 * @access Admin
 */
app.get('/analytics/bookings', requirePermissionOrAdminKey('analytics:read'), async (c) => {
  const { interval = 'day', days = '30' } = c.req.query();
  const daysNum = parseInt(days, 10) || 30;
  
  // Get booking stats and timeline
  const [bookingStats, timeline] = await Promise.all([
    collectBookingStats(c.env),
    generateBookingTimeline(c.env, interval as 'day' | 'week' | 'month', daysNum)
  ]);
  
  // Get popular services (placeholder)
  const popularServices = [
    { id: '1', name: 'Yoga Session', count: 45 },
    { id: '2', name: 'Meditation', count: 32 },
    { id: '3', name: 'Reiki Healing', count: 28 }
  ];
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'settings_view',
    'analytics',
    null,
    { type: 'bookings', interval, days: daysNum }
  );
  
  return c.json({
    success: true,
    analytics: {
      totalBookings: bookingStats.total,
      completedBookings: bookingStats.completed,
      upcomingBookings: bookingStats.upcoming,
      cancelledBookings: bookingStats.cancelled,
      cancellationRate: bookingStats.cancellationRate,
      timeline,
      popularServices
    }
  });
});

/**
 * @route GET /admin/analytics/practitioners
 * @desc Get detailed practitioner analytics
 * @access Admin
 */
app.get('/analytics/practitioners', requirePermissionOrAdminKey('analytics:read'), async (c) => {
  const practitionerStats = await collectPractitionerStats(c.env);
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'settings_view',
    'analytics',
    null,
    { type: 'practitioners' }
  );
  
  return c.json({
    success: true,
    analytics: {
      totalPractitioners: practitionerStats.total,
      activePractitioners: practitionerStats.active,
      verifiedPractitioners: practitionerStats.verified,
      verificationRate: practitionerStats.verificationRate
    }
  });
});

/**
 * @route GET /admin/analytics/appointments
 * @desc Get detailed appointment analytics
 * @access Admin
 */
app.get('/analytics/appointments', requirePermissionOrAdminKey('analytics:read'), async (c) => {
  const bookingStats = await collectBookingStats(c.env);
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'settings_view',
    'analytics',
    null,
    { type: 'appointments' }
  );
  
  return c.json({
    success: true,
    analytics: {
      totalAppointments: bookingStats.total,
      completedAppointments: bookingStats.completed,
      upcomingAppointments: bookingStats.upcoming,
      cancelledAppointments: bookingStats.cancelled,
      cancellationRate: bookingStats.cancellationRate
    }
  });
});

/**
 * @route GET /admin/analytics/revenue
 * @desc Get detailed revenue analytics
 * @access Admin
 */
app.get('/analytics/revenue', requirePermissionOrAdminKey('analytics:read'), async (c) => {
  // Placeholder revenue calculation
  const totalRevenue = 0;
  const monthlyRevenue = 0;
  const averageBookingValue = 0;
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'settings_view',
    'analytics',
    null,
    { type: 'revenue' }
  );
  
  return c.json({
    success: true,
    analytics: {
      totalRevenue,
      monthlyRevenue,
      averageBookingValue,
      growth: 0
    }
  });
});

/**
 * @route GET /admin/analytics/health
 * @desc Get system health analytics
 * @access Admin
 */
app.get('/analytics/health', requirePermissionOrAdminKey('analytics:read'), async (c) => {
  // Basic system health check
  const status = 'healthy';
  const uptime = Date.now();
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'settings_view',
    'analytics',
    null,
    { type: 'health' }
  );
  
  return c.json({
    success: true,
    analytics: {
      status,
      uptime,
      timestamp: new Date().toISOString()
    }
  });
});



export { app as dashboardRoutes };