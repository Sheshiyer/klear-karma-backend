// Service management routes
import { Hono } from 'hono';
import { WorkerEnv } from '../types/env';
import { requireAuth, requirePractitioner, requireAdmin, requireOwnership } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { 
  validateService,
  validateQueryParams,
  validateRequired,
  validateUUID,
  sanitizeString,
  cleanObject,
  ServiceData,
  PartialServiceData
} from '../utils/validation';
import { generateSecureRandom } from '../utils/crypto';
import { AppError, NotFoundError, ValidationError, AuthorizationError, asyncHandler } from '../middleware/errorHandler';

const services = new Hono<{ Bindings: WorkerEnv }>();

// Create new service (practitioners only)
services.post('/', requirePractitioner, rateLimiter, async (c) => {
  const contextUser = c.get('user');
  const practitionerId = contextUser.id;
  const body = await c.req.json();
  
  const validatedService = validateService(body, false) as ServiceData;
  
  // Verify practitioner exists and is active
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const practitionerData = JSON.parse(practitioner);
  if (practitionerData.status !== 'active' || !practitionerData.verified) {
    throw new ValidationError('Only active and verified practitioners can create services');
  }
  
  // Create service
  const serviceId = generateSecureRandom(16);
  const service = {
    id: serviceId,
    practitionerId,
    practitionerName: practitionerData.fullName,
    name: sanitizeString(validatedService.name),
    description: sanitizeString(validatedService.description),
    category: validatedService.category,
    subcategory: validatedService.subcategory || null,
    type: validatedService.type, // 'in-person', 'virtual', 'both'
    duration: validatedService.duration, // in minutes
    price: validatedService.price,
    currency: validatedService.currency || 'USD',
    isActive: true,
    tags: validatedService.tags || [],
    requirements: validatedService.requirements || [],
    benefits: validatedService.benefits || [],
    contraindications: validatedService.contraindications || [],
    preparationInstructions: validatedService.preparationInstructions || null,
    aftercareInstructions: validatedService.aftercareInstructions || null,
    cancellationPolicy: validatedService.cancellationPolicy || null,
    bookingSettings: {
      advanceBookingDays: validatedService.bookingSettings?.advanceBookingDays || 30,
      minAdvanceHours: validatedService.bookingSettings?.minAdvanceHours || 24,
      maxBookingsPerDay: validatedService.bookingSettings?.maxBookingsPerDay || 10,
      allowWeekends: validatedService.bookingSettings?.allowWeekends !== false,
      bufferTime: validatedService.bookingSettings?.bufferTime || 15 // minutes between appointments
    },
    rating: {
      average: 0,
      count: 0
    },
    bookingCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Store service with multiple keys for efficient querying
  await Promise.all([
    c.env.SERVICES_KV.put(`service:${serviceId}`, JSON.stringify(service)),
    c.env.SERVICES_KV.put(`practitioner_services:${practitionerId}:${serviceId}`, JSON.stringify(service)),
    c.env.SERVICES_KV.put(`category_services:${validatedService.category}:${serviceId}`, JSON.stringify(service))
  ]);
  
  // Update practitioner's service count
  practitionerData.serviceCount = (practitionerData.serviceCount || 0) + 1;
  practitionerData.updatedAt = new Date().toISOString();
  await c.env.PRACTITIONERS_KV.put(`practitioner:${practitionerId}`, JSON.stringify(practitionerData));
  
  return c.json({
    success: true,
    message: 'Service created successfully',
    data: service
  }, 201);
});

// Get service by ID
services.get('/:id', async (c) => {
  const serviceId = c.req.param('id');
  
  const service = await c.env.SERVICES_KV.get(`service:${serviceId}`);
  if (!service) {
    throw new NotFoundError('Service not found');
  }
  
  const serviceData = JSON.parse(service);
  
  // Only return active services to non-owners
  const contextUser = c.get('user');
  const userId = contextUser.id;
  const userRole = contextUser.role;
  
  if (!serviceData.isActive && 
      userRole !== 'admin' && 
      serviceData.practitionerId !== userId) {
    throw new NotFoundError('Service not found');
  }
  
  return c.json({
    success: true,
    data: serviceData
  });
});

// Update service
services.put('/:id', requireAuth, rateLimiter, async (c) => {
  const serviceId = c.req.param('id');
  const contextUser = c.get('user');
  const userId = contextUser.id;
  const userRole = contextUser.role;
  const body = await c.req.json();
  
  const service = await c.env.SERVICES_KV.get(`service:${serviceId}`);
  if (!service) {
    throw new NotFoundError('Service not found');
  }
  
  const serviceData = JSON.parse(service);
  
  // Check authorization
  if (userRole !== 'admin' && serviceData.practitionerId !== userId) {
    throw new AuthorizationError('Access denied');
  }
  
  // Validate updates
  const validatedService = validateService(body, true) as PartialServiceData; // partial validation for updates
  
  // Update service
  const updatedService = {
    ...serviceData,
    ...cleanObject(validatedService),
    updatedAt: new Date().toISOString()
  };
  
  // If category changed, update category index
  const promises = [
    c.env.SERVICES_KV.put(`service:${serviceId}`, JSON.stringify(updatedService)),
    c.env.SERVICES_KV.put(`practitioner_services:${serviceData.practitionerId}:${serviceId}`, JSON.stringify(updatedService))
  ];
  
  // Remove old category index if category changed
  if (validatedService.category && validatedService.category !== serviceData.category) {
    promises.push(
      c.env.SERVICES_KV.delete(`category_services:${serviceData.category}:${serviceId}`),
      c.env.SERVICES_KV.put(`category_services:${validatedService.category}:${serviceId}`, JSON.stringify(updatedService))
    );
  } else {
    promises.push(
      c.env.SERVICES_KV.put(`category_services:${serviceData.category}:${serviceId}`, JSON.stringify(updatedService))
    );
  }
  
  await Promise.all(promises);
  
  return c.json({
    success: true,
    message: 'Service updated successfully',
    data: updatedService
  });
});

// Delete service (soft delete)
services.delete('/:id', requireAuth, async (c) => {
  const serviceId = c.req.param('id');
  const contextUser = c.get('user');
  const userId = contextUser.id;
  const userRole = contextUser.role;
  
  const service = await c.env.SERVICES_KV.get(`service:${serviceId}`);
  if (!service) {
    throw new NotFoundError('Service not found');
  }
  
  const serviceData = JSON.parse(service);
  
  // Check authorization
  if (userRole !== 'admin' && serviceData.practitionerId !== userId) {
    throw new AuthorizationError('Access denied');
  }
  
  // Check for active appointments
  const activeAppointments = await c.env.APPOINTMENTS_KV.list({
    prefix: `practitioner_appointments:${serviceData.practitionerId}:`,
    limit: 1000
  });
  
  let hasActiveBookings = false;
  for (const key of activeAppointments.keys) {
    const appointmentData = await c.env.APPOINTMENTS_KV.get(key.name);
    if (appointmentData) {
      const appointment = JSON.parse(appointmentData);
      if (appointment.serviceId === serviceId && 
          ['pending', 'confirmed'].includes(appointment.status)) {
        hasActiveBookings = true;
        break;
      }
    }
  }
  
  if (hasActiveBookings) {
    throw new ValidationError('Cannot delete service with active bookings. Please cancel or complete all appointments first.');
  }
  
  // Soft delete - mark as inactive
  const updatedService = {
    ...serviceData,
    isActive: false,
    deletedAt: new Date().toISOString(),
    deletedBy: userId,
    updatedAt: new Date().toISOString()
  };
  
  // Update all service keys
  await Promise.all([
    c.env.SERVICES_KV.put(`service:${serviceId}`, JSON.stringify(updatedService)),
    c.env.SERVICES_KV.put(`practitioner_services:${serviceData.practitionerId}:${serviceId}`, JSON.stringify(updatedService)),
    c.env.SERVICES_KV.put(`category_services:${serviceData.category}:${serviceId}`, JSON.stringify(updatedService))
  ]);
  
  // Update practitioner's service count
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${serviceData.practitionerId}`);
  if (practitioner) {
    const practitionerData = JSON.parse(practitioner);
    practitionerData.serviceCount = Math.max(0, (practitionerData.serviceCount || 1) - 1);
    practitionerData.updatedAt = new Date().toISOString();
    await c.env.PRACTITIONERS_KV.put(`practitioner:${serviceData.practitionerId}`, JSON.stringify(practitionerData));
  }
  
  return c.json({
    success: true,
    message: 'Service deleted successfully'
  });
});

// Get services with filtering and pagination
services.get('/', asyncHandler(async (c) => {
  const query = c.req.query();
  
  // Validate query parameters
  const allowedParams = [
    'page', 'limit', 'category', 'subcategory', 'type', 'practitionerId',
    'minPrice', 'maxPrice', 'minDuration', 'maxDuration', 'search', 'sortBy', 'sortOrder'
  ];
  
  const invalidParams = Object.keys(query).filter(param => !allowedParams.includes(param));
  if (invalidParams.length > 0) {
    throw new ValidationError(`Invalid query parameters: ${invalidParams.join(', ')}`);
  }
  
  // Validate specific parameter values
  if (query.minPrice && (isNaN(Number(query.minPrice)) || Number(query.minPrice) < 0)) {
    throw new ValidationError('minPrice must be a positive number');
  }
  
  if (query.maxPrice && (isNaN(Number(query.maxPrice)) || Number(query.maxPrice) < 0)) {
    throw new ValidationError('maxPrice must be a positive number');
  }
  
  if (query.minDuration && (isNaN(Number(query.minDuration)) || Number(query.minDuration) < 0)) {
    throw new ValidationError('minDuration must be a positive number');
  }
  
  if (query.maxDuration && (isNaN(Number(query.maxDuration)) || Number(query.maxDuration) < 0)) {
    throw new ValidationError('maxDuration must be a positive number');
  }
  
  if (query.sortBy && !['price', 'duration', 'rating', 'popularity', 'name', 'created'].includes(query.sortBy)) {
    throw new ValidationError('sortBy must be one of: price, duration, rating, popularity, name, created');
  }
  
  if (query.sortOrder && !['asc', 'desc'].includes(query.sortOrder)) {
    throw new ValidationError('sortOrder must be either asc or desc');
  }
  
  const { 
    page, 
    limit, 
    category, 
    subcategory, 
    type, 
    practitionerId, 
    minPrice, 
    maxPrice, 
    minDuration, 
    maxDuration,
    search,
    sortBy,
    sortOrder
  } = validateQueryParams(query);
  
  let prefix = 'service:';
  
  // Use specific prefix for more efficient querying
  if (practitionerId) {
    prefix = `practitioner_services:${practitionerId}:`;
  } else if (category) {
    prefix = `category_services:${category}:`;
  }
  
  const servicesList = await c.env.SERVICES_KV.list({
    prefix,
    limit: 1000
  });
  
  const services = [];
  
  for (const key of servicesList.keys) {
    const serviceData = await c.env.SERVICES_KV.get(key.name);
    if (serviceData) {
      const service = JSON.parse(serviceData);
      
      // Only include active services for public listing
      if (!service.isActive) {
        continue;
      }
      
      // Apply filters
      let include = true;
      
      if (subcategory && service.subcategory !== subcategory) {
        include = false;
      }
      
      if (type && service.type !== type && service.type !== 'both') {
        include = false;
      }
      
      if (minPrice && service.price < parseFloat(minPrice)) {
        include = false;
      }
      
      if (maxPrice && service.price > parseFloat(maxPrice)) {
        include = false;
      }
      
      if (minDuration && service.duration < parseInt(minDuration)) {
        include = false;
      }
      
      if (maxDuration && service.duration > parseInt(maxDuration)) {
        include = false;
      }
      
      if (search) {
        const searchLower = search.toLowerCase();
        const searchableText = `${service.name} ${service.description} ${service.tags?.join(' ') || ''}`.toLowerCase();
        if (!searchableText.includes(searchLower)) {
          include = false;
        }
      }
      
      if (include) {
        services.push(service);
      }
    }
  }
  
  // Remove duplicates (since we might have multiple keys for same service)
  const uniqueServices = services.filter((service, index, self) => 
    index === self.findIndex(s => s.id === service.id)
  );
  
  // Sort services
  uniqueServices.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'price':
        comparison = a.price - b.price;
        break;
      case 'duration':
        comparison = a.duration - b.duration;
        break;
      case 'rating':
        comparison = b.rating.average - a.rating.average;
        break;
      case 'popularity':
        comparison = b.bookingCount - a.bookingCount;
        break;
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'created':
      default:
        comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        break;
    }
    
    return sortOrder === 'asc' ? comparison : -comparison;
  });
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedServices = uniqueServices.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedServices,
    pagination: {
      page,
      limit,
      total: uniqueServices.length,
      totalPages: Math.ceil(uniqueServices.length / limit)
    },
    filters: {
      category,
      subcategory,
      type,
      practitionerId,
      minPrice,
      maxPrice,
      minDuration,
      maxDuration,
      search
    }
  });
}));

// Get service categories
services.get('/categories', async (c) => {
  // This would typically come from a configuration or database
  // For now, we'll return a static list of common wellness categories
  const categories = {
    'massage-therapy': {
      name: 'Massage Therapy',
      subcategories: [
        'swedish-massage',
        'deep-tissue',
        'hot-stone',
        'aromatherapy',
        'sports-massage',
        'prenatal-massage',
        'reflexology'
      ]
    },
    'acupuncture': {
      name: 'Acupuncture',
      subcategories: [
        'traditional-acupuncture',
        'electroacupuncture',
        'cupping',
        'moxibustion',
        'ear-acupuncture'
      ]
    },
    'yoga': {
      name: 'Yoga',
      subcategories: [
        'hatha-yoga',
        'vinyasa-yoga',
        'yin-yoga',
        'restorative-yoga',
        'hot-yoga',
        'prenatal-yoga',
        'meditation'
      ]
    },
    'nutrition': {
      name: 'Nutrition & Wellness',
      subcategories: [
        'nutritional-counseling',
        'meal-planning',
        'weight-management',
        'sports-nutrition',
        'detox-programs'
      ]
    },
    'mental-health': {
      name: 'Mental Health',
      subcategories: [
        'counseling',
        'therapy',
        'life-coaching',
        'stress-management',
        'mindfulness-training'
      ]
    },
    'fitness': {
      name: 'Fitness',
      subcategories: [
        'personal-training',
        'group-fitness',
        'pilates',
        'strength-training',
        'cardio-training',
        'flexibility-training'
      ]
    },
    'alternative-healing': {
      name: 'Alternative Healing',
      subcategories: [
        'reiki',
        'crystal-healing',
        'sound-therapy',
        'energy-healing',
        'chakra-balancing'
      ]
    }
  };
  
  return c.json({
    success: true,
    data: categories
  });
});

// Get practitioner's services
services.get('/practitioner/:practitionerId', async (c) => {
  const practitionerId = c.req.param('practitionerId');
  const { page, limit, includeInactive } = validateQueryParams(c.req.query());
  
  // Check if practitioner exists
  const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${practitionerId}`);
  if (!practitioner) {
    throw new NotFoundError('Practitioner not found');
  }
  
  const servicesList = await c.env.SERVICES_KV.list({
    prefix: `practitioner_services:${practitionerId}:`,
    limit: 1000
  });
  
  const services = [];
  
  for (const key of servicesList.keys) {
    const serviceData = await c.env.SERVICES_KV.get(key.name);
    if (serviceData) {
      const service = JSON.parse(serviceData);
      
      // Include inactive services only if requested and user has permission
      const contextUser = c.get('user');
      const userId = contextUser?.id;
      const userRole = contextUser?.role;
      
      if (!service.isActive && 
          !includeInactive && 
          userRole !== 'admin' && 
          practitionerId !== userId) {
        continue;
      }
      
      services.push(service);
    }
  }
  
  // Sort by creation date (newest first)
  services.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedServices = services.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedServices,
    pagination: {
      page,
      limit,
      total: services.length,
      totalPages: Math.ceil(services.length / limit)
    }
  });
});

export default services;