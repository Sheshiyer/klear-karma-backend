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
import { practitionerRoutes } from './practitioners';
import { productRoutes } from './products';
import { statsRoutes } from './stats';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Register all admin routes
app.route('/auth', authRoutes);
app.route('/users', userRoutes);
app.route('/admins', adminRoutes);
app.route('/analytics', dashboardRoutes); // Alias for dashboard
app.route('/dashboard', dashboardRoutes);
app.route('/moderation', moderationRoutes);
app.route('/settings', settingsRoutes);
app.route('/audit-logs', auditLogRoutes);
app.route('/practitioners', practitionerRoutes);
app.route('/products', productRoutes);
app.route('/stats', statsRoutes);

export default app;