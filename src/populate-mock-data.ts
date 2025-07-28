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

// Main populate function
export async function populateMockData(env: WorkerEnv) {
  console.log('🚀 Starting mock data population...');
  
  console.log('👥 Generating mock users...');
  await generateMockUsers(env, 20);
  
  console.log('🧘 Generating mock practitioners...');
  await generateMockPractitioners(env, 10);
  
  // Fetch practitioner IDs from KV
  console.log('📋 Fetching practitioner IDs...');
  const practList = await env.PRACTITIONERS_KV.list({prefix: 'practitioner:'});
  const practIds = practList.keys.map(k => k.name.split(':')[1]);
  console.log(`Found ${practIds.length} practitioners`);
  
  console.log('🔮 Generating mock services with new healing categories...');
  await generateMockServices(env, practIds);
  
  // Only generate products if PRODUCTS_KV is available
  if (env.PRODUCTS_KV) {
    console.log('📦 Generating mock products...');
    await generateMockProducts(env, practIds, 50);
  } else {
    console.log('⚠️ PRODUCTS_KV not available, skipping product generation');
  }
  
  console.log('✅ Mock data populated successfully!');
  
  return {
    users: 20,
    practitioners: 10,
    services: practIds.length,
    products: env.PRODUCTS_KV ? 50 : 0
  };
}