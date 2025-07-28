// Practitioner management routes
import { Hono } from 'hono';
import { WorkerEnv } from '../types/env';
import { requireAuth, requirePractitioner, requireAdmin, requireOwnership } from '../middleware/auth';
// import { rateLimiter } from '../middleware/rateLimiter';
import { 
  validatePractitionerRegistration,
  validateService,
  validateQueryParams,
  validateRequired,
  sanitizeString,
  validateEmail,
  validatePhone,
  validateTime,
  cleanObject
} from '../utils/validation';
import { generateSecureRandom } from '../utils/crypto';
import { AppError, NotFoundError, ConflictError, ValidationError, AuthorizationError, asyncHandler } from '../middleware/errorHandler';

interface Variables {
  userId?: string;
  userRole?: string;
  user?: any;
}

const practitioners = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();

// Get all practitioners (public)
practitioners.get('/', asyncHandler(async (c) => {
  const queryParams = c.req.query();
  const { page, limit, search, sort, order } = validateQueryParams(queryParams);
  
  // Validate allowed query parameters
  const allowedParams = ['page', 'limit', 'search', 'sort', 'order', 'specialization', 'location', 'minRating', 'maxFee', 'availability'];
  const providedParams = Object.keys(queryParams);
  const invalidParams = providedParams.filter(param => !allowedParams.includes(param));
  
  if (invalidParams.length > 0) {
    throw new ValidationError(`Invalid query parameters: ${invalidParams.join(', ')}. Allowed parameters: ${allowedParams.join(', ')}`);
  }
  
  // Validate specific parameter values
  const { specialization, location, minRating, maxFee, availability } = queryParams;
  
  if (minRating && (isNaN(parseFloat(minRating)) || parseFloat(minRating) < 0 || parseFloat(minRating) > 5)) {
    throw new ValidationError('minRating must be a number between 0 and 5');
  }
  
  if (maxFee && (isNaN(parseFloat(maxFee)) || parseFloat(maxFee) < 0)) {
    throw new ValidationError('maxFee must be a positive number');
  }
  
  // List all active practitioners
  const practitionersList = await c.env.PRACTITIONERS_KV.list({
    prefix: 'practitioner:',
    limit: 1000
  });
  
  const practitioners = [];
  
  for (const key of practitionersList.keys) {
    const practitionerData = await c.env.PRACTITIONERS_KV.get(key.name);
    if (practitionerData) {
      const practitioner = JSON.parse(practitionerData);
      
      // Only show active and verified practitioners
      if (practitioner.status === 'active' && practitioner.verified) {
        // Remove sensitive data
        delete practitioner.email;
        delete practitioner.phone;
        delete practitioner.address;
        
        // Apply filters
        let includeInResults = true;
        
        // Search filter
        if (search) {
          const searchLower = search.toLowerCase();
          includeInResults = includeInResults && (
            practitioner.fullName.toLowerCase().includes(searchLower) ||
            practitioner.specializations.some((s: string) => s.toLowerCase().includes(searchLower)) ||
            practitioner.bio?.toLowerCase().includes(searchLower)
          );
        }
        
        // Specialization filter
        if (specialization) {
          includeInResults = includeInResults && 
            practitioner.specializations.some((s: string) => 
              s.toLowerCase().includes(specialization.toLowerCase())
            );
        }
        
        // Rating filter
        if (minRating) {
          const rating = parseFloat(minRating);
          includeInResults = includeInResults && (practitioner.averageRating || 0) >= rating;
        }
        
        // Fee filter
        if (maxFee) {
          const fee = parseFloat(maxFee);
          includeInResults = includeInResults && practitioner.consultationFee <= fee;
        }
        
        if (includeInResults) {
          practitioners.push(practitioner);
        }
      }
    }
  }
  
  // Sort practitioners
  practitioners.sort((a, b) => {
    let aValue, bValue;
    
    switch (sort) {
      case 'rating':
        aValue = a.averageRating || 0;
        bValue = b.averageRating || 0;
        break;
      case 'fee':
        aValue = a.consultationFee;
        bValue = b.consultationFee;
        break;
      case 'experience':
        aValue = a.experience;
        bValue = b.experience;
        break;
      case 'name':
        aValue = a.fullName;
        bValue = b.fullName;
        break;
      default:
        aValue = a.createdAt;
        bValue = b.createdAt;
    }
    
    if (typeof aValue === 'string') {
      return order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    } else {
      return order === 'asc' ? aValue - bValue : bValue - aValue;
    }
  });
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedPractitioners = practitioners.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedPractitioners,
    pagination: {
      page,
      limit,
      total: practitioners.length,
      totalPages: Math.ceil(practitioners.length / limit)
    }
  });
}));

// Get practitioner by ID (public)
practitioners.get('/:id', async (c) => {
  const practitionerId = c.req.param('id');
  
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const practitionerData = JSON.parse(practitioner);
  
  // Only show if active and verified
  if (practitionerData.status !== 'active' || !practitionerData.verified) {
    throw new NotFoundError('Practitioner not found');
  }
  
  // Remove sensitive data for public view
  delete practitionerData.email;
  delete practitionerData.phone;
  delete practitionerData.address;
  
  // Get practitioner's services
  const servicesList = await c.env.SERVICES_KV.list({
    prefix: `practitioner_services:${practitionerId}:`
  });
  
  const services = [];
  for (const key of servicesList.keys) {
    const serviceData = await c.env.SERVICES_KV.get(key.name);
    if (serviceData) {
      const service = JSON.parse(serviceData);
      if (service.isActive) {
        services.push(service);
      }
    }
  }
  
  // Get recent reviews
  const reviewsList = await c.env.REVIEWS_KV.list({
    prefix: `practitioner_reviews:${practitionerId}:`,
    limit: 10
  });
  
  const reviews = [];
  for (const key of reviewsList.keys) {
    const reviewData = await c.env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      // Remove sensitive data from reviews
      if (review.anonymous) {
        delete review.userId;
        delete review.userName;
      }
      reviews.push(review);
    }
  }
  
  return c.json({
    success: true,
    data: {
      ...practitionerData,
      services,
      recentReviews: reviews
    }
  });
});

// Get practitioner's services (public)
practitioners.get('/:id/services', async (c) => {
  const practitionerId = c.req.param('id');
  
  // Verify practitioner exists and is active
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const practitionerData = JSON.parse(practitioner);
  if (practitionerData.status !== 'active' || !practitionerData.verified) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const servicesList = await c.env.SERVICES_KV.list({
    prefix: `practitioner_services:${practitionerId}:`
  });
  
  const services = [];
  for (const key of servicesList.keys) {
    const serviceData = await c.env.SERVICES_KV.get(key.name);
    if (serviceData) {
      const service = JSON.parse(serviceData);
      if (service.isActive) {
        services.push(service);
      }
    }
  }
  
  return c.json({
    success: true,
    data: services
  });
});

// Get practitioner's reviews (public)
practitioners.get('/:id/reviews', async (c) => {
  const practitionerId = c.req.param('id');
  const { page, limit } = validateQueryParams(c.req.query());
  
  // Verify practitioner exists and is active
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const practitionerData = JSON.parse(practitioner);
  if (practitionerData.status !== 'active' || !practitionerData.verified) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const reviewsList = await c.env.REVIEWS_KV.list({
    prefix: `practitioner_reviews:${practitionerId}:`,
    limit: 1000
  });
  
  const reviews = [];
  for (const key of reviewsList.keys) {
    const reviewData = await c.env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      // Remove sensitive user information for public view
      if (review.user) {
        review.user = {
          id: review.user.id,
          firstName: review.user.firstName,
          lastName: review.user.lastName?.charAt(0) + '.' // Only show first letter of last name
        };
      }
      reviews.push(review);
    }
  }
  
  // Sort by date (newest first)
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

// Get practitioner's availability
practitioners.get('/:id/availability', async (c) => {
  const practitionerId = c.req.param('id');
  const { date, duration } = c.req.query();
  
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const practitionerData = JSON.parse(practitioner);
  
  if (practitionerData.status !== 'active' || !practitionerData.verified) {
    throw new NotFoundError('Practitioner not available');
  }
  
  // Get practitioner's schedule
  const availability = practitionerData.availability || {};
  
  // If specific date requested, get available slots for that date
  if (date) {
    const requestedDate = new Date(date);
    const dayName = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    const daySchedule = availability[dayName];
    if (!daySchedule || !daySchedule.available) {
      return c.json({
        success: true,
        data: {
          date,
          available: false,
          slots: []
        }
      });
    }
    
    // Get existing appointments for the date
    const appointmentsList = await c.env.APPOINTMENTS_KV.list({
      prefix: `practitioner_appointments:${practitionerId}:${date}:`
    });
    
    const bookedSlots = [];
    for (const key of appointmentsList.keys) {
      const appointmentData = await c.env.APPOINTMENTS_KV.get(key.name);
      if (appointmentData) {
        const appointment = JSON.parse(appointmentData);
        if (appointment.status === 'confirmed' || appointment.status === 'pending') {
          bookedSlots.push({
            time: appointment.time,
            duration: appointment.duration
          });
        }
      }
    }
    
    // Generate available time slots
    const slots = generateAvailableSlots(
      daySchedule.start,
      daySchedule.end,
      parseInt(duration) || 60,
      bookedSlots
    );
    
    return c.json({
      success: true,
      data: {
        date,
        available: slots.length > 0,
        slots
      }
    });
  }
  
  // Return general availability schedule
  return c.json({
    success: true,
    data: {
      schedule: availability,
      timezone: practitionerData.timezone || 'UTC'
    }
  });
});

// Practitioner profile routes (require authentication)

// Get own profile
practitioners.get('/me/profile', requirePractitioner, async (c) => {
  const practitionerId = c.get('userId');
  
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner profile not found');
  }
  
  const practitionerData = JSON.parse(practitioner);
  
  return c.json({
    success: true,
    data: practitionerData
  });
});

// Update practitioner profile
practitioners.put('/me/profile', requirePractitioner, /* rateLimiter, */ async (c) => {
  const practitionerId = c.get('userId');
  const body = await c.req.json();
  
  const currentPractitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${practitionerId}`);
  if (!currentPractitioner) {
    throw new NotFoundError('Practitioner profile not found');
  }
  
  const practitionerData = JSON.parse(currentPractitioner);
  
  // Validate updatable fields
  const allowedFields = [
    'bio', 'specializations', 'qualifications', 'experience',
    'consultationFee', 'languages', 'certifications', 'availability',
    'phone', 'address', 'timezone', 'preferences'
  ];
  
  const updates: any = {};
  
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }
  
  // Validate specific fields
  if (updates.bio && (typeof updates.bio !== 'string' || updates.bio.length < 10 || updates.bio.length > 1000)) {
    throw new ValidationError('Bio must be between 10 and 1000 characters');
  }
  
  if (updates.experience && (typeof updates.experience !== 'number' || updates.experience < 0 || updates.experience > 50)) {
    throw new ValidationError('Experience must be between 0 and 50 years');
  }
  
  if (updates.consultationFee && (typeof updates.consultationFee !== 'number' || updates.consultationFee < 0)) {
    throw new ValidationError('Consultation fee must be a positive number');
  }
  
  if (updates.phone && !validatePhone(updates.phone)) {
    throw new ValidationError('Invalid phone number format');
  }
  
  // Validate availability schedule
  if (updates.availability) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      if (updates.availability[day]) {
        const schedule = updates.availability[day];
        if (schedule.available && (!validateTime(schedule.start) || !validateTime(schedule.end))) {
          throw new ValidationError(`Invalid time format for ${day}`);
        }
      }
    }
  }
  
  // Update practitioner data
  const updatedPractitioner = {
    ...practitionerData,
    ...cleanObject(updates),
    updatedAt: new Date().toISOString()
  };
  
  await c.env.PRACTITIONERS_KV.put(`practitioner:${practitionerId}`, JSON.stringify(updatedPractitioner));
  
  return c.json({
    success: true,
    message: 'Profile updated successfully',
    data: updatedPractitioner
  });
});

// Get practitioner's appointments
practitioners.get('/me/appointments', requirePractitioner, async (c) => {
  const practitionerId = c.get('userId');
  const { page, limit, status, date } = validateQueryParams(c.req.query());
  
  let prefix = `practitioner_appointments:${practitionerId}:`;
  if (date) {
    prefix += `${date}:`;
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
      
      // Filter by status if provided
      if (!status || appointment.status === status) {
        appointments.push(appointment);
      }
    }
  }
  
  // Sort by date and time
  appointments.sort((a, b) => {
    const aDateTime = new Date(`${a.date} ${a.time}`);
    const bDateTime = new Date(`${b.date} ${b.time}`);
    return aDateTime.getTime() - bDateTime.getTime();
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

// Get practitioner's services
practitioners.get('/me/services', requirePractitioner, async (c) => {
  const practitionerId = c.get('userId');
  
  const servicesList = await c.env.SERVICES_KV.list({
    prefix: `practitioner_services:${practitionerId}:`
  });
  
  const services = [];
  for (const key of servicesList.keys) {
    const serviceData = await c.env.SERVICES_KV.get(key.name);
    if (serviceData) {
      services.push(JSON.parse(serviceData));
    }
  }
  
  return c.json({
    success: true,
    data: services
  });
});

// Create new service
practitioners.post('/me/services', requirePractitioner, /* rateLimiter, */ async (c) => {
  const practitionerId = c.get('userId');
  const body = await c.req.json();
  
  const validatedService = validateService(body);
  
  const serviceId = generateSecureRandom(16);
  const service = {
    id: serviceId,
    practitionerId,
    ...validatedService,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  await c.env.SERVICES_KV.put(`practitioner_services:${practitionerId}:${serviceId}`, JSON.stringify(service));
  await c.env.SERVICES_KV.put(`service:${serviceId}`, JSON.stringify(service));
  
  return c.json({
    success: true,
    message: 'Service created successfully',
    data: service
  }, 201);
});

// Update service
practitioners.put('/me/services/:serviceId', requirePractitioner, /* rateLimiter, */ async (c) => {
  const practitionerId = c.get('userId');
  const serviceId = c.req.param('serviceId');
  const body = await c.req.json();
  
  const currentService = await c.env.SERVICES_KV.get(`practitioner_services:${practitionerId}:${serviceId}`);
  if (!currentService) {
    throw new NotFoundError('Service not found');
  }
  
  const serviceData = JSON.parse(currentService);
  const validatedUpdates = validateService({ ...serviceData, ...body });
  
  const updatedService = {
    ...serviceData,
    ...validatedUpdates,
    updatedAt: new Date().toISOString()
  };
  
  await c.env.SERVICES_KV.put(`practitioner_services:${practitionerId}:${serviceId}`, JSON.stringify(updatedService));
  await c.env.SERVICES_KV.put(`service:${serviceId}`, JSON.stringify(updatedService));
  
  return c.json({
    success: true,
    message: 'Service updated successfully',
    data: updatedService
  });
});

// Delete service
practitioners.delete('/me/services/:serviceId', requirePractitioner, async (c) => {
  const practitionerId = c.get('userId');
  const serviceId = c.req.param('serviceId');
  
  const service = await c.env.SERVICES_KV.get(`practitioner_services:${practitionerId}:${serviceId}`);
  if (!service) {
    throw new NotFoundError('Service not found');
  }
  
  await c.env.SERVICES_KV.delete(`practitioner_services:${practitionerId}:${serviceId}`);
  await c.env.SERVICES_KV.delete(`service:${serviceId}`);
  
  return c.json({
    success: true,
    message: 'Service deleted successfully'
  });
});

// Get practitioner's reviews
practitioners.get('/me/reviews', requirePractitioner, async (c) => {
  const practitionerId = c.get('userId');
  const { page, limit } = validateQueryParams(c.req.query());
  
  const reviewsList = await c.env.REVIEWS_KV.list({
    prefix: `practitioner_reviews:${practitionerId}:`,
    limit: 1000
  });
  
  const reviews = [];
  for (const key of reviewsList.keys) {
    const reviewData = await c.env.REVIEWS_KV.get(key.name);
    if (reviewData) {
      reviews.push(JSON.parse(reviewData));
    }
  }
  
  // Sort by date (newest first)
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

// Helper function to generate available time slots
function generateAvailableSlots(
  startTime: string,
  endTime: string,
  duration: number,
  bookedSlots: Array<{ time: string; duration: number }>
): string[] {
  const slots = [];
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  
  for (let time = start; time + duration <= end; time += duration) {
    const slotTime = minutesToTime(time);
    
    // Check if slot conflicts with booked appointments
    const isBooked = bookedSlots.some(booked => {
      const bookedStart = timeToMinutes(booked.time);
      const bookedEnd = bookedStart + booked.duration;
      const slotEnd = time + duration;
      
      return (time < bookedEnd && slotEnd > bookedStart);
    });
    
    if (!isBooked) {
      slots.push(slotTime);
    }
  }
  
  return slots;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export default practitioners;