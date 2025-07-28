/**
 * Mock Data Population Script for Klear Karma Backend
 * Generates realistic test data for all KV namespaces
 */

import { WorkerEnv } from '../src/types/env';
import { hashPassword, generateId } from '../src/utils/crypto';

// Mock data constants
const SPECIALIZATIONS = [
  'Reiki Healing', 'Crystal Therapy', 'Chakra Balancing', 'Energy Healing',
  'Acupuncture', 'Aromatherapy', 'Sound Healing', 'Meditation Guidance',
  'Spiritual Counseling', 'Tarot Reading', 'Astrology', 'Numerology',
  'Past Life Regression', 'Hypnotherapy', 'Life Coaching', 'Breathwork',
  'Yoga Therapy', 'Ayurveda', 'Herbalism', 'Massage Therapy'
];

const CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
  'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
  'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte',
  'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Boston'
];

const FIRST_NAMES = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason',
  'Isabella', 'William', 'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia',
  'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander', 'Abigail', 'Michael',
  'Emily', 'Daniel', 'Elizabeth', 'Matthew', 'Sofia', 'Jackson', 'Avery',
  'Sebastian', 'Ella', 'David', 'Madison', 'Carter', 'Scarlett', 'Wyatt',
  'Victoria', 'Jayden', 'Aria', 'John', 'Grace', 'Owen', 'Chloe', 'Dylan',
  'Camila', 'Luke', 'Penelope', 'Gabriel', 'Riley'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark',
  'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King',
  'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores'
];

const SERVICE_DESCRIPTIONS = {
  'Reiki Healing': 'Experience deep relaxation and energy balancing through gentle touch and universal life force energy.',
  'Crystal Therapy': 'Harness the healing power of crystals to restore balance and promote physical and emotional well-being.',
  'Chakra Balancing': 'Align and balance your seven energy centers for optimal physical, emotional, and spiritual health.',
  'Energy Healing': 'Clear energetic blockages and restore natural flow of life force energy throughout your body.',
  'Acupuncture': 'Traditional Chinese medicine technique using fine needles to stimulate healing and restore balance.',
  'Aromatherapy': 'Therapeutic use of essential oils to promote relaxation, healing, and emotional well-being.',
  'Sound Healing': 'Vibrational therapy using singing bowls, gongs, and other instruments to promote deep healing.',
  'Meditation Guidance': 'Learn mindfulness and meditation techniques to reduce stress and enhance inner peace.',
  'Spiritual Counseling': 'Guidance and support for your spiritual journey and personal growth.',
  'Tarot Reading': 'Gain insights into your life path and future possibilities through intuitive card readings.',
  'Astrology': 'Discover your cosmic blueprint and how celestial influences shape your life journey.',
  'Numerology': 'Unlock the hidden meanings in numbers and their influence on your life path.',
  'Past Life Regression': 'Explore past life experiences to understand current life patterns and heal old wounds.',
  'Hypnotherapy': 'Access your subconscious mind to create positive changes and overcome limiting beliefs.',
  'Life Coaching': 'Achieve your goals and create the life you desire with personalized guidance and support.',
  'Breathwork': 'Transform your life through conscious breathing techniques and breath awareness.',
  'Yoga Therapy': 'Therapeutic yoga practices tailored to your specific needs for healing and wellness.',
  'Ayurveda': 'Ancient Indian healing system focusing on balance of mind, body, and spirit.',
  'Herbalism': 'Natural healing using the therapeutic properties of plants and herbal remedies.',
  'Massage Therapy': 'Therapeutic touch to relieve tension, promote relaxation, and enhance well-being.'
};

const REVIEW_COMMENTS = [
  'Amazing session! I felt so much lighter and more balanced afterwards.',
  'Incredible healing experience. The practitioner was very intuitive and caring.',
  'Life-changing session. I finally found the peace I was looking for.',
  'Professional and deeply healing. Highly recommend to anyone seeking wellness.',
  'Transformative experience. I felt energy shifts throughout the entire session.',
  'Wonderful healer with genuine gifts. The session exceeded my expectations.',
  'Felt immediate relief from stress and anxiety. Thank you for this healing.',
  'Beautiful space and incredible energy. I will definitely be returning.',
  'The practitioner created a safe and sacred space for deep healing.',
  'Profound experience that helped me release old patterns and trauma.',
  'Gentle yet powerful healing. I felt supported throughout the entire process.',
  'Exceptional session that brought clarity and peace to my mind and heart.',
  'Highly skilled practitioner who truly cares about their clients wellbeing.',
  'Felt a deep sense of renewal and connection after this healing session.',
  'The energy work was exactly what I needed. Feeling grateful and restored.'
];

// Helper functions
function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomChoices<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateEmail(firstName: string, lastName: string): string {
  const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
  const variations = [
    `${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}${randomInt(1, 999)}`,
    `${firstName.toLowerCase()}_${lastName.toLowerCase()}`
  ];
  return `${randomChoice(variations)}@${randomChoice(domains)}`;
}

function generatePhone(): string {
  const area = randomInt(200, 999);
  const exchange = randomInt(200, 999);
  const number = randomInt(1000, 9999);
  return `+1${area}${exchange}${number}`;
}

// Data generators
export async function generateUsers(count: number = 50): Promise<any[]> {
  const users: any[] = [];
  
  for (let i = 0; i < count; i++) {
    const firstName = randomChoice(FIRST_NAMES);
    const lastName = randomChoice(LAST_NAMES);
    const email = generateEmail(firstName, lastName);
    const hashedPassword = await hashPassword('password123');
    
    const user = {
      id: generateId(),
      email,
      password: hashedPassword,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      phone: generatePhone(),
      dateOfBirth: randomDate(new Date('1970-01-01'), new Date('2000-12-31')).toISOString().split('T')[0],
      gender: randomChoice(['male', 'female', 'non-binary', 'prefer-not-to-say']),
      address: {
        street: `${randomInt(100, 9999)} ${randomChoice(['Main', 'Oak', 'Pine', 'Elm', 'Cedar'])} ${randomChoice(['St', 'Ave', 'Blvd', 'Dr'])}`,
        city: randomChoice(CITIES),
        state: randomChoice(['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI']),
        zipCode: randomInt(10000, 99999).toString(),
        country: 'United States'
      },
      preferences: {
        notifications: {
          email: Math.random() > 0.3,
          sms: Math.random() > 0.5,
          push: Math.random() > 0.2
        },
        privacy: {
          profileVisible: Math.random() > 0.1,
          showLocation: Math.random() > 0.4
        },
        specializations: randomChoices(SPECIALIZATIONS, randomInt(1, 4))
      },
      role: 'user',
      status: randomChoice(['active', 'active', 'active', 'active', 'inactive']), // 80% active
      emailVerified: Math.random() > 0.1, // 90% verified
      createdAt: randomDate(new Date('2023-01-01'), new Date()).toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: randomDate(new Date('2024-01-01'), new Date()).toISOString()
    };
    
    users.push(user);
  }
  
  return users;
}

export async function generatePractitioners(count: number = 25): Promise<any[]> {
  const practitioners: any[] = [];
  
  for (let i = 0; i < count; i++) {
    const firstName = randomChoice(FIRST_NAMES);
    const lastName = randomChoice(LAST_NAMES);
    const email = generateEmail(firstName, lastName);
    const hashedPassword = await hashPassword('password123');
    const specializations = randomChoices(SPECIALIZATIONS, randomInt(2, 5));
    
    const practitioner = {
      id: generateId(),
      email,
      password: hashedPassword,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      phone: generatePhone(),
      dateOfBirth: randomDate(new Date('1970-01-01'), new Date('1995-12-31')).toISOString().split('T')[0],
      gender: randomChoice(['male', 'female', 'non-binary']),
      address: {
        street: `${randomInt(100, 9999)} ${randomChoice(['Healing', 'Wellness', 'Spiritual', 'Energy', 'Peace'])} ${randomChoice(['Way', 'Path', 'Circle', 'Lane'])}`,
        city: randomChoice(CITIES),
        state: randomChoice(['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI']),
        zipCode: randomInt(10000, 99999).toString(),
        country: 'United States'
      },
      bio: `Experienced ${specializations[0]} practitioner with ${randomInt(3, 20)} years of experience. Passionate about helping others find balance, healing, and inner peace through holistic wellness practices.`,
      specializations,
      certifications: specializations.map(spec => ({
        name: `Certified ${spec} Practitioner`,
        issuer: `International ${spec.split(' ')[0]} Association`,
        year: randomInt(2010, 2023),
        verified: Math.random() > 0.2
      })),
      experience: randomInt(3, 20),
      rating: randomFloat(4.0, 5.0),
      reviewCount: randomInt(10, 200),
      completedSessions: randomInt(50, 1000),
      availability: {
        timezone: 'America/New_York',
        schedule: {
          monday: { available: Math.random() > 0.2, hours: ['09:00', '17:00'] },
          tuesday: { available: Math.random() > 0.2, hours: ['09:00', '17:00'] },
          wednesday: { available: Math.random() > 0.2, hours: ['09:00', '17:00'] },
          thursday: { available: Math.random() > 0.2, hours: ['09:00', '17:00'] },
          friday: { available: Math.random() > 0.2, hours: ['09:00', '17:00'] },
          saturday: { available: Math.random() > 0.4, hours: ['10:00', '16:00'] },
          sunday: { available: Math.random() > 0.6, hours: ['10:00', '16:00'] }
        },
        bookingWindow: randomInt(7, 60), // days in advance
        sessionDuration: randomChoice([30, 45, 60, 90, 120])
      },
      pricing: {
        baseRate: randomInt(50, 200),
        currency: 'USD',
        packages: [
          { sessions: 3, discount: 10, price: randomInt(135, 540) },
          { sessions: 5, discount: 15, price: randomInt(212, 850) },
          { sessions: 10, discount: 20, price: randomInt(400, 1600) }
        ]
      },
      location: {
        type: randomChoice(['in-person', 'virtual', 'both']),
        address: Math.random() > 0.3 ? {
          street: `${randomInt(100, 9999)} ${randomChoice(['Healing', 'Wellness', 'Spiritual'])} Center`,
          city: randomChoice(CITIES),
          state: randomChoice(['CA', 'NY', 'TX', 'FL', 'IL']),
          zipCode: randomInt(10000, 99999).toString()
        } : null,
        radius: randomInt(10, 50) // miles for in-person sessions
      },
      preferences: {
        notifications: {
          email: true,
          sms: Math.random() > 0.3,
          push: true
        },
        autoAcceptBookings: Math.random() > 0.4,
        requireDeposit: Math.random() > 0.6
      },
      role: 'practitioner',
      status: randomChoice(['active', 'active', 'active', 'pending', 'inactive']), // 60% active
      verified: Math.random() > 0.2, // 80% verified
      emailVerified: Math.random() > 0.05, // 95% verified
      backgroundCheck: Math.random() > 0.3, // 70% completed
      createdAt: randomDate(new Date('2022-01-01'), new Date()).toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: randomDate(new Date('2024-01-01'), new Date()).toISOString()
    };
    
    practitioners.push(practitioner);
  }
  
  return practitioners;
}

export function generateServices(practitioners: any[], servicesPerPractitioner: number = 4): any[] {
  const services: any[] = [];
  
  practitioners.forEach(practitioner => {
    const practitionerServices = randomChoices(practitioner.specializations, 
      Math.min(servicesPerPractitioner, practitioner.specializations.length));
    
    practitionerServices.forEach((specialization: string) => {
      const service = {
        id: generateId(),
        practitionerId: practitioner.id,
        name: specialization,
        description: SERVICE_DESCRIPTIONS[specialization] || `Professional ${specialization} service tailored to your individual needs.`,
        category: specialization.split(' ')[0].toLowerCase(),
        duration: randomChoice([30, 45, 60, 90, 120]),
        price: randomInt(50, 250),
        currency: 'USD',
        type: randomChoice(['individual', 'group', 'workshop']),
        maxParticipants: randomChoice([1, 1, 1, 2, 4, 6, 8]), // mostly individual
        requirements: Math.random() > 0.7 ? [
          randomChoice([
            'No prior experience necessary',
            'Comfortable clothing recommended',
            'Please arrive 10 minutes early',
            'Bring a water bottle',
            'Avoid heavy meals 2 hours before'
          ])
        ] : [],
        benefits: randomChoices([
          'Stress reduction',
          'Improved energy levels',
          'Better sleep quality',
          'Emotional balance',
          'Pain relief',
          'Mental clarity',
          'Spiritual growth',
          'Increased self-awareness',
          'Deep relaxation',
          'Chakra alignment'
        ], randomInt(3, 6)),
        tags: randomChoices([
          'healing', 'wellness', 'spiritual', 'energy', 'relaxation',
          'meditation', 'holistic', 'therapeutic', 'mindfulness', 'balance'
        ], randomInt(2, 5)),
        rating: randomFloat(4.0, 5.0),
        reviewCount: randomInt(5, 50),
        bookingCount: randomInt(10, 200),
        status: randomChoice(['active', 'active', 'active', 'inactive']), // 75% active
        createdAt: randomDate(new Date('2023-01-01'), new Date()).toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      services.push(service);
    });
  });
  
  return services;
}

export function generateAppointments(users: any[], practitioners: any[], services: any[], count: number = 200): any[] {
  const appointments: any[] = [];
  const statuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'];
  const statusWeights = [0.1, 0.3, 0.5, 0.08, 0.02]; // 50% completed, 30% confirmed, etc.
  
  for (let i = 0; i < count; i++) {
    const customer = randomChoice(users);
    const practitioner = randomChoice(practitioners);
    const service = randomChoice(services.filter(s => s.practitionerId === practitioner.id));
    
    if (!service) continue;
    
    const appointmentDate = randomDate(new Date('2024-01-01'), new Date('2024-12-31'));
    const status = weightedRandomChoice(statuses, statusWeights);
    
    const appointment = {
      id: generateId(),
      customerId: customer.id,
      practitionerId: practitioner.id,
      serviceId: service.id,
      date: appointmentDate.toISOString().split('T')[0],
      time: randomChoice(['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']),
      duration: service.duration,
      status,
      type: randomChoice(['in-person', 'virtual']),
      price: service.price,
      currency: 'USD',
      paymentStatus: status === 'completed' ? 'paid' : 
                    status === 'confirmed' ? randomChoice(['paid', 'pending']) :
                    status === 'cancelled' ? 'refunded' : 'pending',
      notes: Math.random() > 0.7 ? randomChoice([
        'First time client - please arrive 15 minutes early',
        'Follow-up session for ongoing treatment',
        'Client requested focus on stress relief',
        'Rescheduled from previous date',
        'Special requirements discussed via message'
      ]) : '',
      location: service.type === 'virtual' ? {
        type: 'virtual',
        platform: 'zoom',
        meetingId: generateId().substring(0, 10)
      } : {
        type: 'in-person',
        address: practitioner.location.address
      },
      reminders: {
        sent24h: status !== 'pending',
        sent2h: status === 'completed' || status === 'no-show',
        sentFollowup: status === 'completed'
      },
      createdAt: randomDate(new Date('2024-01-01'), appointmentDate).toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: status === 'completed' ? 
        new Date(appointmentDate.getTime() + service.duration * 60000).toISOString() : null
    };
    
    appointments.push(appointment);
  }
  
  return appointments;
}

function weightedRandomChoice<T>(items: T[], weights: number[]): T {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }
  
  return items[items.length - 1];
}

export function generateReviews(appointments: any[], count: number = 300): any[] {
  const reviews: any[] = [];
  const completedAppointments = appointments.filter(a => a.status === 'completed');
  
  // Generate reviews for 60% of completed appointments
  const appointmentsToReview = randomChoices(completedAppointments, 
    Math.min(count, Math.floor(completedAppointments.length * 0.6)));
  
  appointmentsToReview.forEach(appointment => {
    const rating = weightedRandomChoice([1, 2, 3, 4, 5], [0.02, 0.03, 0.1, 0.35, 0.5]); // Mostly positive
    
    const review = {
      id: generateId(),
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      practitionerId: appointment.practitionerId,
      serviceId: appointment.serviceId,
      rating,
      title: rating >= 4 ? randomChoice([
        'Amazing experience!',
        'Highly recommend!',
        'Life-changing session',
        'Incredible healing',
        'Perfect session',
        'Outstanding practitioner',
        'Transformative experience'
      ]) : rating === 3 ? randomChoice([
        'Good session',
        'Decent experience',
        'Okay overall',
        'Average session'
      ]) : randomChoice([
        'Could be better',
        'Not what I expected',
        'Disappointing',
        'Below expectations'
      ]),
      comment: randomChoice(REVIEW_COMMENTS),
      helpful: randomInt(0, 20),
      reported: Math.random() > 0.95, // 5% reported
      hidden: Math.random() > 0.98, // 2% hidden
      practitionerResponse: Math.random() > 0.4 ? {
        message: randomChoice([
          'Thank you for your wonderful feedback! It was a pleasure working with you.',
          'I\'m so grateful for your kind words. Wishing you continued healing and growth.',
          'Thank you for taking the time to share your experience. Blessings to you!',
          'Your feedback means the world to me. Thank you for trusting me with your healing journey.',
          'I\'m honored to have been part of your wellness journey. Thank you for the review!'
        ]),
        createdAt: randomDate(new Date(appointment.completedAt!), new Date()).toISOString()
      } : null,
      createdAt: randomDate(new Date(appointment.completedAt!), new Date()).toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    reviews.push(review);
  });
  
  return reviews;
}

export function generateMessages(users: any[], practitioners: any[], appointments: any[], count: number = 500): any[] {
  const messages: any[] = [];
  const conversations = new Set<string>();
  
  // Generate conversations based on appointments
  appointments.forEach(appointment => {
    const conversationId = [appointment.customerId, appointment.practitionerId].sort().join('-');
    conversations.add(conversationId);
  });
  
  // Add some random conversations
  for (let i = 0; i < 50; i++) {
    const user = randomChoice(users);
    const practitioner = randomChoice(practitioners);
    const conversationId = [user.id, practitioner.id].sort().join('-');
    conversations.add(conversationId);
  }
  
  const conversationArray = Array.from(conversations);
  
  for (let i = 0; i < count; i++) {
    const conversationId = randomChoice(conversationArray);
    const [userId1, userId2] = conversationId.split('-');
    
    const sender = randomChoice([userId1, userId2]);
    const recipient = sender === userId1 ? userId2 : userId1;
    
    const messageTemplates = [
      'Hi! I\'m interested in booking a session with you.',
      'Thank you for the wonderful session yesterday!',
      'Could we reschedule our appointment for next week?',
      'I have a question about the healing process.',
      'Looking forward to our session tomorrow.',
      'The session was exactly what I needed. Thank you!',
      'Can you tell me more about your approach?',
      'I\'d like to book a follow-up session.',
      'What should I expect during our first session?',
      'Thank you for your patience and guidance.',
      'I felt such a positive shift after our session.',
      'Could you recommend any practices for between sessions?',
      'I\'m new to this type of healing. Can you help guide me?',
      'The energy work was incredible. When can we meet again?',
      'I have some concerns I\'d like to discuss before our session.'
    ];
    
    const message = {
      id: generateId(),
      conversationId,
      senderId: sender,
      recipientId: recipient,
      content: randomChoice(messageTemplates),
      type: 'text',
      status: randomChoice(['sent', 'delivered', 'read']),
      readAt: Math.random() > 0.3 ? randomDate(new Date('2024-01-01'), new Date()).toISOString() : null,
      attachments: Math.random() > 0.9 ? [{
        type: 'image',
        url: `https://example.com/attachments/${generateId()}.jpg`,
        filename: 'image.jpg',
        size: randomInt(100000, 5000000)
      }] : [],
      metadata: {
        platform: 'mobile',
        version: '1.0.0'
      },
      createdAt: randomDate(new Date('2024-01-01'), new Date()).toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: Math.random() > 0.95 ? randomDate(new Date('2024-01-01'), new Date()).toISOString() : null
    };
    
    messages.push(message);
  }
  
  return messages;
}

export function generateAnalytics(users: any[], practitioners: any[], appointments: any[], reviews: any[]): any[] {
  const analytics: any[] = [];
  const events = [
    'user_registration', 'user_login', 'practitioner_registration', 'practitioner_login',
    'appointment_booked', 'appointment_completed', 'appointment_cancelled',
    'review_created', 'message_sent', 'profile_updated', 'search_performed',
    'payment_processed', 'service_created', 'service_updated'
  ];
  
  // Generate daily analytics for the past year
  const startDate = new Date('2024-01-01');
  const endDate = new Date();
  
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    events.forEach(event => {
      const count = randomInt(0, 50);
      if (count > 0) {
        const analytic = {
          id: generateId(),
          event,
          date: date.toISOString().split('T')[0],
          count,
          metadata: {
            source: randomChoice(['web', 'mobile', 'api']),
            userAgent: randomChoice(['iOS', 'Android', 'Chrome', 'Safari', 'Firefox']),
            location: randomChoice(CITIES)
          },
          createdAt: date.toISOString()
        };
        
        analytics.push(analytic);
      }
    });
  }
  
  // Generate revenue analytics
  const completedAppointments = appointments.filter(a => a.status === 'completed');
  const revenueByDate = new Map<string, number>();
  
  completedAppointments.forEach(appointment => {
    const date = appointment.date;
    const current = revenueByDate.get(date) || 0;
    revenueByDate.set(date, current + appointment.price);
  });
  
  revenueByDate.forEach((revenue, date) => {
    analytics.push({
      id: generateId(),
      event: 'revenue_generated',
      date,
      count: 1,
      value: revenue,
      metadata: {
        currency: 'USD',
        appointmentCount: completedAppointments.filter(a => a.date === date).length
      },
      createdAt: new Date(date).toISOString()
    });
  });
  
  return analytics;
}

const PRODUCT_CATEGORIES = [
  'Crystals', 'Essential Oils', 'Herbs & Supplements', 'Books & Journals',
  'Meditation Tools', 'Yoga Equipment', 'Aromatherapy', 'Sound Healing Instruments',
  'Tarot & Oracle Cards', 'Jewelry & Amulets', 'Home Decor', 'Clothing & Accessories',
  'Incense & Smudging', 'Candles', 'Wellness Kits'
];

const PRODUCT_NAMES: { [key: string]: string[] } = {
  'Crystals': ['Amethyst Cluster', 'Rose Quartz Heart', 'Clear Quartz Point', 'Black Tourmaline', 'Selenite Wand'],
  'Essential Oils': ['Lavender Oil', 'Peppermint Oil', 'Frankincense Oil', 'Tea Tree Oil', 'Eucalyptus Oil'],
  'Herbs & Supplements': ['Ashwagandha Powder', 'Turmeric Capsules', 'Ginseng Root', 'Spirulina Tablets', 'Moringa Leaves'],
  'Books & Journals': ['The Power of Now', 'Gratitude Journal', 'Crystal Bible', 'Yoga Sutras', 'Tarot Guidebook'],
  'Meditation Tools': ['Meditation Cushion', 'Mala Beads', 'Singing Bowl', 'Eye Pillow', 'Timer'],
  'Yoga Equipment': ['Yoga Mat', 'Yoga Blocks', 'Yoga Strap', 'Bolster', 'Wheel'],
  'Aromatherapy': ['Diffuser', 'Carrier Oil Set', 'Incense Holder', 'Bath Salts', 'Massage Oil'],
  'Sound Healing Instruments': ['Tibetan Singing Bowl', 'Tuning Forks', 'Crystal Harp', 'Drum', 'Chimes'],
  'Tarot & Oracle Cards': ['Rider-Waite Tarot', 'Angel Oracle', 'Moonology Cards', 'Animal Spirit', 'Wisdom Deck'],
  'Jewelry & Amulets': ['Crystal Pendant', 'Chakra Bracelet', 'Protection Amulet', 'Evil Eye Necklace', 'Rune Ring'],
  'Home Decor': ['Mandala Tapestry', 'Altar Cloth', 'Crystal Grid', 'Feng Shui Mirror', 'Dream Catcher'],
  'Clothing & Accessories': ['Yoga Pants', 'Meditation Shawl', 'Healing Scarf', 'Aromatherapy Locket', 'Wellness Tote'],
  'Incense & Smudging': ['Sage Bundle', 'Palo Santo Sticks', 'Frankincense Resin', 'Cone Incense', 'Stick Holder'],
  'Candles': ['Soy Wax Candle', 'Beeswax Taper', 'Chakra Candle', 'Intention Candle', 'Aromatherapy Candle'],
  'Wellness Kits': ['Beginner Crystal Kit', 'Meditation Starter Set', 'Chakra Balancing Kit', 'Self-Care Box', 'Energy Cleansing Kit']
};

export function generateProducts(count: number = 100): any[] {
  const products: any[] = [];
  for (let i = 0; i < count; i++) {
    const category = randomChoice(PRODUCT_CATEGORIES);
    const name = randomChoice(PRODUCT_NAMES[category]);
    const product = {
      id: generateId(),
      name,
      category,
      description: `High-quality ${name} for your wellness journey. Perfect for enhancing your spiritual practice.`,
      price: randomFloat(5.99, 199.99).toFixed(2),
      stock: randomInt(1, 100),
      rating: randomFloat(3.5, 5.0).toFixed(1),
      reviewsCount: randomInt(0, 500),
      isVerified: Math.random() > 0.2,
      createdAt: randomDate(new Date('2023-01-01'), new Date()).toISOString(),
      updatedAt: new Date().toISOString()
    };
    products.push(product);
  }
  return products;
}

// Main population function
export async function populateAllData(env: WorkerEnv): Promise<any> {
  console.log('🚀 Starting mock data population...');
  
  try {
    // Generate all data
    console.log('📊 Generating users...');
    const users = await generateUsers(50);
    
    console.log('👨‍⚕️ Generating practitioners...');
    const practitioners = await generatePractitioners(25);
    
    console.log('🛠️ Generating services...');
    const services = generateServices(practitioners, 4);
    
    console.log('📅 Generating appointments...');
    const appointments = generateAppointments(users, practitioners, services, 200);
    
    console.log('⭐ Generating reviews...');
    const reviews = generateReviews(appointments, 300);
    
    console.log('💬 Generating messages...');
    const messages = generateMessages(users, practitioners, appointments, 500);
    
    console.log('📈 Generating analytics...');
    const analytics = generateAnalytics(users, practitioners, appointments, reviews);

    console.log('🛍️ Generating products...');
    const products = generateProducts(100);
    
    // Populate KV namespaces

    console.log('💾 Populating PRODUCTS_KV...');
    for (const product of products) {
      await env.PRODUCTS_KV.put(`product:${product.id}`, JSON.stringify(product));
    }
    console.log('💾 Populating USERS_KV...');
    for (const user of users) {
      await env.USERS_KV.put(`user:${user.id}`, JSON.stringify(user));
      await env.USERS_KV.put(`email:${user.email}`, user.id);
    }
    
    console.log('💾 Populating PRACTITIONERS_KV...');
    for (const practitioner of practitioners) {
      await env.PRACTITIONERS_KV.put(`practitioner:${practitioner.id}`, JSON.stringify(practitioner));
      await env.PRACTITIONERS_KV.put(`email:${practitioner.email}`, practitioner.id);
    }
    
    console.log('💾 Populating SERVICES_KV...');
    for (const service of services) {
      await env.SERVICES_KV.put(`service:${service.id}`, JSON.stringify(service));
    }
    
    console.log('💾 Populating APPOINTMENTS_KV...');
    for (const appointment of appointments) {
      await env.APPOINTMENTS_KV.put(`appointment:${appointment.id}`, JSON.stringify(appointment));
    }
    
    console.log('💾 Populating REVIEWS_KV...');
    for (const review of reviews) {
      await env.REVIEWS_KV.put(`review:${review.id}`, JSON.stringify(review));
    }
    
    console.log('💾 Populating MESSAGES_KV...');
    for (const message of messages) {
      await (env as any).MESSAGES_KV.put(`message:${message.id}`, JSON.stringify(message));
    }
    
    console.log('💾 Populating ANALYTICS_KV...');
    for (const analytic of analytics) {
      await env.ANALYTICS_KV.put(`analytics:${analytic.event}:${analytic.date}:${analytic.id}`, JSON.stringify(analytic));
    }
    
    // Create summary statistics
    const summary = {
      users: users.length,
      practitioners: practitioners.length,
      services: services.length,
      appointments: appointments.length,
      reviews: reviews.length,
      messages: messages.length,
      analytics: analytics.length,
      populatedAt: new Date().toISOString()
    };
    
    await env.ANALYTICS_KV.put('mock_data_summary', JSON.stringify(summary));
    
    console.log('✅ Mock data population completed successfully!');
    console.log('📊 Summary:', summary);
    
    return summary;
    
  } catch (error) {
    console.error('❌ Error populating mock data:', error);
    throw error;
  }
}