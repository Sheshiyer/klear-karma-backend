import { Hono } from 'hono';
import { WorkerEnv } from '../../types/env';

// Import admin routes
import { authRoutes } from './auth';
import { userRoutes } from './users';
import { adminRoutes } from './admins';
import { dashboardRoutes } from './dashboard';
import { moderationRoutes } from './moderation';
import { settingsRoutes } from './settings';
import { auditLogRoutes } from './audit-logs';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Register all admin routes
app.route('/auth', authRoutes);
app.route('/users', userRoutes);
app.route('/admins', adminRoutes);
app.route('/dashboard', dashboardRoutes);
app.route('/analytics', dashboardRoutes); // Add analytics alias for the dashboard routes
app.route('/moderation', moderationRoutes);
app.route('/settings', settingsRoutes);
app.route('/audit-logs', auditLogRoutes);

export default app;