export type AdminRole = 'superadmin' | 'admin' | 'moderator' | 'curator' | 'support';

export type Permission = 
  // User permissions
  | 'user:read' | 'user:write' | 'user:delete' 
  // Practitioner permissions
  | 'practitioner:read' | 'practitioner:write' | 'practitioner:delete' 
  // Product permissions
  | 'product:read' | 'product:write' | 'product:delete' 
  // Booking permissions
  | 'booking:read' | 'booking:write' | 'booking:delete' 
  // Payment permissions
  | 'payment:read' | 'payment:write' | 'payment:refund' 
  // Content permissions
  | 'content:read' | 'content:write' | 'content:delete' | 'content:moderate' 
  // System permissions
  | 'system:read' | 'system:write' | 'system:admin' | 'system:audit' 
  // Analytics permissions
  | 'analytics:read' | 'analytics:export';

export interface AdminUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: AdminRole;
  permissions: Permission[];
  active: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCreationData {
  email: string;
  password: string;
  fullName: string;
  role: AdminRole;
  permissions?: Permission[];
}

export interface AdminUpdateData {
  fullName?: string;
  role?: AdminRole;
  permissions?: Permission[];
  active?: boolean;
}

export interface AdminJWTPayload {
  id: string;
  email: string;
  role: AdminRole;
  permissions: Permission[];
  [key: string]: any;
}

export type AuditAction = 
  // Authentication actions
  | 'login' | 'logout' | 'password_reset' 
  // User actions
  | 'user_view' | 'user_create' | 'user_update' | 'user_delete' | 'user_verify' | 'user_suspend' 
  // Admin actions
  | 'admin_view' | 'admin_create' | 'admin_update' | 'admin_delete' 
  // Practitioner actions
  | 'practitioner_view' | 'practitioner_update' | 'practitioner_verify' | 'practitioner_suspend' 
  // Content actions
  | 'review_moderate' | 'review_delete' 
  // System actions
  | 'settings_view' | 'settings_update' | 'settings_reset';

export type AuditTargetType = 'user' | 'admin' | 'practitioner' | 'review' | 'booking' | 'product' | 'system';

export interface AuditLog {
  id: string;
  adminId: string;
  adminEmail: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
}

export interface DashboardData {
  users: {
    total: number;
    active: number;
    newToday: number;
    newThisWeek: number;
    verificationRate: number;
  };
  practitioners: {
    total: number;
    active: number;
    verified: number;
    newThisWeek: number;
  };
  bookings: {
    total: number;
    completed: number;
    upcoming: number;
    cancelled: number;
  };
  products: {
    total: number;
    active: number;
  };
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    currency: string;
  };
  recentActivity: AuditLog[];
}

export interface SystemSettings {
  general: {
    siteName: string;
    siteDescription: string;
    contactEmail: string;
    supportPhone: string;
    maintenanceMode: boolean;
  };
  security: {
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSpecialChars: boolean;
    };
    sessionTimeout: number; // in minutes
    maxLoginAttempts: number;
    passwordResetTimeoutMinutes: number;
  };
  email: {
    verificationRequired: boolean;
    welcomeEmailEnabled: boolean;
    reminderEmailsEnabled: boolean;
    senderName: string;
    senderEmail: string;
  };
  booking: {
    minAdvanceTime: number; // in hours
    maxAdvanceTime: number; // in days
    cancellationPolicy: {
      allowedUntil: number; // in hours before appointment
      refundPercentage: number;
    };
    autoConfirm: boolean;
  };
  payment: {
    currency: string;
    platformFee: number; // flat fee
    platformFeePercentage: number; // percentage fee
    minimumPayout: number;
    payoutSchedule: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  };
  moderation: {
    autoApproveReviews: boolean;
    minimumReviewLength: number;
    profanityFilter: boolean;
    requirePurchaseForReview: boolean;
  };
  notifications: {
    emailNotifications: boolean;
    pushNotifications: boolean;
    smsNotifications: boolean;
  };
  analytics: {
    googleAnalyticsId: string;
    facebookPixelId: string;
    collectAnonymousStats: boolean;
  };
}

export type ModerationStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewModerationData {
  status: ModerationStatus;
  moderationNotes?: string;
  moderationReason?: string;
}

export interface ModeratedReview {
  id: string;
  userId: string;
  practitionerId: string;
  rating: number;
  content: string;
  status: ModerationStatus;
  moderationNotes?: string;
  moderationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type AnalyticsInterval = 'day' | 'week' | 'month';

export interface UserAnalytics {
  totalUsers: number;
  activeUsers: number;
  userGrowth: {
    percentage: number;
    absolute: number;
  };
  retentionRate: number;
  timeline: {
    labels: string[];
    data: number[];
  };
}

export const DEFAULT_ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  superadmin: [
    'user:read', 'user:write', 'user:delete',
    'practitioner:read', 'practitioner:write', 'practitioner:delete',
    'product:read', 'product:write', 'product:delete',
    'booking:read', 'booking:write', 'booking:delete',
    'payment:read', 'payment:write', 'payment:refund',
    'content:read', 'content:write', 'content:delete', 'content:moderate',
    'system:read', 'system:write', 'system:admin', 'system:audit',
    'analytics:read', 'analytics:export'
  ],
  admin: [
    'user:read', 'user:write',
    'practitioner:read', 'practitioner:write',
    'product:read', 'product:write',
    'booking:read', 'booking:write',
    'payment:read', 'payment:write', 'payment:refund',
    'content:read', 'content:write', 'content:moderate',
    'system:read', 'system:write',
    'analytics:read', 'analytics:export'
  ],
  moderator: [
    'user:read',
    'practitioner:read',
    'product:read',
    'booking:read',
    'content:read', 'content:write', 'content:moderate',
    'analytics:read'
  ],
  curator: [
    'user:read',
    'practitioner:read',
    'product:read', 'product:write',
    'content:read', 'content:write',
    'analytics:read'
  ],
  support: [
    'user:read',
    'practitioner:read',
    'product:read',
    'booking:read',
    'payment:read',
    'content:read',
    'analytics:read'
  ]
};