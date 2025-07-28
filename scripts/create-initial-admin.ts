/**
 * Create initial admin user in ADMINS_KV
 * This script should be run once to bootstrap the admin system
 */

import { WorkerEnv } from '../src/types/env';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: 'SuperAdmin' | 'Admin' | 'Moderator' | 'Curator' | 'Support';
  permissions: string[];
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  loginAttempts: number;
  lockedUntil?: string;
  metadata: {
    createdBy: string;
    source: string;
  };
}

/**
 * Create a default superadmin user
 */
export async function createInitialAdmin(env: WorkerEnv): Promise<{
  success: boolean;
  message: string;
  admin?: AdminUser;
  credentials?: { email: string; password: string };
}> {
  try {
    // Check if ADMINS_KV is available
    if (!env.ADMINS_KV) {
      return {
        success: false,
        message: 'ADMINS_KV namespace is not available. Please check your wrangler.toml configuration.'
      };
    }

    // Check if any admin users already exist
    const existingAdmins = await env.ADMINS_KV.list({ prefix: 'admin:' });
    
    if (existingAdmins.keys.length > 0) {
      return {
        success: false,
        message: 'Admin users already exist. Cannot create initial admin.'
      };
    }

    // Default credentials for initial admin
    const defaultEmail = 'admin@klearkarma.com';
    const defaultPassword = 'KlearKarma2024!';
    
    const adminId = uuidv4();
    const passwordHash = await bcrypt.hash(defaultPassword, 12);
    
    const admin: AdminUser = {
      id: adminId,
      email: defaultEmail,
      passwordHash,
      fullName: 'System Administrator',
      role: 'SuperAdmin',
      permissions: [
        'admin:*',
        'user:*',
        'practitioner:*',
        'content:*',
        'analytics:*',
        'system:*'
      ],
      isActive: true,
      isVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      loginAttempts: 0,
      metadata: {
        createdBy: 'system',
        source: 'bootstrap'
      }
    };

    // Store admin user
    await env.ADMINS_KV.put(`admin:${adminId}`, JSON.stringify(admin));
    await env.ADMINS_KV.put(`admin:email:${defaultEmail}`, adminId);
    
    console.log('✅ Initial admin user created successfully');
    
    return {
      success: true,
      message: 'Initial admin user created successfully',
      admin,
      credentials: {
        email: defaultEmail,
        password: defaultPassword
      }
    };
  } catch (error) {
    console.error('❌ Failed to create initial admin:', error);
    return {
      success: false,
      message: `Failed to create initial admin: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Create a custom admin user with provided credentials
 */
export async function createCustomAdmin(
  env: WorkerEnv,
  email: string,
  password: string,
  fullName: string
): Promise<{
  success: boolean;
  message: string;
  admin?: AdminUser;
}> {
  try {
    // Check if ADMINS_KV is available
    if (!env.ADMINS_KV) {
      return {
        success: false,
        message: 'ADMINS_KV namespace is not available. Please check your wrangler.toml configuration.'
      };
    }

    // Check if email already exists
    const existingAdminId = await env.ADMINS_KV.get(`admin:email:${email}`);
    
    if (existingAdminId) {
      return {
        success: false,
        message: 'Admin user with this email already exists'
      };
    }

    const adminId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);
    
    const admin: AdminUser = {
      id: adminId,
      email,
      passwordHash,
      fullName,
      role: 'Admin',
      permissions: [
        'user:read',
        'user:update',
        'practitioner:read',
        'practitioner:update',
        'content:read',
        'content:update',
        'analytics:read'
      ],
      isActive: true,
      isVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      loginAttempts: 0,
      metadata: {
        createdBy: 'bootstrap',
        source: 'custom'
      }
    };

    // Store admin user
    await env.ADMINS_KV.put(`admin:${adminId}`, JSON.stringify(admin));
    await env.ADMINS_KV.put(`admin:email:${email}`, adminId);
    
    console.log('✅ Custom admin user created successfully');
    
    return {
      success: true,
      message: 'Custom admin user created successfully',
      admin
    };
  } catch (error) {
    console.error('❌ Failed to create custom admin:', error);
    return {
      success: false,
      message: `Failed to create custom admin: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}