import React from 'react';
import { Calendar, CheckCircle2, Languages, MapPin, UserCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  formatLocaleDateTime,
  translateCategory,
  translateDepartment,
  translateDistrict,
  translateLanguageName,
  translateStatus,
} from '../../lib/i18nHelpers.ts';
import type { ComplaintDetail, ComplaintStatus } from '../../types/index.ts';
import { COMPLAINT_STATUSES } from '../../types/index.ts';
import { PriorityIndicator, StatusIndicator } from '../common/SemanticIndicators.tsx';

interface ComplaintTimelineModalProps {
  detail: ComplaintDetail | null;
  loading: boolean;
  onClose: () => void;
}

const LIFECYCLE_STEPS: ComplaintStatus[] = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
];

export const ComplaintTimelineModal: React.FC<ComplaintTimelineModalProps> = ({
  detail,
  loading,
  onClose,
}) => {
  const { t, i18n } = useTranslation();

  if (!detail && !loading) return null;

  const currentStepIndex = detail
    ? detail.status === 'Rejected'
      ? 1
      : Math.max(0, LIFECYCLE_STEPS.indexOf(detail.status))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden my-8">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            {detail ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-800">{detail.complaint_code}</span>
                  <span aria-hidden="true">·</span>
                  <span>{translateCategory(t, detail.category)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{translateDistrict(t, detail.district)}</span>
                  {detail.original_language && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 text-teal-700 font-medium">
                        <Languages className="h-3 w-3" />
                        <span>{translateLanguageName(t, detail.original_language)}</span>
                      </span>
                    </>
                  )}
                  {detail.is_demo && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{t('common.demoRecord')}</span>
                    </>
                  )}
                </div>
                <h3 className="mt-1 font-display text-lg font-bold text-slate-900">{detail.title}</h3>
              </>
            ) : (
              <h3 className="font-display text-base font-semibold text-slate-900">
                {t('citizen.modal.loadingTitle')}
              </h3>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label={t('citizen.modal.closeLabel')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading || !detail ? (
          <div className="p-6 space-y-4">
            <div className="h-6 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-24 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-32 w-full animate-pulse rounded bg-slate-100" />
          </div>
        ) : (
          <div className="max-h-[75vh] overflow-y-auto p-6 space-y-6">
            {/* Status Progress Stepper */}
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusIndicator status={detail.status} />
                <PriorityIndicator level={detail.priority_level} score={detail.priority_score} />
              </div>

              {detail.status === 'Rejected' ? (
                <p className="mt-3 text-xs text-rose-700 font-medium">
                  {t('citizen.modal.rejectedNote')}
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {LIFECYCLE_STEPS.map((step, idx) => {
                    const reached = idx <= currentStepIndex;
                    return (
                      <div key={step} className="space-y-1.5">
                        <div
                          className={`h-1.5 w-full rounded-full ${
                            reached ? 'bg-teal-600' : 'bg-slate-200'
                          }`}
                        />
                        <div
                          className={`text-[11px] font-medium truncate ${
                            reached ? 'text-slate-900' : 'text-slate-400'
                          }`}
                        >
                          {translateStatus(t, step)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Description & Evidence */}
            <div className="grid gap-5 md:grid-cols-5">
              <div className={detail.image_path ? 'md:col-span-3 space-y-3' : 'md:col-span-5 space-y-3'}>
                <p className="text-sm leading-relaxed text-slate-700">{detail.description}</p>
                {detail.original_language &&
                  detail.original_language !== 'en' &&
                  detail.english_description && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs space-y-1">
                      <div className="font-semibold text-blue-900">
                        {t('citizen.aiPanel.englishSummaryTitle')}
                      </div>
                      {detail.english_title && (
                        <div className="font-medium text-slate-900">{detail.english_title}</div>
                      )}
                      <div className="text-slate-700">{detail.english_description}</div>
                    </div>
                  )}
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>
                      {detail.location}, {detail.locality}, {translateDistrict(t, detail.district)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>
                      {t('citizen.modal.submittedOn', {
                        date: formatLocaleDateTime(detail.created_at, i18n.language),
                      })}{' '}
                      ·{' '}
                      {t('citizen.modal.incidentDate', {
                        date: detail.incident_date,
                      })}
                    </span>
                  </div>
                  {detail.assignment && (
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                      <span>
                        {t('citizen.modal.assignedTo')}{' '}
                        <strong>{translateDepartment(t, detail.assignment.department)}</strong> (
                        {detail.assignment.assigned_to})
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {detail.image_path && (
                <div className="md:col-span-2">
                  <img
                    src={detail.image_path}
                    alt={detail.title}
                    referrerPolicy="no-referrer"
                    className="h-40 w-full rounded-lg border border-slate-200 object-cover"
                  />
                </div>
              )}
            </div>

            {/* AI Priority Summary */}
            <div className="rounded-lg border border-slate-200 p-4 text-xs space-y-1.5">
              <div className="font-semibold text-slate-900">{t('citizen.modal.aiTitle')}</div>
              <p className="text-slate-600 leading-relaxed">{detail.ai_explanation}</p>
              <p className="text-teal-800 font-medium">
                {t('citizen.modal.recommendedAction')} {detail.suggested_action}
              </p>
            </div>

            {/* Official Timeline Updates */}
            <div>
              <h4 className="text-xs font-semibold text-slate-700">
                {t('citizen.modal.timelineTitle')}
              </h4>
              <div className="mt-3 space-y-3">
                {detail.updates.map((u) => (
                  <div key={u.id} className="flex gap-3 border-b border-slate-100 pb-3 last:border-none">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-900">
                          {COMPLAINT_STATUSES.includes(u.status)
                            ? translateStatus(t, u.status)
                            : t('citizen.modal.updateLabel')}
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-500">
                          {formatLocaleDateTime(u.updated_at, i18n.language)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{u.remarks}</p>
                      {u.updated_by && (
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {t('citizen.modal.updatedBy', { name: u.updated_by })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
