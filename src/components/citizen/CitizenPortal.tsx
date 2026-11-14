import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Crosshair,
  FilePlus2,
  ImagePlus,
  LogOut,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  fetchComplaintDetail,
  previewComplaintAnalysis,
  submitComplaintOnline,
} from '../../lib/api.ts';
import {
  formatLocaleDate,
  formatLocaleTime,
  translateCategory,
  translateDistrict,
  translatePriority,
  translateStatus,
} from '../../lib/i18nHelpers.ts';
import { enqueueOfflineDraft, fileToDataUrl } from '../../lib/offlineQueue.ts';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.ts';
import type {
  AIAnalysisResult,
  CitizenTab,
  Complaint,
  ComplaintDetail,
  InfrastructureCategory,
  OfflineDraftComplaint,
  User,
} from '../../types/index.ts';
import {
  COMPLAINT_STATUSES,
  INFRASTRUCTURE_CATEGORIES,
  KARNATAKA_DISTRICTS,
} from '../../types/index.ts';
import { LanguageSelector } from '../common/LanguageSelector.tsx';
import { PriorityIndicator, StatusIndicator } from '../common/SemanticIndicators.tsx';
import { KarnatakaMap } from '../maps/KarnatakaMap.tsx';
import { AIAnalysisPanel } from './AIAnalysisPanel.tsx';
import { ComplaintTimelineModal } from './ComplaintTimelineModal.tsx';

interface CitizenPortalProps {
  user: User;
  complaints: Complaint[];
  loading: boolean;
  offlineDrafts: OfflineDraftComplaint[];
  onRefreshData: () => Promise<void>;
  onRefreshDrafts: () => Promise<void>;
  onSyncDrafts: () => Promise<void>;
  onRemoveDraft: (localId: string) => Promise<void>;
  onUserUpdated?: (updatedUser: User) => void;
  onLogout: () => Promise<void> | void;
}

export const CitizenPortal: React.FC<CitizenPortalProps> = ({
  user,
  complaints,
  loading,
  offlineDrafts,
  onRefreshData,
  onRefreshDrafts,
  onSyncDrafts,
  onRemoveDraft,
  onUserUpdated,
  onLogout,
}) => {
  const { t, i18n } = useTranslation();
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<CitizenTab>('dashboard');

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<InfrastructureCategory>('Road damage and potholes');
  const [district, setDistrict] = useState<string>('Bengaluru');
  const [locality, setLocality] = useState<string>('Indiranagar');
  const [location, setLocation] = useState<string>('');
  const [latitude, setLatitude] = useState<number>(12.9716);
  const [longitude, setLongitude] = useState<number>(77.5946);
  const [incidentDate, setIncidentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [contactInfo, setContactInfo] = useState<string>(user.email || user.mobile);
  const [affectedCitizens, setAffectedCitizens] = useState<number>(45);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [previewingAI, setPreviewingAI] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitBanner, setSubmitBanner] = useState<string | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<{
    analysis: AIAnalysisResult;
    code?: string;
  } | null>(null);

  // Track Complaints State
  const [trackSearch, setTrackSearch] = useState('');
  const [trackStatus, setTrackStatus] = useState<string>('All');
  const [trackCategory, setTrackCategory] = useState<string>('All');
  const [selectedDetail, setSelectedDetail] = useState<ComplaintDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Refresh open timeline modal when active UI language changes so AI narratives re-localize
  useEffect(() => {
    if (!selectedDetail || !isOnline) return;
    let active = true;
    fetchComplaintDetail(selectedDetail.id)
      .then((detail) => {
        if (active) setSelectedDetail(detail);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [i18n.language, selectedDetail?.id, isOnline]);

  const citizenStats = useMemo(() => {
    const total = complaints.length;
    const resolved = complaints.filter((c) => c.status === 'Resolved').length;
    const underReview = complaints.filter((c) => c.status === 'Under Review').length;
    const pending = complaints.filter((c) => c.status !== 'Resolved' && c.status !== 'Rejected').length;
    return { total, pending, underReview, resolved };
  }, [complaints]);

  const filteredTrackList = useMemo(() => {
    const q = trackSearch.trim().toLowerCase();
    return complaints.filter((c) => {
      if (trackStatus !== 'All' && c.status !== trackStatus) return false;
      if (trackCategory !== 'All' && c.category !== trackCategory) return false;
      if (
        q &&
        !c.complaint_code.toLowerCase().includes(q) &&
        !c.title.toLowerCase().includes(q) &&
        !(c.english_title ?? '').toLowerCase().includes(q) &&
        !c.location.toLowerCase().includes(q) &&
        !c.district.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [complaints, trackSearch, trackStatus, trackCategory]);

  const handleDistrictSelect = (nextDistrict: string) => {
    setDistrict(nextDistrict);
    const preset = KARNATAKA_DISTRICTS.find((d) => d.name === nextDistrict);
    if (preset) {
      setLatitude(preset.latitude);
      setLongitude(preset.longitude);
      setLocality(preset.defaultLocality);
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setFormError(t('citizen.submit.errNoGeo'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(Number(pos.coords.latitude.toFixed(5)));
        setLongitude(Number(pos.coords.longitude.toFixed(5)));
        setFormError(null);
      },
      () => {
        setFormError(t('citizen.submit.errGeoRead'));
      },
      { timeout: 6000 }
    );
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError(t('citizen.submit.errImgType'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setFormError(t('citizen.submit.errImgSize'));
      return;
    }
    setFormError(null);
    setImageFile(file);
    const dataUrl = await fileToDataUrl(file);
    setImagePreviewUrl(dataUrl);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreviewUrl(null);
  };

  const handlePreviewAI = async () => {
    if (title.trim().length < 4 || description.trim().length < 10) {
      setFormError(t('citizen.submit.errPreviewLen'));
      return;
    }
    setFormError(null);
    setPreviewingAI(true);
    try {
      const analysis = await previewComplaintAnalysis({
        title: title.trim(),
        description: description.trim(),
        category,
        district,
        locality: locality.trim() || district,
        latitude,
        longitude,
        affectedCitizens,
      });
      setLatestAnalysis({ analysis });
    } catch {
      setFormError(t('citizen.submit.errPreviewOffline'));
    } finally {
      setPreviewingAI(false);
    }
  };

  const resetFormFields = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    clearImage();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitBanner(null);

    if (title.trim().length < 4) {
      setFormError(t('citizen.submit.errTitleLen'));
      return;
    }
    if (description.trim().length < 10) {
      setFormError(t('citizen.submit.errDescLen'));
      return;
    }
    if (!location.trim()) {
      setFormError(t('citizen.submit.errLocation'));
      return;
    }

    setSubmitting(true);

    const saveOffline = async () => {
      const draft: OfflineDraftComplaint = {
        localId: `draft-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        userId: user.id,
        title: title.trim(),
        description: description.trim(),
        category,
        district,
        locality: locality.trim() || district,
        location: location.trim(),
        latitude,
        longitude,
        incident_date: incidentDate,
        contact_info: contactInfo.trim() || 'Citizen Reporter',
        affected_citizens: affectedCitizens,
        imageDataUrl: imagePreviewUrl,
        imageName: imageFile?.name ?? null,
        queuedAt: new Date().toISOString(),
      };
      await enqueueOfflineDraft(draft);
      await onRefreshDrafts();
      setSubmitBanner(t('citizen.submit.savedOffline'));
      resetFormFields();
    };

    try {
      if (!isOnline) {
        await saveOffline();
        return;
      }

      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('description', description.trim());
      fd.append('category', category);
      fd.append('district', district);
      fd.append('locality', locality.trim() || district);
      fd.append('location', location.trim());
      fd.append('latitude', String(latitude));
      fd.append('longitude', String(longitude));
      fd.append('incident_date', incidentDate);
      fd.append('contact_info', contactInfo.trim() || 'Citizen Reporter');
      fd.append('affected_citizens', String(affectedCitizens));
      fd.append('language', i18n.language);
      if (imageFile) {
        fd.append('image', imageFile);
      }

      const res = await submitComplaintOnline(fd);
      setLatestAnalysis({ analysis: res.aiAnalysis, code: res.complaint.complaint_code });
      setSubmitBanner(
        t('citizen.submit.submittedMsg', {
          code: res.complaint.complaint_code,
          score: res.aiAnalysis.priorityScore,
          level: translatePriority(t, res.aiAnalysis.priorityLevel),
        })
      );
      resetFormFields();
      await onRefreshData();
    } catch (err) {
      if (!navigator.onLine) {
        await saveOffline();
      } else {
        setFormError(err instanceof Error ? err.message : t('citizen.submit.errSubmit'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openTimeline = async (complaint: Complaint) => {
    setDetailLoading(true);
    setSelectedDetail(null);
    try {
      const detail = await fetchComplaintDetail(complaint.id);
      setSelectedDetail(detail);
    } catch {
      // Offline fallback from cached complaint object
      setSelectedDetail({
        ...complaint,
        duplicates: [],
        assignment: complaint.department
          ? {
              id: 0,
              complaint_id: complaint.id,
              department: complaint.department,
              assigned_to: complaint.assigned_to ?? 'Duty Engineer',
              assigned_at: complaint.updated_at,
            }
          : null,
        updates: [
          {
            id: 1,
            complaint_id: complaint.id,
            status: complaint.status,
            remarks: t('offline.offlineBanner'),
            updated_by: 'Local Cache',
            updated_at: complaint.updated_at,
          },
        ],
        area_complaint_count: 1,
      });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3.5">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('common.appName')}
          </button>

          <nav className="flex items-center gap-4 sm:gap-6 text-sm font-medium overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === 'dashboard'
                  ? 'border-teal-600 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('citizen.nav.dashboard')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === 'submit'
                  ? 'border-teal-600 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('citizen.nav.submit')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('track')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === 'track'
                  ? 'border-teal-600 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('citizen.nav.track')}
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <LanguageSelector
              variant="light"
              onLanguageUpdated={(_lang, updatedUser) => {
                if (updatedUser) onUserUpdated?.(updatedUser);
              }}
            />
            <span className="hidden md:inline text-xs font-medium text-slate-600 truncate max-w-[140px]">
              {user.full_name}
            </span>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{t('common.logout')}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {/* TAB 1: CITIZEN DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  {t('citizen.dashboard.subtitle', { name: user.full_name, email: user.email })}
                </div>
                <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
                  {t('citizen.dashboard.title')}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('submit')}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FilePlus2 className="h-4 w-4" />
                <span>{t('citizen.dashboard.submitCta')}</span>
              </button>
            </div>

            {/* 4 KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-medium text-slate-500">
                  {t('citizen.dashboard.kpiTotal')}
                </div>
                <div className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-900">
                  {citizenStats.total}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t('citizen.dashboard.kpiTotalSub')}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-medium text-slate-500">
                  {t('citizen.dashboard.kpiPending')}
                </div>
                <div className="mt-2 font-mono text-3xl font-bold tabular-nums text-orange-600">
                  {citizenStats.pending}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t('citizen.dashboard.kpiPendingSub')}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-medium text-slate-500">
                  {t('citizen.dashboard.kpiReview')}
                </div>
                <div className="mt-2 font-mono text-3xl font-bold tabular-nums text-blue-700">
                  {citizenStats.underReview}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t('citizen.dashboard.kpiReviewSub')}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-medium text-slate-500">
                  {t('citizen.dashboard.kpiResolved')}
                </div>
                <div className="mt-2 font-mono text-3xl font-bold tabular-nums text-emerald-700">
                  {citizenStats.resolved}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t('citizen.dashboard.kpiResolvedSub')}
                </div>
              </div>
            </div>

            {/* Pending Offline Queue */}
            {offlineDrafts.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-amber-950">
                      {t('citizen.dashboard.offlineTitle', { count: offlineDrafts.length })}
                    </h2>
                    <p className="text-xs text-amber-800">
                      {t('citizen.dashboard.offlineDesc')}
                    </p>
                  </div>
                  {isOnline && (
                    <button
                      type="button"
                      onClick={() => void onSyncDrafts()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-950 cursor-pointer"
                    >
                      <UploadCloud className="h-3.5 w-3.5" />
                      <span>{t('citizen.dashboard.syncAll')}</span>
                    </button>
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  {offlineDrafts.map((d) => (
                    <div
                      key={d.localId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-4 py-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{d.title}</div>
                        <div className="text-slate-500">
                          {translateCategory(t, d.category)} · {d.locality},{' '}
                          {translateDistrict(t, d.district)} ·{' '}
                          {t('citizen.dashboard.queuedAt', {
                            time: formatLocaleTime(d.queuedAt, i18n.language),
                          })}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onRemoveDraft(d.localId)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{t('citizen.dashboard.discard')}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Updates Table */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  {t('citizen.dashboard.recentTitle')}
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('track')}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
                >
                  {t('citizen.dashboard.viewAll')}
                </button>
              </div>

              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="h-10 w-full animate-pulse rounded bg-slate-100" />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-6 py-3">{t('citizen.dashboard.colId')}</th>
                        <th className="px-4 py-3">{t('citizen.dashboard.colIssue')}</th>
                        <th className="px-4 py-3">{t('citizen.dashboard.colCategory')}</th>
                        <th className="px-4 py-3">{t('citizen.dashboard.colLocation')}</th>
                        <th className="px-4 py-3">{t('citizen.dashboard.colPriority')}</th>
                        <th className="px-6 py-3">{t('citizen.dashboard.colStatus')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {complaints.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                            <div>{t('citizen.dashboard.emptyTitle')}</div>
                            <button
                              type="button"
                              onClick={() => setActiveTab('submit')}
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
                            >
                              <FilePlus2 className="h-3.5 w-3.5" />
                              <span>{t('citizen.dashboard.emptyCta')}</span>
                            </button>
                          </td>
                        </tr>
                      ) : (
                        complaints.slice(0, 8).map((c) => (
                          <tr
                            key={c.id}
                            onClick={() => void openTimeline(c)}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <td className="px-6 py-3.5 font-mono text-xs font-semibold tabular-nums text-slate-800 whitespace-nowrap">
                              {c.complaint_code}
                            </td>
                            <td className="px-4 py-3.5 font-medium text-slate-900 max-w-xs truncate">
                              {c.title}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                              {translateCategory(t, c.category)}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                              {c.locality}, {translateDistrict(t, c.district)}
                            </td>
                            <td className="px-4 py-3.5">
                              <PriorityIndicator level={c.priority_level} score={c.priority_score} />
                            </td>
                            <td className="px-6 py-3.5">
                              <StatusIndicator status={c.status} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SUBMIT A COMPLAINT + AI ANALYSIS */}
        {activeTab === 'submit' && (
          <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  {t('citizen.submit.kicker')}
                </div>
                <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
                  {t('citizen.submit.title')}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('track')}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                {t('citizen.submit.trackLink')}
              </button>
            </div>

            {submitBanner && (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">{t('citizen.submit.recordedTitle')}</div>
                  <div className="text-xs mt-0.5 text-emerald-800">{submitBanner}</div>
                </div>
              </div>
            )}

            {formError && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-8 lg:grid-cols-12 items-start">
              {/* Left Column: Structured Details */}
              <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="complaint-title">
                    {t('citizen.submit.titleLabel')}
                  </label>
                  <input
                    id="complaint-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('citizen.submit.titlePlaceholder')}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="complaint-desc">
                    {t('citizen.submit.descLabel')}
                  </label>
                  <textarea
                    id="complaint-desc"
                    rows={4}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('citizen.submit.descPlaceholder')}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                    {t('citizen.submit.unicodeHint')}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700" htmlFor="complaint-category">
                      {t('citizen.submit.categoryLabel')}
                    </label>
                    <select
                      id="complaint-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as InfrastructureCategory)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    >
                      {INFRASTRUCTURE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {translateCategory(t, cat)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700" htmlFor="complaint-date">
                      {t('citizen.submit.dateLabel')}
                    </label>
                    <input
                      id="complaint-date"
                      type="date"
                      required
                      value={incidentDate}
                      onChange={(e) => setIncidentDate(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700" htmlFor="complaint-district">
                      {t('citizen.submit.districtLabel')}
                    </label>
                    <select
                      id="complaint-district"
                      value={district}
                      onChange={(e) => handleDistrictSelect(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    >
                      {KARNATAKA_DISTRICTS.map((d) => (
                        <option key={d.name} value={d.name}>
                          {translateDistrict(t, d.name)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700" htmlFor="complaint-locality">
                      {t('citizen.submit.localityLabel')}
                    </label>
                    <input
                      id="complaint-locality"
                      type="text"
                      required
                      value={locality}
                      onChange={(e) => setLocality(e.target.value)}
                      placeholder={t('citizen.submit.localityPlaceholder')}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="complaint-location">
                    {t('citizen.submit.locationLabel')}
                  </label>
                  <input
                    id="complaint-location"
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t('citizen.submit.locationPlaceholder')}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700" htmlFor="complaint-contact">
                      {t('citizen.submit.contactLabel')}
                    </label>
                    <input
                      id="complaint-contact"
                      type="text"
                      required
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      placeholder={t('citizen.submit.contactPlaceholder')}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700" htmlFor="complaint-affected">
                      {t('citizen.submit.affectedLabel')}
                    </label>
                    <input
                      id="complaint-affected"
                      type="number"
                      min={1}
                      max={10000}
                      value={affectedCitizens}
                      onChange={(e) => setAffectedCitizens(Math.max(1, Number(e.target.value) || 1))}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm tabular-nums text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    disabled={previewingAI}
                    onClick={() => void handlePreviewAI()}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <span>
                      {previewingAI ? t('citizen.submit.analyzingBtn') : t('citizen.submit.previewBtn')}
                    </span>
                  </button>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>{t('citizen.submit.processingBtn')}</span>
                      </>
                    ) : !isOnline ? (
                      <>
                        <Clock className="h-4 w-4" />
                        <span>{t('citizen.submit.saveDraftBtn')}</span>
                      </>
                    ) : (
                      <span>{t('citizen.submit.submitBtn')}</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column: Interactive Map Picker + Photo Upload */}
              <div className="lg:col-span-5 space-y-6">
                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        {t('citizen.submit.pinTitle')}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {t('citizen.submit.coordinates')}{' '}
                        <span className="font-mono tabular-nums text-slate-700">
                          {latitude.toFixed(5)}, {longitude.toFixed(5)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleUseGps}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      <Crosshair className="h-3.5 w-3.5 text-teal-600" />
                      <span>{t('citizen.submit.useGps')}</span>
                    </button>
                  </div>

                  <KarnatakaMap
                    mode="picker"
                    latitude={latitude}
                    longitude={longitude}
                    onLocationChange={(lat, lng) => {
                      setLatitude(lat);
                      setLongitude(lng);
                    }}
                    heightClass="h-64"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        {t('citizen.submit.uploadTitle')}
                      </h2>
                      <p className="text-xs text-slate-500">{t('citizen.submit.uploadSub')}</p>
                    </div>
                    {imagePreviewUrl && (
                      <button
                        type="button"
                        onClick={clearImage}
                        className="text-xs font-medium text-rose-700 hover:text-rose-800 cursor-pointer"
                      >
                        {t('citizen.submit.removeImg')}
                      </button>
                    )}
                  </div>

                  {imagePreviewUrl ? (
                    <div className="space-y-2">
                      <img
                        src={imagePreviewUrl}
                        alt={t('citizen.submit.uploadTitle')}
                        className="h-48 w-full rounded-lg border border-slate-200 object-cover"
                      />
                      {imageFile && (
                        <div className="text-xs text-slate-500 truncate">
                          {imageFile.name} ({Math.round(imageFile.size / 1024)} KB)
                        </div>
                      )}
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-teal-500 hover:bg-teal-50/30 transition-colors">
                      <ImagePlus className="h-7 w-7 text-slate-400" />
                      <span className="mt-2 text-xs font-semibold text-slate-700">
                        {t('citizen.submit.chooseImg')}
                      </span>
                      <span className="mt-1 text-[11px] text-slate-500">
                        {t('citizen.submit.imgHelp')}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleImageChange(e)}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            </form>

            {/* AI Analysis Result Panel */}
            {latestAnalysis && (
              <AIAnalysisPanel analysis={latestAnalysis.analysis} complaintCode={latestAnalysis.code} />
            )}
          </div>
        )}

        {/* TAB 3: TRACK COMPLAINTS */}
        {activeTab === 'track' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  {t('citizen.track.kicker')}
                </div>
                <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
                  {t('citizen.track.title')}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('submit')}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                <span>{t('citizen.track.newComplaint')}</span>
              </button>
            </div>

            {/* Filters */}
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={trackSearch}
                  onChange={(e) => setTrackSearch(e.target.value)}
                  placeholder={t('citizen.track.searchPlaceholder')}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </div>
              <select
                value={trackCategory}
                onChange={(e) => setTrackCategory(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                <option value="All">{t('citizen.track.allCategories')}</option>
                {INFRASTRUCTURE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {translateCategory(t, cat)}
                  </option>
                ))}
              </select>
              <select
                value={trackStatus}
                onChange={(e) => setTrackStatus(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                <option value="All">{t('citizen.track.allStatuses')}</option>
                {COMPLAINT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {translateStatus(t, st)}
                  </option>
                ))}
              </select>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-6 py-3">{t('citizen.track.colId')}</th>
                      <th className="px-4 py-3">{t('citizen.track.colDate')}</th>
                      <th className="px-4 py-3">{t('citizen.track.colTitleCategory')}</th>
                      <th className="px-4 py-3">{t('citizen.track.colLocation')}</th>
                      <th className="px-4 py-3">{t('citizen.track.colPriority')}</th>
                      <th className="px-6 py-3">{t('citizen.track.colStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTrackList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                          {t('citizen.track.empty')}
                        </td>
                      </tr>
                    ) : (
                      filteredTrackList.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => void openTimeline(c)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-3.5 font-mono text-xs font-semibold tabular-nums text-slate-800 whitespace-nowrap">
                            {c.complaint_code}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                            {formatLocaleDate(c.created_at, i18n.language)}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-slate-900 max-w-sm truncate">{c.title}</div>
                            <div className="text-xs text-slate-500">
                              {translateCategory(t, c.category)}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                            {c.locality}, {translateDistrict(t, c.district)}
                          </td>
                          <td className="px-4 py-3.5">
                            <PriorityIndicator level={c.priority_level} score={c.priority_score} />
                          </td>
                          <td className="px-6 py-3.5">
                            <StatusIndicator status={c.status} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      <ComplaintTimelineModal
        detail={selectedDetail}
        loading={detailLoading}
        onClose={() => {
          setSelectedDetail(null);
          setDetailLoading(false);
        }}
      />
    </div>
  );
};
