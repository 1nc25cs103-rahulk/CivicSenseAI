import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Languages,
  MapPin,
  Save,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { evaluateComplaintSla } from '../../../shared/sla.ts';
import { fetchComplaintDetail, updateComplaintAdmin } from '../../lib/api.ts';
import {
  formatLocaleDateTime,
  translateCategory,
  translateDepartment,
  translateDistrict,
  translateLanguageName,
  translateStatus,
} from '../../lib/i18nHelpers.ts';
import type { ComplaintDetail, ComplaintStatus } from '../../types/index.ts';
import { COMPLAINT_STATUSES, MUNICIPAL_DEPARTMENTS } from '../../types/index.ts';
import { PriorityIndicator, StatusIndicator } from '../common/SemanticIndicators.tsx';

interface AdminComplaintInspectorProps {
  complaintId: number | null;
  adminName: string;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onSelectRelatedId: (id: number) => void;
}

export const AdminComplaintInspector: React.FC<AdminComplaintInspectorProps> = ({
  complaintId,
  adminName,
  onClose,
  onUpdated,
  onSelectRelatedId,
}) => {
  const { t, i18n } = useTranslation();
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [textViewMode, setTextViewMode] = useState<'original' | 'english'>('original');
  const [showEscalationDoc, setShowEscalationDoc] = useState(false);

  const [status, setStatus] = useState<ComplaintStatus>('Submitted');
  const [department, setDepartment] = useState<string>(MUNICIPAL_DEPARTMENTS[0]);
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  useEffect(() => {
    setTextViewMode('original');
    setShowEscalationDoc(false);
  }, [complaintId]);

  useEffect(() => {
    if (!complaintId) {
      setDetail(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setSaveSuccess(null);
    setRemarks('');

    fetchComplaintDetail(complaintId)
      .then((d) => {
        if (!active) return;
        setDetail(d);
        setStatus(d.status);
        setDepartment(d.assignment?.department ?? MUNICIPAL_DEPARTMENTS[0]);
        setAssignedTo(d.assignment?.assigned_to ?? '');
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : t('admin.inspector.loadingTitle'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [complaintId, i18n.language, t]);

  if (!complaintId) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(null);

    try {
      await updateComplaintAdmin(detail.id, {
        status,
        department,
        assigned_to: assignedTo.trim() || 'Duty Municipal Engineer',
        remarks: remarks.trim() || undefined,
        updated_by: `${adminName} (Admin)`,
      });
      const refreshed = await fetchComplaintDetail(detail.id);
      setDetail(refreshed);
      setRemarks('');
      setSaveSuccess(t('admin.inspector.saveSuccess'));
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save administrative update.');
    } finally {
      setSaving(false);
    }
  };

  const detectedLangCode = detail?.original_language || 'en';
  const detectedLangName = translateLanguageName(t, detectedLangCode);
  const hasEnglishTranslation = Boolean(
    detail && (detail.english_title || detail.english_description || detail.english_location)
  );
  const showingEnglish = Boolean(detail && textViewMode === 'english' && hasEnglishTranslation);

  const displayedTitle = detail
    ? showingEnglish
      ? detail.english_title || detail.title
      : detail.title
    : '';
  const displayedDescription = detail
    ? showingEnglish
      ? detail.english_description || detail.description
      : detail.description
    : '';
  const displayedLocation = detail
    ? showingEnglish
      ? detail.english_location || detail.location
      : detail.location
    : '';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50">
      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl border-l border-slate-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            {detail ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-800">{detail.complaint_code}</span>
                  <span aria-hidden="true">·</span>
                  <span>{translateDistrict(t, detail.district)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{translateCategory(t, detail.category)}</span>
                  {detail.is_demo && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{t('common.demoRecord')}</span>
                    </>
                  )}
                </div>
                <h2 className="mt-1 font-display text-lg font-bold text-slate-900">{displayedTitle}</h2>
              </>
            ) : (
              <h2 className="font-display text-base font-semibold text-slate-900">
                {t('admin.inspector.loadingTitle')}
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label={t('admin.inspector.closeLabel')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading || !detail ? (
            <div className="space-y-4">
              <div className="h-24 w-full animate-pulse rounded-lg bg-slate-100" />
              <div className="h-40 w-full animate-pulse rounded-lg bg-slate-100" />
              <div className="h-40 w-full animate-pulse rounded-lg bg-slate-100" />
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">{error}</div>
              )}
              {saveSuccess && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{saveSuccess}</span>
                </div>
              )}

              {detail.critical_safety_flag && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-950">
                  <ShieldAlert className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{t('admin.inspector.criticalTitle')}</span>{' '}
                    {t('admin.inspector.criticalDesc')}
                  </div>
                </div>
              )}

              {/* SLA Deadline & Legal Escalation Alert */}
              {(() => {
                const sla = evaluateComplaintSla(detail);
                const escalated = Boolean(
                  detail.escalation_notice_generated || detail.escalation_notice_sent_at
                );
                return (
                  <div className="space-y-3">
                    {escalated && (
                      <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-950 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 font-bold text-rose-900">
                            <span>⚠️ Legal / SLA Escalation Issued</span>
                          </div>
                          {detail.escalation_document && (
                            <button
                              type="button"
                              onClick={() => setShowEscalationDoc((prev) => !prev)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-900 hover:bg-rose-100 cursor-pointer"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>{showEscalationDoc ? 'Hide Notice' : 'View Formal Notice'}</span>
                            </button>
                          )}
                        </div>
                        <p className="text-rose-900">
                          Citizen generated a formal statutory grievance / RTI escalation notice (
                          {(detail.escalation_language || 'en').toUpperCase()})
                          {detail.escalation_notice_sent_at
                            ? ` and marked it sent on ${formatLocaleDateTime(detail.escalation_notice_sent_at, i18n.language)}.`
                            : '.'}
                        </p>
                        {showEscalationDoc && detail.escalation_document && (
                          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-rose-200 bg-white p-3 font-sans text-[11px] leading-relaxed text-slate-800">
                            {detail.escalation_document}
                          </pre>
                        )}
                      </div>
                    )}

                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-xs ${
                        sla.isBreached
                          ? 'border-rose-200 bg-rose-50/70 text-rose-950'
                          : sla.state === 'approaching'
                          ? 'border-amber-200 bg-amber-50/70 text-amber-950'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 shrink-0" />
                        <span className="font-semibold">SLA Target ({sla.windowLabel}):</span>
                        <span className="font-mono font-bold">
                          {sla.isResolved
                            ? 'Resolved'
                            : sla.isBreached
                            ? `Overdue by ${sla.formattedDelta}`
                            : `${sla.formattedDelta} remaining`}
                        </span>
                      </div>
                      <span className="font-mono text-[11px]">
                        Deadline: {formatLocaleDateTime(sla.deadlineIso, i18n.language)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Detected Language + Original vs. English Translation Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
                <div className="flex items-center gap-2">
                  <Languages className="h-4 w-4 text-teal-700 shrink-0" />
                  <span className="text-slate-600">{t('admin.inspector.detectedLanguage')}</span>
                  <span className="font-semibold text-slate-900">{detectedLangName}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600">
                    {showingEnglish
                      ? t('admin.inspector.showingTranslation')
                      : t('admin.inspector.showingOriginal', { lang: detectedLangName })}
                  </span>
                </div>

                {(detectedLangCode !== 'en' || hasEnglishTranslation) && (
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setTextViewMode('original')}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                        textViewMode === 'original'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t('admin.inspector.viewOriginal')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextViewMode('english')}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                        textViewMode === 'english'
                          ? 'bg-teal-700 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t('admin.inspector.viewEnglish')}
                    </button>
                  </div>
                )}
              </div>

              {/* Overview & Photo */}
              <div className="grid gap-5 md:grid-cols-5">
                <div className={detail.image_path ? 'md:col-span-3 space-y-3' : 'md:col-span-5 space-y-3'}>
                  <div className="flex flex-wrap items-center gap-4">
                    <PriorityIndicator level={detail.priority_level} score={detail.priority_score} />
                    <StatusIndicator status={detail.status} />
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">{displayedDescription}</p>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>
                        {displayedLocation}, {detail.locality}, {translateDistrict(t, detail.district)} (
                        <span className="font-mono tabular-nums">
                          {detail.latitude.toFixed(4)}, {detail.longitude.toFixed(4)}
                        </span>
                        )
                      </span>
                    </div>
                    <div>
                      {t('admin.inspector.affectedCitizens')}{' '}
                      <strong className="font-mono tabular-nums">{detail.affected_citizens}</strong> ·{' '}
                      {t('admin.inspector.areaReports')}{' '}
                      <strong className="font-mono tabular-nums">{detail.area_complaint_count}</strong>
                    </div>
                    <div>
                      {t('admin.inspector.reporter')} {detail.reporter_name} ·{' '}
                      {t('admin.inspector.contact')} {detail.contact_info}
                    </div>
                  </div>
                </div>

                {detail.image_path && (
                  <div className="md:col-span-2">
                    <img
                      src={detail.image_path}
                      alt={displayedTitle}
                      referrerPolicy="no-referrer"
                      className="h-44 w-full rounded-lg border border-slate-200 object-cover"
                    />
                  </div>
                )}
              </div>

              {/* AI Triage Breakdown */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-900">
                    {t('admin.inspector.aiTitle', {
                      source:
                        detail.ai_source === 'hybrid-gemini'
                          ? t('admin.inspector.hybridSource')
                          : t('admin.inspector.rulesSource'),
                    })}
                  </div>
                  <span className="font-mono text-xs font-bold tabular-nums text-slate-800">
                    {t('admin.inspector.scoreLabel', { score: detail.priority_score })}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-600">{detail.ai_explanation}</p>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-md bg-white p-2 border border-slate-200">
                    {t('admin.inspector.factorSeverity')}{' '}
                    <strong className="font-mono">{detail.factor_breakdown.severityPoints}/30</strong>
                  </div>
                  <div className="rounded-md bg-white p-2 border border-slate-200">
                    {t('admin.inspector.factorSafety')}{' '}
                    <strong className="font-mono">{detail.factor_breakdown.safetyRiskPoints}/25</strong>
                  </div>
                  <div className="rounded-md bg-white p-2 border border-slate-200">
                    {t('admin.inspector.factorDuplicates')}{' '}
                    <strong className="font-mono">{detail.factor_breakdown.duplicatePoints}/15</strong>
                  </div>
                  <div className="rounded-md bg-white p-2 border border-slate-200">
                    {t('admin.inspector.factorCitizens')}{' '}
                    <strong className="font-mono">
                      {detail.factor_breakdown.affectedCitizensPoints}/10
                    </strong>
                  </div>
                  <div className="rounded-md bg-white p-2 border border-slate-200">
                    {t('admin.inspector.factorFreq')}{' '}
                    <strong className="font-mono">
                      {detail.factor_breakdown.areaFrequencyPoints}/10
                    </strong>
                  </div>
                  <div className="rounded-md bg-white p-2 border border-slate-200">
                    {t('admin.inspector.factorAge')}{' '}
                    <strong className="font-mono">{detail.factor_breakdown.agePoints}/10</strong>
                  </div>
                </div>
                <div className="text-xs text-teal-900 font-medium">
                  {t('admin.inspector.suggestedAction')} {detail.suggested_action}
                </div>
                <div className="flex items-start gap-1.5 text-[11px] text-slate-500">
                  <AlertOctagon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{t('admin.inspector.rulesNote')}</span>
                </div>
              </div>

              {/* Duplicate Detection Panel */}
              {detail.duplicates.length > 0 && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-orange-950">
                    <Copy className="h-4 w-4 text-orange-600 shrink-0" />
                    <span>
                      {t('admin.inspector.duplicatesTitle', { count: detail.duplicates.length })}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {detail.duplicates.map((d) => (
                      <div
                        key={d.related_complaint_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs"
                      >
                        <div>
                          <button
                            type="button"
                            onClick={() => onSelectRelatedId(d.related_complaint_id)}
                            className="font-mono font-semibold text-blue-700 hover:underline cursor-pointer"
                          >
                            ID #{d.related_complaint_id}
                          </button>
                          <span className="mx-1.5 text-slate-400">·</span>
                          <span className="font-medium text-slate-900">{d.related_title}</span>
                          {d.reason && <div className="text-[11px] text-slate-500">{d.reason}</div>}
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-orange-700">
                          {t('common.matchPercent', { score: d.similarity_score })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Administrative Action Form */}
              <form onSubmit={(e) => void handleSave(e)} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Building2 className="h-4 w-4 text-slate-700" />
                  <span>{t('admin.inspector.formTitle')}</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700" htmlFor="admin-status">
                      {t('admin.inspector.statusLabel')}
                    </label>
                    <select
                      id="admin-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ComplaintStatus)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    >
                      {COMPLAINT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {translateStatus(t, s)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700" htmlFor="admin-dept">
                      {t('admin.inspector.departmentLabel')}
                    </label>
                    <select
                      id="admin-dept"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    >
                      {MUNICIPAL_DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>
                          {translateDepartment(t, dept)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="admin-officer">
                    {t('admin.inspector.officerLabel')}
                  </label>
                  <input
                    id="admin-officer"
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder={t('admin.inspector.officerPlaceholder')}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="admin-remarks">
                    {t('admin.inspector.remarksLabel')}
                  </label>
                  <textarea
                    id="admin-remarks"
                    rows={2}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder={t('admin.inspector.remarksPlaceholder')}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>
                      {saving ? t('admin.inspector.savingBtn') : t('admin.inspector.saveBtn')}
                    </span>
                  </button>
                </div>
              </form>

              {/* Audit Timeline */}
              <div>
                <h3 className="text-xs font-semibold text-slate-700">
                  {t('admin.inspector.auditTitle')}
                </h3>
                <div className="mt-3 space-y-2.5">
                  {detail.updates.map((u) => (
                    <div key={u.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {COMPLAINT_STATUSES.includes(u.status)
                            ? translateStatus(t, u.status)
                            : t('citizen.modal.updateLabel')}
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-500">
                          {formatLocaleDateTime(u.updated_at, i18n.language)}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-600">{u.remarks}</p>
                      {u.updated_by && <div className="mt-0.5 text-[11px] text-slate-400">{u.updated_by}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
