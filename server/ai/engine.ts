import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import path from 'path';
import type {
  AIAnalysisResult,
  AIInsightItem,
  Complaint,
  DuplicateMatch,
  InfrastructureCategory,
  InsightsResponse,
  PriorityFactorBreakdown,
  PriorityLevel,
  SeverityLevel,
  SupportedLanguage,
} from '../../shared/types.ts';
import { INFRASTRUCTURE_CATEGORIES, SUPPORTED_LANGUAGES } from '../../shared/types.ts';

interface CategoryLexicon {
  category: InfrastructureCategory;
  keywords: string[];
  defaultDepartment: string;
}

const CATEGORY_LEXICON: CategoryLexicon[] = [
  {
    category: 'Road damage and potholes',
    keywords: [
      'pothole',
      'large pothole',
      'crater',
      'asphalt',
      'road',
      'pavement',
      'tar',
      'sinkhole',
      'highway',
      'junction',
      'bump',
      'uneven',
      'crack',
      'footpath',
      'caved',
      'resurface',
      'accident',
      'skid',
      'vehicle',
      'vehicles',
      // Kannada
      'ರಸ್ತೆ',
      'ಗುಂಡಿ',
      'ದೊಡ್ಡ ಗುಂಡಿ',
      'ಹಳ್ಳ',
      'ಡಾಂಬರು',
      'ವಾಹನ',
      'ಪಾದಚಾರಿ',
      'ಹೆದ್ದಾರಿ',
      'ಸಂಚಾರ',
      'ಕುಸಿದ',
      // Hindi
      'सड़क',
      'गड्ढा',
      'गड्ढे',
      'बड़ा गड्ढा',
      'डामर',
      'वाहन',
      'फुटपाथ',
      'हाईवे',
      'यातायात',
      'धंस',
    ],
    defaultDepartment: 'Road Engineering & Pothole Cell',
  },
  {
    category: 'Water leakage',
    keywords: [
      'water',
      'leak',
      'leakage',
      'pipe',
      'pipeline',
      'burst',
      'main',
      'valve',
      'supply',
      'tap',
      'potable',
      'bwssb',
      'overflowing tank',
      'rupture',
      'flooding street',
      'drinking water',
      // Kannada
      'ನೀರು',
      'ನೀರಿನ',
      'ಸೋರಿಕೆ',
      'ಪೈಪ್',
      'ಕುಡಿಯುವ ನೀರು',
      'ಜಲಮಂಡಳಿ',
      'ಒಡೆದ',
      'ಹರಿಯುತ್ತಿದೆ',
      // Hindi
      'पानी',
      'पेयजल',
      'रिसाव',
      'लीकेज',
      'पाइप',
      'पाइपलाइन',
      'फूटा',
      'टंकी',
      'जल आपूर्ति',
    ],
    defaultDepartment: 'Water Supply & Distribution Board',
  },
  {
    category: 'Drainage and sewage problems',
    keywords: [
      'drain',
      'drainage',
      'sewage',
      'sewer',
      'manhole',
      'gutter',
      'stormwater',
      'clogged',
      'blocked',
      'stench',
      'overflow',
      'waterlogging',
      'culvert',
      'nala',
      'stagnant',
      'mosquito',
      // Kannada
      'ಚರಂಡಿ',
      'ಒಳಚರಂಡಿ',
      'ಮ್ಯಾನ್‌ಹೋಲ್',
      'ಮಳೆನೀರು',
      'ಕೊಳಚೆ',
      'ದುರ್ವಾಸನೆ',
      'ಕಟ್ಟಿಕೊಂಡಿದೆ',
      'ಜಲಾವೃತ',
      // Hindi
      'नाली',
      'सीवर',
      'मेनहोल',
      'मैनहोल',
      'जलभराव',
      'गंदा पानी',
      'बदबू',
      'नाला',
    ],
    defaultDepartment: 'Stormwater Drainage & Sewerage Dept',
  },
  {
    category: 'Broken streetlights',
    keywords: [
      'streetlight',
      'street light',
      'lamp',
      'pole',
      'dark',
      'darkness',
      'led',
      'bulb',
      'lighting',
      'flickering',
      'electric',
      'wire',
      'outage',
      'unlit',
      'blackout',
      'tilted pole',
      // Kannada
      'ದೀಪ',
      'ಬೀದಿ ದೀಪ',
      'ಕಂಬ',
      'ಕತ್ತಲೆ',
      'ವಿದ್ಯುತ್',
      'ತಂತಿ',
      'ಬಲ್ಬ್',
      'ಬೆಳಕು',
      // Hindi
      'स्ट्रीटलाइट',
      'स्ट्रीट लाइट',
      'लाइट',
      'बत्ती',
      'खंभा',
      'अंधेरा',
      'बिजली',
      'तार',
      'बल्ब',
    ],
    defaultDepartment: 'Municipal Electrical & Streetlighting',
  },
  {
    category: 'Improper waste disposal',
    keywords: [
      'garbage',
      'waste',
      'trash',
      'litter',
      'dump',
      'dumping',
      'bin',
      'compactor',
      'plastic',
      'debris',
      'rubble',
      'sanitation',
      'collection',
      'foul smell',
      'uncollected',
      // Kannada
      'ಕಸ',
      'ತ್ಯಾಜ್ಯ',
      'ಕೊಳಕು',
      'ಡಂಪಿಂಗ್',
      'ಪ್ಲಾಸ್ಟಿಕ್',
      'ಸ್ವಚ್ಛತೆ',
      'ಕಸದ ತೊಟ್ಟಿ',
      // Hindi
      'कचरा',
      'कूड़ा',
      'गंदगी',
      'डंपिंग',
      'प्लास्टिक',
      'सफाई',
      'कूड़ेदान',
      'दुर्गंध',
    ],
    defaultDepartment: 'Solid Waste Management Division',
  },
  {
    category: 'Public infrastructure damage',
    keywords: [
      'bench',
      'bus stop',
      'shelter',
      'railing',
      'guardrail',
      'park',
      'bridge',
      'flyover',
      'wall',
      'toilet',
      'signage',
      'traffic signal',
      'pedestrian',
      'collapsed',
      'vandalized',
      'broken structure',
      // Kannada
      'ಬಸ್ ನಿಲ್ದಾಣ',
      'ಉದ್ಯಾನ',
      'ಸೇತುವೆ',
      'ಫ್ಲೈಓವರ್',
      'ಗೋಡೆ',
      'ಶೌಚಾಲಯ',
      'ಸಿಗ್ನಲ್',
      // Hindi
      'बस स्टॉप',
      'पार्क',
      'पुल',
      'फ्लाईओवर',
      'दीवार',
      'शौचालय',
      'सिग्नल',
    ],
    defaultDepartment: 'Public Assets & Civil Maintenance',
  },
  {
    category: 'Other civic issues',
    keywords: [
      'encroachment',
      'stray',
      'noise',
      'tree',
      'branch',
      'civic',
      'public',
      'hazard',
      'maintenance',
      // Kannada
      'ಅತಿಕ್ರಮಣ',
      'ಮರ',
      'ಶಬ್ದ',
      'ನಾಗರಿಕ',
      'ಸಾರ್ವಜನಿಕ',
      'ನಿರ್ವಹಣೆ',
      // Hindi
      'अतिक्रमण',
      'पेड़',
      'शोर',
      'नागरिक',
      'सार्वजनिक',
      'मरम्मत',
    ],
    defaultDepartment: 'General Civic Grievance Cell',
  },
];

const CRITICAL_SAFETY_TERMS = [
  'open manhole',
  'exposed wire',
  'live wire',
  'electrocution',
  'sinkhole',
  'caved',
  'collapse',
  'collapsed',
  'accident',
  'hospital',
  'school',
  'ambulance',
  'deep crater',
  'large pothole',
  'danger for vehicles',
  'burst main',
  'flooded',
  'raw sewage',
  'major junction',
  'highway',
  'children',
  'emergency',
  'tilted pole',
  // Kannada
  'ತೆರೆದ ಮ್ಯಾನ್‌ಹೋಲ್',
  'ವಿದ್ಯುತ್ ತಂತಿ',
  'ಅಪಘಾತ',
  'ಶಾಲೆ',
  'ಆಸ್ಪತ್ರೆ',
  'ಕುಸಿತ',
  'ಮಕ್ಕಳು',
  'ದೊಡ್ಡ ಗುಂಡಿ',
  'ವಾಹನಗಳಿಗೆ ಅಪಾಯ',
  // Hindi
  'खुला मैनहोल',
  'बिजली का तार',
  'दुर्घटना',
  'स्कूल',
  'अस्पताल',
  'बच्चे',
  'बड़ा गड्ढा',
  'वाहन चालकों को खतरा',
  'आपातकालीन',
];

const HIGH_SEVERITY_TERMS = [
  'burst',
  'overflowing',
  'severe',
  'urgent',
  'broken',
  'blocked',
  'danger',
  'hazardous',
  'dark',
  'unlit',
  'waterlogging',
  'deep',
  'large',
  'vehicles',
  'multiple',
  'days',
  'week',
  'slippery',
  'traffic',
  'stench',
  // Kannada
  'ದೊಡ್ಡ',
  'ಗಂಭೀರ',
  'ತೀವ್ರ',
  'ಒಡೆದ',
  'ತುರ್ತು',
  'ಅಪಾಯ',
  'ವಾಹನ',
  'ಕತ್ತಲೆ',
  'ತೊಂದರೆ',
  // Hindi
  'बड़ा',
  'गंभीर',
  'तुरंत',
  'टूटा',
  'खतरा',
  'वाहन',
  'अंधेरा',
  'परेशानी',
  'जाम',
];

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'been',
  'near',
  'road',
  'area',
  'issue',
  'problem',
  'since',
  'last',
  'very',
  'there',
  'here',
  'into',
  'over',
  'around',
  'please',
  'urgent',
  // Kannada
  'ನಮ್ಮ',
  'ಇದೆ',
  'ಮತ್ತು',
  'ಹತ್ತಿರ',
  'ಸಮಸ್ಯೆ',
  // Hindi
  'हमारी',
  'हमारे',
  'इससे',
  'हो',
  'रहा',
  'है',
  'पर',
  'और',
  'के',
  'को',
]);

const GLOSS_DICTIONARY: Array<[RegExp, string]> = [
  // Kannada phrases & terms
  [/ನಮ್ಮ\s*ರಸ್ತೆಯಲ್ಲಿ/g, 'on our road'],
  [/ರಸ್ತೆಯಲ್ಲಿ/g, 'on the road'],
  [/ದೊಡ್ಡ\s*ಗುಂಡಿ/g, 'large pothole'],
  [/ವಾಹನಗಳಿಗೆ\s*ಅಪಾಯವಾಗುತ್ತಿದೆ/g, 'creating danger for vehicles'],
  [/ಅಪಾಯವಾಗುತ್ತಿದೆ/g, 'creating danger'],
  [/ನೀರಿನ\s*ಸೋರಿಕೆ/g, 'water leakage'],
  [/ಕುಡಿಯುವ\s*ನೀರು/g, 'drinking water'],
  [/ಬೀದಿ\s*ದೀಪ/g, 'street light'],
  [/ಒಳಚರಂಡಿ/g, 'sewage drainage'],
  [/ಕಸದ\s*ತೊಟ್ಟಿ/g, 'garbage bin'],
  [/ರಸ್ತೆ/g, 'road'],
  [/ಗುಂಡಿ/g, 'pothole'],
  [/ವಾಹನಗಳಿಗೆ/g, 'for vehicles'],
  [/ವಾಹನ/g, 'vehicle'],
  [/ಅಪಾಯ/g, 'danger'],
  [/ನೀರು/g, 'water'],
  [/ಸೋರಿಕೆ/g, 'leakage'],
  [/ಪೈಪ್/g, 'pipe'],
  [/ಚರಂಡಿ/g, 'drainage'],
  [/ಕಸ/g, 'garbage'],
  [/ದೀಪ/g, 'streetlight'],
  [/ಕತ್ತಲೆ/g, 'darkness'],
  [/ದೊಡ್ಡ/g, 'large'],
  [/ಸಮಸ್ಯೆ/g, 'problem'],
  [/ಇದೆ/g, 'exists'],
  // Hindi phrases & terms
  [/हमारी\s*सड़क\s*पर/g, 'on our road'],
  [/सड़क\s*पर/g, 'on the road'],
  [/बड़ा\s*गड्ढा/g, 'large pothole'],
  [/वाहन\s*चालकों\s*को\s*खतरा\s*हो\s*रहा\s*है/g, 'is creating danger for motorists and vehicles'],
  [/वाहन\s*चालकों/g, 'vehicle drivers'],
  [/खतरा\s*हो\s*रहा\s*है/g, 'is creating danger'],
  [/जल\s*आपूर्ति/g, 'water supply'],
  [/गंदा\s*पानी/g, 'dirty sewage water'],
  [/स्ट्रीट\s*लाइट/g, 'street light'],
  [/सड़क/g, 'road'],
  [/गड्ढा/g, 'pothole'],
  [/गड्ढे/g, 'potholes'],
  [/बड़ा/g, 'large'],
  [/वाहन/g, 'vehicle'],
  [/खतरा/g, 'danger'],
  [/पानी/g, 'water'],
  [/रिसाव/g, 'leakage'],
  [/पाइप/g, 'pipe'],
  [/नाली/g, 'drainage'],
  [/सीवर/g, 'sewer'],
  [/कचरा/g, 'garbage'],
  [/गंदगी/g, 'filth'],
  [/बत्ती/g, 'light'],
  [/अंधेरा/g, 'darkness'],
  [/समस्या/g, 'problem'],
  [/है/g, 'is'],
];

const DEPARTMENT_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    'Road Engineering & Pothole Cell': 'Road Engineering & Pothole Cell',
    'Water Supply & Distribution Board': 'Water Supply & Distribution Board',
    'Stormwater Drainage & Sewerage Dept': 'Stormwater Drainage & Sewerage Dept',
    'Municipal Electrical & Streetlighting': 'Municipal Electrical & Streetlighting',
    'Solid Waste Management Division': 'Solid Waste Management Division',
    'Public Assets & Civil Maintenance': 'Public Assets & Civil Maintenance',
    'General Civic Grievance Cell': 'General Civic Grievance Cell',
  },
  kn: {
    'Road Engineering & Pothole Cell': 'ರಸ್ತೆ ಎಂಜಿನಿಯರಿಂಗ್ ಮತ್ತು ಗುಂಡಿ ದುರಸ್ತಿ ವಿಭಾಗ',
    'Water Supply & Distribution Board': 'ನೀರು ಸರಬರಾಜು ಮತ್ತು ವಿತರಣಾ ಮಂಡಳಿ',
    'Stormwater Drainage & Sewerage Dept': 'ಮಳೆನೀರು ಚರಂಡಿ ಮತ್ತು ಒಳಚರಂಡಿ ಇಲಾಖೆ',
    'Municipal Electrical & Streetlighting': 'ನಗರ ವಿದ್ಯುತ್ ಮತ್ತು ಬೀದಿ ದೀಪ ವಿಭಾಗ',
    'Solid Waste Management Division': 'ಘನತ್ಯಾಜ್ಯ ನಿರ್ವಹಣಾ ವಿಭಾಗ',
    'Public Assets & Civil Maintenance': 'ಸಾರ್ವಜನಿಕ ಆಸ್ತಿ ಮತ್ತು ನಾಗರಿಕ ನಿರ್ವಹಣೆ',
    'General Civic Grievance Cell': 'ಸಾಮಾನ್ಯ ನಾಗರಿಕ ದೂರು ಕೋಶ',
  },
  hi: {
    'Road Engineering & Pothole Cell': 'सड़क इंजीनियरिंग एवं गड्ढा मरम्मत प्रकोष्ठ',
    'Water Supply & Distribution Board': 'जल आपूर्ति एवं वितरण बोर्ड',
    'Stormwater Drainage & Sewerage Dept': 'वर्षा जल निकासी एवं सीवरेज विभाग',
    'Municipal Electrical & Streetlighting': 'नगर विद्युत एवं स्ट्रीटलाइट प्रभाग',
    'Solid Waste Management Division': 'ठोस अपशिष्ट प्रबंधन प्रभाग',
    'Public Assets & Civil Maintenance': 'सार्वजनिक संपत्ति एवं सिविल रखरखाव',
    'General Civic Grievance Cell': 'सामान्य नागरिक शिकायत प्रकोष्ठ',
  },
};

const PRIORITY_LABELS: Record<SupportedLanguage, Record<PriorityLevel, string>> = {
  en: { Critical: 'Critical', High: 'High', Medium: 'Medium', Low: 'Low' },
  kn: { Critical: 'ಅತ್ಯಂತ ತುರ್ತು', High: 'ಹೆಚ್ಚು', Medium: 'ಮಧ್ಯಮ', Low: 'ಕಡಿಮೆ' },
  hi: { Critical: 'अत्यंत गंभीर', High: 'उच्च', Medium: 'मध्यम', Low: 'कम' },
};

const CATEGORY_LABELS: Record<SupportedLanguage, Record<InfrastructureCategory, string>> = {
  en: {
    'Road damage and potholes': 'Road damage and potholes',
    'Water leakage': 'Water leakage',
    'Drainage and sewage problems': 'Drainage and sewage problems',
    'Broken streetlights': 'Broken streetlights',
    'Improper waste disposal': 'Improper waste disposal',
    'Public infrastructure damage': 'Public infrastructure damage',
    'Other civic issues': 'Other civic issues',
  },
  kn: {
    'Road damage and potholes': 'ರಸ್ತೆ ಹಾನಿ ಮತ್ತು ಗುಂಡಿಗಳು',
    'Water leakage': 'ನೀರಿನ ಸೋರಿಕೆ',
    'Drainage and sewage problems': 'ಚರಂಡಿ ಮತ್ತು ಒಳಚರಂಡಿ ಸಮಸ್ಯೆಗಳು',
    'Broken streetlights': 'ಹಾಳಾದ ಬೀದಿ ದೀಪಗಳು',
    'Improper waste disposal': 'ಅಸಮರ್ಪಕ ಕಸ ವಿಲೇವಾರಿ',
    'Public infrastructure damage': 'ಸಾರ್ವಜನಿಕ ಮೂಲಸೌಕರ್ಯ ಹಾನಿ',
    'Other civic issues': 'ಇತರ ನಾಗರಿಕ ಸಮಸ್ಯೆಗಳು',
  },
  hi: {
    'Road damage and potholes': 'सड़क क्षति और गड्ढे',
    'Water leakage': 'पानी का रिसाव',
    'Drainage and sewage problems': 'नाली और सीवर की समस्याएँ',
    'Broken streetlights': 'खराब स्ट्रीटलाइट',
    'Improper waste disposal': 'अनुचित कचरा निपटान',
    'Public infrastructure damage': 'सार्वजनिक बुनियादी ढाँचा क्षति',
    'Other civic issues': 'अन्य नागरिक समस्याएँ',
  },
};

export function normalizeTargetLanguage(lang?: unknown): SupportedLanguage {
  if (typeof lang === 'string') {
    const clean = lang.trim().toLowerCase().slice(0, 2);
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(clean)) {
      return clean as SupportedLanguage;
    }
  }
  return 'en';
}

export function detectComplaintLanguage(text: string): SupportedLanguage {
  const kannadaCount = (text.match(/[\u0C80-\u0CFF]/g) ?? []).length;
  const devanagariCount = (text.match(/[\u0900-\u097F]/g) ?? []).length;
  if (kannadaCount >= 2 && kannadaCount >= devanagariCount) return 'kn';
  if (devanagariCount >= 2) return 'hi';
  return 'en';
}

export function fallbackTranslateToEnglish(
  text: string,
  lang: SupportedLanguage,
  category?: InfrastructureCategory
): string {
  const trimmed = text.trim();
  if (!trimmed || lang === 'en') return trimmed;

  let gloss = trimmed;
  for (const [pattern, replacement] of GLOSS_DICTIONARY) {
    gloss = gloss.replace(pattern, ` ${replacement} `);
  }

  // Strip remaining untranslated Indic characters if enough English words were mapped, or append context
  const englishWords = gloss
    .replace(/[\u0900-\u097F\u0C80-\u0CFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,।])/g, '$1')
    .trim();

  if (englishWords.length >= 6) {
    return englishWords;
  }

  const langName = lang === 'kn' ? 'Kannada' : 'Hindi';
  const catLabel = category ?? 'civic infrastructure issue';
  return `${catLabel} reported in ${langName}: "${trimmed}"`;
}

export function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
  return matches.filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

function computeTextSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(tokenize(textA));
  const tokensB = new Set(tokenize(textB));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function classifyComplaintRules(
  title: string,
  description: string,
  selectedCategory?: InfrastructureCategory
): {
  predictedCategory: InfrastructureCategory;
  confidence: number;
  detectedKeywords: string[];
} {
  const combined = `${title} ${description}`.toLowerCase();
  const scores: Array<{ category: InfrastructureCategory; score: number; matches: string[] }> = [];

  for (const entry of CATEGORY_LEXICON) {
    const matches: string[] = [];
    let score = 0;
    for (const kw of entry.keywords) {
      if (combined.includes(kw)) {
        matches.push(kw);
        score += kw.includes(' ') ? 2.5 : 1.5;
      }
    }
    if (selectedCategory && entry.category === selectedCategory) {
      score += 1.2;
    }
    scores.push({ category: entry.category, score, matches });
  }

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const second = scores[1];

  const predictedCategory =
    top && top.score > 0
      ? top.category
      : selectedCategory && INFRASTRUCTURE_CATEGORIES.includes(selectedCategory)
        ? selectedCategory
        : 'Other civic issues';

  const margin = top && second ? Math.max(0, top.score - second.score) : 1;
  const confidence = Math.min(96, Math.max(58, Math.round(64 + (top?.score ?? 0) * 5 + margin * 4)));

  const extraTerms = tokenize(combined).filter((t) => !top?.matches.includes(t)).slice(0, 4);
  const detectedKeywords = Array.from(new Set([...(top?.matches ?? []), ...extraTerms])).slice(0, 8);

  return {
    predictedCategory,
    confidence,
    detectedKeywords,
  };
}

export interface DuplicateCandidateInput {
  id?: number;
  title: string;
  description: string;
  englishTitle?: string;
  englishDescription?: string;
  category: InfrastructureCategory;
  district: string;
  locality: string;
  latitude: number;
  longitude: number;
  created_at?: string;
}

export function detectDuplicates(
  input: DuplicateCandidateInput,
  existingComplaints: Array<{
    id: number;
    title: string;
    description: string;
    english_title?: string | null;
    english_description?: string | null;
    category: string;
    district: string;
    locality: string;
    latitude: number;
    longitude: number;
    status: string;
    location: string;
    created_at: string;
  }>
): DuplicateMatch[] {
  const inputLang = detectComplaintLanguage(`${input.title} ${input.description}`);
  const inputEnglish =
    input.englishTitle || input.englishDescription
      ? `${input.englishTitle ?? ''} ${input.englishDescription ?? ''}`
      : fallbackTranslateToEnglish(`${input.title} ${input.description}`, inputLang, input.category);
  const inputText = `${input.title} ${input.description} ${inputEnglish} ${input.locality}`;
  const inputTime = input.created_at ? new Date(input.created_at).getTime() : Date.now();
  const matches: DuplicateMatch[] = [];

  for (const existing of existingComplaints) {
    if (input.id && existing.id === input.id) continue;

    const existingLang = detectComplaintLanguage(`${existing.title} ${existing.description}`);
    const existingEnglish =
      existing.english_title || existing.english_description
        ? `${existing.english_title ?? ''} ${existing.english_description ?? ''}`
        : fallbackTranslateToEnglish(`${existing.title} ${existing.description}`, existingLang);
    const existingText = `${existing.title} ${existing.description} ${existingEnglish} ${existing.locality}`;
    const textSim = computeTextSimilarity(inputText, existingText);
    const sameCategory = existing.category === input.category;
    const sameDistrict = existing.district.toLowerCase() === input.district.toLowerCase();
    const sameLocality = existing.locality.toLowerCase() === input.locality.toLowerCase();
    const distanceKm = calculateHaversineKm(input.latitude, input.longitude, existing.latitude, existing.longitude);
    const daysDiff = Math.abs(inputTime - new Date(existing.created_at).getTime()) / (1000 * 60 * 60 * 24);

    let score = textSim * 52;
    if (sameCategory) score += 22;
    if (distanceKm <= 0.5) score += 26;
    else if (distanceKm <= 1.5) score += 18;
    else if (distanceKm <= 3.5) score += 10;
    else if (sameLocality && sameDistrict) score += 12;

    if (daysDiff <= 7) score += 10;
    else if (daysDiff <= 21) score += 5;

    const rounded = Math.min(98, Math.round(score));

    // Must share meaningful geographical + topical signal
    if (rounded >= 52 && (sameCategory || textSim >= 0.18) && (distanceKm <= 4.5 || (sameDistrict && sameLocality))) {
      const reasons: string[] = [];
      if (sameCategory) reasons.push('matching category');
      if (distanceKm <= 1.5) reasons.push(`${Math.round(distanceKm * 1000)}m proximity`);
      else if (sameLocality) reasons.push(`same locality (${existing.locality})`);
      if (textSim >= 0.22) reasons.push('similar description terms');
      if (daysDiff <= 7) reasons.push('reported within 7 days');

      matches.push({
        related_complaint_id: existing.id,
        related_title: existing.title,
        related_status: existing.status as DuplicateMatch['related_status'],
        related_location: existing.location,
        related_created_at: existing.created_at,
        similarity_score: rounded,
        reason: reasons.join(', '),
      });
    }
  }

  return matches.sort((a, b) => b.similarity_score - a.similarity_score).slice(0, 6);
}

export function getSuggestedAction(
  category: InfrastructureCategory,
  priorityLevel: PriorityLevel,
  lang: SupportedLanguage = 'en'
): string {
  const baseDept =
    CATEGORY_LEXICON.find((c) => c.category === category)?.defaultDepartment ?? 'General Civic Grievance Cell';
  const dept = DEPARTMENT_LABELS[lang][baseDept] ?? baseDept;

  if (lang === 'kn') {
    if (priorityLevel === 'Critical') {
      return `${dept} ವತಿಯಿಂದ 4 ಗಂಟೆಗಳೊಳಗೆ ತುರ್ತು ಕ್ಷೇತ್ರ ತಂಡವನ್ನು ಕಳುಹಿಸಿ, ಸುರಕ್ಷತಾ ಬ್ಯಾರಿಕೇಡ್‌ಗಳನ್ನು ಅಳವಡಿಸಿ ಮತ್ತು ಸಾರ್ವಜನಿಕ ಅಪಾಯವನ್ನು ತಕ್ಷಣ ನಿಯಂತ್ರಿಸಿ.`;
    }
    if (priorityLevel === 'High') {
      return `${dept} ಗೆ 24 ಗಂಟೆಗಳೊಳಗೆ ಆದ್ಯತೆಯ ಕ್ಷೇತ್ರ ಪರಿಶೀಲನೆ ವಹಿಸಿ ಮತ್ತು ದುರಸ್ತಿ ತಂಡವನ್ನು ನಿಯೋಜಿಸಿ.`;
    }
    if (priorityLevel === 'Medium') {
      return `${dept} ಮೂಲಕ ವಾರದ ನಿಗದಿತ ಪರಿಶೀಲನಾ ಪಟ್ಟಿಯಲ್ಲಿ ಸೇರಿಸಿ ಮತ್ತು ಸ್ಥಳೀಯ ಸಮಸ್ಯೆಯನ್ನು ಪರಿಶೀಲಿಸಿ.`;
    }
    return `${dept} ಅಡಿಯಲ್ಲಿ ನಿಯಮಿತ ತಡೆಗಟ್ಟುವ ನಿರ್ವಹಣಾ ಚಕ್ರದಲ್ಲಿ ದಾಖಲಿಸಿ.`;
  }

  if (lang === 'hi') {
    if (priorityLevel === 'Critical') {
      return `${dept} से 4 घंटे के भीतर आपातकालीन रैपिड-रिस्पॉन्स टीम भेजें, सुरक्षा बैरिकेड लगाएँ और सार्वजनिक खतरे को तुरंत नियंत्रित करें।`;
    }
    if (priorityLevel === 'High') {
      return `${dept} को 24 घंटे के भीतर प्राथमिकता क्षेत्रीय निरीक्षण सौंपें और मरम्मत दल की तैनाती करें।`;
    }
    if (priorityLevel === 'Medium') {
      return `${dept} के साप्ताहिक निर्धारित निरीक्षण में शामिल करें और प्रभावित क्षेत्र की जाँच करें।`;
    }
    return `${dept} के अंतर्गत नियमित निवारक रखरखाव चक्र में दर्ज करें।`;
  }

  if (priorityLevel === 'Critical') {
    return `Dispatch emergency rapid-response crew from ${dept} within 4 hours; place safety barricades and isolate public hazard immediately.`;
  }
  if (priorityLevel === 'High') {
    return `Assign priority field inspection to ${dept} within 24 hours and schedule corrective repair crew.`;
  }
  if (priorityLevel === 'Medium') {
    return `Queue for scheduled weekly inspection with ${dept} and verify affected locality assets.`;
  }
  return `Log for routine preventive maintenance cycle under ${dept}.`;
}

export function buildLocalizedRuleExplanation(params: {
  priorityScore: number;
  priorityLevel: PriorityLevel;
  criticalSafetyHits: string[];
  duplicatesCount: number;
  duplicatePoints: number;
  areaComplaintCount14d: number;
  areaFrequencyPoints: number;
  affectedCitizens: number;
  lang: SupportedLanguage;
}): string {
  const {
    priorityScore,
    priorityLevel,
    criticalSafetyHits,
    duplicatesCount,
    duplicatePoints,
    areaComplaintCount14d,
    areaFrequencyPoints,
    affectedCitizens,
    lang,
  } = params;

  const pLabel = PRIORITY_LABELS[lang][priorityLevel];

  if (lang === 'kn') {
    const parts: string[] = [
      `ಆರು ಪಾರದರ್ಶಕ ಅಂಶಗಳ ಆಧಾರದ ಮೇಲೆ ನಿಯಮ-ಆಧಾರಿತ ವಿಶ್ಲೇಷಣೆಯು ${priorityScore}/100 (${pLabel}) ಆದ್ಯತಾ ಅಂಕವನ್ನು ನೀಡಿದೆ.`,
    ];
    if (criticalSafetyHits.length > 0) {
      parts.push(`ಸಾರ್ವಜನಿಕ ಸುರಕ್ಷತಾ ಅಪಾಯದ ಸಂಕೇತಗಳು ಪತ್ತೆಯಾಗಿವೆ (${criticalSafetyHits.slice(0, 3).join(', ')}).`);
    }
    if (duplicatesCount > 0) {
      parts.push(`ಹತ್ತಿರದ ${duplicatesCount} ಸಂಬಂಧಿತ ದೂರುಗಳು ತುರ್ತು ಅಂಕವನ್ನು +${duplicatePoints} ಹೆಚ್ಚಿಸಿವೆ.`);
    }
    if (areaComplaintCount14d >= 2) {
      parts.push(`ಸ್ಥಳೀಯ ಪ್ರದೇಶದಲ್ಲಿ ಇತ್ತೀಚಿನ ${areaComplaintCount14d} ದೂರುಗಳು +${areaFrequencyPoints} ಅಂಕಗಳನ್ನು ಸೇರಿಸಿವೆ.`);
    }
    parts.push(`ಅಂದಾಜು ಪರಿಣಾಮ: ~${affectedCitizens} ನಾಗರಿಕರು.`);
    return parts.join(' ');
  }

  if (lang === 'hi') {
    const parts: string[] = [
      `छह पारदर्शी कारकों के आधार पर नियम-आधारित मूल्यांकन ने ${priorityScore}/100 (${pLabel}) प्राथमिकता स्कोर निर्धारित किया है।`,
    ];
    if (criticalSafetyHits.length > 0) {
      parts.push(`सार्वजनिक सुरक्षा जोखिम के संकेत मिले हैं (${criticalSafetyHits.slice(0, 3).join(', ')})।`);
    }
    if (duplicatesCount > 0) {
      parts.push(`आस-पास की ${duplicatesCount} संबंधित शिकायतों ने तात्कालिकता में +${duplicatePoints} अंक जोड़े।`);
    }
    if (areaComplaintCount14d >= 2) {
      parts.push(`क्षेत्र में हाल की ${areaComplaintCount14d} शिकायतों की आवृत्ति ने +${areaFrequencyPoints} अंक जोड़े।`);
    }
    parts.push(`अनुमानित प्रभाव: ~${affectedCitizens} नागरिक।`);
    return parts.join(' ');
  }

  const parts: string[] = [
    `Rule-based prototype evaluation assigned ${priorityScore}/100 (${priorityLevel}) based on six transparent factors.`,
  ];
  if (criticalSafetyHits.length > 0) {
    parts.push(`Public safety hazard signals detected (${criticalSafetyHits.slice(0, 3).join(', ')}).`);
  }
  if (duplicatesCount > 0) {
    parts.push(`${duplicatesCount} nearby related report(s) increased urgency by +${duplicatePoints} pts.`);
  }
  if (areaComplaintCount14d >= 2) {
    parts.push(
      `Local area frequency (${areaComplaintCount14d} recent complaints nearby) added +${areaFrequencyPoints} pts.`
    );
  }
  parts.push(`Estimated impact: ~${affectedCitizens} citizens.`);
  return parts.join(' ');
}

export function computePriorityAnalysis(params: {
  title: string;
  description: string;
  category: InfrastructureCategory;
  predictedCategory: InfrastructureCategory;
  detectedKeywords: string[];
  affectedCitizens: number;
  duplicates: DuplicateMatch[];
  areaComplaintCount14d: number;
  createdAt?: string;
  targetLanguage?: SupportedLanguage;
}): Omit<AIAnalysisResult, 'categoryConfidence' | 'aiSource'> {
  const lang = params.targetLanguage ?? 'en';
  const combined = `${params.title} ${params.description}`.toLowerCase();

  const criticalSafetyHits = CRITICAL_SAFETY_TERMS.filter((term) => combined.includes(term));
  const highSeverityHits = HIGH_SEVERITY_TERMS.filter((term) => combined.includes(term));

  // Factor 1: Severity (0-30)
  let severityPoints = 12;
  if (params.predictedCategory === 'Water leakage' || params.predictedCategory === 'Drainage and sewage problems') {
    severityPoints += 5;
  } else if (params.predictedCategory === 'Road damage and potholes' || params.predictedCategory === 'Broken streetlights') {
    severityPoints += 4;
  }
  severityPoints += Math.min(10, highSeverityHits.length * 3);
  severityPoints += Math.min(8, criticalSafetyHits.length * 4);
  severityPoints = Math.min(30, severityPoints);

  // Factor 2: Potential Public Safety Risk (0-25)
  let safetyRiskPoints = 6;
  if (criticalSafetyHits.length > 0) {
    safetyRiskPoints += Math.min(19, 8 + criticalSafetyHits.length * 4);
  } else if (highSeverityHits.length >= 2) {
    safetyRiskPoints += 9;
  }
  if (
    combined.includes('night') ||
    combined.includes('school') ||
    combined.includes('hospital') ||
    combined.includes('highway') ||
    combined.includes('vehicle') ||
    combined.includes('ವಾಹನ') ||
    combined.includes('वाहन')
  ) {
    safetyRiskPoints += 4;
  }
  safetyRiskPoints = Math.min(25, safetyRiskPoints);

  // Factor 3: Duplicate Reports Nearby (0-15)
  const duplicatePoints = Math.min(15, params.duplicates.length * 5);

  // Factor 4: Affected Citizens (0-10)
  let affectedCitizensPoints = 2;
  if (params.affectedCitizens >= 400) affectedCitizensPoints = 10;
  else if (params.affectedCitizens >= 150) affectedCitizensPoints = 8;
  else if (params.affectedCitizens >= 40) affectedCitizensPoints = 6;
  else if (params.affectedCitizens >= 15) affectedCitizensPoints = 4;

  // Factor 5: Complaint Frequency in Area (0-10)
  const areaFrequencyPoints = Math.min(10, params.areaComplaintCount14d * 2);

  // Factor 6: Time Elapsed Since Submission (0-10)
  const createdMs = params.createdAt ? new Date(params.createdAt).getTime() : Date.now();
  const ageDays = Math.max(0, (Date.now() - createdMs) / (1000 * 60 * 60 * 24));
  const agePoints = Math.min(10, Math.floor(ageDays / 2));

  const priorityScore = Math.min(
    100,
    Math.max(
      10,
      severityPoints +
        safetyRiskPoints +
        duplicatePoints +
        affectedCitizensPoints +
        areaFrequencyPoints +
        agePoints
    )
  );

  let priorityLevel: PriorityLevel = 'Low';
  if (priorityScore >= 80) priorityLevel = 'Critical';
  else if (priorityScore >= 60) priorityLevel = 'High';
  else if (priorityScore >= 40) priorityLevel = 'Medium';

  let estimatedSeverity: SeverityLevel = priorityLevel;
  if (criticalSafetyHits.length >= 2 && severityPoints >= 24 && priorityScore >= 80) {
    estimatedSeverity = 'Critical';
  } else if (severityPoints >= 24 && (criticalSafetyHits.length >= 1 || highSeverityHits.length >= 2)) {
    if (estimatedSeverity === 'Low' || estimatedSeverity === 'Medium') {
      estimatedSeverity = 'High';
    }
  }

  const criticalSafetyFlag = criticalSafetyHits.length > 0 || priorityScore >= 80;

  const factorBreakdown: PriorityFactorBreakdown = {
    severityPoints,
    safetyRiskPoints,
    duplicatePoints,
    affectedCitizensPoints,
    areaFrequencyPoints,
    agePoints,
  };

  return {
    predictedCategory: params.predictedCategory,
    detectedKeywords: params.detectedKeywords,
    estimatedSeverity,
    priorityScore,
    priorityLevel,
    criticalSafetyFlag,
    factorBreakdown,
    explanation: buildLocalizedRuleExplanation({
      priorityScore,
      priorityLevel,
      criticalSafetyHits,
      duplicatesCount: params.duplicates.length,
      duplicatePoints,
      areaComplaintCount14d: params.areaComplaintCount14d,
      areaFrequencyPoints,
      affectedCitizens: params.affectedCitizens,
      lang,
    }),
    suggestedAction: getSuggestedAction(params.predictedCategory, priorityLevel, lang),
    duplicates: params.duplicates,
    affectedAreaCount: params.areaComplaintCount14d + 1,
  };
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.length > 10);
}

export async function runHybridComplaintAnalysis(params: {
  title: string;
  description: string;
  location?: string;
  selectedCategory?: InfrastructureCategory;
  district: string;
  locality: string;
  latitude: number;
  longitude: number;
  affectedCitizens: number;
  imagePath?: string | null;
  createdAt?: string;
  targetLanguage?: SupportedLanguage;
  existingComplaints: Array<{
    id: number;
    title: string;
    description: string;
    english_title?: string | null;
    english_description?: string | null;
    category: string;
    district: string;
    locality: string;
    latitude: number;
    longitude: number;
    status: string;
    location: string;
    created_at: string;
  }>;
}): Promise<AIAnalysisResult> {
  const targetLang = normalizeTargetLanguage(params.targetLanguage);
  const detectedLanguage = detectComplaintLanguage(`${params.title} ${params.description} ${params.location ?? ''}`);

  const ruleClass = classifyComplaintRules(params.title, params.description, params.selectedCategory);
  const fallbackEnglishTitle = fallbackTranslateToEnglish(params.title, detectedLanguage, ruleClass.predictedCategory);
  const fallbackEnglishDescription = fallbackTranslateToEnglish(
    params.description,
    detectedLanguage,
    ruleClass.predictedCategory
  );
  const fallbackEnglishLocation = params.location
    ? fallbackTranslateToEnglish(params.location, detectedLanguage)
    : undefined;

  const duplicates = detectDuplicates(
    {
      title: params.title,
      description: params.description,
      englishTitle: fallbackEnglishTitle,
      englishDescription: fallbackEnglishDescription,
      category: params.selectedCategory ?? ruleClass.predictedCategory,
      district: params.district,
      locality: params.locality,
      latitude: params.latitude,
      longitude: params.longitude,
      created_at: params.createdAt,
    },
    params.existingComplaints
  );

  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const areaComplaintCount14d = params.existingComplaints.filter((c) => {
    const dist = calculateHaversineKm(params.latitude, params.longitude, c.latitude, c.longitude);
    const inWindow = new Date(c.created_at).getTime() >= twoWeeksAgo;
    return inWindow && (dist <= 3.0 || (c.district === params.district && c.locality === params.locality));
  }).length;

  const baseResult = computePriorityAnalysis({
    title: params.title,
    description: params.description,
    category: params.selectedCategory ?? ruleClass.predictedCategory,
    predictedCategory: ruleClass.predictedCategory,
    detectedKeywords: ruleClass.detectedKeywords,
    affectedCitizens: params.affectedCitizens,
    duplicates,
    areaComplaintCount14d,
    createdAt: params.createdAt,
    targetLanguage: targetLang,
  });

  const baseTranslation = {
    title: fallbackEnglishTitle,
    description: fallbackEnglishDescription,
    ...(fallbackEnglishLocation ? { location: fallbackEnglishLocation } : {}),
  };

  if (!isGeminiConfigured()) {
    return {
      ...baseResult,
      categoryConfidence: ruleClass.confidence,
      aiSource: 'rules',
      detectedLanguage,
      englishTranslation: baseTranslation,
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    if (params.imagePath && params.imagePath.startsWith('/uploads/')) {
      const localImg = path.resolve(process.cwd(), params.imagePath.replace(/^\//, ''));
      if (fs.existsSync(localImg)) {
        const ext = path.extname(localImg).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const data = fs.readFileSync(localImg).toString('base64');
        parts.push({ inlineData: { mimeType, data } });
      }
    }

    const targetLanguageName =
      targetLang === 'kn' ? 'Kannada (ಕನ್ನಡ)' : targetLang === 'hi' ? 'Hindi (हिन्दी)' : 'English';

    parts.push({
      text: `Analyze this Indian municipal infrastructure complaint in ${params.locality}, ${params.district}.
Detected Input Language: ${detectedLanguage}
Title: ${params.title}
Description: ${params.description}
${params.location ? `Location Landmark: ${params.location}` : ''}
Citizen Selected Category: ${params.selectedCategory ?? 'Unspecified'}
Baseline Rule-Based Priority Score: ${baseResult.priorityScore}/100 (${baseResult.priorityLevel})
Nearby Duplicate Reports Detected: ${duplicates.length}

Tasks:
1. Classify predictedCategory into ONE exact English string from: ${INFRASTRUCTURE_CATEGORIES.join(', ')}.
2. Provide concise detectedKeywords.
3. Provide accurate English translations in englishTitle, englishDescription${params.location ? ', and englishLocation' : ''} (if already English, return clean English).
4. Write explanation (2 concise sentences noting it complements rule-based triage) and suggestedAction strictly in ${targetLanguageName}.`,
    });

    const geminiPromise = ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction:
          'You are CivicSense AI, a multilingual municipal infrastructure triage assistant for Indian cities (supporting English, Kannada, and Hindi). Keep translations faithful and triage explanations factual, concise, and actionable.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predictedCategory: { type: Type.STRING },
            detectedKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            englishTitle: { type: Type.STRING },
            englishDescription: { type: Type.STRING },
            englishLocation: { type: Type.STRING },
            explanation: { type: Type.STRING },
            suggestedAction: { type: Type.STRING },
          },
        },
      },
    });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const response = await Promise.race([
      geminiPromise,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Gemini request timed out after 8000ms')), 8000);
      }),
    ]).finally(() => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      predictedCategory?: string;
      detectedKeywords?: string[];
      englishTitle?: string;
      englishDescription?: string;
      englishLocation?: string;
      explanation?: string;
      suggestedAction?: string;
    };

    const validCategory = INFRASTRUCTURE_CATEGORIES.find((c) => c === parsed.predictedCategory);
    const hybridSuffix =
      targetLang === 'kn'
        ? '(ಹೈಬ್ರಿಡ್ ನಿಯಮಗಳು + ಜೆಮಿನಿ ವಿಶ್ಲೇಷಣೆ)'
        : targetLang === 'hi'
          ? '(हाइब्रिड नियम + जेमिनी विश्लेषण)'
          : '(Hybrid rules + Gemini triage)';

    return {
      ...baseResult,
      predictedCategory: validCategory ?? baseResult.predictedCategory,
      detectedKeywords:
        Array.isArray(parsed.detectedKeywords) && parsed.detectedKeywords.length > 0
          ? parsed.detectedKeywords.slice(0, 8)
          : baseResult.detectedKeywords,
      explanation: parsed.explanation ? `${parsed.explanation} ${hybridSuffix}` : baseResult.explanation,
      suggestedAction: parsed.suggestedAction || baseResult.suggestedAction,
      categoryConfidence: Math.min(98, ruleClass.confidence + 4),
      aiSource: 'hybrid-gemini',
      detectedLanguage,
      englishTranslation: {
        title: parsed.englishTitle?.trim() || baseTranslation.title,
        description: parsed.englishDescription?.trim() || baseTranslation.description,
        ...(params.location
          ? { location: parsed.englishLocation?.trim() || baseTranslation.location || params.location }
          : {}),
      },
    };
  } catch (error) {
    console.warn(
      'Gemini enrichment unavailable, using deterministic rules engine:',
      error instanceof Error ? error.message : error
    );
    return {
      ...baseResult,
      categoryConfidence: ruleClass.confidence,
      aiSource: 'rules',
      detectedLanguage,
      englishTranslation: baseTranslation,
    };
  }
}

export function localizeComplaintNarrative(
  complaint: Complaint,
  lang: SupportedLanguage,
  duplicatesCount: number,
  areaComplaintCount14d: number
): { explanation: string; suggestedAction: string } {
  const combined = `${complaint.title} ${complaint.description} ${complaint.english_title ?? ''} ${complaint.english_description ?? ''}`.toLowerCase();
  const criticalSafetyHits = CRITICAL_SAFETY_TERMS.filter((term) => combined.includes(term));

  return {
    explanation: buildLocalizedRuleExplanation({
      priorityScore: complaint.priority_score,
      priorityLevel: complaint.priority_level,
      criticalSafetyHits,
      duplicatesCount,
      duplicatePoints: complaint.factor_breakdown.duplicatePoints,
      areaComplaintCount14d,
      areaFrequencyPoints: complaint.factor_breakdown.areaFrequencyPoints,
      affectedCitizens: complaint.affected_citizens,
      lang,
    }),
    suggestedAction: getSuggestedAction(complaint.predicted_category, complaint.priority_level, lang),
  };
}

export function generateAIInsights(
  complaints: Complaint[],
  duplicateRows: Array<{ complaint_id: number; related_complaint_id: number; similarity_score: number }>,
  targetLanguage: SupportedLanguage = 'en'
): InsightsResponse {
  const lang = normalizeTargetLanguage(targetLanguage);
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const unresolved = complaints.filter((c) => c.status !== 'Resolved' && c.status !== 'Rejected');

  const clusterMap = new Map<string, Complaint[]>();
  for (const c of unresolved) {
    const key = `${c.district}::${c.locality}::${c.category}`;
    const arr = clusterMap.get(key) ?? [];
    arr.push(c);
    clusterMap.set(key, arr);
  }

  const insights: AIInsightItem[] = [];

  for (const [key, items] of clusterMap.entries()) {
    const [district, locality, rawCategory] = key.split('::');
    const category = rawCategory as InfrastructureCategory;
    const catLabel = CATEGORY_LABELS[lang][category] ?? rawCategory;

    const recent7d = items.filter((c) => new Date(c.created_at).getTime() >= sevenDaysAgo);
    const recent30d = items.filter((c) => new Date(c.created_at).getTime() >= thirtyDaysAgo);
    const targetList = recent7d.length >= 2 ? recent7d : recent30d.length >= 2 ? recent30d : [];

    if (targetList.length >= 2) {
      const windowDays = recent7d.length >= 2 ? 7 : 30;
      const avgPriority = Math.round(targetList.reduce((sum, c) => sum + c.priority_score, 0) / targetList.length);
      const totalCitizens = targetList.reduce((sum, c) => sum + c.affected_citizens, 0);
      const maxLevel: PriorityLevel =
        avgPriority >= 80 ? 'Critical' : avgPriority >= 60 ? 'High' : avgPriority >= 40 ? 'Medium' : 'Low';

      let title = `${targetList.length} ${catLabel} reports in ${locality}, ${district}`;
      let summary = `Multiple ${catLabel.toLowerCase()} complaints (${targetList.length} reports) have been logged in ${locality}, ${district} within the last ${windowDays} days, indicating a systemic local infrastructure fault.`;
      let recommendation = `Deploy a joint diagnostic unit to ${locality}, ${district} to audit recurring ${catLabel.toLowerCase()} failures.`;

      if (lang === 'kn') {
        title = `${locality}, ${district} ನಲ್ಲಿ ${targetList.length} ${catLabel} ದೂರುಗಳು`;
        summary = `ಕಳೆದ ${windowDays} ದಿನಗಳಲ್ಲಿ ${locality}, ${district} ಪ್ರದೇಶದಲ್ಲಿ ${targetList.length} ${catLabel} ದೂರುಗಳು ದಾಖಲಾಗಿದ್ದು, ಸ್ಥಳೀಯ ಮೂಲಸೌಕರ್ಯದಲ್ಲಿ ಮರುಕಳಿಸುವ ಸಮಸ್ಯೆಯನ್ನು ಸೂಚಿಸುತ್ತವೆ.`;
        if (category === 'Water leakage') {
          recommendation = `${locality}, ${district} ನಲ್ಲಿ ಸ್ಥಳೀಯ ನೀರು ವಿತರಣಾ ಜಾಲ ಮತ್ತು ಫೀಡರ್ ವಾಲ್ವ್‌ಗಳ ತಕ್ಷಣದ ಒತ್ತಡ ಪರೀಕ್ಷೆ ಮತ್ತು ಪರಿಶೀಲನೆಗೆ ಶಿಫಾರಸು ಮಾಡಲಾಗಿದೆ.`;
        } else if (category === 'Road damage and potholes') {
          recommendation = `${locality}, ${district} ನ ಮುಖ್ಯ ರಸ್ತೆಗಳಲ್ಲಿ ತಾತ್ಕಾಲಿಕ ತೇಪೆಗಿಂತ ಸಂಪೂರ್ಣ ಡಾಂಬರೀಕರಣ ಮತ್ತು ಒಳಚರಂಡಿ ಪರಿಶೀಲನೆಯನ್ನು ನಿಗದಿಪಡಿಸಿ.`;
        } else if (category === 'Drainage and sewage problems') {
          recommendation = `${locality}, ${district} ನಲ್ಲಿ ಮಳೆನೀರು ಚರಂಡಿಗಳ ಹೂಳು ತೆಗೆಯುವ ಮತ್ತು ಹೈ-ಪ್ರೆಶರ್ ಜೆಟ್ಟಿಂಗ್ ತಂಡವನ್ನು ನಿಯೋಜಿಸಿ.`;
        } else if (category === 'Broken streetlights') {
          recommendation = `${locality}, ${district} ನಲ್ಲಿ ಬೀದಿ ದೀಪಗಳ ಫೀಡರ್ ಪಿಲ್ಲರ್ ಬಾಕ್ಸ್, ಭೂಗತ ಕೇಬಲ್ ಮತ್ತು ಟೈಮರ್ ರಿಲೇಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.`;
        } else if (category === 'Improper waste disposal') {
          recommendation = `${locality}, ${district} ನಲ್ಲಿ ದೈನಂದಿನ ಕಸ ಸಂಗ್ರಹಣಾ ಆವರ್ತನವನ್ನು ಹೆಚ್ಚಿಸಿ ಮತ್ತು ಮುಚ್ಚಿದ ಕಸದ ತೊಟ್ಟಿಗಳನ್ನು ಅಳವಡಿಸಿ.`;
        } else {
          recommendation = `${locality}, ${district} ನಲ್ಲಿ ಮರುಕಳಿಸುವ ${catLabel} ದೋಷಗಳನ್ನು ಪರಿಶೀಲಿಸಲು ಜಂಟಿ ತಪಾಸಣಾ ತಂಡವನ್ನು ನಿಯೋಜಿಸಿ.`;
        }
      } else if (lang === 'hi') {
        title = `${locality}, ${district} में ${catLabel} की ${targetList.length} शिकायतें`;
        summary = `पिछले ${windowDays} दिनों में ${locality}, ${district} में ${catLabel} की ${targetList.length} शिकायतें दर्ज हुई हैं, जो स्थानीय बुनियादी ढाँचे में बार-बार होने वाली समस्या को दर्शाती हैं।`;
        if (category === 'Water leakage') {
          recommendation = `${locality}, ${district} में स्थानीय जल वितरण नेटवर्क और फीडर वाल्व के तत्काल दबाव परीक्षण और निरीक्षण की अनुशंसा की जाती है।`;
        } else if (category === 'Road damage and potholes') {
          recommendation = `${locality}, ${district} में केवल अस्थायी पैचवर्क के बजाय मुख्य मार्गों पर पूर्ण डामरीकरण और जल निकासी जाँच निर्धारित करें।`;
        } else if (category === 'Drainage and sewage problems') {
          recommendation = `${locality}, ${district} में जुड़े हुए नालों की गाद सफाई और हाई-प्रेशर जेटिंग टीम तैनात करें।`;
        } else if (category === 'Broken streetlights') {
          recommendation = `${locality}, ${district} में स्ट्रीटलाइट फीडर पिलर बॉक्स, भूमिगत केबल और टाइमर रिले का निरीक्षण करें।`;
        } else if (category === 'Improper waste disposal') {
          recommendation = `${locality}, ${district} में दैनिक कचरा संग्रहण बढ़ाएँ और संवेदनशील बिंदुओं पर ढके हुए कचरा पात्र लगाएँ।`;
        } else {
          recommendation = `${locality}, ${district} में बार-बार होने वाली ${catLabel} समस्याओं के ऑडिट के लिए संयुक्त जाँच दल तैनात करें।`;
        }
      } else {
        if (category === 'Water leakage') {
          recommendation = `Recommend immediate pressure testing and inspection of the local water distribution network and feeder valves in ${locality}, ${district}.`;
        } else if (category === 'Road damage and potholes') {
          recommendation = `Schedule corridor-wide asphalt resurfacing and sub-base drainage check along arterial stretches in ${locality}, ${district} rather than isolated patching.`;
        } else if (category === 'Drainage and sewage problems') {
          recommendation = `Deploy high-pressure jetting and silt-desilting crew across connected stormwater grates in ${locality}, ${district} ahead of peak rainfall.`;
        } else if (category === 'Broken streetlights') {
          recommendation = `Inspect feeder pillar box, underground cabling, and timer relays serving ${locality}, ${district} to restore corridor illumination.`;
        } else if (category === 'Improper waste disposal') {
          recommendation = `Increase daily compactor frequency and add covered secondary collection bins at identified vulnerable points in ${locality}, ${district}.`;
        }
      }

      insights.push({
        id: `cluster-${district}-${locality}-${rawCategory}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        type: recent7d.length >= 2 ? 'recurring_issue' : 'hotspot_alert',
        severity: maxLevel,
        title,
        summary,
        recommendation,
        district,
        locality,
        category: rawCategory,
        supportingComplaintIds: targetList.map((c) => c.id),
        supportingCodes: targetList.map((c) => c.complaint_code),
        metrics: {
          reportCount: targetList.length,
          windowDays,
          avgPriorityScore: avgPriority,
          estimatedAffectedCitizens: totalCitizens,
        },
      });
    }
  }

  // District-level critical hotspots
  const districtHotspots = new Map<string, Complaint[]>();
  for (const c of unresolved.filter((item) => item.priority_level === 'Critical' || item.priority_level === 'High')) {
    const arr = districtHotspots.get(c.district) ?? [];
    arr.push(c);
    districtHotspots.set(c.district, arr);
  }

  for (const [district, items] of districtHotspots.entries()) {
    if (items.length >= 3) {
      const topCatRaw = (items[0]?.category ?? 'Other civic issues') as InfrastructureCategory;
      const topCatLabel = CATEGORY_LABELS[lang][topCatRaw] ?? topCatRaw;
      const avgScore = Math.round(items.reduce((s, c) => s + c.priority_score, 0) / items.length);

      let title = `Elevated High-Priority Backlog in ${district} (${items.length} active hazards)`;
      let summary = `${district} currently carries ${items.length} high or critical unresolved complaints, led by ${topCatLabel.toLowerCase()}. Prioritized crew allocation is advised to prevent SLA breaches.`;
      let recommendation = `Reallocate mobile rapid-response maintenance teams in ${district} to clear the top ${Math.min(3, items.length)} critical hazards first.`;
      let localityLabel = 'District-wide';

      if (lang === 'kn') {
        title = `${district} ಜಿಲ್ಲೆಯಲ್ಲಿ ಹೆಚ್ಚಿನ ಆದ್ಯತೆಯ ಬಾಕಿ ದೂರುಗಳು (${items.length} ಸಕ್ರಿಯ ಅಪಾಯಗಳು)`;
        summary = `${district} ನಲ್ಲಿ ಪ್ರಸ್ತುತ ${items.length} ಹೆಚ್ಚಿನ ಅಥವಾ ಅತ್ಯಂತ ತುರ್ತು ಬಾಕಿ ದೂರುಗಳಿದ್ದು, ಪ್ರಮುಖವಾಗಿ ${topCatLabel} ಸಂಬಂಧಿಸಿವೆ. ಸಮಯಕ್ಕೆ ಸರಿಯಾಗಿ ತಂಡಗಳನ್ನು ನಿಯೋಜಿಸಲು ಶಿಫಾರಸು ಮಾಡಲಾಗಿದೆ.`;
        recommendation = `${district} ಜಿಲ್ಲೆಯ ಅಗ್ರ ${Math.min(3, items.length)} ತುರ್ತು ಅಪಾಯಗಳನ್ನು ಮೊದಲು ಸರಿಪಡಿಸಲು ಸಂಚಾರಿ ತ್ವರಿತ-ಪ್ರತಿಕ್ರಿಯೆ ತಂಡಗಳನ್ನು ನಿಯೋಜಿಸಿ.`;
        localityLabel = 'ಜಿಲ್ಲಾ ವ್ಯಾಪ್ತಿ';
      } else if (lang === 'hi') {
        title = `${district} में उच्च-प्राथमिकता बकाया शिकायतें (${items.length} सक्रिय जोखिम)`;
        summary = `${district} में वर्तमान में ${items.length} उच्च या अत्यंत गंभीर लंबित शिकायतें हैं, जिनमें ${topCatLabel} प्रमुख है। समयबद्ध समाधान के लिए त्वरित टीम आवंटन की सलाह दी जाती है।`;
        recommendation = `${district} में शीर्ष ${Math.min(3, items.length)} गंभीर जोखिमों को पहले दूर करने हेतु मोबाइल त्वरित-प्रतिक्रिया रखरखाव दलों को पुनः आवंटित करें।`;
        localityLabel = 'जिला-व्यापी';
      }

      insights.push({
        id: `district-hotspot-${district.toLowerCase()}`,
        type: 'maintenance_recommendation',
        severity: avgScore >= 80 ? 'Critical' : 'High',
        title,
        summary,
        recommendation,
        district,
        locality: localityLabel,
        category: topCatRaw,
        supportingComplaintIds: items.slice(0, 5).map((c) => c.id),
        supportingCodes: items.slice(0, 5).map((c) => c.complaint_code),
        metrics: {
          reportCount: items.length,
          windowDays: 30,
          avgPriorityScore: avgScore,
          estimatedAffectedCitizens: items.reduce((s, c) => s + c.affected_citizens, 0),
        },
      });
    }
  }

  insights.sort((a, b) => b.metrics.avgPriorityScore - a.metrics.avgPriorityScore || b.metrics.reportCount - a.metrics.reportCount);

  const byId = new Map(complaints.map((c) => [c.id, c]));
  const dupGroupMap = new Map<number, { relatedIds: Set<number>; maxSimilarity: number }>();

  for (const row of duplicateRows) {
    const entry = dupGroupMap.get(row.complaint_id) ?? { relatedIds: new Set<number>(), maxSimilarity: 0 };
    entry.relatedIds.add(row.related_complaint_id);
    entry.maxSimilarity = Math.max(entry.maxSimilarity, row.similarity_score);
    dupGroupMap.set(row.complaint_id, entry);
  }

  const duplicateGroups = Array.from(dupGroupMap.entries())
    .map(([primaryId, info]) => {
      const c = byId.get(primaryId);
      if (!c) return null;
      return {
        primaryId,
        primaryCode: c.complaint_code,
        primaryTitle: c.title,
        district: c.district,
        locality: c.locality,
        category: c.category,
        relatedCount: info.relatedIds.size,
        maxSimilarity: info.maxSimilarity,
        relatedIds: Array.from(info.relatedIds),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.maxSimilarity - a.maxSimilarity)
    .slice(0, 12);

  const matchCount = complaints.filter((c) => c.category === c.predicted_category).length;
  const avgScore = complaints.length
    ? Math.round(complaints.reduce((sum, c) => sum + c.priority_score, 0) / complaints.length)
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    engineMode: isGeminiConfigured() ? 'hybrid-gemini' : 'rules',
    classificationSummary: {
      totalAnalyzed: complaints.length,
      categoryMatchRate: complaints.length ? Math.round((matchCount / complaints.length) * 100) : 100,
      criticalSafetyCount: complaints.filter((c) => c.critical_safety_flag).length,
      duplicateClusterCount: duplicateGroups.length,
      avgPriorityScore: avgScore,
    },
    insights: insights.slice(0, 10),
    duplicateGroups,
  };
}
