import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  createAdminInviteApi,
  fetchAdminInvites,
  fetchOfficersApi,
  revokeAdminInviteApi,
  updateOfficerStatusApi,
} from '../../lib/api.ts';
import { formatLocaleDateTime, translateDepartment } from '../../lib/i18nHelpers.ts';
import type { AccountStatus, AdminInvite, User } from '../../types/index.ts';
import { OFFICIAL_DEPARTMENTS } from '../../types/index.ts';

interface AdminProvisioningViewProps {
  currentUser: User;
  refreshTrigger?: number;
}

type OfficerRow = User & { approver_name?: string | null };

export const AdminProvisioningView: React.FC<AdminProvisioningViewProps> = ({
  currentUser,
  refreshTrigger = 0,
}) => {
  const { t, i18n } = useTranslation();
  const isSuperAdmin = currentUser.role === 'super_admin';

  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Invite creation form
  const [department, setDepartment] = useState<string>(OFFICIAL_DEPARTMENTS[1] ?? 'Roads & Public Works');
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [creating, setCreating] = useState(false);
  const [freshInvite, setFreshInvite] = useState<AdminInvite | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<number | null>(null);
  const [busyOfficerId, setBusyOfficerId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [officerRows, inviteRows] = await Promise.all([
        fetchOfficersApi(),
        isSuperAdmin ? fetchAdminInvites() : Promise.resolve([]),
      ]);
      setOfficers(officerRows);
      setInvites(inviteRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provisioning data.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshTrigger]);

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((prev) => (prev === code ? null : prev)), 2500);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createAdminInviteApi(department, expiresInDays);
      setFreshInvite(created);
      setNotice(
        t('adminConsole.provisioning.createdNotice', {
          defaultValue: `Single-use invite code ${created.code} generated for ${created.department}.`,
          code: created.code,
          department: created.department,
        })
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite code.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeInvite = async (inviteId: number) => {
    if (!isSuperAdmin) return;
    setBusyInviteId(inviteId);
    setError(null);
    setNotice(null);
    try {
      await revokeAdminInviteApi(inviteId);
      setNotice(
        t('adminConsole.provisioning.revokedNotice', {
          defaultValue: 'Invite code revoked and invalidated.',
        })
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invite code.');
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleOfficerStatus = async (officer: OfficerRow, nextStatus: AccountStatus) => {
    if (!isSuperAdmin) return;
    setBusyOfficerId(officer.id);
    setError(null);
    setNotice(null);
    try {
      await updateOfficerStatusApi(officer.id, nextStatus);
      setNotice(`${officer.full_name} account status updated to ${nextStatus}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update official account status.');
    } finally {
      setBusyOfficerId(null);
    }
  };

  const pendingCount = officers.filter((o) => o.account_status === 'pending').length;
  const activeInvitesCount = invites.filter((i) => i.status === 'active').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-slate-500">
            {t('adminConsole.provisioning.kicker', {
              defaultValue: 'TWO-TIER GOVERNMENT ADMINISTRATOR ONBOARDING',
            })}
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            {t('adminConsole.provisioning.title', {
              defaultValue: 'Official Provisioning & Invite Codes',
            })}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh', { defaultValue: 'Refresh' })}</span>
        </button>
      </div>

      {/* Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Total Officials</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {officers.length}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Pending Approvals</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-amber-700">
            {pendingCount}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Active Single-Use Invites</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-emerald-700">
            {isSuperAdmin ? activeInvitesCount : '—'}
          </div>
        </div>
      </div>

      {!isSuperAdmin && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
          <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Read-Only Directory Access</div>
            <p className="mt-0.5 text-amber-900">
              You are signed in as a department official. Only a{' '}
              <span className="font-semibold">Super Administrator</span> can generate single-use invite
              codes or approve/suspend official accounts.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-900">
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Super Admin Invite Code Generator */}
      {isSuperAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              {t('adminConsole.provisioning.generateTitle', {
                defaultValue: 'Generate Single-Use Official Invite Code',
              })}
            </h2>
          </div>

          <form onSubmit={(e) => void handleCreateInvite(e)} className="grid gap-3 md:grid-cols-12 items-end">
            <div className="md:col-span-6">
              <label className="block text-xs font-semibold text-slate-700" htmlFor="invite-dept">
                Target Municipal Department
              </label>
              <select
                id="invite-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                {OFFICIAL_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {translateDepartment(t, dept)}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-700" htmlFor="invite-expiry">
                Validity Window
              </label>
              <select
                id="invite-expiry"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                <option value={1}>24 Hours</option>
                <option value={3}>3 Days</option>
                <option value={7}>7 Days (Recommended)</option>
                <option value={14}>14 Days</option>
                <option value={30}>30 Days</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{creating ? 'Generating...' : 'Generate Invite Code'}</span>
              </button>
            </div>
          </form>

          {freshInvite && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3">
              <div className="space-y-0.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                  Newly Provisioned Single-Use Code ({freshInvite.department})
                </div>
                <div className="font-mono text-lg font-bold tracking-widest text-slate-950">
                  {freshInvite.code}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy(freshInvite.code)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 cursor-pointer"
              >
                {copiedCode === freshInvite.code ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Invite Ledger Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Invite Code</th>
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Expires</th>
                  <th className="px-4 py-2.5">Redeemed By</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invites.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No official invite codes have been generated yet.
                    </td>
                  </tr>
                ) : (
                  invites.map((inv) => {
                    const statusStyle =
                      inv.status === 'active'
                        ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                        : inv.status === 'used'
                        ? 'text-blue-800 bg-blue-50 border-blue-200'
                        : 'text-slate-600 bg-slate-100 border-slate-200';
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-mono font-bold tracking-wider text-slate-900">
                          {inv.code}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{inv.department}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-block rounded border px-2 py-0.5 text-[11px] font-semibold uppercase ${statusStyle}`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-500">
                          {formatLocaleDateTime(inv.expires_at, i18n.language)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {inv.used_by_name ? inv.used_by_name : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {inv.status === 'active' ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleCopy(inv.code)}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                              >
                                {copiedCode === inv.code ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                <span>{copiedCode === inv.code ? 'Copied' : 'Copy'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={busyInviteId === inv.id}
                                onClick={() => void handleRevokeInvite(inv.id)}
                                className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>Revoke</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Official Accounts & Approvals Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              {t('adminConsole.provisioning.officersTitle', {
                defaultValue: 'Registered Government Officials & Pending Approvals',
              })}
            </h2>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {officers.length} accounts
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Official</th>
                <th className="px-4 py-3">Department & Designation</th>
                <th className="px-4 py-3">Employee ID</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Governance Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    Loading official accounts...
                  </td>
                </tr>
              ) : officers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    No government official accounts found.
                  </td>
                </tr>
              ) : (
                officers.map((officer) => {
                  const isSelf = officer.id === currentUser.id;
                  const statusClass =
                    officer.account_status === 'active'
                      ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                      : officer.account_status === 'pending'
                      ? 'text-amber-800 bg-amber-50 border-amber-200'
                      : 'text-rose-800 bg-rose-50 border-rose-200';
                  return (
                    <tr key={officer.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-900">
                          {officer.full_name}
                          {isSelf && (
                            <span className="ml-1.5 text-[11px] font-medium text-emerald-700">
                              (You)
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500">{officer.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">
                          {officer.department || 'Central Command'}
                        </div>
                        <div className="text-slate-500">{officer.designation || 'Civic Administrator'}</div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                        {officer.employee_id || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                          {officer.role === 'super_admin' && (
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                          )}
                          <span>{officer.role === 'super_admin' ? 'Super Admin' : 'Official'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-[11px] font-semibold uppercase ${statusClass}`}
                        >
                          {officer.account_status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {isSuperAdmin && !isSelf ? (
                          <div className="inline-flex items-center gap-2">
                            {officer.account_status !== 'active' && (
                              <button
                                type="button"
                                disabled={busyOfficerId === officer.id}
                                onClick={() => void handleOfficerStatus(officer, 'active')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                <span>
                                  {officer.account_status === 'pending' ? 'Approve' : 'Reactivate'}
                                </span>
                              </button>
                            )}
                            {officer.account_status !== 'suspended' && (
                              <button
                                type="button"
                                disabled={busyOfficerId === officer.id}
                                onClick={() => void handleOfficerStatus(officer, 'suspended')}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                              >
                                <UserX className="h-3.5 w-3.5" />
                                <span>Suspend</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
