import type { ComplaintStatus, InfrastructureCategory } from '../../shared/types.ts';
import {
  calculateHaversineKm,
  classifyComplaintRules,
  computePriorityAnalysis,
  detectDuplicates,
} from '../ai/engine.ts';
import {
  hashSecret,
  isApprovedAdminDomain,
  isPersonalEmailDomain,
  normalizeEmail,
  normalizeSecurityAnswer,
  validateEmailFormat,
  validatePasswordStrength,
} from '../services/authService.ts';
import { getDb } from './database.ts';

interface SeedComplaintSpec {
  title: string;
  description: string;
  category: InfrastructureCategory;
  image_path: string | null;
  location: string;
  locality: string;
  district: string;
  latitude: number;
  longitude: number;
  daysAgo: number;
  affected_citizens: number;
  status: ComplaintStatus;
  department?: string;
  assigned_to?: string;
  remarks?: string[];
}

function isoDaysAgo(daysAgo: number, hourOffset = 10): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  d.setHours(hourOffset, 15, 0, 0);
  return d.toISOString();
}

const DEMO_COMPLAINTS: SeedComplaintSpec[] = [
  // Cluster 1: Bengaluru Indiranagar Water Leakage (3 nearby reports within 7 days)
  {
    title: 'Burst underground water main flooding 100 Feet Road sidewalk',
    description:
      'High-pressure potable water pipe burst near Indiranagar Metro pillar 42, flooding the footpath and wasting clean municipal supply continuously since morning.',
    category: 'Water leakage',
    image_path: '/demo-images/civic_water_leakage_1794632109809.jpg',
    location: '100 Feet Road, Near CMH Junction, Indiranagar',
    locality: 'Indiranagar',
    district: 'Bengaluru',
    latitude: 12.9784,
    longitude: 77.6408,
    daysAgo: 1,
    affected_citizens: 480,
    status: 'Assigned',
    department: 'Water Supply & Distribution Board',
    assigned_to: 'R. Venkatesh (AEE BWSSB)',
    remarks: ['Emergency valve isolation team notified.', 'Pipe clamp & excavation crew dispatched to CMH Junction.'],
  },
  {
    title: 'Continuous BWSSB water pipe leakage near 12th Main Indiranagar',
    description:
      'Clean drinking water leaking heavily from underground feeder valve near 12th Main Indiranagar, causing low pressure in nearby homes and slippery road surface.',
    category: 'Water leakage',
    image_path: '/demo-images/civic_water_leakage_1794632109809.jpg',
    location: '12th Main Road, HAL 2nd Stage, Indiranagar',
    locality: 'Indiranagar',
    district: 'Bengaluru',
    latitude: 12.9769,
    longitude: 77.6389,
    daysAgo: 3,
    affected_citizens: 320,
    status: 'Under Review',
    remarks: ['Flagged as possible feeder network pressure surge linked to CMH Road line.'],
  },
  {
    title: 'Underground water supply joint rupture at Indiranagar 80 Feet Road',
    description:
      'Potable water gushing from road edge pipe joint at Indiranagar 80 Feet Road near hospital entrance, creating traffic bottleneck and water loss.',
    category: 'Water leakage',
    image_path: null,
    location: '80 Feet Road, Opposite Chinmaya Mission Hospital, Indiranagar',
    locality: 'Indiranagar',
    district: 'Bengaluru',
    latitude: 12.9795,
    longitude: 77.6421,
    daysAgo: 5,
    affected_citizens: 540,
    status: 'In Progress',
    department: 'Water Supply & Distribution Board',
    assigned_to: 'K. Shivakumar (JE East Zone)',
    remarks: ['Trench opened; replacing corroded cast-iron collar joint.'],
  },

  // Cluster 2: Bengaluru Koramangala Pothole Corridor (3 nearby reports)
  {
    title: 'Deep water-filled pothole crater near Koramangala Sony World Junction',
    description:
      'Severe asphalt crater over 1.2m wide on 80 Feet Road Koramangala causing two-wheeler skids and sudden braking during peak evening commute.',
    category: 'Road damage and potholes',
    image_path: '/demo-images/civic_road_pothole_1794632108953.jpg',
    location: '80 Feet Road, Sony World Signal, Koramangala 4th Block',
    locality: 'Koramangala',
    district: 'Bengaluru',
    latitude: 12.9352,
    longitude: 77.6245,
    daysAgo: 2,
    affected_citizens: 850,
    status: 'In Progress',
    department: 'Road Engineering & Pothole Cell',
    assigned_to: 'S. Manjunath (BBMP Road Div)',
    remarks: ['Safety cones placed around crater.', 'Hot-mix asphalt patching scheduled tonight.'],
  },
  {
    title: 'Caved-in asphalt pothole cluster outside Koramangala 4th Block bus stop',
    description:
      'Multiple deep potholes and cracked tar pavement near Koramangala 4th Block bus bay posing severe accident risk for commuters and school buses.',
    category: 'Road damage and potholes',
    image_path: '/demo-images/civic_road_pothole_1794632108953.jpg',
    location: 'Koramangala 4th Block Bus Stop, 80 Feet Road',
    locality: 'Koramangala',
    district: 'Bengaluru',
    latitude: 12.9361,
    longitude: 77.6258,
    daysAgo: 4,
    affected_citizens: 620,
    status: 'Under Review',
  },
  {
    title: 'Damaged road surface and sinkhole depression on Koramangala Inner Ring Road',
    description:
      'Road surface has sunk near stormwater crossing on Koramangala Inner Ring Road, creating a deep uneven hazard for ambulances and heavy vehicles.',
    category: 'Road damage and potholes',
    image_path: null,
    location: 'Inner Ring Road, Koramangala 6th Block',
    locality: 'Koramangala',
    district: 'Bengaluru',
    latitude: 12.9389,
    longitude: 77.6289,
    daysAgo: 6,
    affected_citizens: 710,
    status: 'Submitted',
  },

  // Cluster 3: Mysuru Vijayanagar Drainage & Sewage (3 nearby reports)
  {
    title: 'Clogged stormwater drain causing raw sewage overflow in Vijayanagar 2nd Stage',
    description:
      'Blocked roadside stormwater grate and overflowing manhole releasing foul sewage onto residential street near Vijayanagar Water Tank Circle.',
    category: 'Drainage and sewage problems',
    image_path: '/demo-images/civic_drainage_waste_1794632111098.jpg',
    location: 'High Tension Double Road, Vijayanagar 2nd Stage',
    locality: 'Vijayanagar',
    district: 'Mysuru',
    latitude: 12.3264,
    longitude: 76.6122,
    daysAgo: 2,
    affected_citizens: 390,
    status: 'Assigned',
    department: 'Stormwater Drainage & Sewerage Dept',
    assigned_to: 'Prashanth Gowda (MCC Drainage)',
    remarks: ['Jetting suction tanker assigned for desilting operation.'],
  },
  {
    title: 'Blocked drainage grate and stagnant waterlogging in Vijayanagar 2nd Stage',
    description:
      'Stormwater gutter completely choked with silt and plastic waste causing mosquito breeding and waterlogging near Vijayanagar Park.',
    category: 'Drainage and sewage problems',
    image_path: '/demo-images/civic_drainage_waste_1794632111098.jpg',
    location: '3rd Cross, Vijayanagar 2nd Stage',
    locality: 'Vijayanagar',
    district: 'Mysuru',
    latitude: 12.3278,
    longitude: 76.6134,
    daysAgo: 5,
    affected_citizens: 240,
    status: 'Under Review',
  },
  {
    title: 'Open manhole without cover near Mysuru Vijayanagar school gate',
    description:
      'Missing concrete manhole lid on pedestrian walkway beside government primary school in Vijayanagar. Immediate fall hazard for children.',
    category: 'Drainage and sewage problems',
    image_path: null,
    location: 'School Road, Vijayanagar 1st Stage',
    locality: 'Vijayanagar',
    district: 'Mysuru',
    latitude: 12.3249,
    longitude: 76.6151,
    daysAgo: 1,
    affected_citizens: 450,
    status: 'Submitted',
  },

  // Cluster 4: Hubballi Vidyanagar Broken Streetlights (2 nearby reports)
  {
    title: 'Tilted and non-functioning LED streetlight pole at Vidyanagar intersection',
    description:
      'Main arterial streetlight pole tilted dangerously after vehicle impact and completely unlit, leaving pedestrian crosswalk in total darkness.',
    category: 'Broken streetlights',
    image_path: '/demo-images/civic_broken_streetlight_1794632109856.jpg',
    location: 'PB Road, Vidyanagar Cross, Hubballi',
    locality: 'Vidyanagar',
    district: 'Hubballi',
    latitude: 15.3688,
    longitude: 75.1204,
    daysAgo: 2,
    affected_citizens: 500,
    status: 'Assigned',
    department: 'Municipal Electrical & Streetlighting',
    assigned_to: 'Basavaraj Patil (HDMC Electrical)',
    remarks: ['Electrical feeder isolated to avoid live wire shock; crane crew scheduled.'],
  },
  {
    title: 'Entire stretch of 9 streetlights unlit along Vidyanagar College Road',
    description:
      'Feeder blackout across 9 municipal LED poles near BVB Campus creating dark safety hazard for evening commuters and students.',
    category: 'Broken streetlights',
    image_path: '/demo-images/civic_broken_streetlight_1794632109856.jpg',
    location: 'BVB Campus Road, Vidyanagar, Hubballi',
    locality: 'Vidyanagar',
    district: 'Hubballi',
    latitude: 15.3694,
    longitude: 75.1219,
    daysAgo: 4,
    affected_citizens: 640,
    status: 'In Progress',
    department: 'Municipal Electrical & Streetlighting',
    assigned_to: 'Basavaraj Patil (HDMC Electrical)',
    remarks: ['Fault traced to underground armored cable joint.'],
  },

  // Additional Bengaluru complaints (mixed resolved & active)
  {
    title: 'Overflowing garbage dump point near Malleswaram 8th Cross market',
    description:
      'Uncollected organic market waste and plastic bags piling over roadside footpath, blocking pedestrian access and attracting stray animals.',
    category: 'Improper waste disposal',
    image_path: '/demo-images/civic_drainage_waste_1794632111098.jpg',
    location: '8th Cross, Sampige Road, Malleswaram',
    locality: 'Malleswaram',
    district: 'Bengaluru',
    latitude: 13.0031,
    longitude: 77.5643,
    daysAgo: 12,
    affected_citizens: 310,
    status: 'Resolved',
    department: 'Solid Waste Management Division',
    assigned_to: 'N. Kavitha (Health Inspector)',
    remarks: ['Compactor vehicle cleared waste heap.', 'Additional covered 240L bins installed and verified.'],
  },
  {
    title: 'Damaged pedestrian guardrail on Hebbal Flyover ramp',
    description:
      'Steel median guardrail bent and detached for 6 meters along Hebbal service road ramp following truck scrape.',
    category: 'Public infrastructure damage',
    image_path: null,
    location: 'Hebbal Flyover Service Road, Bellary Road',
    locality: 'Hebbal',
    district: 'Bengaluru',
    latitude: 13.0358,
    longitude: 77.597,
    daysAgo: 18,
    affected_citizens: 420,
    status: 'Resolved',
    department: 'Public Assets & Civil Maintenance',
    assigned_to: 'D. Harish (Civil Works)',
    remarks: ['New galvanized guardrail section bolted and painted.'],
  },
  {
    title: 'Flickering streetlight and exposed junction box in Jayanagar 4th Block',
    description:
      'Streetlight pole base cover missing with exposed live electrical wires near Jayanagar shopping complex walkway.',
    category: 'Broken streetlights',
    image_path: '/demo-images/civic_broken_streetlight_1794632109856.jpg',
    location: '11th Main, Jayanagar 4th Block',
    locality: 'Jayanagar',
    district: 'Bengaluru',
    latitude: 12.9279,
    longitude: 77.5838,
    daysAgo: 3,
    affected_citizens: 290,
    status: 'Assigned',
    department: 'Municipal Electrical & Streetlighting',
    assigned_to: 'V. Nagaraj (BESCOM Liaison)',
  },

  // Mysuru additional
  {
    title: 'Broken concrete bus shelter roof near Mysuru Palace East Gate',
    description:
      'Cracked concrete cantilever and rusted bench frame at tourist bus shelter causing unsafe seating conditions.',
    category: 'Public infrastructure damage',
    image_path: null,
    location: 'Hardinge Circle, East Gate',
    locality: 'Palace Precinct',
    district: 'Mysuru',
    latitude: 12.3052,
    longitude: 76.6552,
    daysAgo: 25,
    affected_citizens: 280,
    status: 'Resolved',
    department: 'Public Assets & Civil Maintenance',
    assigned_to: 'M. Lokesh (MCC Engineering)',
    remarks: ['Roof slab reinforced and seating replaced.'],
  },
  {
    title: 'Pothole stretch along KRS Road industrial intersection',
    description:
      'Heavy freight movement damaged tar road near Metagalli signal creating 40m uneven stretch.',
    category: 'Road damage and potholes',
    image_path: '/demo-images/civic_road_pothole_1794632108953.jpg',
    location: 'KRS Road, Metagalli Signal',
    locality: 'Metagalli',
    district: 'Mysuru',
    latitude: 12.352,
    longitude: 76.628,
    daysAgo: 34,
    affected_citizens: 500,
    status: 'Resolved',
    department: 'Road Engineering & Pothole Cell',
    assigned_to: 'R. Mahesh (MCC Roads)',
    remarks: ['Milled and resurfaced 60m carriageway.'],
  },

  // Mangaluru (3 complaints)
  {
    title: 'Coastal monsoon stormwater drain blockage near Hampankatta Circle',
    description:
      'Clogged culvert and plastic debris backing up rainwater across Hampankatta market junction during afternoon showers.',
    category: 'Drainage and sewage problems',
    image_path: '/demo-images/civic_drainage_waste_1794632111098.jpg',
    location: 'KS Rao Road, Hampankatta',
    locality: 'Hampankatta',
    district: 'Mangaluru',
    latitude: 12.8698,
    longitude: 74.843,
    daysAgo: 4,
    affected_citizens: 600,
    status: 'In Progress',
    department: 'Stormwater Drainage & Sewerage Dept',
    assigned_to: 'S. Alva (MCC Monsoon Cell)',
    remarks: ['Excavator removing silt trap accumulation at KS Rao junction.'],
  },
  {
    title: 'Water pipeline valve leakage at Kadri Park Road',
    description:
      'Continuous clean water seepage from roadside sluice valve chamber near Kadri Temple crossroad.',
    category: 'Water leakage',
    image_path: '/demo-images/civic_water_leakage_1794632109809.jpg',
    location: 'Kadri Temple Road, Kadri',
    locality: 'Kadri',
    district: 'Mangaluru',
    latitude: 12.8886,
    longitude: 74.8559,
    daysAgo: 9,
    affected_citizens: 160,
    status: 'Assigned',
    department: 'Water Supply & Distribution Board',
    assigned_to: 'P. Shetty (Water Works)',
  },
  {
    title: 'Dark streetlight stretch near Bejai KSRTC bus stand',
    description:
      'Four consecutive LED street lamps out of order on Bejai Church road affecting evening pedestrian safety.',
    category: 'Broken streetlights',
    image_path: '/demo-images/civic_broken_streetlight_1794632109856.jpg',
    location: 'Bejai Main Road, Near KSRTC',
    locality: 'Bejai',
    district: 'Mangaluru',
    latitude: 12.8842,
    longitude: 74.8447,
    daysAgo: 21,
    affected_citizens: 230,
    status: 'Resolved',
    department: 'Municipal Electrical & Streetlighting',
    assigned_to: 'D. Rai (MCC Electrical)',
    remarks: ['Replaced faulty relay contactor and 2 LED drivers.'],
  },

  // Hubballi additional
  {
    title: 'Illegal construction rubble dumped beside Unkal Lake bund road',
    description:
      'Truckloads of broken concrete rubble and mixed plastic garbage obstructing storm channel along Unkal Lake perimeter.',
    category: 'Improper waste disposal',
    image_path: '/demo-images/civic_drainage_waste_1794632111098.jpg',
    location: 'Unkal Lake Bund Road',
    locality: 'Unkal',
    district: 'Hubballi',
    latitude: 15.3772,
    longitude: 75.1112,
    daysAgo: 14,
    affected_citizens: 140,
    status: 'Under Review',
  },

  // Belagavi (3 complaints)
  {
    title: 'Severe potholes at Tilakwadi Railway Gate approach road',
    description:
      'Deep broken tarmac and exposed aggregate near Tilakwadi railway crossing slowing ambulances and city buses.',
    category: 'Road damage and potholes',
    image_path: '/demo-images/civic_road_pothole_1794632108953.jpg',
    location: 'Congress Road, Tilakwadi',
    locality: 'Tilakwadi',
    district: 'Belagavi',
    latitude: 15.8398,
    longitude: 74.5021,
    daysAgo: 3,
    affected_citizens: 520,
    status: 'Assigned',
    department: 'Road Engineering & Pothole Cell',
    assigned_to: 'A. Kulkarni (BCC Roads)',
  },
  {
    title: 'Collapsed park boundary wall and broken bench at Camp Area',
    description:
      'Ten-meter brick boundary wall collapsed after heavy rain beside children play area in Belagavi Camp.',
    category: 'Public infrastructure damage',
    image_path: null,
    location: 'Club Road, Camp Area',
    locality: 'Camp',
    district: 'Belagavi',
    latitude: 15.862,
    longitude: 74.5045,
    daysAgo: 8,
    affected_citizens: 180,
    status: 'Under Review',
  },
  {
    title: 'Leaking municipal drinking water standpost in Shahapur',
    description:
      'Broken brass tap and cracked riser pipe leaking water nonstop onto Shahapur main lane.',
    category: 'Water leakage',
    image_path: '/demo-images/civic_water_leakage_1794632109809.jpg',
    location: 'Khasbag Main Road, Shahapur',
    locality: 'Shahapur',
    district: 'Belagavi',
    latitude: 15.8442,
    longitude: 74.521,
    daysAgo: 29,
    affected_citizens: 95,
    status: 'Resolved',
    department: 'Water Supply & Distribution Board',
    assigned_to: 'R. Joshi (BCC Water)',
    remarks: ['Standpost valve replaced and apron concreted.'],
  },

  // Kalaburagi (3 complaints)
  {
    title: 'Uncollected garbage heap near Super Market vegetable lane',
    description:
      'Overflowing waste container and rotting vegetable refuse creating severe odor and sanitation risk near Super Market.',
    category: 'Improper waste disposal',
    image_path: '/demo-images/civic_drainage_waste_1794632111098.jpg',
    location: 'Super Market Main Road',
    locality: 'Super Market Area',
    district: 'Kalaburagi',
    latitude: 17.3341,
    longitude: 76.8358,
    daysAgo: 3,
    affected_citizens: 410,
    status: 'Submitted',
  },
  {
    title: 'Burst water distribution line at Jewargi Cross',
    description:
      'Water main leak eroding road edge near Jewargi Road junction, reducing pressure across surrounding blocks.',
    category: 'Water leakage',
    image_path: '/demo-images/civic_water_leakage_1794632109809.jpg',
    location: 'Jewargi Road, Near Ring Road Cross',
    locality: 'Jewargi Cross',
    district: 'Kalaburagi',
    latitude: 17.3156,
    longitude: 76.8224,
    daysAgo: 15,
    affected_citizens: 350,
    status: 'Resolved',
    department: 'Water Supply & Distribution Board',
    assigned_to: 'M. Biradar (KUWSDB)',
    remarks: ['Welded steel sleeve installed and pressure restored.'],
  },
  {
    title: 'Broken overhead directional signage gantry on Sedam Road',
    description:
      'Loose steel sign plate hanging over Sedam Road lane posing hazard to passing buses.',
    category: 'Public infrastructure damage',
    image_path: null,
    location: 'Sedam Road, Near PDA Engineering College',
    locality: 'Sedam Road',
    district: 'Kalaburagi',
    latitude: 17.3212,
    longitude: 76.854,
    daysAgo: 6,
    affected_citizens: 260,
    status: 'In Progress',
    department: 'Public Assets & Civil Maintenance',
    assigned_to: 'S.Deshmukh (KMP Civil)',
  },

  // Ballari (2 complaints)
  {
    title: 'Deep road depression and pothole cluster on Royal Circle road',
    description:
      'Series of potholes across Royal Circle roundabout causing severe congestion and two-wheeler accidents.',
    category: 'Road damage and potholes',
    image_path: '/demo-images/civic_road_pothole_1794632108953.jpg',
    location: 'Royal Circle, Bangalore Road',
    locality: 'Gandhinagar',
    district: 'Ballari',
    latitude: 15.1421,
    longitude: 76.9245,
    daysAgo: 5,
    affected_citizens: 580,
    status: 'Assigned',
    department: 'Road Engineering & Pothole Cell',
    assigned_to: 'T. Ramesh (Ballari Corp)',
  },
  {
    title: 'Tree branch encroachment blocking traffic signal visibility in Ballari',
    description:
      'Overgrown avenue tree branch completely obscures green/red signal head at Cowl Bazaar crossing.',
    category: 'Other civic issues',
    image_path: null,
    location: 'Cowl Bazaar Main Signal',
    locality: 'Cowl Bazaar',
    district: 'Ballari',
    latitude: 15.1342,
    longitude: 76.9125,
    daysAgo: 19,
    affected_citizens: 120,
    status: 'Resolved',
    department: 'General Civic Grievance Cell',
    assigned_to: 'Horticulture Wing Ballari',
    remarks: ['Canopy trimmed cleanly; signal visibility restored.'],
  },

  // Chikkaballapur (2 complaints)
  {
    title: 'Unlit highway junction streetlights at Chikkaballapur B.B. Road',
    description:
      'Six highway median lamps non-functional near District Hospital turnoff on B.B. Road creating night accident zone.',
    category: 'Broken streetlights',
    image_path: '/demo-images/civic_broken_streetlight_1794632109856.jpg',
    location: 'B.B. Road, Near District Hospital Turnoff',
    locality: 'B.B. Road Junction',
    district: 'Chikkaballapur',
    latitude: 13.4368,
    longitude: 77.7298,
    daysAgo: 2,
    affected_citizens: 440,
    status: 'Submitted',
  },
  {
    title: 'Blocked roadside drainage channel near APMC market yard',
    description:
      'Stagnant rainwater and agricultural waste clogging main roadside drain beside APMC entrance.',
    category: 'Drainage and sewage problems',
    image_path: '/demo-images/civic_drainage_waste_1794632111098.jpg',
    location: 'APMC Market Road, Chikkaballapur',
    locality: 'APMC Yard',
    district: 'Chikkaballapur',
    latitude: 13.4312,
    longitude: 77.7364,
    daysAgo: 42,
    affected_citizens: 190,
    status: 'Rejected',
    remarks: ['Duplicate administrative ticket superseded by APMC internal maintenance work order #AP-88.'],
  },

  // Tumakuru (2 complaints)
  {
    title: 'Cracked pavement and pothole hazard near Sira Gate bus bay',
    description:
      'Asphalt edge broken along Sira Gate service road causing buses to swerve into pedestrian shoulder.',
    category: 'Road damage and potholes',
    image_path: '/demo-images/civic_road_pothole_1794632108953.jpg',
    location: 'NH-48 Service Road, Sira Gate',
    locality: 'Sira Gate',
    district: 'Tumakuru',
    latitude: 13.3489,
    longitude: 77.1108,
    daysAgo: 7,
    affected_citizens: 370,
    status: 'Under Review',
  },
  {
    title: 'Smart City public drinking water kiosk leak at BH Road Tumakuru',
    description:
      'Supply pipe behind public drinking water ATM near Town Hall is leaking continuously onto the footpath.',
    category: 'Water leakage',
    image_path: '/demo-images/civic_water_leakage_1794632109809.jpg',
    location: 'BH Road, Near Town Hall Circle',
    locality: 'Town Hall',
    district: 'Tumakuru',
    latitude: 13.3396,
    longitude: 77.1142,
    daysAgo: 31,
    affected_citizens: 150,
    status: 'Resolved',
    department: 'Water Supply & Distribution Board',
    assigned_to: 'H. Girish (TMC Water)',
    remarks: ['Replaced elbow coupling and sealed kiosk base.'],
  },
];

function isConfiguredSecret(val: string | undefined, placeholderPrefix: string): val is string {
  const trimmed = val?.trim();
  return Boolean(trimmed && !trimmed.startsWith(placeholderPrefix));
}

function ensureSeededAuthAccounts(): void {
  const db = getDb();
  const citizenEmail = normalizeEmail(process.env.CITIZEN_DEMO_EMAIL || 'aarav.citizen@civicsense.demo');
  const citizenPassRaw = process.env.CITIZEN_DEMO_PASSWORD;
  const citizenPass = isConfiguredSecret(citizenPassRaw, 'CHANGE_ME_') ? citizenPassRaw : null;
  const citizenSecAnswer = process.env.CITIZEN_DEMO_SECURITY_ANSWER?.trim();

  const adminEmail = normalizeEmail(process.env.ADMIN_SEED_EMAIL || 'meera.admin@civicsense.gov.in');
  const adminPassRaw = process.env.ADMIN_SEED_PASSWORD;
  const adminPass = isConfiguredSecret(adminPassRaw, 'CHANGE_ME_') ? adminPassRaw : null;
  const adminSecAnswer = process.env.ADMIN_SEED_SECURITY_ANSWER?.trim();

  const nowIso = new Date().toISOString();

  // 1. Seed or sync Demo Citizen account (owns seeded demo complaints)
  const existingCitizen = db.prepare("SELECT id, email, password_hash FROM Users WHERE role = 'CITIZEN' ORDER BY id ASC LIMIT 1").get() as
    | { id: number; email: string; password_hash: string }
    | undefined;

  if (!citizenPass) {
    console.warn('[CivicSense Seed] CITIZEN_DEMO_PASSWORD is not set; skipping demo citizen password provisioning.');
  } else {
    const strengthErr = validatePasswordStrength(citizenPass);
    if (strengthErr) {
      console.warn(`[CivicSense Seed] CITIZEN_DEMO_PASSWORD rejected (${strengthErr}). Skipping demo citizen password sync.`);
    }
  }

  const validCitizenPass = citizenPass && !validatePasswordStrength(citizenPass) ? citizenPass : null;

  if (!existingCitizen) {
    db.prepare(
      `INSERT INTO Users (
        full_name, email, mobile, password_hash, role,
        security_question, security_answer_hash, account_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'CITIZEN', ?, ?, 'active', ?, ?)`
    ).run(
      'Aarav Kulkarni',
      citizenEmail,
      '9845000001',
      validCitizenPass ? hashSecret(validCitizenPass) : '',
      citizenSecAnswer ? 'What was the name of your first school?' : '',
      citizenSecAnswer ? hashSecret(normalizeSecurityAnswer(citizenSecAnswer)) : '',
      nowIso,
      nowIso
    );
  } else if (validCitizenPass) {
    db.prepare(
      `UPDATE Users
       SET email = ?,
           password_hash = ?,
           security_question = CASE WHEN ? != '' THEN 'What was the name of your first school?' ELSE security_question END,
           security_answer_hash = CASE WHEN ? != '' THEN ? ELSE security_answer_hash END,
           mobile = COALESCE(NULLIF(mobile, ''), '9845000001'),
           updated_at = ?
       WHERE id = ?`
    ).run(
      citizenEmail,
      hashSecret(validCitizenPass),
      citizenSecAnswer ?? '',
      citizenSecAnswer ?? '',
      citizenSecAnswer ? hashSecret(normalizeSecurityAnswer(citizenSecAnswer)) : '',
      nowIso,
      existingCitizen.id
    );
  }

  // 2. Seed or sync Provisioned Government Administrator account
  if (!adminPass) {
    console.warn(
      '[CivicSense Seed] ADMIN_SEED_PASSWORD is not set; skipping administrator password seeding. Configure ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in environment variables.'
    );
    return;
  }

  if (!validateEmailFormat(adminEmail) || isPersonalEmailDomain(adminEmail) || !isApprovedAdminDomain(adminEmail)) {
    console.warn(
      '[CivicSense Seed] ADMIN_SEED_EMAIL must use an approved domain from ALLOWED_ADMIN_DOMAINS and cannot be a personal email. Skipping admin seeding.'
    );
    return;
  }

  const adminStrengthErr = validatePasswordStrength(adminPass);
  if (adminStrengthErr) {
    console.warn(`[CivicSense Seed] ADMIN_SEED_PASSWORD rejected (${adminStrengthErr}). Skipping admin seeding.`);
    return;
  }

  const existingAdmin = db.prepare("SELECT id FROM Users WHERE role = 'ADMIN' ORDER BY id ASC LIMIT 1").get() as
    | { id: number }
    | undefined;

  if (!existingAdmin) {
    db.prepare(
      `INSERT INTO Users (
        full_name, email, mobile, password_hash, role,
        security_question, security_answer_hash, account_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'ADMIN', ?, ?, 'active', ?, ?)`
    ).run(
      'Meera Deshpande',
      adminEmail,
      '9845000002',
      hashSecret(adminPass),
      adminSecAnswer ? 'What was the name of your first school?' : '',
      adminSecAnswer ? hashSecret(normalizeSecurityAnswer(adminSecAnswer)) : '',
      nowIso,
      nowIso
    );
  } else {
    db.prepare(
      `UPDATE Users
       SET email = ?,
           password_hash = ?,
           account_status = 'active',
           security_question = CASE WHEN ? != '' THEN 'What was the name of your first school?' ELSE security_question END,
           security_answer_hash = CASE WHEN ? != '' THEN ? ELSE security_answer_hash END,
           mobile = COALESCE(NULLIF(mobile, ''), '9845000002'),
           updated_at = ?
       WHERE id = ?`
    ).run(
      adminEmail,
      hashSecret(adminPass),
      adminSecAnswer ?? '',
      adminSecAnswer ?? '',
      adminSecAnswer ? hashSecret(normalizeSecurityAnswer(adminSecAnswer)) : '',
      nowIso,
      existingAdmin.id
    );
  }
}

export function seedDatabaseIfEmpty(): { seeded: boolean; count: number } {
  const db = getDb();

  ensureSeededAuthAccounts();

  const existingComplaints = db.prepare('SELECT COUNT(*) as count FROM Complaints').get() as { count: number };
  if (existingComplaints.count > 0) {
    return { seeded: false, count: existingComplaints.count };
  }

  const citizenRow = db.prepare("SELECT id FROM Users WHERE role = 'CITIZEN' ORDER BY id ASC LIMIT 1").get() as { id: number };
  const citizenId = citizenRow?.id ?? 1;

  const insertComplaint = db.prepare(`
    INSERT INTO Complaints (
      complaint_code, user_id, title, description, category, predicted_category,
      image_path, location, locality, district, latitude, longitude,
      incident_date, contact_info, affected_citizens, severity, priority_score,
      priority_level, ai_keywords, ai_explanation, suggested_action,
      factor_breakdown, critical_safety_flag, ai_source, status, is_demo,
      created_at, updated_at
    ) VALUES (
      @complaint_code, @user_id, @title, @description, @category, @predicted_category,
      @image_path, @location, @locality, @district, @latitude, @longitude,
      @incident_date, @contact_info, @affected_citizens, @severity, @priority_score,
      @priority_level, @ai_keywords, @ai_explanation, @suggested_action,
      @factor_breakdown, @critical_safety_flag, @ai_source, @status, 1,
      @created_at, @updated_at
    )
  `);

  const insertDuplicate = db.prepare(`
    INSERT OR IGNORE INTO Complaint_Duplicates (complaint_id, related_complaint_id, similarity_score, reason)
    VALUES (?, ?, ?, ?)
  `);

  const insertAssignment = db.prepare(`
    INSERT OR REPLACE INTO Department_Assignments (complaint_id, department, assigned_to, assigned_at)
    VALUES (?, ?, ?, ?)
  `);

  const insertUpdate = db.prepare(`
    INSERT INTO Complaint_Updates (complaint_id, status, remarks, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertedSoFar: Array<{
    id: number;
    title: string;
    description: string;
    category: string;
    district: string;
    locality: string;
    latitude: number;
    longitude: number;
    status: string;
    location: string;
    created_at: string;
  }> = [];

  const tx = db.transaction(() => {
    DEMO_COMPLAINTS.forEach((spec, index) => {
      const createdAt = isoDaysAgo(spec.daysAgo, 9 + (index % 8));
      const updatedAt =
        spec.status === 'Resolved'
          ? isoDaysAgo(Math.max(0, spec.daysAgo - 3), 16)
          : spec.status === 'Submitted'
            ? createdAt
            : isoDaysAgo(Math.max(0, spec.daysAgo - 1), 14);

      const ruleClass = classifyComplaintRules(spec.title, spec.description, spec.category);
      const dupes = detectDuplicates(
        {
          title: spec.title,
          description: spec.description,
          category: spec.category,
          district: spec.district,
          locality: spec.locality,
          latitude: spec.latitude,
          longitude: spec.longitude,
          created_at: createdAt,
        },
        insertedSoFar
      );

      const twoWeeksAgo = new Date(createdAt).getTime() - 14 * 24 * 60 * 60 * 1000;
      const areaCount = insertedSoFar.filter((c) => {
        const dist = calculateHaversineKm(spec.latitude, spec.longitude, c.latitude, c.longitude);
        return new Date(c.created_at).getTime() >= twoWeeksAgo && (dist <= 3.0 || c.locality === spec.locality);
      }).length;

      const analysis = computePriorityAnalysis({
        title: spec.title,
        description: spec.description,
        category: spec.category,
        predictedCategory: ruleClass.predictedCategory,
        detectedKeywords: ruleClass.detectedKeywords,
        affectedCitizens: spec.affected_citizens,
        duplicates: dupes,
        areaComplaintCount14d: areaCount,
        createdAt,
      });

      const code = `CS-${String(202601 + index)}`;
      const result = insertComplaint.run({
        complaint_code: code,
        user_id: citizenId,
        title: spec.title,
        description: spec.description,
        category: spec.category,
        predicted_category: analysis.predictedCategory,
        image_path: spec.image_path,
        location: spec.location,
        locality: spec.locality,
        district: spec.district,
        latitude: spec.latitude,
        longitude: spec.longitude,
        incident_date: createdAt.slice(0, 10),
        contact_info: `+91 98450 ${String(10200 + index).slice(-5)} (Demo Citizen)`,
        affected_citizens: spec.affected_citizens,
        severity: analysis.estimatedSeverity,
        priority_score: analysis.priorityScore,
        priority_level: analysis.priorityLevel,
        ai_keywords: JSON.stringify(analysis.detectedKeywords),
        ai_explanation: analysis.explanation,
        suggested_action: analysis.suggestedAction,
        factor_breakdown: JSON.stringify(analysis.factorBreakdown),
        critical_safety_flag: analysis.criticalSafetyFlag ? 1 : 0,
        ai_source: 'rules',
        status: spec.status,
        created_at: createdAt,
        updated_at: updatedAt,
      });

      const newId = Number(result.lastInsertRowid);

      for (const d of dupes) {
        insertDuplicate.run(newId, d.related_complaint_id, d.similarity_score, d.reason ?? 'Geo-text match');
        insertDuplicate.run(d.related_complaint_id, newId, d.similarity_score, d.reason ?? 'Geo-text match');
      }

      if (spec.department && spec.assigned_to) {
        insertAssignment.run(newId, spec.department, spec.assigned_to, updatedAt);
      }

      // Build realistic status timeline
      insertUpdate.run(
        newId,
        'Submitted',
        'Complaint registered via Citizen Portal and analyzed by CivicSense AI triage engine.',
        'Aarav Kulkarni',
        createdAt
      );

      if (spec.status !== 'Submitted') {
        insertUpdate.run(
          newId,
          'Under Review',
          'Municipal triage desk verified location coordinates and priority classification.',
          'Meera Deshpande',
          isoDaysAgo(Math.max(0, spec.daysAgo - 0.5), 11)
        );
      }

      if (spec.status === 'Assigned' || spec.status === 'In Progress' || spec.status === 'Resolved') {
        insertUpdate.run(
          newId,
          'Assigned',
          `Routed to ${spec.department ?? 'Civic Engineering'} (${spec.assigned_to ?? 'Duty Engineer'}).`,
          'Meera Deshpande',
          isoDaysAgo(Math.max(0, spec.daysAgo - 1), 13)
        );
      }

      if (spec.status === 'In Progress' || spec.status === 'Resolved') {
        insertUpdate.run(
          newId,
          'In Progress',
          spec.remarks?.[0] ?? 'Field crew arrived on site and commenced repair work.',
          spec.assigned_to ?? 'Field Team',
          isoDaysAgo(Math.max(0, spec.daysAgo - 1.5), 15)
        );
      }

      if (spec.status === 'Resolved') {
        insertUpdate.run(
          newId,
          'Resolved',
          spec.remarks?.[1] ?? 'Infrastructure repair completed and quality-checked.',
          spec.assigned_to ?? 'Meera Deshpande',
          updatedAt
        );
      }

      if (spec.status === 'Rejected') {
        insertUpdate.run(
          newId,
          'Rejected',
          spec.remarks?.[0] ?? 'Closed after administrative verification.',
          'Meera Deshpande',
          updatedAt
        );
      }

      insertedSoFar.push({
        id: newId,
        title: spec.title,
        description: spec.description,
        category: spec.category,
        district: spec.district,
        locality: spec.locality,
        latitude: spec.latitude,
        longitude: spec.longitude,
        status: spec.status,
        location: spec.location,
        created_at: createdAt,
      });
    });
  });

  tx();
  return { seeded: true, count: DEMO_COMPLAINTS.length };
}
