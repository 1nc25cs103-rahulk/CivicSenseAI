import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  UserCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { translatePriority, translateStatus } from '../../lib/i18nHelpers.ts';
import type { ComplaintStatus, PriorityLevel } from '../../types/index.ts';

export const PriorityIndicator: React.FC<{
  level: PriorityLevel;
  score?: number;
  showScore?: boolean;
}> = ({ level, score, showScore = true }) => {
  const { t } = useTranslation();
  const config: Record<
    PriorityLevel,
    { text: string; icon: React.ReactNode }
  > = {
    Critical: {
      text: 'text-red-700',
      icon: <AlertOctagon className="h-3.5 w-3.5 text-red-600 shrink-0" />,
    },
    High: {
      text: 'text-orange-700',
      icon: <AlertTriangle className="h-3.5 w-3.5 text-orange-600 shrink-0" />,
    },
    Medium: {
      text: 'text-amber-700',
      icon: <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />,
    },
    Low: {
      text: 'text-slate-600',
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />,
    },
  };

  const c = config[level];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${c.text}`}>
      {c.icon}
      <span>{translatePriority(t, level)}</span>
      {showScore && typeof score === 'number' && (
        <span className="font-mono tabular-nums text-slate-500 font-medium">({score})</span>
      )}
    </span>
  );
};

export const StatusIndicator: React.FC<{ status: ComplaintStatus }> = ({ status }) => {
  const { t } = useTranslation();
  const map: Record<ComplaintStatus, { color: string; icon: React.ReactNode }> = {
    Submitted: {
      color: 'text-slate-700',
      icon: <FileText className="h-3.5 w-3.5 text-slate-500 shrink-0" />,
    },
    'Under Review': {
      color: 'text-blue-700',
      icon: <Eye className="h-3.5 w-3.5 text-blue-600 shrink-0" />,
    },
    Assigned: {
      color: 'text-indigo-700',
      icon: <UserCheck className="h-3.5 w-3.5 text-indigo-600 shrink-0" />,
    },
    'In Progress': {
      color: 'text-orange-700',
      icon: <Wrench className="h-3.5 w-3.5 text-orange-600 shrink-0" />,
    },
    Resolved: {
      color: 'text-emerald-700',
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />,
    },
    Rejected: {
      color: 'text-rose-700',
      icon: <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />,
    },
  };

  const item = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${item.color}`}>
      {item.icon}
      <span>{translateStatus(t, status)}</span>
    </span>
  );
};
