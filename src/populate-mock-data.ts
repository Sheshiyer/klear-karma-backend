// populate-mock-data.ts - Script to populate KV with mock data for development
import { WorkerEnv } from './types/env';
import { generateSecureRandom, hashPassword } from './utils/crypto';
import { Product, getProductKey } from './types/product';

// Sample data generators
async function generateMockUsers(env: WorkerEnv, count: number) {
  for (let i = 0; i < count; i++) {
    const id = generateSecureRandom(16);
    const user = {
      id,
      email: `user${i}@example.com`,
      fullName: `User ${i + 1}`,
      hashedPassword: await hashPassword('Password123!'),
      role: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await env.USERS_KV.put(`user:${id}`, JSON.stringify(user));
  }
}

async function generateMockPractitioners(env: WorkerEnv, count: number) {
  const specializations = ['Yoga', 'Meditation', 'Acupuncture', 'Reiki'];
  for (let i = 0; i < count; i++) {
    const id = generateSecureRandom(16);
    const practitioner = {
      id,
      fullName: `Practitioner ${i + 1}`,
      email: `pract${i}@example.com`,
      specializations: [specializations[Math.floor(Math.random() * specializations.length)]],
      averageRating: Math.random() * 5,
      verified: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await env.PRACTITIONERS_KV.put(`practitioner:${id}`, JSON.stringify(practitioner));
  }
}

async function generateMockServices(env: WorkerEnv, practitioners: string[]) {
  // Updated service categories with 25 holistic healing modalities
  const serviceCategories = [
    'sound-healing',
    'chakra-healing', 
    'reiki',
    'pranic-healing',
    'crystal-healing',
    'breathwork',
    'shamanic-healing',
    'akashic-records',
    'past-life-regression',
    'ayurvedic-consultations',
    'herbal-medicine',
    'holistic-nutrition',
    'yoga-therapy',
    'sound-bath',
    'theta-healing',
    'access-bars',
    'astrology',
    'numerology',
    'tarot-oracle',
    'eft-tapping',
    'spiritual-coaching',
    'qigong-healing',
    'hypnotherapy',
    'somatic-healing',
    'bach-flower-remedies'
  ];

  const serviceTypes = ['in-person', 'virtual', 'both'];
  const currencies = ['USD', 'EUR', 'GBP', 'CAD'];

  // Service name mappings for better display names
  const serviceNames: { [key: string]: string } = {
    'sound-healing': 'Sound Healing Session',
    'chakra-healing': 'Chakra Balancing & Healing',
    'reiki': 'Reiki Energy Healing',
    'pranic-healing': 'Pranic Healing Session',
    'crystal-healing': 'Crystal Healing Therapy',
    'breathwork': 'Transformational Breathwork',
    'shamanic-healing': 'Shamanic Journey & Healing',
    'akashic-records': 'Akashic Records Reading',
    'past-life-regression': 'Past Life Regression Therapy',
    'ayurvedic-consultations': 'Ayurvedic Consultation',
    'herbal-medicine': 'Herbal Medicine Consultation',
    'holistic-nutrition': 'Holistic Nutrition Counseling',
    'yoga-therapy': 'Therapeutic Yoga Session',
    'sound-bath': 'Sound Bath Experience',
    'theta-healing': 'Theta Healing Session',
    'access-bars': 'Access Bars Therapy',
    'astrology': 'Astrological Reading',
    'numerology': 'Numerology Consultation',
    'tarot-oracle': 'Tarot & Oracle Card Reading',
    'eft-tapping': 'EFT Tapping Session',
    'spiritual-coaching': 'Spiritual Life Coaching',
    'qigong-healing': 'Qigong Healing Practice',
    'hypnotherapy': 'Hypnotherapy Session',
    'somatic-healing': 'Somatic Healing Therapy',
    'bach-flower-remedies': 'Bach Flower Remedy Consultation'
  };

  for (const practId of practitioners) {
    const category = serviceCategories[Math.floor(Math.random() * serviceCategories.length)];
    const serviceType = serviceTypes[Math.floor(Math.random() * serviceTypes.length)];
    const currency = currencies[Math.floor(Math.random() * currencies.length)];
    
    const serviceId = generateSecureRandom(16);
    const service = {
      id: serviceId,
      practitionerId: practId,
      name: serviceNames[category] || `${category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Session`,
      description: `Professional ${category.replace('-', ' ')} service with experienced practitioner. Transform your wellbeing through this ancient healing modality.`,
      category,
      subcategory: null,
      type: serviceType,
      duration: [30, 45, 60, 90, 120][Math.floor(Math.random() * 5)],
      price: Math.floor(Math.random() * 200) + 50,
      currency,
      isActive: true,
      tags: [category, 'wellness', 'healing', 'holistic', 'energy-work'],
      requirements: [],
      benefits: ['Stress relief', 'Improved wellbeing', 'Energy balance', 'Emotional healing', 'Spiritual growth'],
      contraindications: [],
      preparationInstructions: 'Please arrive 10 minutes early and wear comfortable clothing',
      aftercareInstructions: 'Drink plenty of water and rest after the session',
      cancellationPolicy: '24 hours notice required',
      bookingSettings: {
        advanceBookingDays: 30,
        minAdvanceHours: 24,
        maxBookingsPerDay: 8,
        allowWeekends: true,
        bufferTime: 15
      },
      rating: {
        average: Math.round((Math.random() * 2 + 3) * 10) / 10, // 3.0 - 5.0
        count: Math.floor(Math.random() * 50)
      },
      bookingCount: Math.floor(Math.random() * 100),
      createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    };
    await env.SERVICES_KV.put(`service:${serviceId}`, JSON.stringify(service));
  }
}

async function generateMockProducts(env: WorkerEnv, practitioners: string[], count: number) {
  const categories = ['yoga', 'meditation', 'acupuncture', 'herbal medicine'];
  for (let i = 0; i < count; i++) {
    const id = generateSecureRandom(16);
    const curatorId = practitioners[Math.floor(Math.random() * practitioners.length)];
    const verificationStatus = Math.random() > 0.5 ? 'verified' : 'pending';
    const product: Product = {
      id,
      name: `Product ${i + 1}`,
      description: `Description for product ${i + 1}`,
      price: Math.floor(Math.random() * 100) + 10,
      images: [`https://example.com/product${i+1}.jpg`],
      categories: [categories[Math.floor(Math.random() * categories.length)]],
      curatorPractitionerId: curatorId,
      verificationStatus,
      verifiedAt: verificationStatus === 'verified' ? new Date().toISOString() : undefined,
      stock: Math.floor(Math.random() * 100) + 10,
      modality: categories[Math.floor(Math.random() * categories.length)],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      ratings: { average: Math.random() * 5, count: Math.floor(Math.random() * 50) },
      tags: [categories[Math.floor(Math.random() * categories.length)]]
    };
    await env.PRODUCTS_KV.put(getProductKey(id), JSON.stringify(product));
  }
}

async function generateMockAppointments(env: WorkerEnv, userIds: string[], practIds: string[], serviceIds: string[]) {
  const statuses = ['scheduled', 'completed', 'cancelled', 'no-show'];
  const appointmentCount = 30;
  
  for (let i = 0; i < appointmentCount; i++) {
    const id = generateSecureRandom(16);
    const userId = userIds[Math.floor(Math.random() * userIds.length)];
    const practId = practIds[Math.floor(Math.random() * practIds.length)];
    const serviceId = serviceIds[Math.floor(Math.random() * serviceIds.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    const appointmentDate = new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000);
    
    const appointment = {
      id,
      userId,
      practitionerId: practId,
      serviceId,
      status,
      scheduledAt: appointmentDate.toISOString(),
      duration: [30, 45, 60, 90][Math.floor(Math.random() * 4)],
      price: Math.floor(Math.random() * 150) + 50,
      currency: 'USD',
      notes: status === 'completed' ? 'Great session, very relaxing and insightful.' : '',
      paymentStatus: status === 'completed' ? 'paid' : 'pending',
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await env.APPOINTMENTS_KV.put(`appointment:${id}`, JSON.stringify(appointment));
  }
}

async function generateMockMessages(env: WorkerEnv, userIds: string[], practIds: string[]) {
  const messageCount = 50;
  const conversationIds: string[] = [];
  
  // Create conversations
  for (let i = 0; i < 10; i++) {
    const conversationId = generateSecureRandom(16);
    conversationIds.push(conversationId);
    
    const userId = userIds[Math.floor(Math.random() * userIds.length)];
    const practId = practIds[Math.floor(Math.random() * practIds.length)];
    
    const conversation = {
      id: conversationId,
      participants: [userId, practId],
      lastMessageAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    await env.MESSAGES_KV.put(`conversation:${conversationId}`, JSON.stringify(conversation));
  }
  
  // Create messages
  const sampleMessages = [
    'Hello! I\'m interested in booking a session with you.',
    'Thank you for your interest! I\'d be happy to help you.',
    'What times work best for you this week?',
    'I\'m available Tuesday or Thursday afternoon.',
    'Perfect! Let\'s schedule for Thursday at 2 PM.',
    'Looking forward to our session!',
    'How should I prepare for the session?',
    'Just come with an open mind and comfortable clothing.',
    'Thank you for the wonderful session today!',
    'It was my pleasure. Take care and drink plenty of water.'
  ];
  
  for (let i = 0; i < messageCount; i++) {
    const id = generateSecureRandom(16);
    const conversationId = conversationIds[Math.floor(Math.random() * conversationIds.length)];
    const senderId = Math.random() > 0.5 ? userIds[Math.floor(Math.random() * userIds.length)] : practIds[Math.floor(Math.random() * practIds.length)];
    
    const message = {
      id,
      conversationId,
      senderId,
      content: sampleMessages[Math.floor(Math.random() * sampleMessages.length)],
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      read: Math.random() > 0.3
    };
    
    await env.MESSAGES_KV.put(`message:${id}`, JSON.stringify(message));
  }
}

async function generateMockReviews(env: WorkerEnv, userIds: string[], practIds: string[], serviceIds: string[]) {
  const reviewCount = 40;
  const reviewTexts = [
    'Amazing session! I felt so much more balanced and peaceful afterwards.',
    'Highly recommend this practitioner. Very professional and knowledgeable.',
    'The healing session was exactly what I needed. Thank you!',
    'Incredible experience. I will definitely be booking again.',
    'Very calming and restorative. Great value for money.',
    'Professional service with genuine care for client wellbeing.',
    'Transformative session that helped me release a lot of tension.',
    'Wonderful practitioner with deep knowledge of their craft.',
    'Felt immediate relief and continued benefits for days after.',
    'Excellent session, would recommend to anyone seeking healing.'
  ];
  
  for (let i = 0; i < reviewCount; i++) {
    const id = generateSecureRandom(16);
    const userId = userIds[Math.floor(Math.random() * userIds.length)];
    const practId = practIds[Math.floor(Math.random() * practIds.length)];
    const serviceId = serviceIds[Math.floor(Math.random() * serviceIds.length)];
    
    const review = {
      id,
      userId,
      practitionerId: practId,
      serviceId,
      rating: Math.floor(Math.random() * 2) + 4, // 4-5 stars
      comment: reviewTexts[Math.floor(Math.random() * reviewTexts.length)],
      verified: Math.random() > 0.2, // 80% verified
      helpful: Math.floor(Math.random() * 10),
      createdAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await env.REVIEWS_KV.put(`review:${id}`, JSON.stringify(review));
  }
}

// Main populate function
export async function populateMockData(env: WorkerEnv) {
  console.log('🚀 Starting comprehensive mock data population...');
  
  console.log('👥 Generating mock users...');
  await generateMockUsers(env, 25);
  
  console.log('🧘 Generating mock practitioners...');
  await generateMockPractitioners(env, 15);
  
  // Fetch user and practitioner IDs from KV
  console.log('📋 Fetching user and practitioner IDs...');
  const userList = await env.USERS_KV.list({prefix: 'user:'});
  const userIds = userList.keys.map(k => k.name.split(':')[1]);
  
  const practList = await env.PRACTITIONERS_KV.list({prefix: 'practitioner:'});
  const practIds = practList.keys.map(k => k.name.split(':')[1]);
  console.log(`Found ${userIds.length} users and ${practIds.length} practitioners`);
  
  console.log('🔮 Generating mock services with healing categories...');
  await generateMockServices(env, practIds);
  
  // Fetch service IDs
  const serviceList = await env.SERVICES_KV.list({prefix: 'service:'});
  const serviceIds = serviceList.keys.map(k => k.name.split(':')[1]);
  console.log(`Generated ${serviceIds.length} services`);
  
  console.log('📅 Generating mock appointments...');
  if (env.APPOINTMENTS_KV) {
    await generateMockAppointments(env, userIds, practIds, serviceIds);
  } else {
    console.log('⚠️ APPOINTMENTS_KV not available, skipping appointment generation');
  }
  
  console.log('💬 Generating mock messages and conversations...');
  if (env.MESSAGES_KV) {
    await generateMockMessages(env, userIds, practIds);
  } else {
    console.log('⚠️ MESSAGES_KV not available, skipping message generation');
  }
  
  console.log('⭐ Generating mock reviews...');
  if (env.REVIEWS_KV) {
    await generateMockReviews(env, userIds, practIds, serviceIds);
  } else {
    console.log('⚠️ REVIEWS_KV not available, skipping review generation');
  }
  
  // Only generate products if PRODUCTS_KV is available
  if (env.PRODUCTS_KV) {
    console.log('📦 Generating mock products...');
    await generateMockProducts(env, practIds, 60);
  } else {
    console.log('⚠️ PRODUCTS_KV not available, skipping product generation');
  }
  
  console.log('✅ Comprehensive mock data populated successfully!');
  
  return {
    users: userIds.length,
    practitioners: practIds.length,
    services: serviceIds.length,
    appointments: env.APPOINTMENTS_KV ? 30 : 0,
    messages: env.MESSAGES_KV ? 50 : 0,
    conversations: env.MESSAGES_KV ? 10 : 0,
    reviews: env.REVIEWS_KV ? 40 : 0,
    products: env.PRODUCTS_KV ? 60 : 0
  };
}