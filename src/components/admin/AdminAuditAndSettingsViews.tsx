import React, { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  Cpu,
  Database,
  FileSearch,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  fetchAdminSettingsApi,
  fetchAuditLogsApi,
  type AdminSettingsResponse,
} from '../../lib/api.ts';
import { formatLocaleDateTime } from '../../lib/i18nHelpers.ts';
import type { AuditLogEntry, User } from '../../types/index.ts';

// 1. AUDIT LOGS VIEW
interface AdminAuditLogsViewProps {
  refreshTrigger?: number;
}

const AUDIT_ACTION_FILTERS = [
  'All',
  'ADMIN_BOOTSTRAP',
  'INVITE_CREATED',
  'INVITE_REVOKED',
  'OFFICIAL_REGISTERED',
  'OFFICER_STATUS_UPDATED',
  'COMPLAINT_UPDATED',
  'ESCALATION_GENERATED',
  'ESCALATION_SENT',
  'SLA_BREACH_SIMULATED',
];

export const AdminAuditLogsView: React.FC<AdminAuditLogsViewProps> = ({ refreshTrigger = 0 }) => {
  const { t, i18n } = useTranslation();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuditLogsApi({
        search: search.trim() || undefined,
        action: actionFilter !== 'All' ? actionFilter : undefined,
      });
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load governance audit logs.');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, search]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs, refreshTrigger]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-slate-500">
            IMMUTABLE GOVERNANCE & SECURITY ACTIVITY TRAIL
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            {t('adminConsole.auditLogs.title', { defaultValue: 'Audit Logs' })}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void loadLogs()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by actor, email, action, or event detail..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
        >
          {AUDIT_ACTION_FILTERS.map((action) => (
            <option key={action} value={action}>
              {action === 'All' ? 'All Event Types' : action}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-5 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Loading audit log entries...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2">
                      <FileSearch className="h-4 w-4 text-slate-400" />
                      <span>No matching audit log events recorded yet.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {formatLocaleDateTime(entry.created_at, i18n.language)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {entry.actor_name || 'System'}
                      </div>
                      <div className="text-[11px] uppercase text-slate-500">
                        {entry.actor_role || 'system'}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-800">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                      {entry.target_type}
                      {entry.target_id ? ` #${entry.target_id}` : ''}
                    </td>
                    <td className="px-5 py-3 text-slate-700 max-w-md">{entry.details}</td>
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

// 2. SYSTEM SETTINGS VIEW
interface AdminSettingsViewProps {
  currentUser: User;
  refreshTrigger?: number;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({
  currentUser,
  refreshTrigger = 0,
}) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AdminSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchAdminSettingsApi()
      .then((data) => {
        if (active) setSettings(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load settings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshTrigger]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium text-slate-500">PLATFORM CONFIGURATION & SLA POLICY</div>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
          {t('adminConsole.settings.title', { defaultValue: 'System Settings' })}
        </h1>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Official Identity Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-emerald-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Active Official Credentials
            </h2>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
              <dt className="text-slate-500">Full Name</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{currentUser.full_name}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
              <dt className="text-slate-500">Access Tier</dt>
              <dd className="mt-0.5 font-semibold uppercase text-emerald-800">
                {currentUser.role === 'super_admin' ? 'Super Administrator' : 'Municipal Official'}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
              <dt className="text-slate-500">Department</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                {currentUser.department || 'Central Command'}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
              <dt className="text-slate-500">Employee ID / Designation</dt>
              <dd className="mt-0.5 font-mono font-semibold text-slate-900">
                {currentUser.employee_id || '—'} · {currentUser.designation || 'Officer'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Runtime & Security Policy */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-slate-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Governance Runtime & Onboarding Policy
            </h2>
          </div>
          {loading || !settings ? (
            <div className="h-28 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5">
                <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Prototype Mode (Open Email Onboarding & Demo SLA Tools)
                </span>
                <span
                  className={`font-mono font-bold ${
                    settings.prototypeMode ? 'text-emerald-700' : 'text-slate-700'
                  }`}
                >
                  {settings.prototypeMode ? 'ENABLED' : 'STRICT GOV-DOMAIN'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5">
                <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                  <Cpu className="h-4 w-4 text-teal-700" />
                  AI Triage & Escalation Engine
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {settings.aiMode === 'hybrid-gemini' ? 'Hybrid Rules + Gemini' : 'Deterministic Rules Engine'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5">
                <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                  <Database className="h-4 w-4 text-slate-600" />
                  SQLite Operational Store
                </span>
                <span className="font-mono tabular-nums text-slate-800">
                  {settings.counts.totalComplaints} complaints · {settings.counts.totalUsers} users ·{' '}
                  {settings.counts.activeInvites} active invites
                </span>
              </div>
            </div>
          )}
        </div>

        {/* SLA Threshold Matrix */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Statutory SLA Escalation Policy Matrix
            </h2>
          </div>
          {loading || !settings ? (
            <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3 text-xs">
              <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4">
                <div className="font-semibold text-rose-900">Critical Priority (80–100)</div>
                <div className="mt-1 font-mono text-lg font-bold text-rose-800">
                  {settings.slaPolicy.critical.windowHours} Hours
                </div>
                <div className="mt-1 text-rose-800">
                  Immediate public safety / infrastructure hazards. Eligible for escalation after 48h.
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                <div className="font-semibold text-amber-900">High Priority (60–79)</div>
                <div className="mt-1 font-mono text-lg font-bold text-amber-800">
                  {settings.slaPolicy.high.label}
                </div>
                <div className="mt-1 text-amber-800">
                  Major service disruptions & recurrent hotspots. Eligible for escalation after 7 days.
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="font-semibold text-slate-900">Normal Priority (0–59)</div>
                <div className="mt-1 font-mono text-lg font-bold text-slate-800">
                  {settings.slaPolicy.normal.label}
                </div>
                <div className="mt-1 text-slate-600">
                  Routine municipal maintenance & repairs. Eligible for escalation after 15 days.
                </div>
              </div>
            </div>
          )}

          {settings && settings.allowedAdminDomains.length > 0 && (
            <div className="pt-2 border-t border-slate-100 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Configured Official Domains (Production): </span>
              <span className="font-mono">{settings.allowedAdminDomains.join(', ')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
