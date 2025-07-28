import { Hono } from 'hono';
import type { WorkerEnv } from '../types/env';
import { 
  generateJWT, 
  generateRefreshToken, 
  verifyRefreshToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  generateEmailVerificationToken,
  verifyEmailVerificationToken
} from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/crypto';
import { validateEmail, validatePassword } from '../utils/validation';
import { 
  ValidationError, 
  AuthenticationError, 
  ConflictError, 
  NotFoundError,
  asyncHandler 
} from '../middleware/errorHandler';
import { createRateLimiter } from '../middleware/rateLimiter';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Rate limiters for auth endpoints
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 50 // Increased for testing
});

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 50 // Increased for testing
});

const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 50 // Increased for testing
});

// User registration
app.post('/register', registerLimiter, asyncHandler(async (c) => {
  const { email, password, fullName, role = 'user', phone } = await c.req.json();

  // Validate input
  if (!email || !password || !fullName) {
    throw new ValidationError('Email, password, and full name are required');
  }

  if (!validateEmail(email)) {
    throw new ValidationError('Invalid email format');
  }

  if (!validatePassword(password)) {
    throw new ValidationError('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
  }

  if (!['user', 'practitioner'].includes(role)) {
    throw new ValidationError('Role must be either "user" or "practitioner"');
  }

  // Check if user already exists
  const existingUserKey = `email:${email.toLowerCase()}`;
  const existingUser = await c.env.USERS_KV.get(existingUserKey);
  
  if (existingUser) {
    throw new ConflictError('User with this email already exists');
  }

  // Generate user ID and hash password
  const userId = crypto.randomUUID();
  const hashedPassword = await hashPassword(password);

  // Create user object
  const user = {
    id: userId,
    email: email.toLowerCase(),
    password: hashedPassword,
    fullName,
    role,
    phone: phone || null,
    verified: false,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLogin: null,
    profile: {
      avatar: null,
      bio: null,
      preferences: {
        notifications: {
          email: true,
          push: true,
          sms: false
        },
        privacy: {
          profileVisible: true,
          showEmail: false,
          showPhone: false
        }
      }
    }
  };

  // Store user data
  const userKey = `user:${userId}`;
  await Promise.all([
    c.env.USERS_KV.put(userKey, JSON.stringify(user)),
    c.env.USERS_KV.put(existingUserKey, userId) // Email to ID mapping
  ]);

  // Generate email verification token
  const verificationToken = await generateEmailVerificationToken(userId, email, c.env.JWT_SECRET);

  // TODO: Send verification email (implement email service)
  console.log(`Verification token for ${email}: ${verificationToken}`);

  // Generate tokens
  const accessToken = await generateJWT({
    sub: userId,
    email: user.email,
    role: user.role,
    verified: user.verified
  }, c.env.JWT_SECRET);

  const refreshToken = await generateRefreshToken(userId, c.env.JWT_SECRET);

  // Store refresh token
  const refreshKey = `refresh:${userId}`;
  await c.env.USERS_KV.put(refreshKey, refreshToken, {
    expirationTtl: 30 * 24 * 60 * 60 // 30 days
  });

  return c.json({
    message: 'User registered successfully',
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      verified: user.verified
    },
    tokens: {
      accessToken,
      refreshToken
    }
  }, 201);
}));

// User login
app.post('/login', loginLimiter, asyncHandler(async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  // Find user by email
  const emailKey = `email:${email.toLowerCase()}`;
  const userId = await c.env.USERS_KV.get(emailKey);
  
  if (!userId) {
    throw new AuthenticationError('Invalid email or password');
  }

  const userKey = `user:${userId}`;
  const userData = await c.env.USERS_KV.get(userKey);
  
  if (!userData) {
    throw new AuthenticationError('Invalid email or password');
  }

  const user = JSON.parse(userData);

  // Check if account is active
  if (!user.active) {
    throw new AuthenticationError('Account is deactivated');
  }

  // Verify password
  const isValidPassword = await verifyPassword(password, user.password);
  if (!isValidPassword) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Update last login
  user.lastLogin = new Date().toISOString();
  await c.env.USERS_KV.put(userKey, JSON.stringify(user));

  // Generate tokens
  const accessToken = await generateJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    verified: user.verified
  }, c.env.JWT_SECRET);

  const refreshToken = await generateRefreshToken(user.id, c.env.JWT_SECRET);

  // Store refresh token
  const refreshKey = `refresh:${user.id}`;
  await c.env.USERS_KV.put(refreshKey, refreshToken, {
    expirationTtl: 30 * 24 * 60 * 60 // 30 days
  });

  return c.json({
    message: 'Login successful',
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      verified: user.verified,
      lastLogin: user.lastLogin
    },
    tokens: {
      accessToken,
      refreshToken
    }
  });
}));

// Refresh token
app.post('/refresh', asyncHandler(async (c) => {
  const { refreshToken } = await c.req.json();

  if (!refreshToken) {
    throw new ValidationError('Refresh token is required');
  }

  try {
    // Verify refresh token
    const userId = await verifyRefreshToken(refreshToken, c.env.JWT_SECRET);

    // Check if refresh token exists in storage
    const refreshKey = `refresh:${userId}`;
    const storedToken = await c.env.USERS_KV.get(refreshKey);
    
    if (!storedToken || storedToken !== refreshToken) {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Get user data
    const userKey = `user:${userId}`;
    const userData = await c.env.USERS_KV.get(userKey);
    
    if (!userData) {
      throw new AuthenticationError('User not found');
    }

    const user = JSON.parse(userData);

    if (!user.active) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Generate new tokens
    const newAccessToken = await generateJWT({
      sub: user.id,
      email: user.email,
      role: user.role,
      verified: user.verified
    }, c.env.JWT_SECRET);

    const newRefreshToken = await generateRefreshToken(user.id, c.env.JWT_SECRET);

    // Update stored refresh token
    await c.env.USERS_KV.put(refreshKey, newRefreshToken, {
      expirationTtl: 30 * 24 * 60 * 60 // 30 days
    });

    return c.json({
      message: 'Tokens refreshed successfully',
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }
}));

// Logout
app.post('/logout', authMiddleware, asyncHandler(async (c) => {
  const user = c.get('user');
  
  // Remove refresh token
  const refreshKey = `refresh:${user.id}`;
  await c.env.USERS_KV.delete(refreshKey);

  return c.json({
    message: 'Logout successful'
  });
}));

// Verify email
app.post('/verify-email', asyncHandler(async (c) => {
  const { token } = await c.req.json();

  if (!token) {
    throw new ValidationError('Verification token is required');
  }

  try {
    const { userId, email } = await verifyEmailVerificationToken(token, c.env.JWT_SECRET);

    // Get user data
    const userKey = `user:${userId}`;
    const userData = await c.env.USERS_KV.get(userKey);
    
    if (!userData) {
      throw new NotFoundError('User not found');
    }

    const user = JSON.parse(userData);

    // Verify email matches
    if (user.email !== email) {
      throw new ValidationError('Invalid verification token');
    }

    // Update user verification status
    user.verified = true;
    user.updatedAt = new Date().toISOString();
    
    await c.env.USERS_KV.put(userKey, JSON.stringify(user));

    return c.json({
      message: 'Email verified successfully'
    });

  } catch (error) {
    throw new ValidationError('Invalid or expired verification token');
  }
}));

// Request password reset
app.post('/forgot-password', passwordResetLimiter, asyncHandler(async (c) => {
  const { email } = await c.req.json();

  if (!email) {
    throw new ValidationError('Email is required');
  }

  // Find user by email
  const emailKey = `email:${email.toLowerCase()}`;
  const userId = await c.env.USERS_KV.get(emailKey);
  
  if (!userId) {
    // Don't reveal if email exists or not
    return c.json({
      message: 'If an account with this email exists, a password reset link has been sent'
    });
  }

  // Generate password reset token
  const resetToken = await generatePasswordResetToken(userId, c.env.JWT_SECRET);

  // TODO: Send password reset email
  console.log(`Password reset token for ${email}: ${resetToken}`);

  return c.json({
    message: 'If an account with this email exists, a password reset link has been sent'
  });
}));

// Reset password
app.post('/reset-password', asyncHandler(async (c) => {
  const { token, newPassword } = await c.req.json();

  if (!token || !newPassword) {
    throw new ValidationError('Token and new password are required');
  }

  if (!validatePassword(newPassword)) {
    throw new ValidationError('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
  }

  try {
    const userId = await verifyPasswordResetToken(token, c.env.JWT_SECRET);

    // Get user data
    const userKey = `user:${userId}`;
    const userData = await c.env.USERS_KV.get(userKey);
    
    if (!userData) {
      throw new NotFoundError('User not found');
    }

    const user = JSON.parse(userData);

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update user password
    user.password = hashedPassword;
    user.updatedAt = new Date().toISOString();
    
    await c.env.USERS_KV.put(userKey, JSON.stringify(user));

    // Invalidate all refresh tokens
    const refreshKey = `refresh:${userId}`;
    await c.env.USERS_KV.delete(refreshKey);

    return c.json({
      message: 'Password reset successfully'
    });

  } catch (error) {
    throw new ValidationError('Invalid or expired reset token');
  }
}));

// Get current user profile
app.get('/me', authMiddleware, asyncHandler(async (c) => {
  const user = c.get('user');
  
  // Get full user data
  const userKey = `user:${user.id}`;
  const userData = await c.env.USERS_KV.get(userKey);
  
  if (!userData) {
    throw new NotFoundError('User not found');
  }

  const fullUser = JSON.parse(userData);

  return c.json({
    user: {
      id: fullUser.id,
      email: fullUser.email,
      fullName: fullUser.fullName,
      role: fullUser.role,
      phone: fullUser.phone,
      verified: fullUser.verified,
      createdAt: fullUser.createdAt,
      lastLogin: fullUser.lastLogin,
      profile: fullUser.profile
    }
  });
}));

export { app as authRoutes };