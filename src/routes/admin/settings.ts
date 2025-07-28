import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WorkerEnv } from '../../types/env';
import { adminAuthMiddleware, requirePermission } from '../../middleware/adminAuth';
import { createAdminAuditLog } from './auth';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Apply admin authentication to all routes
app.use('*', adminAuthMiddleware);

// Define system settings schema
const systemSettingsSchema = z.object({
  features: z.object({
    enableBookings: z.boolean().optional(),
    enableProducts: z.boolean().optional(),
    enableReviews: z.boolean().optional(),
    enableChat: z.boolean().optional(),
    enablePractitionerVerification: z.boolean().optional(),
    enableUserVerification: z.boolean().optional(),
    maintenanceMode: z.boolean().optional()
  }).optional(),
  
  email: z.object({
    enableEmailNotifications: z.boolean().optional(),
    adminEmail: z.string().email().optional(),
    supportEmail: z.string().email().optional(),
    emailProvider: z.enum(['sendgrid', 'mailgun', 'ses']).optional(),
    emailTemplates: z.record(z.string()).optional()
  }).optional(),
  
  security: z.object({
    passwordMinLength: z.number().min(8).max(32).optional(),
    sessionTimeout: z.number().min(1).max(24).optional(), // in hours
    maxLoginAttempts: z.number().min(3).max(10).optional(),
    requireEmailVerification: z.boolean().optional(),
    twoFactorAuthEnabled: z.boolean().optional()
  }).optional(),
  
  moderation: z.object({
    autoApproveReviews: z.boolean().optional(),
    profanityFilter: z.boolean().optional(),
    reviewMinLength: z.number().min(10).max(500).optional(),
    reviewMaxLength: z.number().min(100).max(5000).optional(),
    flaggedWords: z.array(z.string()).optional()
  }).optional(),
  
  notifications: z.object({
    enablePushNotifications: z.boolean().optional(),
    enableSMS: z.boolean().optional(),
    adminNotifications: z.object({
      newUsers: z.boolean().optional(),
      newPractitioners: z.boolean().optional(),
      newReviews: z.boolean().optional(),
      flaggedContent: z.boolean().optional()
    }).optional()
  }).optional(),
  
  analytics: z.object({
    enableGoogleAnalytics: z.boolean().optional(),
    googleAnalyticsId: z.string().optional(),
    enableCustomAnalytics: z.boolean().optional(),
    trackUserJourney: z.boolean().optional()
  }).optional(),
  
  payment: z.object({
    providers: z.array(z.enum(['stripe', 'paypal', 'square'])).optional(),
    currency: z.string().length(3).optional(),
    taxRate: z.number().min(0).max(30).optional(),
    platformFee: z.number().min(0).max(30).optional()
  }).optional()
});

/**
 * Helper function to deep merge objects
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

/**
 * Helper function to check if value is an object
 */
function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Helper function to find changes between objects for audit logging
 */
function findChanges(oldObj: any, newObj: any, path = ''): Record<string, { from: any, to: any }> {
  const changes: Record<string, { from: any, to: any }> = {};
  
  // Handle case where one object is null/undefined
  if (!oldObj || !newObj) {
    if (oldObj !== newObj) {
      changes[path.slice(1) || 'root'] = { from: oldObj, to: newObj };
    }
    return changes;
  }
  
  // Get all keys from both objects
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  
  for (const key of allKeys) {
    const oldValue = oldObj[key];
    const newValue = newObj[key];
    const currentPath = path ? `${path}.${key}` : key;
    
    // If both values are objects, recurse
    if (isObject(oldValue) && isObject(newValue)) {
      const nestedChanges = findChanges(oldValue, newValue, currentPath);
      Object.assign(changes, nestedChanges);
    } 
    // If values are different, record the change
    else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[currentPath] = { from: oldValue, to: newValue };
    }
  }
  
  return changes;
}

// Default system settings
const defaultSettings = {
  features: {
    enableBookings: true,
    enableProducts: true,
    enableReviews: true,
    enableChat: true,
    enablePractitionerVerification: true,
    enableUserVerification: false,
    maintenanceMode: false
  },
  email: {
    enableEmailNotifications: true,
    adminEmail: 'admin@klearkarma.com',
    supportEmail: 'support@klearkarma.com',
    emailProvider: 'sendgrid',
    emailTemplates: {
      welcome: 'Welcome to Klear Karma',
      passwordReset: 'Reset Your Password',
      bookingConfirmation: 'Your Booking is Confirmed',
      reviewApproved: 'Your Review Has Been Approved'
    }
  },
  security: {
    passwordMinLength: 8,
    sessionTimeout: 8, // hours
    maxLoginAttempts: 5,
    requireEmailVerification: true,
    twoFactorAuthEnabled: false
  },
  moderation: {
    autoApproveReviews: false,
    profanityFilter: true,
    reviewMinLength: 20,
    reviewMaxLength: 2000,
    flaggedWords: []
  },
  notifications: {
    enablePushNotifications: false,
    enableSMS: false,
    adminNotifications: {
      newUsers: true,
      newPractitioners: true,
      newReviews: true,
      flaggedContent: true
    }
  },
  analytics: {
    enableGoogleAnalytics: false,
    googleAnalyticsId: '',
    enableCustomAnalytics: true,
    trackUserJourney: true
  },
  payment: {
    providers: ['stripe'],
    currency: 'USD',
    taxRate: 0,
    platformFee: 10
  }
};

/**
 * @route GET /admin/settings
 * @desc Get system settings
 * @access Admin with settings:read permission
 */
app.get('/', requirePermission('settings:read'), async (c) => {
  // Get settings from KV
  const settingsData = await c.env.SETTINGS_KV.get('system:settings');
  
  // If no settings exist, return defaults
  const settings = settingsData ? JSON.parse(settingsData) : defaultSettings;
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'settings_view',
    'settings',
    null,
    {}
  );
  
  return c.json({
    success: true,
    settings
  });
});

/**
 * @route PUT /admin/settings
 * @desc Update system settings
 * @access Admin with settings:write permission
 */
app.put('/', requirePermission('settings:write'), zValidator('json', systemSettingsSchema), async (c) => {
  const updates = c.req.valid('json');
  
  // Get current settings
  const settingsData = await c.env.SETTINGS_KV.get('system:settings');
  const currentSettings = settingsData ? JSON.parse(settingsData) : defaultSettings;
  
  // Merge updates with current settings
  const updatedSettings = deepMerge(currentSettings, updates);
  
  // Find changes for audit log
  const changes = findChanges(currentSettings, updatedSettings);
  
  // Save updated settings
  await c.env.SETTINGS_KV.put('system:settings', JSON.stringify(updatedSettings));
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'settings_update',
    'settings',
    null,
    { changes }
  );
  
  return c.json({
    success: true,
    message: 'Settings updated successfully',
    settings: updatedSettings
  });
});

/**
 * @route POST /admin/settings/reset
 * @desc Reset system settings to defaults
 * @access Admin with settings:write permission
 */
app.post('/reset', requirePermission('settings:write'), async (c) => {
  // Get current settings for audit log
  const settingsData = await c.env.SETTINGS_KV.get('system:settings');
  const currentSettings = settingsData ? JSON.parse(settingsData) : null;
  
  // Save default settings
  await c.env.SETTINGS_KV.put('system:settings', JSON.stringify(defaultSettings));
  
  // Create audit log
  await createAdminAuditLog(
    c,
    'settings_reset',
    'settings',
    null,
    { previousSettings: currentSettings }
  );
  
  return c.json({
    success: true,
    message: 'Settings reset to defaults',
    settings: defaultSettings
  });
});

export { app as settingsRoutes };