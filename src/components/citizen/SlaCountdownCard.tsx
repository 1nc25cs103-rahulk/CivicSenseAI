import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileWarning, Scale, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { evaluateComplaintSla } from '../../../shared/sla.ts';
import { formatLocaleDate } from '../../lib/i18nHelpers.ts';
import type { Complaint } from '../../types/index.ts';

interface SlaCountdownCardProps {
  complaint: Complaint;
  prototypeMode: boolean;
  simulatingId: number | null;
  onSimulateBreach: (complaint: Complaint) => void;
  onOpenEscalation: (complaint: Complaint) => void;
  onInspectTimeline: (complaintId: number) => void;
}

export const SlaCountdownCard: React.FC<SlaCountdownCardProps> = ({
  complaint,
  prototypeMode,
  simulatingId,
  onSimulateBreach,
  onOpenEscalation,
  onInspectTimeline,
}) => {
  const { t, i18n } = useTranslation();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const sla = evaluateComplaintSla(complaint, nowMs);

  const stateConfig = {
    within_sla: {
      label: t('sla.withinSla'),
      textColor: 'text-emerald-700',
      barColor: 'bg-emerald-500',
      borderClass: 'border-slate-200',
      Icon: Clock,
    },
    approaching: {
      label: t('sla.approaching'),
      textColor: 'text-amber-700',
      barColor: 'bg-amber-500',
      borderClass: 'border-amber-200',
      Icon: Timer,
    },
    breached: {
      label: t('sla.breached'),
      textColor: 'text-red-700',
      barColor: 'bg-red-600',
      borderClass: 'border-red-300',
      Icon: AlertTriangle,
    },
    escalated: {
      label: t('sla.escalated'),
      textColor: 'text-red-800',
      barColor: 'bg-red-700',
      borderClass: 'border-red-300 bg-red-50/40',
      Icon: Scale,
    },
    resolved: {
      label: t('sla.resolved'),
      textColor: 'text-emerald-700',
      barColor: 'bg-emerald-600',
      borderClass: 'border-slate-200',
      Icon: CheckCircle2,
    },
  }[sla.state];

  const StateIcon = stateConfig.Icon;

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-xs transition-colors ${stateConfig.borderClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => onInspectTimeline(complaint.id)}
              className="font-mono font-semibold text-slate-900 hover:text-teal-700 hover:underline cursor-pointer"
            >
              {complaint.complaint_code}
            </button>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums font-semibold text-slate-700">
              {complaint.priority_score}/100 ({complaint.priority_level})
            </span>
            <span aria-hidden="true">·</span>
            <span>SLA {sla.windowLabel}</span>
            {complaint.sla_breach_simulated && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-amber-700">Demo Breach</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => onInspectTimeline(complaint.id)}
            className="mt-1 block truncate text-left font-display text-sm font-bold text-slate-900 hover:text-teal-700 cursor-pointer"
          >
            {complaint.title}
          </button>
          <div className="mt-0.5 text-xs text-slate-500 truncate">
            {complaint.locality}, {complaint.district} · {t('sla.deadlineLabel')}:{' '}
            <span className="font-mono tabular-nums">{formatLocaleDate(sla.deadlineIso, i18n.language)}</span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className={`inline-flex items-center gap-1.5 text-xs font-bold ${stateConfig.textColor}`}>
            <StateIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{stateConfig.label}</span>
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums text-slate-600">
            {sla.isResolved
              ? complaint.status
              : sla.isBreached
                ? t('sla.overdueBy', { delta: sla.formattedDelta })
                : t('sla.timeLeft', { delta: sla.formattedDelta })}
          </div>
        </div>
      </div>

      {/* SLA Progress Bar */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${stateConfig.barColor}`}
          style={{ width: `${sla.progressPercent}%` }}
        />
      </div>

      {/* Actions Row */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>Status: {complaint.status}</span>
          {complaint.escalation_notice_sent_at && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-emerald-700">
                {t('sla.sentBadge')} ({formatLocaleDate(complaint.escalation_notice_sent_at, i18n.language)})
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {prototypeMode && !sla.isResolved && !sla.isBreached && (
            <button
              type="button"
              disabled={simulatingId === complaint.id}
              onClick={() => onSimulateBreach(complaint)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60 cursor-pointer"
            >
              <FileWarning className="h-3.5 w-3.5 text-amber-600" />
              <span>
                {simulatingId === complaint.id ? 'Simulating...' : t('sla.simulateBreach')}
              </span>
            </button>
          )}

          {(sla.isBreached || complaint.escalation_notice_generated) && !sla.isResolved && (
            <button
              type="button"
              onClick={() => onOpenEscalation(complaint)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>
                {complaint.escalation_notice_generated
                  ? t('sla.viewNotice')
                  : t('sla.generateNotice')}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
