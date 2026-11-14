import { getCurrentLanguage } from '../i18n/index.ts';
import type {
  AIAnalysisResult,
  AnalyticsResponse,
  AuthSessionResponse,
  Complaint,
  ComplaintDetail,
  InsightsResponse,
  OfflineDraftComplaint,
  SupportedLanguage,
  User,
} from '../types/index.ts';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const AUTH_TOKEN_KEY = 'civicsense_auth_token';

const CACHE_KEYS = {
  complaints: 'civicsense_cache_complaints',
  analytics: 'civicsense_cache_analytics',
  insights: 'civicsense_cache_insights',
};

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
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
}

export function clearAuthAndCache(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
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
    ...extra,
  };
  return token
    ? { ...baseHeaders, Authorization: `Bearer ${token}` }
    : baseHeaders;
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

export async function fetchHealth(): Promise<{ status: string; aiMode: 'rules' | 'hybrid-gemini'; complaintsCount: number }> {
  const res = await apiFetch('/api/health', {}, false);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchAuthPolicy(): Promise<{ allowedAdminDomains: string[] }> {
  const res = await apiFetch('/api/auth/policy', {}, false);
  if (!res.ok) {
    return { allowedAdminDomains: ['civicsense.gov.in', 'karnataka.gov.in'] };
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

export async function loginCitizenApi(email: string, password: string): Promise<AuthSessionResponse> {
  const res = await apiFetch(
    '/api/auth/login/citizen',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    false
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Invalid citizen credentials.');
  }
  const session = data as AuthSessionResponse;
  clearAuthAndCache();
  setStoredToken(session.token);
  return session;
}

export async function loginAdminApi(email: string, password: string): Promise<AuthSessionResponse> {
  const res = await apiFetch(
    '/api/auth/login/admin',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    false
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Unauthorized administrator login.');
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
    '/api/auth/forgot-password/question',
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
    '/api/auth/forgot-password/verify',
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
    '/api/auth/forgot-password/reset',
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

export async function fetchComplaints(filters: ComplaintFilters = {}): Promise<{ complaints: Complaint[]; fromCache: boolean }> {
  const qs = toQueryString({
    search: filters.search,
    category: filters.category,
    priority: filters.priority,
    district: filters.district,
    status: filters.status,
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
