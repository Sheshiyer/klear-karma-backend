import { Hono } from 'hono';
import { WorkerEnv } from '../../types/env';
import { AuditAction, AuditLog } from '../../types/admin';
import { adminAuthMiddleware, requirePermission } from '../../middleware/adminAuth';
import { createAdminAuditLog } from './auth';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Apply admin authentication to all routes
app.use('*', adminAuthMiddleware);

// Apply audit permission to all routes
app.use('*', requirePermission('system:audit'));

/**
 * @route GET /admin/audit-logs
 * @desc Get audit logs with pagination and filtering
 * @access Admin with system:audit permission
 */
app.get('/', async (c) => {
  const { 
    page = '1', 
    limit = '50', 
    adminId, 
    action, 
    targetType, 
    targetId,
    fromDate,
    toDate
  } = c.req.query();
  
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 50, 100); // Max 100 per page
  
  // List all audit logs
  let auditLogsList;
  
  // If filtering by admin, use the admin index
  if (adminId) {
    auditLogsList = await c.env.AUDIT_LOGS_KV.list({ prefix: `audit:admin:${adminId}:` });
  } else {
    // Otherwise use the time-based index
    auditLogsList = await c.env.AUDIT_LOGS_KV.list({ prefix: 'audit:time:' });
  }
  
  let auditLogs: AuditLog[] = [];
  
  // Get audit log data for each key
  for (const key of auditLogsList.keys) {
    const logId = await c.env.AUDIT_LOGS_KV.get(key.name);
    if (logId) {
      const logData = await c.env.AUDIT_LOGS_KV.get(`audit:${logId}`);
      if (logData) {
        const log = JSON.parse(logData) as AuditLog;
        
        // Apply filters if provided
        if (action && log.action !== action) continue;
        if (targetType && log.targetType !== targetType) continue;
        if (targetId && log.targetId !== targetId) continue;
        
        // Date range filtering
        if (fromDate) {
          const fromDateTime = new Date(fromDate).getTime();
          const logTime = new Date(log.timestamp).getTime();
          if (logTime < fromDateTime) continue;
        }
        
        if (toDate) {
          const toDateTime = new Date(toDate).getTime();
          const logTime = new Date(log.timestamp).getTime();
          if (logTime > toDateTime) continue;
        }
        
        auditLogs.push(log);
      }
    }
  }
  
  // Sort by timestamp (newest first)
  auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  // Apply pagination
  const offset = (pageNum - 1) * limitNum;
  const paginatedLogs = auditLogs.slice(offset, offset + limitNum);
  
  // Create audit log for this view
  await createAdminAuditLog(
    c,
    'audit_log_view',
    'system',
    null,
    { filters: { adminId, action, targetType, targetId, fromDate, toDate } }
  );
  
  return c.json({
    success: true,
    auditLogs: paginatedLogs,
    pagination: {
      total: auditLogs.length,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(auditLogs.length / limitNum)
    }
  });
});

/**
 * @route GET /admin/audit-logs/:id
 * @desc Get a specific audit log by ID
 * @access Admin with system:audit permission
 */
app.get('/:id', async (c) => {
  const logId = c.req.param('id');
  
  // Get audit log data
  const logData = await c.env.AUDIT_LOGS_KV.get(`audit:${logId}`);
  
  if (!logData) {
    return c.json({
      success: false,
      message: 'Audit log not found'
    }, 404);
  }
  
  const auditLog = JSON.parse(logData);
  
  // Create audit log for this view
  await createAdminAuditLog(
    c,
    'audit_log_view',
    'system',
    logId,
    { auditLogId: logId }
  );
  
  return c.json({
    success: true,
    auditLog
  });
});

/**
 * @route GET /admin/audit-logs/actions
 * @desc Get list of possible audit log actions for filtering
 * @access Admin with system:audit permission
 */
app.get('/actions', async (c) => {
  // List of all possible audit actions
  const actions: AuditAction[] = [
    'login',
    'logout',
    'admin_create',
    'admin_update',
    'admin_delete',
    'admin_view',
    'admin_list_view',
    'user_create',
    'user_update',
    'user_delete',
    'user_view',
    'dashboard_view',
    'analytics_view',
    'settings_update',
    'settings_view',
    'review_approve',
    'review_reject',
    'review_delete',
    'audit_log_view'
  ];
  
  return c.json({
    success: true,
    actions
  });
});

/**
 * @route GET /admin/audit-logs/target-types
 * @desc Get list of possible audit log target types for filtering
 * @access Admin with system:audit permission
 */
app.get('/target-types', async (c) => {
  // List of all possible target types
  const targetTypes = [
    'admin',
    'user',
    'practitioner',
    'booking',
    'review',
    'product',
    'system',
    'settings',
    'analytics'
  ];
  
  return c.json({
    success: true,
    targetTypes
  });
});

/**
 * @route GET /admin/audit-logs/stats
 * @desc Get statistics on audit logs
 * @access Admin with system:audit permission
 */
app.get('/stats', async (c) => {
  // List all audit logs
  const auditLogsList = await c.env.AUDIT_LOGS_KV.list({ prefix: 'audit:time:' });
  
  let auditLogs: AuditLog[] = [];
  let actionCounts: Record<string, number> = {};
  let targetTypeCounts: Record<string, number> = {};
  let adminCounts: Record<string, number> = {};
  
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  let totalCount = 0;
  let dailyCount = 0;
  let weeklyCount = 0;
  
  // Get audit log data for each key
  for (const key of auditLogsList.keys) {
    const logId = await c.env.AUDIT_LOGS_KV.get(key.name);
    if (logId) {
      const logData = await c.env.AUDIT_LOGS_KV.get(`audit:${logId}`);
      if (logData) {
        const log = JSON.parse(logData) as AuditLog;
        auditLogs.push(log);
        
        totalCount++;
        
        // Count by action
        actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
        
        // Count by target type
        targetTypeCounts[log.targetType] = (targetTypeCounts[log.targetType] || 0) + 1;
        
        // Count by admin
        adminCounts[log.adminId] = (adminCounts[log.adminId] || 0) + 1;
        
        // Count by time period
        const logTime = new Date(log.timestamp);
        if (logTime >= oneDayAgo) {
          dailyCount++;
        }
        if (logTime >= oneWeekAgo) {
          weeklyCount++;
        }
      }
    }
  }
  
  // Create audit log for this view
  await createAdminAuditLog(
    c,
    'audit_log_view',
    'system',
    null,
    { stats: true }
  );
  
  return c.json({
    success: true,
    stats: {
      total: totalCount,
      daily: dailyCount,
      weekly: weeklyCount,
      byAction: actionCounts,
      byTargetType: targetTypeCounts,
      byAdmin: adminCounts
    }
  });
});

export { app as auditLogRoutes };