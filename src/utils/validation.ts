// Validation utilities for Klear Karma backend
// Input validation, sanitization, and schema validation

import { ValidationError } from '../middleware/errorHandler';

// Email validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Phone number validation regex (international format)
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

// Password strength regex (at least 8 chars, 1 uppercase, 1 lowercase, 1 number)
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Sanitize string input
export const sanitizeString = (input: string): string => {
  if (typeof input !== 'string') {
    throw new ValidationError('Input must be a string');
  }
  
  return input
    .trim()
    .replace(/[<>"'&]/g, (char) => {
      const entities: { [key: string]: string } = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return entities[char] || char;
    });
};

// Validate email
export const validateEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  return EMAIL_REGEX.test(email.toLowerCase());
};

// Validate phone number
export const validatePhone = (phone: string): boolean => {
  if (!phone || typeof phone !== 'string') {
    return false;
  }
  return PHONE_REGEX.test(phone.replace(/[\s-()]/g, ''));
};

// Validate password strength
export const validatePassword = (password: string): boolean => {
  if (!password || typeof password !== 'string') {
    return false;
  }
  return PASSWORD_REGEX.test(password);
};

// Validate UUID
export const validateUUID = (uuid: string): boolean => {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }
  return UUID_REGEX.test(uuid);
};

// Validate date string (ISO format)
export const validateDate = (dateString: string): boolean => {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }
  
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date.toISOString().startsWith(dateString.substring(0, 10));
};

// Validate future date
export const validateFutureDate = (dateString: string): boolean => {
  if (!validateDate(dateString)) {
    return false;
  }
  
  const date = new Date(dateString);
  const now = new Date();
  return date > now;
};

// Validate time string (HH:MM format)
export const validateTime = (timeString: string): boolean => {
  if (!timeString || typeof timeString !== 'string') {
    return false;
  }
  
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(timeString);
};

// Validate URL
export const validateURL = (url: string): boolean => {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Validate numeric range
export const validateRange = (value: number, min: number, max: number): boolean => {
  return typeof value === 'number' && !isNaN(value) && value >= min && value <= max;
};

// Validate string length
export const validateLength = (str: string, min: number, max: number): boolean => {
  return typeof str === 'string' && str.length >= min && str.length <= max;
};

// User registration validation schema
export interface UserRegistrationData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}

export const validateUserRegistration = (data: any): UserRegistrationData => {
  const errors: string[] = [];
  
  // Email validation
  if (!data.email) {
    errors.push('Email is required');
  } else if (!validateEmail(data.email)) {
    errors.push('Invalid email format');
  }
  
  // Password validation
  if (!data.password) {
    errors.push('Password is required');
  } else if (!validatePassword(data.password)) {
    errors.push('Password must be at least 8 characters with uppercase, lowercase, and number');
  }
  
  // Full name validation
  if (!data.fullName) {
    errors.push('Full name is required');
  } else if (!validateLength(data.fullName, 2, 100)) {
    errors.push('Full name must be between 2 and 100 characters');
  }
  
  // Optional phone validation
  if (data.phone && !validatePhone(data.phone)) {
    errors.push('Invalid phone number format');
  }
  
  // Optional date of birth validation
  if (data.dateOfBirth && !validateDate(data.dateOfBirth)) {
    errors.push('Invalid date of birth format');
  }
  
  // Gender validation
  if (data.gender && !['male', 'female', 'other', 'prefer_not_to_say'].includes(data.gender)) {
    errors.push('Invalid gender value');
  }
  
  if (errors.length > 0) {
    throw new ValidationError(`Validation failed: ${errors.join(', ')}`);
  }
  
  return {
    email: sanitizeString(data.email.toLowerCase()),
    password: data.password,
    fullName: sanitizeString(data.fullName),
    phone: data.phone ? sanitizeString(data.phone) : undefined,
    dateOfBirth: data.dateOfBirth,
    gender: data.gender,
    address: data.address ? {
      street: data.address.street ? sanitizeString(data.address.street) : undefined,
      city: data.address.city ? sanitizeString(data.address.city) : undefined,
      state: data.address.state ? sanitizeString(data.address.state) : undefined,
      zipCode: data.address.zipCode ? sanitizeString(data.address.zipCode) : undefined,
      country: data.address.country ? sanitizeString(data.address.country) : undefined
    } : undefined
  };
};

// Allowed modalities for relevance check
const ALLOWED_MODALITIES = [
  'yoga', 'meditation', 'acupuncture', 'herbal medicine', 'aromatherapy',
  'reiki', 'ayurveda', 'homeopathy', 'crystal healing', 'sound therapy',
  'massage', 'chiropractic', 'reflexology', 'tai chi', 'qigong'
];

// Product creation validation
export interface ProductCreationData {
  name: string;
  description: string;
  price: number;
  images?: string[];
  categories: string[];
}

export const validateProductCreation = (data: any): ProductCreationData => {
  const errors: string[] = [];
  
  // Name validation
  if (!data.name) {
    errors.push('Name is required');
  } else if (!validateLength(data.name, 3, 100)) {
    errors.push('Name must be between 3 and 100 characters');
  }
  
  // Description validation
  if (!data.description) {
    errors.push('Description is required');
  } else if (!validateLength(data.description, 10, 1000)) {
    errors.push('Description must be between 10 and 1000 characters');
  }
  
  // Price validation
  if (!data.price || typeof data.price !== 'number' || data.price <= 0) {
    errors.push('Price must be a positive number');
  }
  
  // Categories validation
  if (!data.categories || !Array.isArray(data.categories) || data.categories.length === 0) {
    errors.push('At least one category is required');
  } else {
    // Modality relevance check
    const hasRelevantModality = data.categories.some((cat: string) => ALLOWED_MODALITIES.includes(cat.toLowerCase()));
    if (!hasRelevantModality) {
      errors.push('Product must include at least one relevant modality category');
    }
  }
  
  // Images validation (optional)
  if (data.images) {
    if (!Array.isArray(data.images)) {
      errors.push('Images must be an array');
    } else {
      data.images.forEach((url: string, index: number) => {
        if (!validateURL(url)) {
          errors.push(`Invalid URL in images at position ${index}`);
        }
      });
    }
  }
  
  if (errors.length > 0) {
    throw new ValidationError(`Validation failed: ${errors.join(', ')}`);
  }
  
  return {
    name: sanitizeString(data.name),
    description: sanitizeString(data.description),
    price: data.price,
    images: data.images,
    categories: data.categories.map((cat: string) => sanitizeString(cat))
  };
};

// Product update validation
export interface ProductUpdateData {
  name?: string;
  description?: string;
  price?: number;
  images?: string[];
  categories?: string[];
  isActive?: boolean;
}

export const validateProductUpdate = (data: any): ProductUpdateData => {
  const updates: ProductUpdateData = {};
  const errors: string[] = [];
  
  if (data.name !== undefined) {
    if (!validateLength(data.name, 3, 100)) {
      errors.push('Name must be between 3 and 100 characters');
    }
    updates.name = sanitizeString(data.name);
  }
  
  if (data.description !== undefined) {
    if (!validateLength(data.description, 10, 1000)) {
      errors.push('Description must be between 10 and 1000 characters');
    }
    updates.description = sanitizeString(data.description);
  }
  
  if (data.price !== undefined) {
    if (typeof data.price !== 'number' || data.price <= 0) {
      errors.push('Price must be a positive number');
    }
    updates.price = data.price;
  }
  
  if (data.categories !== undefined) {
    if (!Array.isArray(data.categories) || data.categories.length === 0) {
      errors.push('At least one category is required');
    } else {
      const hasRelevantModality = data.categories.some((cat: string) => ALLOWED_MODALITIES.includes(cat.toLowerCase()));
      if (!hasRelevantModality) {
        errors.push('Product must include at least one relevant modality category');
      }
      updates.categories = data.categories.map((cat: string) => sanitizeString(cat));
    }
  }
  
  if (data.images !== undefined) {
    if (!Array.isArray(data.images)) {
      errors.push('Images must be an array');
    } else {
      data.images.forEach((url: string, index: number) => {
        if (!validateURL(url)) {
          errors.push(`Invalid URL in images at position ${index}`);
        }
      });
    }
    updates.images = data.images;
  }
  
  if (data.isActive !== undefined) {
    if (typeof data.isActive !== 'boolean') {
      errors.push('isActive must be a boolean');
    }
    updates.isActive = data.isActive;
  }
  
  if (errors.length > 0) {
    throw new ValidationError(`Validation failed: ${errors.join(', ')}`);
  }
  
  return updates;
};

// Practitioner registration validation schema
export interface PractitionerRegistrationData extends UserRegistrationData {
  specializations: string[];
  qualifications: string[];
  experience: number;
  bio?: string;
  consultationFee: number;
  availability: {
    [day: string]: {
      start: string;
      end: string;
      available: boolean;
    };
  };
  languages: string[];
  certifications?: string[];
}

export const validatePractitionerRegistration = (data: any): PractitionerRegistrationData => {
  const baseValidation = validateUserRegistration(data);
  const errors: string[] = [];
  
  // Specializations validation
  if (!data.specializations || !Array.isArray(data.specializations) || data.specializations.length === 0) {
    errors.push('At least one specialization is required');
  }
  
  // Qualifications validation
  if (!data.qualifications || !Array.isArray(data.qualifications) || data.qualifications.length === 0) {
    errors.push('At least one qualification is required');
  }
  
  // Experience validation
  if (typeof data.experience !== 'number' || data.experience < 0 || data.experience > 50) {
    errors.push('Experience must be a number between 0 and 50 years');
  }
  
  // Consultation fee validation
  if (typeof data.consultationFee !== 'number' || data.consultationFee < 0) {
    errors.push('Consultation fee must be a positive number');
  }
  
  // Languages validation
  if (!data.languages || !Array.isArray(data.languages) || data.languages.length === 0) {
    errors.push('At least one language is required');
  }
  
  // Bio validation (optional)
  if (data.bio && !validateLength(data.bio, 10, 1000)) {
    errors.push('Bio must be between 10 and 1000 characters');
  }
  
  // Availability validation
  if (!data.availability || typeof data.availability !== 'object') {
    errors.push('Availability schedule is required');
  } else {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      if (data.availability[day]) {
        const schedule = data.availability[day];
        if (schedule.available && (!validateTime(schedule.start) || !validateTime(schedule.end))) {
          errors.push(`Invalid time format for ${day}`);
        }
      }
    }
  }
  
  if (errors.length > 0) {
    throw new ValidationError(`Practitioner validation failed: ${errors.join(', ')}`);
  }
  
  return {
    ...baseValidation,
    specializations: data.specializations.map((s: string) => sanitizeString(s)),
    qualifications: data.qualifications.map((q: string) => sanitizeString(q)),
    experience: data.experience,
    bio: data.bio ? sanitizeString(data.bio) : undefined,
    consultationFee: data.consultationFee,
    availability: data.availability,
    languages: data.languages.map((l: string) => sanitizeString(l)),
    certifications: data.certifications ? data.certifications.map((c: string) => sanitizeString(c)) : undefined
  };
};

// Appointment booking validation
export interface AppointmentBookingData {
  practitionerId: string;
  serviceId: string;
  date: string;
  time: string;
  duration: number;
  notes?: string;
  type: 'in_person' | 'video_call' | 'phone_call';
}

export const validateAppointmentBooking = (data: any): AppointmentBookingData => {
  const errors: string[] = [];
  
  // Practitioner ID validation
  if (!data.practitionerId || !validateUUID(data.practitionerId)) {
    errors.push('Valid practitioner ID is required');
  }
  
  // Service ID validation
  if (!data.serviceId || !validateUUID(data.serviceId)) {
    errors.push('Valid service ID is required');
  }
  
  // Date validation (must be future date)
  if (!data.date || !validateFutureDate(data.date)) {
    errors.push('Valid future date is required');
  }
  
  // Time validation
  if (!data.time || !validateTime(data.time)) {
    errors.push('Valid time in HH:MM format is required');
  }
  
  // Duration validation (15 minutes to 4 hours)
  if (!validateRange(data.duration, 15, 240)) {
    errors.push('Duration must be between 15 and 240 minutes');
  }
  
  // Type validation
  if (!['in_person', 'video_call', 'phone_call'].includes(data.type)) {
    errors.push('Invalid appointment type');
  }
  
  // Notes validation (optional)
  if (data.notes && !validateLength(data.notes, 1, 500)) {
    errors.push('Notes must be between 1 and 500 characters');
  }
  
  if (errors.length > 0) {
    throw new ValidationError(`Appointment booking validation failed: ${errors.join(', ')}`);
  }
  
  return {
    practitionerId: data.practitionerId,
    serviceId: data.serviceId,
    date: data.date,
    time: data.time,
    duration: data.duration,
    notes: data.notes ? sanitizeString(data.notes) : undefined,
    type: data.type
  };
};

// Review validation
export interface ReviewData {
  appointmentId: string;
  rating: number;
  comment?: string;
  anonymous?: boolean;
}

export const validateReview = (data: any): ReviewData => {
  const errors: string[] = [];
  
  // Appointment ID validation
  if (!data.appointmentId || !validateUUID(data.appointmentId)) {
    errors.push('Valid appointment ID is required');
  }
  
  // Rating validation (1-5 stars)
  if (!validateRange(data.rating, 1, 5) || !Number.isInteger(data.rating)) {
    errors.push('Rating must be an integer between 1 and 5');
  }
  
  // Comment validation (optional)
  if (data.comment && !validateLength(data.comment, 10, 1000)) {
    errors.push('Comment must be between 10 and 1000 characters');
  }
  
  if (errors.length > 0) {
    throw new ValidationError(`Review validation failed: ${errors.join(', ')}`);
  }
  
  return {
    appointmentId: data.appointmentId,
    rating: data.rating,
    comment: data.comment ? sanitizeString(data.comment) : undefined,
    anonymous: Boolean(data.anonymous)
  };
};

// Service validation
export interface ServiceData {
  name: string;
  description: string;
  duration: number;
  price: number;
  category: string;
  subcategory?: string;
  type?: string;
  currency?: string;
  isActive?: boolean;
  location?: any;
  benefits?: string[];
  contraindications?: string[];
  preparationInstructions?: string;
  aftercareInstructions?: string;
  cancellationPolicy?: string;
  bookingSettings?: any;
  tags?: string[];
  requirements?: string[];
}

// Partial service data for updates
export type PartialServiceData = Partial<ServiceData>;

export const validateService = (data: any, partial: boolean = false): ServiceData | PartialServiceData => {
  const errors: string[] = [];
  
  // Name validation
  if (!partial && (!data.name || !validateLength(data.name, 2, 100))) {
    errors.push('Service name must be between 2 and 100 characters');
  } else if (data.name && !validateLength(data.name, 2, 100)) {
    errors.push('Service name must be between 2 and 100 characters');
  }
  
  // Description validation
  if (!partial && (!data.description || !validateLength(data.description, 10, 500))) {
    errors.push('Service description must be between 10 and 500 characters');
  } else if (data.description && !validateLength(data.description, 10, 500)) {
    errors.push('Service description must be between 10 and 500 characters');
  }
  
  // Duration validation (15 minutes to 4 hours)
  if (!partial && !validateRange(data.duration, 15, 240)) {
    errors.push('Duration must be between 15 and 240 minutes');
  } else if (data.duration !== undefined && !validateRange(data.duration, 15, 240)) {
    errors.push('Duration must be between 15 and 240 minutes');
  }
  
  // Price validation
  if (!partial && (typeof data.price !== 'number' || data.price < 0)) {
    errors.push('Price must be a positive number');
  } else if (data.price !== undefined && (typeof data.price !== 'number' || data.price < 0)) {
    errors.push('Price must be a positive number');
  }
  
  // Category validation
  if (!partial && (!data.category || !validateLength(data.category, 2, 50))) {
    errors.push('Category must be between 2 and 50 characters');
  } else if (data.category && !validateLength(data.category, 2, 50)) {
    errors.push('Category must be between 2 and 50 characters');
  }
  
  if (errors.length > 0) {
    throw new ValidationError(`Service validation failed: ${errors.join(', ')}`);
  }
  
  if (partial) {
    const partialData: PartialServiceData = {};
    
    if (data.name !== undefined) partialData.name = sanitizeString(data.name);
    if (data.description !== undefined) partialData.description = sanitizeString(data.description);
    if (data.duration !== undefined) partialData.duration = data.duration;
    if (data.price !== undefined) partialData.price = data.price;
    if (data.category !== undefined) partialData.category = sanitizeString(data.category);
    if (data.subcategory !== undefined) partialData.subcategory = sanitizeString(data.subcategory);
    if (data.type !== undefined) partialData.type = sanitizeString(data.type);
    if (data.currency !== undefined) partialData.currency = sanitizeString(data.currency);
    if (data.isActive !== undefined) partialData.isActive = Boolean(data.isActive);
    if (data.location !== undefined) partialData.location = data.location;
    if (data.benefits !== undefined) partialData.benefits = data.benefits;
    if (data.contraindications !== undefined) partialData.contraindications = data.contraindications;
    if (data.preparationInstructions !== undefined) partialData.preparationInstructions = sanitizeString(data.preparationInstructions);
    if (data.aftercareInstructions !== undefined) partialData.aftercareInstructions = sanitizeString(data.aftercareInstructions);
    if (data.cancellationPolicy !== undefined) partialData.cancellationPolicy = sanitizeString(data.cancellationPolicy);
    if (data.bookingSettings !== undefined) partialData.bookingSettings = data.bookingSettings;
    if (data.tags !== undefined) partialData.tags = data.tags;
    if (data.requirements !== undefined) partialData.requirements = data.requirements;
    
    return partialData;
  }
  
  // For complete service data
  return {
    name: sanitizeString(data.name || ''),
    description: sanitizeString(data.description || ''),
    duration: data.duration || 0,
    price: data.price || 0,
    category: sanitizeString(data.category || ''),
    subcategory: data.subcategory ? sanitizeString(data.subcategory) : undefined,
    type: data.type ? sanitizeString(data.type) : undefined,
    currency: data.currency ? sanitizeString(data.currency) : undefined,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    location: data.location,
    benefits: data.benefits,
    contraindications: data.contraindications,
    preparationInstructions: data.preparationInstructions ? sanitizeString(data.preparationInstructions) : undefined,
    aftercareInstructions: data.aftercareInstructions ? sanitizeString(data.aftercareInstructions) : undefined,
    cancellationPolicy: data.cancellationPolicy ? sanitizeString(data.cancellationPolicy) : undefined,
    bookingSettings: data.bookingSettings,
    tags: data.tags,
    requirements: data.requirements
  };
};

// Message validation
export interface MessageData {
  recipientId: string;
  content: string;
  type?: 'text' | 'image' | 'file';
  metadata?: any;
}

export const validateMessage = (data: any): MessageData => {
  const errors: string[] = [];
  
  // Recipient ID validation
  if (!data.recipientId || !validateUUID(data.recipientId)) {
    errors.push('Valid recipient ID is required');
  }
  
  // Content validation
  if (!data.content || !validateLength(data.content, 1, 2000)) {
    errors.push('Message content must be between 1 and 2000 characters');
  }
  
  // Type validation
  if (data.type && !['text', 'image', 'file'].includes(data.type)) {
    errors.push('Invalid message type');
  }
  
  if (errors.length > 0) {
    throw new ValidationError(`Message validation failed: ${errors.join(', ')}`);
  }
  
  return {
    recipientId: data.recipientId,
    content: sanitizeString(data.content),
    type: data.type || 'text',
    metadata: data.metadata
  };
};

// Query parameter validation
export const validateQueryParams = (params: any) => {
  const validated: any = {};
  
  // Page validation
  if (params.page) {
    const page = parseInt(params.page);
    validated.page = isNaN(page) || page < 1 ? 1 : page;
  } else {
    validated.page = 1;
  }
  
  // Limit validation
  if (params.limit) {
    const limit = parseInt(params.limit);
    validated.limit = isNaN(limit) || limit < 1 || limit > 100 ? 20 : limit;
  } else {
    validated.limit = 20;
  }
  
  // Sort validation
  if (params.sort) {
    validated.sort = sanitizeString(params.sort);
  }
  
  // Order validation
  if (params.order && ['asc', 'desc'].includes(params.order.toLowerCase())) {
    validated.order = params.order.toLowerCase();
  } else {
    validated.order = 'desc';
  }
  
  // Search validation
  if (params.search) {
    validated.search = sanitizeString(params.search);
  }
  
  return validated;
};

// Generic object validation
export const validateRequired = (obj: any, requiredFields: string[]): void => {
  const missing = requiredFields.filter(field => {
    const value = obj[field];
    return value === undefined || value === null || value === '';
  });
  
  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
};

// Clean object (remove undefined/null values)
export const cleanObject = (obj: any): any => {
  const cleaned: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        const cleanedNested = cleanObject(value);
        if (Object.keys(cleanedNested).length > 0) {
          cleaned[key] = cleanedNested;
        }
      } else {
        cleaned[key] = value;
      }
    }
  }
  
  return cleaned;
};