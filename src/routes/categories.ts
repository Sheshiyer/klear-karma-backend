// Categories routes for both practitioners and services
import { Hono } from 'hono';
import { WorkerEnv, RequestContext } from '../types/env';

const categories = new Hono<{ Bindings: WorkerEnv; Variables: RequestContext }>();

// Get practitioner categories
categories.get('/practitioners', async (c) => {
  // This would typically come from a configuration or database
  // For now, we'll return a static list of common practitioner categories
  const practitionerCategories = {
    'therapy': {
      name: 'Therapy',
      subcategories: [
        'psychotherapy',
        'cognitive-behavioral',
        'family-therapy',
        'couples-therapy',
        'art-therapy',
        'music-therapy'
      ]
    },
    'massage': {
      name: 'Massage',
      subcategories: [
        'swedish',
        'deep-tissue',
        'sports',
        'thai',
        'shiatsu',
        'reflexology'
      ]
    },
    'yoga': {
      name: 'Yoga',
      subcategories: [
        'hatha',
        'vinyasa',
        'ashtanga',
        'kundalini',
        'yin',
        'restorative'
      ]
    },
    'nutrition': {
      name: 'Nutrition',
      subcategories: [
        'dietitian',
        'holistic-nutrition',
        'sports-nutrition',
        'weight-management',
        'medical-nutrition'
      ]
    },
    'acupuncture': {
      name: 'Acupuncture',
      subcategories: [
        'traditional-chinese',
        'japanese',
        'korean',
        'auricular',
        'electroacupuncture'
      ]
    },
    'coaching': {
      name: 'Coaching',
      subcategories: [
        'life-coaching',
        'health-coaching',
        'career-coaching',
        'wellness-coaching',
        'mindfulness-coaching'
      ]
    }
  };

  return c.json({
    success: true,
    data: practitionerCategories
  });
});

// Get service categories
categories.get('/services', async (c) => {
  // Comprehensive holistic healing service categories
  const serviceCategories = {
    'sound-healing': {
      name: 'Sound Healing',
      description: 'Using singing bowls, gongs, or tuning forks to harmonize energy',
      subcategories: [
        'singing-bowls',
        'gong-therapy',
        'tuning-forks',
        'sound-baths',
        'vibrational-healing'
      ]
    },
    'chakra-healing': {
      name: 'Chakra Healing',
      description: 'Balancing and clearing energy centers in the body',
      subcategories: [
        'chakra-balancing',
        'energy-clearing',
        'aura-cleansing',
        'chakra-alignment'
      ]
    },
    'reiki': {
      name: 'Reiki',
      description: 'Japanese energy healing technique for stress reduction and relaxation',
      subcategories: [
        'usui-reiki',
        'karuna-reiki',
        'kundalini-reiki',
        'distance-reiki'
      ]
    },
    'pranic-healing': {
      name: 'Pranic Healing',
      description: 'Non-touch energy healing system to cleanse and energize the body',
      subcategories: [
        'basic-pranic-healing',
        'advanced-pranic-healing',
        'pranic-psychotherapy',
        'crystal-pranic-healing'
      ]
    },
    'crystal-healing': {
      name: 'Crystal Healing',
      description: 'Using crystals and stones to align and heal energy',
      subcategories: [
        'crystal-therapy',
        'gemstone-healing',
        'crystal-grids',
        'crystal-meditation'
      ]
    },
    'breathwork': {
      name: 'Breathwork',
      description: 'Guided breathing techniques to release trauma and increase vitality',
      subcategories: [
        'holotropic-breathwork',
        'rebirthing',
        'wim-hof-method',
        'pranayama'
      ]
    },
    'shamanic-healing': {
      name: 'Shamanic Healing',
      description: 'Spiritual healing involving journeys, soul retrievals, and rituals',
      subcategories: [
        'soul-retrieval',
        'power-animal-retrieval',
        'extraction-healing',
        'shamanic-journeying'
      ]
    },
    'akashic-records': {
      name: 'Akashic Records Reading',
      description: 'Accessing soul-level information for guidance and healing',
      subcategories: [
        'akashic-consultation',
        'soul-purpose-reading',
        'past-life-akashic',
        'akashic-healing'
      ]
    },
    'past-life-regression': {
      name: 'Past Life Regression Therapy',
      description: 'Uncovering past life memories to heal present issues',
      subcategories: [
        'past-life-therapy',
        'regression-hypnosis',
        'karmic-healing',
        'soul-healing'
      ]
    },
    'ayurveda': {
      name: 'Ayurvedic Consultations & Therapies',
      description: 'Personalized wellness practices based on doshas',
      subcategories: [
        'dosha-consultation',
        'ayurvedic-massage',
        'panchakarma',
        'ayurvedic-nutrition'
      ]
    },
    'herbal-medicine': {
      name: 'Herbal Medicine Consultations',
      description: 'Using plant-based remedies for physical and emotional health',
      subcategories: [
        'herbal-consultation',
        'custom-herbal-blends',
        'plant-medicine',
        'botanical-therapy'
      ]
    },
    'holistic-nutrition': {
      name: 'Holistic Nutrition Counseling',
      description: 'Creating diet and lifestyle plans to support overall well-being',
      subcategories: [
        'nutritional-counseling',
        'meal-planning',
        'detox-programs',
        'functional-nutrition'
      ]
    },
    'yoga-therapy': {
      name: 'Yoga Therapy',
      description: 'Tailored yoga sessions to address specific physical or emotional needs',
      subcategories: [
        'therapeutic-yoga',
        'restorative-yoga',
        'yin-yoga',
        'trauma-informed-yoga'
      ]
    },
    'sound-bath': {
      name: 'Sound Bath Sessions',
      description: 'Immersive group or private sessions with sound vibrations',
      subcategories: [
        'group-sound-bath',
        'private-sound-bath',
        'crystal-bowl-bath',
        'gong-bath'
      ]
    },
    'theta-healing': {
      name: 'Theta Healing',
      description: 'Working with belief systems and subconscious reprogramming',
      subcategories: [
        'belief-work',
        'dna-activation',
        'intuitive-healing',
        'manifestation-work'
      ]
    },
    'access-bars': {
      name: 'Access Bars Therapy',
      description: 'Energy work involving 32 points on the head to release blockages',
      subcategories: [
        'access-bars-session',
        'access-body-process',
        'consciousness-work',
        'energy-clearing'
      ]
    },
    'astrology': {
      name: 'Astrology Readings',
      description: 'Personalized cosmic insights for self-understanding and growth',
      subcategories: [
        'natal-chart-reading',
        'transit-reading',
        'compatibility-reading',
        'solar-return'
      ]
    },
    'numerology': {
      name: 'Numerology Consultations',
      description: 'Using numbers to guide life decisions and self-awareness',
      subcategories: [
        'life-path-reading',
        'name-analysis',
        'yearly-forecast',
        'compatibility-numerology'
      ]
    },
    'tarot-oracle': {
      name: 'Tarot or Oracle Card Readings',
      description: 'Intuitive guidance through symbolic cards',
      subcategories: [
        'tarot-reading',
        'oracle-reading',
        'angel-cards',
        'intuitive-reading'
      ]
    },
    'eft-tapping': {
      name: 'Emotional Freedom Technique (EFT)',
      description: 'Tapping technique to release emotional blockages',
      subcategories: [
        'eft-tapping',
        'matrix-reimprinting',
        'emotional-clearing',
        'trauma-tapping'
      ]
    },
    'life-coaching': {
      name: 'Life or Spiritual Coaching',
      description: 'Holistic guidance to achieve personal and spiritual goals',
      subcategories: [
        'life-coaching',
        'spiritual-coaching',
        'wellness-coaching',
        'transformation-coaching'
      ]
    },
    'qigong': {
      name: 'Qigong Healing',
      description: 'Chinese energy practice to restore balance and vitality',
      subcategories: [
        'medical-qigong',
        'energy-qigong',
        'moving-meditation',
        'tai-chi-qigong'
      ]
    },
    'hypnotherapy': {
      name: 'Hypnotherapy',
      description: 'Subconscious work to change habits and heal traumas',
      subcategories: [
        'clinical-hypnosis',
        'regression-therapy',
        'habit-change',
        'trauma-hypnosis'
      ]
    },
    'somatic-healing': {
      name: 'Somatic Healing',
      description: 'Releasing trauma and emotional blockages stored in the body',
      subcategories: [
        'somatic-experiencing',
        'body-based-therapy',
        'trauma-release',
        'nervous-system-regulation'
      ]
    },
    'bach-flower': {
      name: 'Bach Flower Remedy Consultations',
      description: 'Using flower essences to harmonize emotions',
      subcategories: [
        'flower-essence-consultation',
        'custom-flower-blends',
        'emotional-healing',
        'vibrational-medicine'
      ]
    }
  };

  return c.json({
    success: true,
    data: serviceCategories
  });
});

// Get product categories
categories.get('/products', async (c) => {
  // Product categories for the marketplace
  const productCategories = {
    'crystals-stones': {
      name: 'Crystals & Stones',
      description: 'Healing crystals, gemstones, and mineral specimens',
      subcategories: [
        'healing-crystals',
        'gemstones',
        'raw-stones',
        'tumbled-stones',
        'crystal-jewelry',
        'crystal-sets'
      ]
    },
    'essential-oils': {
      name: 'Essential Oils & Aromatherapy',
      description: 'Pure essential oils and aromatherapy products',
      subcategories: [
        'single-oils',
        'oil-blends',
        'diffusers',
        'aromatherapy-accessories',
        'carrier-oils'
      ]
    },
    'herbal-supplements': {
      name: 'Herbal Supplements',
      description: 'Natural herbs and botanical supplements',
      subcategories: [
        'dried-herbs',
        'herbal-tinctures',
        'herbal-teas',
        'adaptogenic-herbs',
        'ayurvedic-herbs'
      ]
    },
    'meditation-tools': {
      name: 'Meditation & Mindfulness Tools',
      description: 'Tools to support meditation and mindfulness practice',
      subcategories: [
        'meditation-cushions',
        'singing-bowls',
        'meditation-malas',
        'incense',
        'meditation-apps'
      ]
    },
    'yoga-equipment': {
      name: 'Yoga Equipment',
      description: 'Yoga mats, props, and accessories',
      subcategories: [
        'yoga-mats',
        'yoga-blocks',
        'yoga-straps',
        'bolsters',
        'yoga-clothing'
      ]
    },
    'sound-healing-tools': {
      name: 'Sound Healing Tools',
      description: 'Instruments for sound therapy and healing',
      subcategories: [
        'tibetan-bowls',
        'crystal-bowls',
        'tuning-forks',
        'gongs',
        'chimes'
      ]
    },
    'books-oracle-cards': {
      name: 'Books & Oracle Cards',
      description: 'Spiritual books, oracle cards, and educational materials',
      subcategories: [
        'spiritual-books',
        'oracle-cards',
        'tarot-decks',
        'meditation-guides',
        'healing-journals'
      ]
    },
    'wellness-accessories': {
      name: 'Wellness Accessories',
      description: 'General wellness and self-care products',
      subcategories: [
        'sage-smudging',
        'wellness-journals',
        'self-care-kits',
        'energy-tools',
        'ritual-supplies'
      ]
    }
  };

  return c.json({
    success: true,
    data: productCategories
  });
});

export default categories;