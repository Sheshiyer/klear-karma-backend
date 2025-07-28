// Appointment management routes
import { Hono } from 'hono';
import { WorkerEnv, Context } from '../types/env';
import { requireAuth, requirePractitioner, requireAdmin, requireOwnership } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { 
  validateAppointmentBooking,
  validateQueryParams,
  validateRequired,
  validateUUID,
  validateFutureDate,
  validateTime,
  sanitizeString,
  cleanObject
} from '../utils/validation';
import { generateSecureRandom } from '../utils/crypto';
import { AppError, NotFoundError, ConflictError, ValidationError, AuthorizationError } from '../middleware/errorHandler';

const appointments = new Hono<{ Bindings: WorkerEnv; Variables: Context }>();

// Book new appointment
appointments.post('/', requireAuth, rateLimiter, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  
  const validatedBooking = validateAppointmentBooking(body);
  
  // Check if practitioner exists and is available
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${validatedBooking.practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const practitionerData = JSON.parse(practitioner);
  if (practitionerData.status !== 'active' || !practitionerData.verified) {
    throw new ValidationError('Practitioner is not available for bookings');
  }
  
  // Check if service exists
  const service = await c.env.SERVICES_KV.get(`service:${validatedBooking.serviceId}`);
  if (!service) {
    throw new NotFoundError('Service not found');
  }
  
  const serviceData = JSON.parse(service);
  if (!serviceData.isActive || serviceData.practitionerId !== validatedBooking.practitionerId) {
    throw new ValidationError('Service is not available');
  }
  
  // Check practitioner availability for the requested date/time
  const requestedDate = new Date(validatedBooking.date);
  const dayName = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  
  const availability = practitionerData.availability?.[dayName];
  if (!availability || !availability.available) {
    throw new ValidationError('Practitioner is not available on the requested day');
  }
  
  // Check if time slot is within practitioner's working hours
  const requestedTimeMinutes = timeToMinutes(validatedBooking.time);
  const startTimeMinutes = timeToMinutes(availability.start);
  const endTimeMinutes = timeToMinutes(availability.end);
  
  if (requestedTimeMinutes < startTimeMinutes || 
      requestedTimeMinutes + validatedBooking.duration > endTimeMinutes) {
    throw new ValidationError('Requested time is outside practitioner\'s working hours');
  }
  
  // Check for conflicting appointments
  const conflictKey = `practitioner_appointments:${validatedBooking.practitionerId}:${validatedBooking.date}:${validatedBooking.time}`;
  const existingAppointment = await c.env.APPOINTMENTS_KV.get(conflictKey);
  
  if (existingAppointment) {
    const existing = JSON.parse(existingAppointment);
    if (existing.status === 'confirmed' || existing.status === 'pending') {
      throw new ConflictError('Time slot is already booked');
    }
  }
  
  // Check for overlapping appointments
  const appointmentsList = await c.env.APPOINTMENTS_KV.list({
    prefix: `practitioner_appointments:${validatedBooking.practitionerId}:${validatedBooking.date}:`
  });
  
  for (const key of appointmentsList.keys) {
    const appointmentData = await c.env.APPOINTMENTS_KV.get(key.name);
    if (appointmentData) {
      const appointment = JSON.parse(appointmentData);
      if (appointment.status === 'confirmed' || appointment.status === 'pending') {
        const existingStart = timeToMinutes(appointment.time);
        const existingEnd = existingStart + appointment.duration;
        const newStart = requestedTimeMinutes;
        const newEnd = newStart + validatedBooking.duration;
        
        if (newStart < existingEnd && newEnd > existingStart) {
          throw new ConflictError('Time slot conflicts with existing appointment');
        }
      }
    }
  }
  
  // Get user data
  const user = await c.env.USERS_KV.get(`user:${userId}`);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  const userData = JSON.parse(user);
  
  // Create appointment
  const appointmentId = generateSecureRandom(16);
  const appointment = {
    id: appointmentId,
    customerId: userId,
    customerName: userData.fullName,
    customerEmail: userData.email,
    practitionerId: validatedBooking.practitionerId,
    practitionerName: practitionerData.fullName,
    serviceId: validatedBooking.serviceId,
    serviceName: serviceData.name,
    date: validatedBooking.date,
    time: validatedBooking.time,
    duration: validatedBooking.duration,
    type: validatedBooking.type,
    notes: validatedBooking.notes,
    status: 'pending',
    price: serviceData.price,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Store appointment with multiple keys for efficient querying
  await Promise.all([
    c.env.APPOINTMENTS_KV.put(`appointment:${appointmentId}`, JSON.stringify(appointment)),
    c.env.APPOINTMENTS_KV.put(`user_appointments:${userId}:${appointmentId}`, JSON.stringify(appointment)),
    c.env.APPOINTMENTS_KV.put(`practitioner_appointments:${validatedBooking.practitionerId}:${validatedBooking.date}:${validatedBooking.time}`, JSON.stringify(appointment)),
    c.env.APPOINTMENTS_KV.put(`practitioner_appointments:${validatedBooking.practitionerId}:${appointmentId}`, JSON.stringify(appointment))
  ]);
  
  // Update analytics
  const analyticsKey = `analytics:appointments:${new Date().toISOString().split('T')[0]}`;
  const currentAnalytics = await c.env.ANALYTICS_KV.get(analyticsKey);
  const analytics = currentAnalytics ? JSON.parse(currentAnalytics) : { date: new Date().toISOString().split('T')[0], bookings: 0 };
  analytics.bookings += 1;
  await c.env.ANALYTICS_KV.put(analyticsKey, JSON.stringify(analytics));
  
  return c.json({
    success: true,
    message: 'Appointment booked successfully',
    data: appointment
  }, 201);
});

// Get appointment by ID
appointments.get('/:id', requireAuth, async (c) => {
  const appointmentId = c.req.param('id');
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  
  const appointment = await c.env.APPOINTMENTS_KV.get(`appointment:${appointmentId}`);
  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }
  
  const appointmentData = JSON.parse(appointment);
  
  // Check authorization
  if (userRole !== 'admin' && 
      appointmentData.customerId !== userId && 
      appointmentData.practitionerId !== userId) {
    throw new AuthorizationError('Access denied');
  }
  
  return c.json({
    success: true,
    data: appointmentData
  });
});

// Update appointment status
appointments.put('/:id/status', requireAuth, rateLimiter, async (c) => {
  const appointmentId = c.req.param('id');
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  const { status, reason } = await c.req.json();
  
  validateRequired({ status }, ['status']);
  
  const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError('Invalid status value');
  }
  
  const appointment = await c.env.APPOINTMENTS_KV.get(`appointment:${appointmentId}`);
  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }
  
  const appointmentData = JSON.parse(appointment);
  
  // Check authorization based on status change
  let authorized = false;
  
  if (userRole === 'admin') {
    authorized = true;
  } else if (appointmentData.practitionerId === userId) {
    // Practitioners can confirm, cancel, or mark as completed/no_show
    authorized = ['confirmed', 'cancelled', 'completed', 'no_show'].includes(status);
  } else if (appointmentData.customerId === userId) {
    // Customers can only cancel
    authorized = status === 'cancelled';
  }
  
  if (!authorized) {
    throw new AuthorizationError('Not authorized to change appointment status');
  }
  
  // Validate status transitions
  const currentStatus = appointmentData.status;
  const validTransitions: { [key: string]: string[] } = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['cancelled', 'completed', 'no_show'],
    'cancelled': [], // Cannot change from cancelled
    'completed': [], // Cannot change from completed
    'no_show': [] // Cannot change from no_show
  };
  
  if (!validTransitions[currentStatus]?.includes(status)) {
    throw new ValidationError(`Cannot change status from ${currentStatus} to ${status}`);
  }
  
  // Update appointment
  const updatedAppointment = {
    ...appointmentData,
    status,
    statusReason: reason || null,
    statusUpdatedAt: new Date().toISOString(),
    statusUpdatedBy: userId,
    updatedAt: new Date().toISOString()
  };
  
  // Update all appointment keys
  await Promise.all([
    c.env.APPOINTMENTS_KV.put(`appointment:${appointmentId}`, JSON.stringify(updatedAppointment)),
    c.env.APPOINTMENTS_KV.put(`user_appointments:${appointmentData.customerId}:${appointmentId}`, JSON.stringify(updatedAppointment)),
    c.env.APPOINTMENTS_KV.put(`practitioner_appointments:${appointmentData.practitionerId}:${appointmentData.date}:${appointmentData.time}`, JSON.stringify(updatedAppointment)),
    c.env.APPOINTMENTS_KV.put(`practitioner_appointments:${appointmentData.practitionerId}:${appointmentId}`, JSON.stringify(updatedAppointment))
  ]);
  
  return c.json({
    success: true,
    message: `Appointment ${status} successfully`,
    data: updatedAppointment
  });
});

// Reschedule appointment
appointments.put('/:id/reschedule', requireAuth, rateLimiter, async (c) => {
  const appointmentId = c.req.param('id');
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  const { date, time, reason } = await c.req.json();
  
  validateRequired({ date, time }, ['date', 'time']);
  
  if (!validateFutureDate(date) || !validateTime(time)) {
    throw new ValidationError('Invalid date or time format');
  }
  
  const appointment = await c.env.APPOINTMENTS_KV.get(`appointment:${appointmentId}`);
  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }
  
  const appointmentData = JSON.parse(appointment);
  
  // Check authorization
  if (userRole !== 'admin' && 
      appointmentData.customerId !== userId && 
      appointmentData.practitionerId !== userId) {
    throw new AuthorizationError('Access denied');
  }
  
  // Can only reschedule pending or confirmed appointments
  if (!['pending', 'confirmed'].includes(appointmentData.status)) {
    throw new ValidationError('Cannot reschedule this appointment');
  }
  
  // Check practitioner availability for new date/time
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${appointmentData.practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const practitionerData = JSON.parse(practitioner);
  const requestedDate = new Date(date);
  const dayName = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  
  const availability = practitionerData.availability?.[dayName];
  if (!availability || !availability.available) {
    throw new ValidationError('Practitioner is not available on the requested day');
  }
  
  // Check time slot availability
  const requestedTimeMinutes = timeToMinutes(time);
  const startTimeMinutes = timeToMinutes(availability.start);
  const endTimeMinutes = timeToMinutes(availability.end);
  
  if (requestedTimeMinutes < startTimeMinutes || 
      requestedTimeMinutes + appointmentData.duration > endTimeMinutes) {
    throw new ValidationError('Requested time is outside practitioner\'s working hours');
  }
  
  // Check for conflicts (excluding current appointment)
  const appointmentsList = await c.env.APPOINTMENTS_KV.list({
    prefix: `practitioner_appointments:${appointmentData.practitionerId}:${date}:`
  });
  
  for (const key of appointmentsList.keys) {
    const existingAppointmentData = await c.env.APPOINTMENTS_KV.get(key.name);
    if (existingAppointmentData) {
      const existing = JSON.parse(existingAppointmentData);
      if (existing.id !== appointmentId && 
          (existing.status === 'confirmed' || existing.status === 'pending')) {
        const existingStart = timeToMinutes(existing.time);
        const existingEnd = existingStart + existing.duration;
        const newStart = requestedTimeMinutes;
        const newEnd = newStart + appointmentData.duration;
        
        if (newStart < existingEnd && newEnd > existingStart) {
          throw new ConflictError('Time slot conflicts with existing appointment');
        }
      }
    }
  }
  
  // Remove old appointment keys
  await Promise.all([
    c.env.APPOINTMENTS_KV.delete(`practitioner_appointments:${appointmentData.practitionerId}:${appointmentData.date}:${appointmentData.time}`)
  ]);
  
  // Update appointment
  const updatedAppointment = {
    ...appointmentData,
    date,
    time,
    rescheduleReason: reason || null,
    rescheduledAt: new Date().toISOString(),
    rescheduledBy: userId,
    updatedAt: new Date().toISOString()
  };
  
  // Store with new keys
  await Promise.all([
    c.env.APPOINTMENTS_KV.put(`appointment:${appointmentId}`, JSON.stringify(updatedAppointment)),
    c.env.APPOINTMENTS_KV.put(`user_appointments:${appointmentData.customerId}:${appointmentId}`, JSON.stringify(updatedAppointment)),
    c.env.APPOINTMENTS_KV.put(`practitioner_appointments:${appointmentData.practitionerId}:${date}:${time}`, JSON.stringify(updatedAppointment)),
    c.env.APPOINTMENTS_KV.put(`practitioner_appointments:${appointmentData.practitionerId}:${appointmentId}`, JSON.stringify(updatedAppointment))
  ]);
  
  return c.json({
    success: true,
    message: 'Appointment rescheduled successfully',
    data: updatedAppointment
  });
});

// Add notes to appointment
appointments.put('/:id/notes', requireAuth, async (c) => {
  const appointmentId = c.req.param('id');
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  const { notes, type } = await c.req.json();
  
  validateRequired({ notes }, ['notes']);
  
  if (typeof notes !== 'string' || notes.length > 1000) {
    throw new ValidationError('Notes must be a string with maximum 1000 characters');
  }
  
  const appointment = await c.env.APPOINTMENTS_KV.get(`appointment:${appointmentId}`);
  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }
  
  const appointmentData = JSON.parse(appointment);
  
  // Check authorization
  if (userRole !== 'admin' && 
      appointmentData.customerId !== userId && 
      appointmentData.practitionerId !== userId) {
    throw new AuthorizationError('Access denied');
  }
  
  // Determine note type based on user role
  const noteType = type || (appointmentData.practitionerId === userId ? 'practitioner' : 'customer');
  
  // Add note to appointment
  const note = {
    id: generateSecureRandom(8),
    type: noteType,
    content: sanitizeString(notes),
    addedBy: userId,
    addedAt: new Date().toISOString()
  };
  
  const updatedAppointment = {
    ...appointmentData,
    notes: [...(appointmentData.notes || []), note],
    updatedAt: new Date().toISOString()
  };
  
  // Update all appointment keys
  await Promise.all([
    c.env.APPOINTMENTS_KV.put(`appointment:${appointmentId}`, JSON.stringify(updatedAppointment)),
    c.env.APPOINTMENTS_KV.put(`user_appointments:${appointmentData.customerId}:${appointmentId}`, JSON.stringify(updatedAppointment)),
    c.env.APPOINTMENTS_KV.put(`practitioner_appointments:${appointmentData.practitionerId}:${appointmentData.date}:${appointmentData.time}`, JSON.stringify(updatedAppointment)),
    c.env.APPOINTMENTS_KV.put(`practitioner_appointments:${appointmentData.practitionerId}:${appointmentId}`, JSON.stringify(updatedAppointment))
  ]);
  
  return c.json({
    success: true,
    message: 'Note added successfully',
    data: updatedAppointment
  });
});

// Get appointments (admin only)
appointments.get('/', requireAdmin, async (c) => {
  const { page, limit, status, practitionerId, customerId, date } = validateQueryParams(c.req.query());
  
  let prefix = 'appointment:';
  
  // If filtering by practitioner or customer, use specific prefix
  if (practitionerId) {
    prefix = `practitioner_appointments:${practitionerId}:`;
  } else if (customerId) {
    prefix = `user_appointments:${customerId}:`;
  }
  
  const appointmentsList = await c.env.APPOINTMENTS_KV.list({
    prefix,
    limit: 1000
  });
  
  const appointments = [];
  
  for (const key of appointmentsList.keys) {
    const appointmentData = await c.env.APPOINTMENTS_KV.get(key.name);
    if (appointmentData) {
      const appointment = JSON.parse(appointmentData);
      
      // Apply filters
      let include = true;
      
      if (status && appointment.status !== status) {
        include = false;
      }
      
      if (date && appointment.date !== date) {
        include = false;
      }
      
      if (include) {
        appointments.push(appointment);
      }
    }
  }
  
  // Remove duplicates (since we might have multiple keys for same appointment)
  const uniqueAppointments = appointments.filter((appointment, index, self) => 
    index === self.findIndex(a => a.id === appointment.id)
  );
  
  // Sort by date and time
  uniqueAppointments.sort((a, b) => {
    const aDateTime = new Date(`${a.date} ${a.time}`);
    const bDateTime = new Date(`${b.date} ${b.time}`);
    return bDateTime.getTime() - aDateTime.getTime();
  });
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedAppointments = uniqueAppointments.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedAppointments,
    pagination: {
      page,
      limit,
      total: uniqueAppointments.length,
      totalPages: Math.ceil(uniqueAppointments.length / limit)
    }
  });
});

// Helper function to convert time to minutes
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export default appointments;