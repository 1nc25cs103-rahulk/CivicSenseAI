import { getCurrentLanguage } from '../i18n/index.ts';
import type {
  AccountStatus,
  AdminBootstrapStatus,
  AdminInvite,
  AIAnalysisResult,
  AnalyticsResponse,
  AuditLogEntry,
  AuthSessionResponse,
  Complaint,
  ComplaintDetail,
  EscalationLetterResponse,
  InsightsResponse,
  OfflineDraftComplaint,
  PublicHotspotsResponse,
  PublicStatsResponse,
  SupportedLanguage,
  User,
} from '../types/index.ts';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const CACHE_KEYS = {
  complaints: 'civicsense_cache_complaints',
  analytics: 'civicsense_cache_analytics',
  insights: 'civicsense_cache_insights',
};

// Keep bearer token strictly in memory; reload persistence uses the HttpOnly session cookie.
let inMemoryAuthToken: string | null = null;

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function subscribeUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(): void {
  clearAuthAndCache();
  unauthorizedListeners.forEach((listener) => listener());
}

export function getStoredToken(): string | null {
  return inMemoryAuthToken;
}

export function setStoredToken(token: string | null): void {
  inMemoryAuthToken = token;
}

export function clearAuthAndCache(): void {
  inMemoryAuthToken = null;
  try {
    localStorage.removeItem('civicsense_auth_token');
    localStorage.removeItem(CACHE_KEYS.complaints);
    localStorage.removeItem(CACHE_KEYS.analytics);
    localStorage.removeItem(CACHE_KEYS.insights);
  } catch {
    // Ignore storage access errors
  }
}

function buildAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getStoredToken();
  const baseHeaders: Record<string, string> = {
    'Accept-Language': getCurrentLanguage(),
    'X-Requested-With': 'CivicSense',
    ...extra,
  };
  return token ? { ...baseHeaders, Authorization: `Bearer ${token}` } : baseHeaders;
}

async function apiFetch(input: string, init: RequestInit = {}, notifyOn401 = true): Promise<Response> {
  const mergedHeaders = buildAuthHeaders(
    (init.headers as Record<string, string> | undefined) ?? {}
  );
  const res = await fetch(`${API_BASE}${input}`, {
    ...init,
    credentials: 'include',
    headers: mergedHeaders,
  });
  if (res.status === 401 && notifyOn401) {
    notifyUnauthorized();
  }
  return res;
}

function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export interface ComplaintFilters {
  search?: string;
  category?: string;
  priority?: string;
  district?: string;
  status?: string;
  department?: string;
  slaStatus?: string;
  sortBy?: 'priority' | 'date' | 'severity';
  sortDir?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
}

function toQueryString(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v && v !== 'All') sp.set(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// --- Public Telemetry & Hotspots ---

export async function fetchPublicStats(): Promise<PublicStatsResponse> {
  const res = await apiFetch('/api/public/stats', {}, false);
  if (!res.ok) throw new Error('Unable to load public stats.');
  return res.json();
}

export async function fetchPublicHotspots(filters: { district?: string; category?: string } = {}): Promise<PublicHotspotsResponse> {
  const qs = toQueryString({ district: filters.district, category: filters.category });
  const res = await apiFetch(`/api/public/hotspots${qs}`, {}, false);
  if (!res.ok) throw new Error('Unable to load public hotspots.');
  return res.json();
}

export async function fetchHealth(): Promise<{ status: string; aiMode: 'rules' | 'hybrid-gemini'; complaintsCount: number }> {
  const res = await apiFetch('/api/health', {}, false);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

// --- Auth, Bootstrap & Two-Tier Official Onboarding ---

export async function fetchAuthPolicy(): Promise<{ allowedAdminDomains: string[]; prototypeMode: boolean }> {
  const res = await apiFetch('/api/auth/policy', {}, false);
  if (!res.ok) {
    return { allowedAdminDomains: ['bbmp.gov.in', 'karnataka.gov.in', 'civicsense.gov.in'], prototypeMode: true };
  }
  return res.json();
}

export async function fetchAdminBootstrapStatus(): Promise<AdminBootstrapStatus> {
  const res = await apiFetch('/api/auth/admin-bootstrap-status', {}, false);
  if (!res.ok) {
    throw new Error('Failed to load administrator bootstrap status.');
  }
  return res.json();
}

export async function fetchCurrentUser(): Promise<User | null> {
  const res = await apiFetch('/api/auth/me', {}, false);
  if (!res.ok) {
    if (res.status === 401) {
      setStoredToken(null);
    }
    return null;
  }
  const data = (await res.json()) as { user: User };
  return data.user;
}

export async function updateUserPreferencesApi(preferred_language: SupportedLanguage): Promise<User> {
  const res = await apiFetch(
    '/api/auth/preferences',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_language }),
    },
    false
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update language preference.');
  }
  return data.user as User;
}

export async function registerCitizenApi(payload: {
  full_name: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  security_question: string;
  security_answer: string;
  preferred_language?: SupportedLanguage;
}): Promise<{ message: string; user: User }> {
  const res = await apiFetch(
    '/api/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        preferred_language: payload.preferred_language ?? getCurrentLanguage(),
      }),
    },
    false
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Registration failed.');
  }
  return data as { message: string; user: User };
}

export async function registerInitialAdminApi(payload: {
  full_name: string;
  email: string;
  employee_id: string;
  designation: string;
  mobile?: string;
  password: string;
  confirmPassword: string;
  security_question: string;
  security_answer: string;
  preferred_language?: SupportedLanguage;
}): Promise<AuthSessionResponse & { message: string }> {
  const res = await apiFetch(
    '/api/auth/register-initial-admin',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        preferred_language: payload.preferred_language ?? getCurrentLanguage(),
      }),
    },
    false
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Initial Super Administrator setup failed.');
  }
  clearAuthAndCache();
  setStoredToken(data.token);
  return data as AuthSessionResponse & { message: string };
}

export async function registerOfficialApi(payload: {
  registration_method: 'invite' | 'email';
  invite_code?: string;
  full_name: string;
  email: string;
  department: string;
  employee_id: string;
  designation: string;
  mobile?: string;
  password: string;
  confirmPassword: string;
  security_question: string;
  security_answer: string;
  preferred_language?: SupportedLanguage;
}): Promise<{ user: User; status: 'active' | 'pending'; message: string; token?: string; expiresAt?: string }> {
  const res = await apiFetch(
    '/api/auth/register-official',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        preferred_language: payload.preferred_language ?? getCurrentLanguage(),
      }),
    },
    false
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Official registration failed.');
  }
  if (data.token) {
    clearAuthAndCache();
    setStoredToken(data.token);
  }
  return data as { user: User; status: 'active' | 'pending'; message: string; token?: string; expiresAt?: string };
}

export async function loginUnifiedApi(
  email: string,
  password: string,
  portal?: 'citizen' | 'official'
): Promise<AuthSessionResponse> {
  const res = await apiFetch(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, portal }),
    },
    false
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Invalid credentials.');
  }
  const session = data as AuthSessionResponse;
  clearAuthAndCache();
  setStoredToken(session.token);
  return session;
}

export async function loginCitizenApi(email: string, password: string): Promise<AuthSessionResponse> {
  return loginUnifiedApi(email, password, 'citizen');
}

export async function loginAdminApi(email: string, password: string): Promise<AuthSessionResponse> {
  return loginUnifiedApi(email, password, 'official');
}

export async function loginDemoAdminApi(): Promise<AuthSessionResponse> {
  const res = await apiFetch('/api/auth/demo-admin', { method: 'POST' }, false);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Demo administrator login unavailable.');
  }
  const session = data as AuthSessionResponse;
  clearAuthAndCache();
  setStoredToken(session.token);
  return session;
}

export async function logoutApi(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' }, false);
  } catch {
    // Clear local session regardless of network errors
  } finally {
    clearAuthAndCache();
  }
}

export async function requestSecurityQuestionApi(email: string): Promise<{
  question: string;
  challengeToken: string;
  expiresAt: string;
}> {
  const res = await apiFetch(
    '/api/auth/forgot-password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    },
    false
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Unable to start password recovery.');
  }
  return data as { question: string; challengeToken: string; expiresAt: string };
}

export async function verifySecurityAnswerApi(
  challengeToken: string,
  answer: string
): Promise<{ verified: boolean; resetToken: string }> {
  const res = await apiFetch(
    '/api/auth/verify-security-answer',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken, answer }),
    },
    false
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Security answer verification failed.');
  }
  return data as { verified: boolean; resetToken: string };
}

export async function resetPasswordApi(
  resetToken: string,
  newPassword: string,
  confirmPassword: string
): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch(
    '/api/auth/reset-password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword, confirmPassword }),
    },
    false
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Password reset failed.');
  }
  clearAuthAndCache();
  return data as { success: boolean; message: string };
}

// --- Admin Provisioning, Audit & Settings ---

export async function fetchAdminInvites(): Promise<AdminInvite[]> {
  const res = await apiFetch('/api/admin/invites');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load invite codes.');
  return data.invites as AdminInvite[];
}

export async function createAdminInviteApi(department: string, expiresInDays = 7): Promise<AdminInvite> {
  const res = await apiFetch('/api/admin/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ department, expiresInDays }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate invite code.');
  return data.invite as AdminInvite;
}

export async function revokeAdminInviteApi(inviteId: number): Promise<void> {
  const res = await apiFetch(`/api/admin/invites/${inviteId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to revoke invite code.');
}

export async function fetchOfficersApi(): Promise<Array<User & { approver_name?: string | null }>> {
  const res = await apiFetch('/api/admin/officers');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load official accounts.');
  return data.officers as Array<User & { approver_name?: string | null }>;
}

export async function updateOfficerStatusApi(officerId: number, account_status: AccountStatus): Promise<User> {
  const res = await apiFetch(`/api/admin/officers/${officerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_status }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update official account status.');
  return data.officer as User;
}

export async function fetchAuditLogsApi(filters: { search?: string; action?: string } = {}): Promise<AuditLogEntry[]> {
  const qs = toQueryString({ search: filters.search, action: filters.action });
  const res = await apiFetch(`/api/admin/audit-logs${qs}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load audit logs.');
  return data.logs as AuditLogEntry[];
}

export interface AdminSettingsResponse {
  prototypeMode: boolean;
  aiMode: 'rules' | 'hybrid-gemini';
  allowedAdminDomains: string[];
  slaPolicy: {
    critical: { minScore: number; maxScore: number; windowHours: number; label: string };
    high: { minScore: number; maxScore: number; windowHours: number; label: string };
    normal: { minScore: number; maxScore: number; windowHours: number; label: string };
  };
  counts: {
    totalComplaints: number;
    totalUsers: number;
    activeInvites: number;
  };
}

export async function fetchAdminSettingsApi(): Promise<AdminSettingsResponse> {
  const res = await apiFetch('/api/admin/settings');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load system settings.');
  return data as AdminSettingsResponse;
}

// --- Complaints, SLA & Legal Escalation ---

export async function fetchComplaints(filters: ComplaintFilters = {}): Promise<{ complaints: Complaint[]; fromCache: boolean }> {
  const qs = toQueryString({
    search: filters.search,
    category: filters.category,
    priority: filters.priority,
    district: filters.district,
    status: filters.status,
    department: filters.department,
    slaStatus: filters.slaStatus,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });

  try {
    const res = await apiFetch(`/api/complaints${qs}`);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('Authentication required to load complaints.');
      }
      throw new Error('Failed to fetch complaints');
    }
    const data = (await res.json()) as { complaints: Complaint[] };
    if (!qs) {
      writeCache(CACHE_KEYS.complaints, data.complaints);
    }
    return { complaints: data.complaints, fromCache: false };
  } catch (err) {
    if (!navigator.onLine) {
      const cached = readCache<Complaint[]>(CACHE_KEYS.complaints);
      if (cached) {
        return { complaints: cached, fromCache: true };
      }
    }
    throw err;
  }
}

export async function fetchComplaintDetail(id: number): Promise<ComplaintDetail> {
  const lang = encodeURIComponent(getCurrentLanguage());
  const res = await apiFetch(`/api/complaints/${id}?lang=${lang}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load complaint details');
  return data.complaint as ComplaintDetail;
}

export async function previewComplaintAnalysis(payload: {
  title: string;
  description: string;
  location?: string;
  category?: string;
  district: string;
  locality: string;
  latitude: number;
  longitude: number;
  affectedCitizens: number;
}): Promise<AIAnalysisResult> {
  const res = await apiFetch('/api/complaints/analyze-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, language: getCurrentLanguage() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to preview AI analysis');
  return data.analysis as AIAnalysisResult;
}

export async function submitComplaintOnline(formData: FormData): Promise<{ complaint: Complaint; aiAnalysis: AIAnalysisResult }> {
  const res = await apiFetch('/api/complaints', {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to submit complaint');
  }
  return data as { complaint: Complaint; aiAnalysis: AIAnalysisResult };
}

export async function syncOfflineDraftToServer(draft: OfflineDraftComplaint): Promise<{ complaint: Complaint; aiAnalysis: AIAnalysisResult }> {
  const res = await apiFetch('/api/complaints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to sync offline draft');
  }
  return data as { complaint: Complaint; aiAnalysis: AIAnalysisResult };
}

export async function simulateSlaBreachApi(complaintId: number): Promise<Complaint> {
  const res = await apiFetch(`/api/complaints/${complaintId}/simulate-sla-breach`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to simulate SLA breach.');
  }
  return data.complaint as Complaint;
}

export async function generateEscalationLetterApi(
  complaintId: number,
  language: SupportedLanguage
): Promise<EscalationLetterResponse> {
  const res = await apiFetch(`/api/complaints/${complaintId}/escalation-letter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to generate escalation notice.');
  }
  return data as EscalationLetterResponse;
}

export async function markEscalationSentApi(
  complaintId: number,
  letterText: string
): Promise<Complaint> {
  const res = await apiFetch(`/api/complaints/${complaintId}/mark-escalation-sent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmed: true, letterText }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to mark escalation as sent.');
  }
  return data.complaint as Complaint;
}

export async function updateComplaintAdmin(
  id: number,
  payload: {
    status?: string;
    department?: string;
    assigned_to?: string;
    remarks?: string;
    updated_by?: string;
  }
): Promise<Complaint> {
  const res = await apiFetch(`/api/complaints/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update complaint');
  }
  return data.complaint as Complaint;
}

export async function fetchAnalytics(filters: { dateFrom?: string; dateTo?: string; district?: string; category?: string } = {}): Promise<{
  analytics: AnalyticsResponse;
  fromCache: boolean;
}> {
  const qs = toQueryString({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    district: filters.district,
    category: filters.category,
  });
  try {
    const res = await apiFetch(`/api/analytics${qs}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    const data = (await res.json()) as AnalyticsResponse;
    if (!qs) writeCache(CACHE_KEYS.analytics, data);
    return { analytics: data, fromCache: false };
  } catch (err) {
    if (!navigator.onLine) {
      const cached = readCache<AnalyticsResponse>(CACHE_KEYS.analytics);
      if (cached) return { analytics: cached, fromCache: true };
    }
    throw err;
  }
}

export async function fetchInsights(): Promise<{ insights: InsightsResponse; fromCache: boolean }> {
  const lang = getCurrentLanguage();
  try {
    const res = await apiFetch(`/api/insights?lang=${encodeURIComponent(lang)}`);
    if (!res.ok) throw new Error('Failed to fetch AI insights');
    const data = (await res.json()) as InsightsResponse;
    writeCache(`${CACHE_KEYS.insights}_${lang}`, data);
    return { insights: data, fromCache: false };
  } catch (err) {
    if (!navigator.onLine) {
      const cached =
        readCache<InsightsResponse>(`${CACHE_KEYS.insights}_${lang}`) ??
        readCache<InsightsResponse>(CACHE_KEYS.insights);
      if (cached) return { insights: cached, fromCache: true };
    }
    throw err;
  }
}

export async function downloadComplaintsCsv(filters: ComplaintFilters = {}): Promise<void> {
  const qs = toQueryString({
    search: filters.search,
    category: filters.category,
    priority: filters.priority,
    district: filters.district,
    status: filters.status,
    department: filters.department,
    slaStatus: filters.slaStatus,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });
  const res = await apiFetch(`/api/export/csv${qs}`);
  if (!res.ok) {
    throw new Error('Failed to export CSV report.');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = 'civicsense-complaints-export.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
