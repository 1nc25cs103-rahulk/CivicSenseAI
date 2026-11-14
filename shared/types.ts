export const INFRASTRUCTURE_CATEGORIES = [
  'Road damage and potholes',
  'Water leakage',
  'Drainage and sewage problems',
  'Broken streetlights',
  'Improper waste disposal',
  'Public infrastructure damage',
  'Other civic issues',
] as const;

export type InfrastructureCategory = (typeof INFRASTRUCTURE_CATEGORIES)[number];

export const COMPLAINT_STATUSES = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
  'Rejected',
] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type UserRole = 'CITIZEN' | 'ADMIN';
export type AccountStatus = 'active' | 'pending' | 'suspended';

export const SUPPORTED_LANGUAGES = ['en', 'kn', 'hi'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const SUGGESTED_SECURITY_QUESTIONS = [
  'What was the name of your first school?',
  'What is the name of your childhood best friend?',
  'What was your favourite childhood nickname?',
  'What is the name of your favourite teacher?',
] as const;

export type AuthRoute =
  | '/'
  | '/login/citizen'
  | '/register/citizen'
  | '/login/admin'
  | '/forgot-password'
  | '/citizen'
  | '/admin';

export interface DistrictPreset {
  name: string;
  latitude: number;
  longitude: number;
  defaultLocality: string;
  authorityBody: string;
}

export const KARNATAKA_DISTRICTS: DistrictPreset[] = [
  {
    name: 'Bengaluru',
    latitude: 12.9716,
    longitude: 77.5946,
    defaultLocality: 'Indiranagar',
    authorityBody: 'BBMP / BWSSB Bengaluru',
  },
  {
    name: 'Mysuru',
    latitude: 12.2958,
    longitude: 76.6394,
    defaultLocality: 'Vijayanagar',
    authorityBody: 'Mysuru City Corporation',
  },
  {
    name: 'Mangaluru',
    latitude: 12.9141,
    longitude: 74.856,
    defaultLocality: 'Hampankatta',
    authorityBody: 'Mangaluru City Corporation',
  },
  {
    name: 'Hubballi',
    latitude: 15.3647,
    longitude: 75.124,
    defaultLocality: 'Vidyanagar',
    authorityBody: 'HDMC Hubballi-Dharwad',
  },
  {
    name: 'Belagavi',
    latitude: 15.8497,
    longitude: 74.4977,
    defaultLocality: 'Tilakwadi',
    authorityBody: 'Belagavi City Corporation',
  },
  {
    name: 'Kalaburagi',
    latitude: 17.3297,
    longitude: 76.8343,
    defaultLocality: 'Super Market Area',
    authorityBody: 'Kalaburagi Mahanagara Palike',
  },
  {
    name: 'Ballari',
    latitude: 15.1394,
    longitude: 76.9214,
    defaultLocality: 'Gandhinagar',
    authorityBody: 'Ballari City Corporation',
  },
  {
    name: 'Chikkaballapur',
    latitude: 13.4355,
    longitude: 77.7315,
    defaultLocality: 'B.B. Road Junction',
    authorityBody: 'Chikkaballapur CMC',
  },
  {
    name: 'Tumakuru',
    latitude: 13.3379,
    longitude: 77.1173,
    defaultLocality: 'Sira Gate',
    authorityBody: 'Tumakuru Smart City / TMC',
  },
];

export const MUNICIPAL_DEPARTMENTS = [
  'Road Engineering & Pothole Cell',
  'Water Supply & Distribution Board',
  'Stormwater Drainage & Sewerage Dept',
  'Municipal Electrical & Streetlighting',
  'Solid Waste Management Division',
  'Public Assets & Civil Maintenance',
  'General Civic Grievance Cell',
] as const;

export interface User {
  id: number;
  full_name: string;
  email: string;
  mobile: string;
  role: UserRole;
  account_status: AccountStatus;
  preferred_language?: SupportedLanguage;
  security_question?: string;
  created_at: string;
  updated_at: string;
}

export interface AuthSessionResponse {
  user: User;
  token: string;
  expiresAt: string;
}

export interface PriorityFactorBreakdown {
  severityPoints: number;
  safetyRiskPoints: number;
  duplicatePoints: number;
  affectedCitizensPoints: number;
  areaFrequencyPoints: number;
  agePoints: number;
}

export interface DuplicateMatch {
  id?: number;
  complaint_id?: number;
  related_complaint_id: number;
  related_title?: string;
  related_status?: ComplaintStatus;
  related_location?: string;
  related_created_at?: string;
  similarity_score: number;
  reason?: string;
}

export interface DepartmentAssignment {
  id: number;
  complaint_id: number;
  department: string;
  assigned_to: string;
  assigned_at: string;
}

export interface ComplaintUpdate {
  id: number;
  complaint_id: number;
  status: ComplaintStatus;
  remarks: string;
  updated_by?: string;
  updated_at: string;
}

export interface Complaint {
  id: number;
  complaint_code: string;
  user_id: number;
  reporter_name?: string;
  title: string;
  description: string;
  category: InfrastructureCategory;
  predicted_category: InfrastructureCategory;
  image_path: string | null;
  location: string;
  locality: string;
  district: string;
  latitude: number;
  longitude: number;
  incident_date: string;
  contact_info: string;
  affected_citizens: number;
  severity: SeverityLevel;
  priority_score: number;
  priority_level: PriorityLevel;
  ai_keywords: string[];
  ai_explanation: string;
  suggested_action: string;
  factor_breakdown: PriorityFactorBreakdown;
  critical_safety_flag: boolean;
  ai_source: 'rules' | 'hybrid-gemini';
  original_language?: SupportedLanguage;
  english_title?: string | null;
  english_description?: string | null;
  english_location?: string | null;
  status: ComplaintStatus;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  duplicate_count?: number;
  affected_area_count?: number;
  department?: string | null;
  assigned_to?: string | null;
}

export interface ComplaintDetail extends Complaint {
  duplicates: DuplicateMatch[];
  assignment: DepartmentAssignment | null;
  updates: ComplaintUpdate[];
  area_complaint_count: number;
}

export interface AIAnalysisResult {
  predictedCategory: InfrastructureCategory;
  categoryConfidence: number;
  detectedKeywords: string[];
  estimatedSeverity: SeverityLevel;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  criticalSafetyFlag: boolean;
  factorBreakdown: PriorityFactorBreakdown;
  explanation: string;
  suggestedAction: string;
  aiSource: 'rules' | 'hybrid-gemini';
  detectedLanguage?: SupportedLanguage;
  englishTranslation?: {
    title: string;
    description: string;
    location?: string;
  };
  duplicates: DuplicateMatch[];
  affectedAreaCount: number;
}

export interface AnalyticsResponse {
  kpis: {
    total: number;
    newComplaints: number;
    critical: number;
    highPriority: number;
    inProgress: number;
    resolved: number;
    pending: number;
    underReview: number;
    avgResolutionHours: number;
    resolutionRate: number;
  };
  byCategory: Array<{ category: string; count: number; criticalCount: number; resolvedCount: number }>;
  byDistrict: Array<{ district: string; count: number; criticalCount: number; resolvedCount: number; avgPriority: number }>;
  byPriority: Array<{ level: PriorityLevel; count: number }>;
  byStatus: Array<{ status: ComplaintStatus; count: number }>;
  monthlyTrends: Array<{ month: string; submitted: number; resolved: number; critical: number }>;
  frequentProblems: Array<{ label: string; district: string; category: string; count: number; avgPriority: number }>;
  hotspots: Array<{
    district: string;
    locality: string;
    latitude: number;
    longitude: number;
    count: number;
    criticalCount: number;
    maxPriority: number;
    topCategory: string;
  }>;
}

export interface AIInsightItem {
  id: string;
  type: 'recurring_issue' | 'hotspot_alert' | 'duplicate_cluster' | 'maintenance_recommendation';
  severity: PriorityLevel;
  title: string;
  summary: string;
  recommendation: string;
  district: string;
  locality: string;
  category: string;
  supportingComplaintIds: number[];
  supportingCodes: string[];
  metrics: {
    reportCount: number;
    windowDays: number;
    avgPriorityScore: number;
    estimatedAffectedCitizens: number;
  };
}

export interface InsightsResponse {
  generatedAt: string;
  engineMode: 'rules' | 'hybrid-gemini';
  classificationSummary: {
    totalAnalyzed: number;
    categoryMatchRate: number;
    criticalSafetyCount: number;
    duplicateClusterCount: number;
    avgPriorityScore: number;
  };
  insights: AIInsightItem[];
  duplicateGroups: Array<{
    primaryId: number;
    primaryCode: string;
    primaryTitle: string;
    district: string;
    locality: string;
    category: string;
    relatedCount: number;
    maxSimilarity: number;
    relatedIds: number[];
  }>;
}
