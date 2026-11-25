import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Clock,
  Eye,
  FileWarning,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { evaluateComplaintSla } from '../../../shared/sla.ts';
import {
  formatLocaleDate,
  formatLocaleDateTime,
  translateCategory,
  translateDepartment,
  translateDistrict,
} from '../../lib/i18nHelpers.ts';
import type { Complaint } from '../../types/index.ts';
import { MUNICIPAL_DEPARTMENTS } from '../../types/index.ts';
import { PriorityIndicator, StatusIndicator } from '../common/SemanticIndicators.tsx';

// 1. DEPARTMENT MANAGEMENT VIEW
interface AdminDepartmentManagementViewProps {
  complaints: Complaint[];
  onInspectComplaintId: (id: number) => void;
}

export const AdminDepartmentManagementView: React.FC<AdminDepartmentManagementViewProps> = ({
  complaints,
  onInspectComplaintId,
}) => {
  const { t } = useTranslation();
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');

  const departmentStats = useMemo(() => {
    const map = new Map<
      string,
      {
        department: string;
        total: number;
        open: number;
        critical: number;
        breached: number;
        resolved: number;
        avgScore: number;
        scoreSum: number;
      }
    >();

    MUNICIPAL_DEPARTMENTS.forEach((dept) => {
      map.set(dept, {
        department: dept,
        total: 0,
        open: 0,
        critical: 0,
        breached: 0,
        resolved: 0,
        avgScore: 0,
        scoreSum: 0,
      });
    });

    complaints.forEach((c) => {
      const dept = c.department || 'Unassigned / Central Intake';
      if (!map.has(dept)) {
        map.set(dept, {
          department: dept,
          total: 0,
          open: 0,
          critical: 0,
          breached: 0,
          resolved: 0,
          avgScore: 0,
          scoreSum: 0,
        });
      }
      const row = map.get(dept)!;
      const sla = evaluateComplaintSla(c);
      row.total += 1;
      row.scoreSum += c.priority_score;
      if (c.status === 'Resolved') row.resolved += 1;
      else if (c.status !== 'Rejected') row.open += 1;
      if (c.priority_level === 'Critical') row.critical += 1;
      if (sla.isBreached) row.breached += 1;
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        avgScore: row.total > 0 ? Math.round(row.scoreSum / row.total) : 0,
      }))
      .sort((a, b) => b.open - a.open || b.breached - a.breached);
  }, [complaints]);

  const filteredQueue = useMemo(() => {
    return complaints
      .filter((c) => {
        if (selectedDepartment === 'All') return true;
        const dept = c.department || 'Unassigned / Central Intake';
        return dept === selectedDepartment;
      })
      .sort((a, b) => b.priority_score - a.priority_score);
  }, [complaints, selectedDepartment]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium text-slate-500">DEPARTMENTAL WORKLOAD & ROUTING</div>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
          {t('adminConsole.departments.title', { defaultValue: 'Department Management' })}
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {departmentStats.map((dept) => {
          const isSelected = selectedDepartment === dept.department;
          return (
            <button
              key={dept.department}
              type="button"
              onClick={() =>
                setSelectedDepartment((prev) => (prev === dept.department ? 'All' : dept.department))
              }
              className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2
                    className={`h-4 w-4 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`}
                  />
                  <span className="font-semibold text-sm truncate">
                    {translateDepartment(t, dept.department)}
                  </span>
                </div>
                <span
                  className={`font-mono text-xs font-bold tabular-nums ${
                    isSelected ? 'text-emerald-300' : 'text-slate-600'
                  }`}
                >
                  {dept.total} total
                </span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <div>
                  <div className={isSelected ? 'text-slate-400' : 'text-slate-500'}>Open</div>
                  <div className="font-mono font-bold tabular-nums">{dept.open}</div>
                </div>
                <div>
                  <div className={isSelected ? 'text-slate-400' : 'text-slate-500'}>Critical</div>
                  <div className={`font-mono font-bold tabular-nums ${isSelected ? 'text-rose-300' : 'text-rose-700'}`}>
                    {dept.critical}
                  </div>
                </div>
                <div>
                  <div className={isSelected ? 'text-slate-400' : 'text-slate-500'}>Breached</div>
                  <div className={`font-mono font-bold tabular-nums ${isSelected ? 'text-amber-300' : 'text-amber-700'}`}>
                    {dept.breached}
                  </div>
                </div>
                <div>
                  <div className={isSelected ? 'text-slate-400' : 'text-slate-500'}>Resolved</div>
                  <div className={`font-mono font-bold tabular-nums ${isSelected ? 'text-emerald-300' : 'text-emerald-700'}`}>
                    {dept.resolved}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
          <div className="text-sm font-semibold text-slate-900">
            {selectedDepartment === 'All'
              ? 'All Departmental Assignments'
              : `Assigned Queue: ${translateDepartment(t, selectedDepartment)}`}
          </div>
          {selectedDepartment !== 'All' && (
            <button
              type="button"
              onClick={() => setSelectedDepartment('All')}
              className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              Show All Departments
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Ticket</th>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Officer</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredQueue.slice(0, 20).map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onInspectComplaintId(c.id)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-5 py-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                    {c.complaint_code}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate font-medium text-slate-900">{c.title}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {c.department ? translateDepartment(t, c.department) : 'Unassigned'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {c.assigned_to || 'Pending Assignment'}
                  </td>
                  <td className="px-4 py-3">
                    <PriorityIndicator level={c.priority_level} score={c.priority_score} />
                  </td>
                  <td className="px-5 py-3">
                    <StatusIndicator status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// 2. SLA BREACH MONITORING VIEW
interface AdminSlaBreachesViewProps {
  complaints: Complaint[];
  onInspectComplaintId: (id: number) => void;
}

export const AdminSlaBreachesView: React.FC<AdminSlaBreachesViewProps> = ({
  complaints,
  onInspectComplaintId,
}) => {
  const { t, i18n } = useTranslation();
  const [filterMode, setFilterMode] = useState<'all_risk' | 'breached' | 'approaching'>('all_risk');

  const evaluated = useMemo(() => {
    return complaints
      .filter((c) => c.status !== 'Resolved' && c.status !== 'Rejected')
      .map((complaint) => ({
        complaint,
        sla: evaluateComplaintSla(complaint),
      }))
      .sort((a, b) => a.sla.remainingMs - b.sla.remainingMs);
  }, [complaints]);

  const breachedItems = evaluated.filter((item) => item.sla.isBreached);
  const approachingItems = evaluated.filter((item) => item.sla.state === 'approaching');
  const withinItems = evaluated.filter((item) => item.sla.state === 'within_sla');

  const visibleRows = useMemo(() => {
    if (filterMode === 'breached') return breachedItems;
    if (filterMode === 'approaching') return approachingItems;
    return [...breachedItems, ...approachingItems];
  }, [approachingItems, breachedItems, filterMode]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-slate-500">
            CITIZEN CHARTER & SAKALA DEADLINE COMPLIANCE
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            {t('adminConsole.slaBreaches.title', { defaultValue: 'SLA Breach Monitoring' })}
          </h1>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-xs">
          {[
            { id: 'all_risk', label: `At Risk & Breached (${breachedItems.length + approachingItems.length})` },
            { id: 'breached', label: `Breached (${breachedItems.length})` },
            { id: 'approaching', label: `Approaching (${approachingItems.length})` },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setFilterMode(btn.id as 'all_risk' | 'breached' | 'approaching')}
              className={`rounded-md px-3 py-1.5 font-semibold cursor-pointer ${
                filterMode === btn.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-rose-800">
            <span>SLA Breached</span>
            <FileWarning className="h-4 w-4" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-rose-900">
            {breachedItems.length}
          </div>
          <div className="mt-1 text-[11px] text-rose-800">Immediate commissioner / ward review required</div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
            <span>Approaching Deadline (&lt;25% left)</span>
            <Clock className="h-4 w-4" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-amber-900">
            {approachingItems.length}
          </div>
          <div className="mt-1 text-[11px] text-amber-800">Dispatch field teams before SLA expiry</div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
            <span>Within SLA Window</span>
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-900">
            {withinItems.length}
          </div>
          <div className="mt-1 text-[11px] text-emerald-800">48h Critical · 7d High · 15d Normal</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Ticket</th>
                <th className="px-4 py-3">Complaint</th>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">SLA Tier</th>
                <th className="px-4 py-3">Deadline Status</th>
                <th className="px-4 py-3">Escalation</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">
                    No active complaints match this SLA filter.
                  </td>
                </tr>
              ) : (
                visibleRows.map(({ complaint: c, sla }) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {c.complaint_code}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-slate-900 truncate">{c.title}</div>
                      <div className="text-[11px] text-slate-500">{translateCategory(t, c.category)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {translateDistrict(t, c.district)}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                      {sla.windowLabel} ({c.priority_score}/100)
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div
                        className={`font-mono font-semibold ${
                          sla.isBreached ? 'text-rose-700' : 'text-amber-700'
                        }`}
                      >
                        {sla.isBreached
                          ? `Overdue by ${sla.formattedDelta}`
                          : `${sla.formattedDelta} remaining`}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Due {formatLocaleDate(sla.deadlineIso, i18n.language)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.escalation_notice_generated || c.escalation_notice_sent_at ? (
                        <span className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Legal / SLA Escalation Issued</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Not Issued</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => onInspectComplaintId(c.id)}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// 3. LEGAL ESCALATION TRACKING VIEW
interface AdminLegalEscalationsViewProps {
  complaints: Complaint[];
  onInspectComplaintId: (id: number) => void;
}

export const AdminLegalEscalationsView: React.FC<AdminLegalEscalationsViewProps> = ({
  complaints,
  onInspectComplaintId,
}) => {
  const { t, i18n } = useTranslation();
  const [previewComplaint, setPreviewComplaint] = useState<Complaint | null>(null);

  const escalatedComplaints = useMemo(() => {
    return complaints
      .filter((c) => Boolean(c.escalation_notice_generated || c.escalation_notice_sent_at))
      .sort((a, b) => {
        const aTime = new Date(a.escalation_notice_sent_at ?? a.updated_at).getTime();
        const bTime = new Date(b.escalation_notice_sent_at ?? b.updated_at).getTime();
        return bTime - aTime;
      });
  }, [complaints]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium text-slate-500">
          FORMAL CITIZEN ESCALATION & RTI NOTICE LEDGER
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
          {t('adminConsole.escalations.title', { defaultValue: 'Legal Escalation Tracking' })}
        </h1>
      </div>

      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-950 flex items-start gap-3">
        <Scale className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">
            {escalatedComplaints.length} Complaint(s) Flagged with Formal Citizen Escalation Notices
          </div>
          <p className="mt-0.5 text-rose-900">
            Complaints listed here have exceeded their statutory SLA deadline and the citizen has
            generated or dispatched a formal statutory grievance / RTI notice citing the Karnataka
            Municipal Corporations Act, Sakala Services Act, and RTI Act, 2005.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-3">Ticket</th>
                <th className="px-3 py-3">Complaint & District</th>
                <th className="px-3 py-3">Escalation Status</th>
                <th className="px-3 py-3">Method</th>
                <th className="px-3 py-3">Dispatched</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {escalatedComplaints.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">
                    No legal or SLA escalation notices have been generated yet.
                  </td>
                </tr>
              ) : (
                escalatedComplaints.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {c.complaint_code}
                    </td>
                    <td className="px-3 py-3 max-w-[220px]">
                      <div className="font-medium text-slate-900 truncate">{c.title}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {c.locality}, {translateDistrict(t, c.district)}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                        ⚠️ Legal / SLA Escalation Issued
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                      {(c.escalation_language || 'en').toUpperCase()} ·{' '}
                      {c.escalation_generation_method === 'gemini' ? 'Gemini AI' : 'Template'}
                    </td>
                    <td className="px-3 py-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {c.escalation_notice_sent_at
                        ? formatLocaleDateTime(c.escalation_notice_sent_at, i18n.language)
                        : 'Generated (Draft)'}
                    </td>
                    <td className="px-3 py-3">
                      <StatusIndicator status={c.status} />
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {c.escalation_document && (
                          <button
                            type="button"
                            onClick={() => setPreviewComplaint(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onInspectComplaintId(c.id)}
                          className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
                        >
                          Inspect
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewComplaint && previewComplaint.escalation_document && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-mono text-xs font-semibold text-rose-700">
                {previewComplaint.complaint_code} — Stored Escalation Notice Preview
              </div>
              <div className="text-sm font-bold text-slate-900">{previewComplaint.title}</div>
            </div>
            <button
              type="button"
              onClick={() => setPreviewComplaint(null)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Close Preview
            </button>
          </div>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-sans text-xs leading-relaxed text-slate-800">
            {previewComplaint.escalation_document}
          </pre>
        </div>
      )}
    </div>
  );
};
