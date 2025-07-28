// User management routes
import { Hono } from 'hono';
import { WorkerEnv, Context } from '../types/env';
import { requireAuth, requireOwnership, requireAdmin } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { 
  validateUserRegistration, 
  validateQueryParams, 
  validateRequired,
  sanitizeString,
  validateEmail,
  validatePhone,
  cleanObject
} from '../utils/validation';
import { hashPassword } from '../utils/crypto';
import { AppError, NotFoundError, ConflictError, ValidationError } from '../middleware/errorHandler';

const users = new Hono<{ Bindings: WorkerEnv; Variables: Context }>();

// Get current user profile
users.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  
  const userRecord = await c.env.USERS_KV.get(`user:${userId}`);
  if (!userRecord) {
    throw new NotFoundError('User not found');
  }
  
  const userData = JSON.parse(userRecord);
  
  // Remove sensitive data
  delete userData.password;
  delete userData.refreshTokens;
  
  return c.json({
    success: true,
    data: userData
  });
});

// Update current user profile
users.put('/me', requireAuth, rateLimiter, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const body = await c.req.json();
  
  // Get current user data
  const currentUser = await c.env.USERS_KV.get(`user:${userId}`);
  if (!currentUser) {
    throw new NotFoundError('User not found');
  }
  
  const userData = JSON.parse(currentUser);
  
  // Validate updatable fields
  const allowedFields = [
    'fullName', 'phone', 'dateOfBirth', 'gender', 'address', 
    'preferences', 'emergencyContact', 'medicalHistory'
  ];
  
  const updates: any = {};
  
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }
  
  // Validate specific fields
  if (updates.fullName && (typeof updates.fullName !== 'string' || updates.fullName.length < 2 || updates.fullName.length > 100)) {
    throw new ValidationError('Full name must be between 2 and 100 characters');
  }
  
  if (updates.phone && !validatePhone(updates.phone)) {
    throw new ValidationError('Invalid phone number format');
  }
  
  if (updates.gender && !['male', 'female', 'other', 'prefer_not_to_say'].includes(updates.gender)) {
    throw new ValidationError('Invalid gender value');
  }
  
  // Sanitize string fields
  if (updates.fullName) {
    updates.fullName = sanitizeString(updates.fullName);
  }
  
  if (updates.phone) {
    updates.phone = sanitizeString(updates.phone);
  }
  
  // Update user data
  const updatedUser = {
    ...userData,
    ...cleanObject(updates),
    updatedAt: new Date().toISOString()
  };
  
  await c.env.USERS_KV.put(`user:${userId}`, JSON.stringify(updatedUser));
  
  // Remove sensitive data from response
  delete updatedUser.password;
  delete updatedUser.refreshTokens;
  
  return c.json({
    success: true,
    message: 'Profile updated successfully',
    data: updatedUser
  });
});

// Change password
users.put('/me/password', requireAuth, rateLimiter, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const { currentPassword, newPassword } = await c.req.json();
  
  validateRequired({ currentPassword, newPassword }, ['currentPassword', 'newPassword']);
  
  // Get current user data
  const currentUser = await c.env.USERS_KV.get(`user:${userId}`);
  if (!currentUser) {
    throw new NotFoundError('User not found');
  }
  
  const userData = JSON.parse(currentUser);
  
  // Verify current password
  const { verifyPassword } = await import('../utils/crypto');
  const isValidPassword = await verifyPassword(currentPassword, userData.password);
  
  if (!isValidPassword) {
    throw new ValidationError('Current password is incorrect');
  }
  
  // Validate new password
  const { validatePassword } = await import('../utils/validation');
  if (!validatePassword(newPassword)) {
    throw new ValidationError('New password must be at least 8 characters with uppercase, lowercase, and number');
  }
  
  // Hash new password
  const hashedPassword = await hashPassword(newPassword);
  
  // Update user data
  userData.password = hashedPassword;
  userData.updatedAt = new Date().toISOString();
  
  await c.env.USERS_KV.put(`user:${userId}`, JSON.stringify(userData));
  
  return c.json({
    success: true,
    message: 'Password updated successfully'
  });
});

// Update user preferences
users.put('/me/preferences', requireAuth, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const preferences = await c.req.json();
  
  // Get current user data
  const currentUser = await c.env.USERS_KV.get(`user:${userId}`);
  if (!currentUser) {
    throw new NotFoundError('User not found');
  }
  
  const userData = JSON.parse(currentUser);
  
  // Update preferences
  userData.preferences = {
    ...userData.preferences,
    ...cleanObject(preferences),
    updatedAt: new Date().toISOString()
  };
  
  userData.updatedAt = new Date().toISOString();
  
  await c.env.USERS_KV.put(`user:${userId}`, JSON.stringify(userData));
  
  return c.json({
    success: true,
    message: 'Preferences updated successfully',
    data: userData.preferences
  });
});

// Get user appointments
users.get('/me/appointments', requireAuth, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const { page, limit, status, sort, order } = validateQueryParams(c.req.query());
  
  // List user appointments
  const appointmentsList = await c.env.APPOINTMENTS_KV.list({
    prefix: `user_appointments:${userId}:`,
    limit: limit
  });
  
  const appointments = [];
  
  for (const key of appointmentsList.keys) {
    const appointmentData = await c.env.APPOINTMENTS_KV.get(key.name);
    if (appointmentData) {
      const appointment = JSON.parse(appointmentData);
      
      // Filter by status if provided
      if (!status || appointment.status === status) {
        appointments.push(appointment);
      }
    }
  }
  
  // Sort appointments
  appointments.sort((a, b) => {
    const aDate = new Date(`${a.date} ${a.time}`);
    const bDate = new Date(`${b.date} ${b.time}`);
    return order === 'asc' ? aDate.getTime() - bDate.getTime() : bDate.getTime() - aDate.getTime();
  });
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedAppointments = appointments.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedAppointments,
    pagination: {
      page,
      limit,
      total: appointments.length,
      totalPages: Math.ceil(appointments.length / limit)
    }
  });
});

// Get user messages
users.get('/me/messages', requireAuth, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const { page, limit } = validateQueryParams(c.req.query());
  
  // List user messages
  const messagesList = await c.env.MESSAGES_KV.list({
    prefix: `user_messages:${userId}:`,
    limit: limit
  });
  
  const messages = [];
  
  for (const key of messagesList.keys) {
    const messageData = await c.env.MESSAGES_KV.get(key.name);
    if (messageData) {
      messages.push(JSON.parse(messageData));
    }
  }
  
  // Sort by timestamp (newest first)
  messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedMessages = messages.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedMessages,
    pagination: {
      page,
      limit,
      total: messages.length,
      totalPages: Math.ceil(messages.length / limit)
    }
  });
});

// Get user reviews
users.get('/me/reviews', requireAuth, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const { page, limit } = validateQueryParams(c.req.query());
  
  // List user reviews
  const reviewsList = await c.env.REVIEWS_KV.list({
    prefix: `user_reviews:${userId}:`,
    limit: limit
  });
  
  const reviews = [];
  
  for (const key of reviewsList.keys) {
    const reviewData = await c.env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      reviews.push(JSON.parse(reviewData));
    }
  }
  
  // Sort by timestamp (newest first)
  reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedReviews = reviews.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedReviews,
    pagination: {
      page,
      limit,
      total: reviews.length,
      totalPages: Math.ceil(reviews.length / limit)
    }
  });
});

// Delete user account
users.delete('/me', requireAuth, rateLimiter, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const { password, confirmation } = await c.req.json();
  
  validateRequired({ password, confirmation }, ['password', 'confirmation']);
  
  if (confirmation !== 'DELETE_MY_ACCOUNT') {
    throw new ValidationError('Invalid confirmation. Please type "DELETE_MY_ACCOUNT" to confirm.');
  }
  
  // Get current user data
  const currentUser = await c.env.USERS_KV.get(`user:${userId}`);
  if (!currentUser) {
    throw new NotFoundError('User not found');
  }
  
  const userData = JSON.parse(currentUser);
  
  // Verify password
  const { verifyPassword } = await import('../utils/crypto');
  const isValidPassword = await verifyPassword(password, userData.password);
  
  if (!isValidPassword) {
    throw new ValidationError('Password is incorrect');
  }
  
  // Mark user as deleted (soft delete)
  userData.status = 'deleted';
  userData.deletedAt = new Date().toISOString();
  userData.email = `deleted_${userId}@deleted.local`;
  
  await c.env.USERS_KV.put(`user:${userId}`, JSON.stringify(userData));
  
  return c.json({
    success: true,
    message: 'Account deleted successfully'
  });
});

// Admin routes

// List all users (admin only)
users.get('/', requireAdmin, async (c) => {
  const { page, limit, search, sort, order } = validateQueryParams(c.req.query());
  
  // List all users
  const usersList = await c.env.USERS_KV.list({
    prefix: 'user:',
    limit: 1000 // Get all users for filtering
  });
  
  const users = [];
  
  for (const key of usersList.keys) {
    const userData = await c.env.USERS_KV.get(key.name);
    if (userData) {
      const user = JSON.parse(userData);
      
      // Remove sensitive data
      delete user.password;
      delete user.refreshTokens;
      
      // Filter by search term
      if (!search || 
          user.fullName.toLowerCase().includes(search.toLowerCase()) ||
          user.email.toLowerCase().includes(search.toLowerCase())) {
        users.push(user);
      }
    }
  }
  
  // Sort users
  users.sort((a, b) => {
    const aValue = sort === 'name' ? a.fullName : a.createdAt;
    const bValue = sort === 'name' ? b.fullName : b.createdAt;
    
    if (order === 'asc') {
      return aValue.localeCompare(bValue);
    } else {
      return bValue.localeCompare(aValue);
    }
  });
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedUsers = users.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedUsers,
    pagination: {
      page,
      limit,
      total: users.length,
      totalPages: Math.ceil(users.length / limit)
    }
  });
});

// Get specific user (admin only)
users.get('/:id', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  
  const user = await c.env.USERS_KV.get(`user:${userId}`);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  const userData = JSON.parse(user);
  
  // Remove sensitive data
  delete userData.password;
  delete userData.refreshTokens;
  
  return c.json({
    success: true,
    data: userData
  });
});

// Update user status (admin only)
users.put('/:id/status', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  const { status, reason } = await c.req.json();
  
  validateRequired({ status }, ['status']);
  
  if (!['active', 'suspended', 'banned', 'deleted'].includes(status)) {
    throw new ValidationError('Invalid status value');
  }
  
  const userRecord = await c.env.USERS_KV.get(`user:${userId}`);
  if (!userRecord) {
    throw new NotFoundError('User not found');
  }
  
  const userData = JSON.parse(userRecord);
  
  userData.status = status;
  userData.statusReason = reason || null;
  userData.statusUpdatedAt = new Date().toISOString();
  const contextUser = c.get('user');
  userData.statusUpdatedBy = contextUser.id;
  
  await c.env.USERS_KV.put(`user:${userId}`, JSON.stringify(userData));
  
  return c.json({
    success: true,
    message: `User status updated to ${status}`,
    data: {
      id: userData.id,
      status: userData.status,
      statusReason: userData.statusReason,
      statusUpdatedAt: userData.statusUpdatedAt
    }
  });
});

export default users;