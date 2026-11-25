import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  BrainCircuit,
  Building2,
  Clock,
  Download,
  FileSearch,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Menu,
  Scale,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { evaluateComplaintSla } from '../../../shared/sla.ts';
import { downloadComplaintsCsv, fetchAnalytics, fetchComplaints } from '../../lib/api.ts';
import {
  formatLocaleDate,
  translateCategory,
  translateDistrict,
  translatePriority,
  translateStatus,
} from '../../lib/i18nHelpers.ts';
import type {
  AdminTab,
  AnalyticsResponse,
  Complaint,
  User,
} from '../../types/index.ts';
import {
  COMPLAINT_STATUSES,
  INFRASTRUCTURE_CATEGORIES,
  KARNATAKA_DISTRICTS,
} from '../../types/index.ts';
import { LanguageSelector } from '../common/LanguageSelector.tsx';
import { PWAInstallButton } from '../common/PWAInstallButton.tsx';
import { PriorityIndicator, StatusIndicator } from '../common/SemanticIndicators.tsx';
import { KarnatakaMap } from '../maps/KarnatakaMap.tsx';
import { AdminAnalyticsView } from './AdminAnalyticsView.tsx';
import { AdminAuditLogsView, AdminSettingsView } from './AdminAuditAndSettingsViews.tsx';
import { AdminComplaintInspector } from './AdminComplaintInspector.tsx';
import { AdminInsightsView } from './AdminInsightsView.tsx';
import { AdminProvisioningView } from './AdminProvisioningView.tsx';
import {
  AdminDepartmentManagementView,
  AdminLegalEscalationsView,
  AdminSlaBreachesView,
} from './AdminSlaAndEscalationViews.tsx';

interface AdminDashboardProps {
  user: User;
  complaints: Complaint[];
  loading: boolean;
  onRefreshAll: () => Promise<void>;
  onUserUpdated?: (updatedUser: User) => void;
  onLogout: () => Promise<void> | void;
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: '#DC2626',
  High: '#EA580C',
  Medium: '#D97706',
  Low: '#0D9488',
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  complaints,
  loading,
  onRefreshAll,
  onUserUpdated,
  onLogout,
}) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [overviewAnalytics, setOverviewAnalytics] = useState<AnalyticsResponse | null>(null);

  // Complaint Management Filter State
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterDistrict, setFilterDistrict] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterSlaStatus, setFilterSlaStatus] = useState<'all' | 'breached' | 'escalated'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'date' | 'severity'>('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [managedComplaints, setManagedComplaints] = useState<Complaint[]>(complaints);
  const [tableLoading, setTableLoading] = useState(false);

  // Hotspot Map Filters
  const [hotspotCategory, setHotspotCategory] = useState('All');
  const [hotspotPriority, setHotspotPriority] = useState('All');

  // Inspector State
  const [inspectingId, setInspectingId] = useState<number | null>(null);

  useEffect(() => {
    fetchAnalytics()
      .then((res) => setOverviewAnalytics(res.analytics))
      .catch(() => {
        // Fallback handled via cached complaints
      });
  }, [complaints, refreshTick]);

  useEffect(() => {
    let active = true;
    setTableLoading(true);
    fetchComplaints({
      search,
      category: filterCategory,
      priority: filterPriority,
      district: filterDistrict,
      status: filterStatus,
      slaStatus: filterSlaStatus,
      sortBy,
      sortDir,
    })
      .then((res) => {
        if (active) setManagedComplaints(res.complaints);
      })
      .catch(() => {
        // Client-side fallback when offline
        if (!active) return;
        const q = search.trim().toLowerCase();
        const fallback = complaints.filter((c) => {
          if (filterCategory !== 'All' && c.category !== filterCategory) return false;
          if (filterPriority !== 'All' && c.priority_level !== filterPriority) return false;
          if (filterDistrict !== 'All' && c.district !== filterDistrict) return false;
          if (filterStatus !== 'All' && c.status !== filterStatus) return false;
          if (filterSlaStatus === 'breached' && !evaluateComplaintSla(c).isBreached) return false;
          if (
            filterSlaStatus === 'escalated' &&
            !c.escalation_notice_generated &&
            !c.escalation_notice_sent_at
          ) {
            return false;
          }
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
        setManagedComplaints(fallback);
      })
      .finally(() => {
        if (active) setTableLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    complaints,
    search,
    filterCategory,
    filterPriority,
    filterDistrict,
    filterStatus,
    filterSlaStatus,
    sortBy,
    sortDir,
    refreshTick,
  ]);

  const kpis = useMemo(() => {
    if (overviewAnalytics) return overviewAnalytics.kpis;
    return {
      total: complaints.length,
      newComplaints: complaints.filter((c) => c.status === 'Submitted').length,
      critical: complaints.filter((c) => c.priority_level === 'Critical').length,
      highPriority: complaints.filter((c) => c.priority_level === 'High').length,
      inProgress: complaints.filter((c) => c.status === 'In Progress' || c.status === 'Assigned').length,
      resolved: complaints.filter((c) => c.status === 'Resolved').length,
      pending: complaints.filter((c) => c.status !== 'Resolved' && c.status !== 'Rejected').length,
      underReview: complaints.filter((c) => c.status === 'Under Review').length,
      avgResolutionHours: 0,
      resolutionRate: complaints.length
        ? Math.round((complaints.filter((c) => c.status === 'Resolved').length / complaints.length) * 100)
        : 0,
    };
  }, [overviewAnalytics, complaints]);

  const hotspotComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (hotspotCategory !== 'All' && c.category !== hotspotCategory) return false;
      if (hotspotPriority !== 'All' && c.priority_level !== hotspotPriority) return false;
      return true;
    });
  }, [complaints, hotspotCategory, hotspotPriority]);

  const hotspotClusters = useMemo(() => {
    const map = new Map<
      string,
      {
        district: string;
        locality: string;
        latitude: number;
        longitude: number;
        count: number;
        criticalCount: number;
        maxPriority: number;
        topCategory: string;
      }
    >();
    hotspotComplaints
      .filter((c) => c.status !== 'Resolved' && c.status !== 'Rejected')
      .forEach((c) => {
        const key = `${c.district}::${c.locality}`;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            district: c.district,
            locality: c.locality,
            latitude: c.latitude,
            longitude: c.longitude,
            count: 1,
            criticalCount: c.priority_level === 'Critical' ? 1 : 0,
            maxPriority: c.priority_score,
            topCategory: c.category,
          });
        } else {
          existing.count += 1;
          if (c.priority_level === 'Critical') existing.criticalCount += 1;
          existing.maxPriority = Math.max(existing.maxPriority, c.priority_score);
        }
      });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || b.maxPriority - a.maxPriority);
  }, [hotspotComplaints]);

  const slaMetrics = useMemo(() => {
    let breached = 0;
    let escalated = 0;
    complaints.forEach((c) => {
      if (evaluateComplaintSla(c).isBreached) breached += 1;
      if (c.escalation_notice_generated || c.escalation_notice_sent_at) escalated += 1;
    });
    return { breached, escalated };
  }, [complaints]);

  const handleUpdated = async () => {
    await onRefreshAll();
    setRefreshTick((tick) => tick + 1);
  };

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'overview', label: t('adminConsole.nav.overview', { defaultValue: 'Overview Dashboard' }), icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'management', label: t('adminConsole.nav.management', { defaultValue: 'Complaint Management' }), icon: <ListFilter className="h-4 w-4" /> },
    { id: 'ai_monitoring', label: t('adminConsole.nav.aiMonitoring', { defaultValue: 'AI Priority & Hotspots' }), icon: <BrainCircuit className="h-4 w-4" /> },
    { id: 'departments', label: t('adminConsole.nav.departments', { defaultValue: 'Department Management' }), icon: <Building2 className="h-4 w-4" /> },
    { id: 'provisioning', label: t('adminConsole.nav.provisioning', { defaultValue: 'Official Provisioning' }), icon: <KeyRound className="h-4 w-4" /> },
    { id: 'sla_breaches', label: t('adminConsole.nav.slaBreaches', { defaultValue: 'SLA Breach Monitoring' }), icon: <Clock className="h-4 w-4" />, badge: slaMetrics.breached },
    { id: 'escalations', label: t('adminConsole.nav.escalations', { defaultValue: 'Legal Escalations' }), icon: <Scale className="h-4 w-4" />, badge: slaMetrics.escalated },
    { id: 'analytics', label: t('adminConsole.nav.analytics', { defaultValue: 'Analytics & Reports' }), icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'audit_logs', label: t('adminConsole.nav.auditLogs', { defaultValue: 'Audit Logs' }), icon: <FileSearch className="h-4 w-4" /> },
    { id: 'settings', label: t('adminConsole.nav.settings', { defaultValue: 'System Settings' }), icon: <Settings className="h-4 w-4" /> },
  ];

  const activeNavLabel = navItems.find((i) => i.id === activeTab)?.label ?? t('admin.nav.overview');

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-900 text-slate-200">
        <div className="border-b border-slate-800 px-6 py-4">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="font-display text-lg font-bold tracking-tight text-white cursor-pointer"
          >
            {t('common.appName')}
          </button>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {user.role === 'super_admin' ? 'Super Admin Command' : user.department || t('admin.consoleTitle')}
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                activeTab === item.id
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="rounded bg-rose-600/90 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-white">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4 space-y-3">
          <div className="text-xs">
            <div className="font-semibold text-white truncate">{user.full_name}</div>
            <div className="text-slate-400 truncate">{user.email}</div>
            <div className="mt-0.5 text-[11px] text-emerald-400 truncate">
              {user.role === 'super_admin' ? 'Super Administrator' : 'Municipal Official'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{t('common.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-50 flex w-64 flex-col bg-slate-900 text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <span className="font-display text-base font-bold text-white">{t('common.appName')}</span>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium ${
                    activeTab === item.id ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="border-t border-slate-800 p-4 space-y-2.5">
              <div className="text-xs">
                <div className="font-semibold text-white truncate">{user.full_name}</div>
                <div className="text-slate-400 truncate">{user.email}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void onLogout();
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t('common.logout')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Context Header */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-700 lg:hidden"
                aria-label={t('admin.openMenu')}
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="text-xs font-medium text-slate-500 whitespace-nowrap truncate">
                {t('admin.administration')} <span className="mx-1">/</span>
                <span className="text-slate-900 font-semibold">{activeNavLabel}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <LanguageSelector
                variant="light"
                isAuthenticated
                onLanguageUpdated={(_lang, updatedUser) => {
                  if (updatedUser) onUserUpdated?.(updatedUser);
                }}
              />
              <PWAInstallButton />
              <button
                type="button"
                onClick={() => void onLogout()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t('common.logout')}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {/* 1. OVERVIEW DASHBOARD */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    {t('admin.overview.kicker')}
                  </div>
                  <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
                    {t('admin.overview.title')}
                  </h1>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('management')}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  {t('admin.overview.openQueue')}
                </button>
              </div>

              {/* 6 KPI Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">{t('admin.overview.kpiTotal')}</div>
                  <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{kpis.total}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">{t('admin.overview.kpiNew')}</div>
                  <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-blue-700">
                    {kpis.newComplaints}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">{t('admin.overview.kpiCritical')}</div>
                  <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-red-700">{kpis.critical}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">{t('admin.overview.kpiHigh')}</div>
                  <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-orange-600">
                    {kpis.highPriority}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">{t('admin.overview.kpiInProgress')}</div>
                  <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-indigo-700">
                    {kpis.inProgress}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">{t('admin.overview.kpiResolved')}</div>
                  <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-700">
                    {kpis.resolved}
                  </div>
                </div>
              </div>

              {/* SLA & Escalation Alert Strip */}
              {(slaMetrics.breached > 0 || slaMetrics.escalated > 0) && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-5 py-3.5 text-xs text-rose-950">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-rose-900">
                      <AlertTriangle className="h-4 w-4 text-rose-700" />
                      <span>Governance SLA Alert:</span>
                    </span>
                    <span className="font-mono font-bold tabular-nums">
                      {slaMetrics.breached} SLA Breached
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-bold tabular-nums">
                      {slaMetrics.escalated} Legal / SLA Escalations Issued
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('sla_breaches')}
                      className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold text-rose-900 hover:bg-rose-100 cursor-pointer"
                    >
                      Open SLA Monitor
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('escalations')}
                      className="rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white hover:bg-rose-800 cursor-pointer"
                    >
                      View Legal Escalations
                    </button>
                  </div>
                </div>
              )}

              {/* Charts Row */}
              {overviewAnalytics && (
                <div className="grid gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5">
                    <h2 className="font-display text-sm font-semibold text-slate-900">
                      {t('admin.overview.trendsTitle')}
                    </h2>
                    <div className="mt-4 h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={overviewAnalytics.monthlyTrends}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569' }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                          <Tooltip />
                          <Area
                            type="monotone"
                            dataKey="submitted"
                            name={t('admin.overview.seriesSubmitted')}
                            stroke="#0F294A"
                            fill="#CBD5E1"
                            strokeWidth={2}
                          />
                          <Area
                            type="monotone"
                            dataKey="resolved"
                            name={t('admin.overview.seriesResolved')}
                            stroke="#16A34A"
                            fill="#BBF7D0"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5">
                    <h2 className="font-display text-sm font-semibold text-slate-900">
                      {t('admin.overview.categoryDistTitle')}
                    </h2>
                    <div className="mt-4 h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={overviewAnalytics.byCategory} layout="vertical" margin={{ left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                          <YAxis
                            dataKey="category"
                            type="category"
                            width={130}
                            tick={{ fontSize: 10, fill: '#334155' }}
                            tickFormatter={(val) => translateCategory(t, String(val))}
                          />
                          <Tooltip labelFormatter={(val) => translateCategory(t, String(val))} />
                          <Bar
                            dataKey="count"
                            name={t('admin.overview.seriesComplaints')}
                            fill="#0D9488"
                            radius={[0, 4, 4, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
                    <div>
                      <h2 className="font-display text-sm font-semibold text-slate-900">
                        {t('admin.overview.priorityDistTitle')}
                      </h2>
                      <div className="mt-4 h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={overviewAnalytics.byPriority}>
                            <XAxis
                              dataKey="level"
                              tick={{ fontSize: 11, fill: '#475569' }}
                              tickFormatter={(val) => translatePriority(t, String(val))}
                            />
                            <YAxis allowDecimals={false} hide />
                            <Tooltip labelFormatter={(val) => translatePriority(t, String(val))} />
                            <Bar dataKey="count" name={t('admin.overview.seriesCount')} radius={[4, 4, 0, 0]}>
                              {overviewAnalytics.byPriority.map((entry) => (
                                <Cell key={entry.level} fill={PRIORITY_COLORS[entry.level] ?? '#64748B'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
                      <div className="font-semibold text-slate-700">
                        {t('admin.overview.resolutionPerf')}
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>{t('admin.overview.closureRate')}</span>
                        <span className="font-mono tabular-nums font-semibold text-emerald-700">
                          {kpis.resolutionRate}%
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>{t('admin.overview.avgResolutionTime')}</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {kpis.avgResolutionHours} {t('common.hrs')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent & Critical Complaints Table */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    {t('admin.overview.recentTitle')}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('management')}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
                  >
                    {t('admin.overview.manageAll', { count: complaints.length })}
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
                          <th className="px-6 py-3">{t('admin.overview.colId')}</th>
                          <th className="px-4 py-3">{t('admin.overview.colTitle')}</th>
                          <th className="px-4 py-3">{t('admin.overview.colCategory')}</th>
                          <th className="px-4 py-3">{t('admin.overview.colLocation')}</th>
                          <th className="px-4 py-3">{t('admin.overview.colPriority')}</th>
                          <th className="px-4 py-3">{t('admin.overview.colDate')}</th>
                          <th className="px-6 py-3">{t('admin.overview.colStatus')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {complaints.slice(0, 8).map((c) => (
                          <tr
                            key={c.id}
                            onClick={() => setInspectingId(c.id)}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <td className="px-6 py-3 font-mono text-xs font-semibold tabular-nums text-slate-800 whitespace-nowrap">
                              {c.complaint_code}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900 max-w-xs truncate">
                              <div className="flex items-center gap-1.5">
                                {c.critical_safety_flag && (
                                  <ShieldAlert className="h-3.5 w-3.5 text-red-600 shrink-0" />
                                )}
                                <span className="truncate">{c.title}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                              {translateCategory(t, c.category)}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                              {c.locality}, {translateDistrict(t, c.district)}
                            </td>
                            <td className="px-4 py-3">
                              <PriorityIndicator level={c.priority_level} score={c.priority_score} />
                            </td>
                            <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                              {formatLocaleDate(c.created_at, i18n.language)}
                            </td>
                            <td className="px-6 py-3">
                              <StatusIndicator status={c.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. COMPLAINT MANAGEMENT */}
          {activeTab === 'management' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    {t('admin.management.kicker')}
                  </div>
                  <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
                    {t('admin.management.title')}
                  </h1>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void downloadComplaintsCsv({
                      search,
                      category: filterCategory,
                      priority: filterPriority,
                      district: filterDistrict,
                      status: filterStatus,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{t('admin.management.exportCsv')}</span>
                </button>
              </div>

              {/* Filters & Sort Bar */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="relative md:col-span-2">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('admin.management.searchPlaceholder')}
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="All">{t('admin.management.allCategories')}</option>
                    {INFRASTRUCTURE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {translateCategory(t, cat)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterDistrict}
                    onChange={(e) => setFilterDistrict(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="All">{t('admin.management.allDistricts')}</option>
                    {KARNATAKA_DISTRICTS.map((d) => (
                      <option key={d.name} value={d.name}>
                        {translateDistrict(t, d.name)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="All">{t('admin.management.allPriorities')}</option>
                    <option value="Critical">{t('admin.management.priorityCriticalRange')}</option>
                    <option value="High">{t('admin.management.priorityHighRange')}</option>
                    <option value="Medium">{t('admin.management.priorityMediumRange')}</option>
                    <option value="Low">{t('admin.management.priorityLowRange')}</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">
                        {t('admin.management.statusLabel')}
                      </span>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                      >
                        <option value="All">{t('admin.management.allStatuses')}</option>
                        {COMPLAINT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {translateStatus(t, s)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">SLA / Legal:</span>
                      <select
                        value={filterSlaStatus}
                        onChange={(e) =>
                          setFilterSlaStatus(e.target.value as 'all' | 'breached' | 'escalated')
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                      >
                        <option value="all">All SLA States</option>
                        <option value="breached">SLA Breached Only</option>
                        <option value="escalated">Legal / SLA Escalation Issued</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">{t('admin.management.sortBy')}</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'priority' | 'date' | 'severity')}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900"
                    >
                      <option value="priority">{t('admin.management.sortPriority')}</option>
                      <option value="severity">{t('admin.management.sortSeverity')}</option>
                      <option value="date">{t('admin.management.sortDate')}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      <span>
                        {sortDir === 'desc'
                          ? t('admin.management.sortDesc')
                          : t('admin.management.sortAsc')}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Management Table */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-5 py-3">{t('admin.management.colId')}</th>
                        <th className="px-4 py-3">{t('admin.management.colTitle')}</th>
                        <th className="px-4 py-3">{t('admin.management.colCategory')}</th>
                        <th className="px-4 py-3">{t('admin.management.colLocation')}</th>
                        <th className="px-4 py-3">{t('admin.management.colSeverity')}</th>
                        <th className="px-4 py-3 text-right">{t('admin.management.colPriority')}</th>
                        <th className="px-4 py-3">{t('admin.management.colDate')}</th>
                        <th className="px-5 py-3">{t('admin.management.colStatus')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tableLoading ? (
                        <tr>
                          <td colSpan={8} className="px-6 py-8 text-center text-xs text-slate-500">
                            {t('admin.management.loadingQueue')}
                          </td>
                        </tr>
                      ) : managedComplaints.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">
                            {t('admin.management.emptyQueue')}
                          </td>
                        </tr>
                      ) : (
                        managedComplaints.map((c) => (
                          <tr
                            key={c.id}
                            onClick={() => setInspectingId(c.id)}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <td className="px-5 py-3 font-mono text-xs font-semibold tabular-nums text-slate-800 whitespace-nowrap">
                              {c.complaint_code}
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              <div className="flex items-center gap-1.5 font-medium text-slate-900 truncate">
                                {c.critical_safety_flag && (
                                  <ShieldAlert className="h-3.5 w-3.5 text-red-600 shrink-0" />
                                )}
                                <span className="truncate">{c.title}</span>
                              </div>
                              {(c.escalation_notice_generated || c.escalation_notice_sent_at) && (
                                <div className="mt-1 inline-flex items-center rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                                  ⚠️ Legal / SLA Escalation Issued
                                </div>
                              )}
                              {(c.duplicate_count ?? 0) > 0 && (
                                <div className="text-[11px] text-orange-700 font-medium">
                                  {t('admin.management.relatedReports', { count: c.duplicate_count })}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                              {translateCategory(t, c.category)}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                              {c.locality}, {translateDistrict(t, c.district)}
                            </td>
                            <td className="px-4 py-3 text-xs font-medium text-slate-700">
                              {translatePriority(t, c.severity)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <PriorityIndicator level={c.priority_level} score={c.priority_score} />
                            </td>
                            <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                              {formatLocaleDate(c.created_at, i18n.language)}
                            </td>
                            <td className="px-5 py-3">
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

          {/* 3. AI PRIORITY MONITORING & GEOSPATIAL HOTSPOTS */}
          {activeTab === 'ai_monitoring' && (
            <div className="space-y-8">
              <AdminInsightsView
                refreshTrigger={refreshTick}
                onInspectComplaintId={(id) => setInspectingId(id)}
              />

              <div className="border-t border-slate-200 pt-8 space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      {t('admin.hotspots.kicker')}
                    </div>
                    <h2 className="mt-1 font-display text-xl font-bold text-slate-900">
                      {t('admin.hotspots.title')}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={hotspotCategory}
                      onChange={(e) => setHotspotCategory(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                    >
                      <option value="All">{t('admin.hotspots.allCategories')}</option>
                      {INFRASTRUCTURE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {translateCategory(t, cat)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={hotspotPriority}
                      onChange={(e) => setHotspotPriority(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                    >
                      <option value="All">{t('admin.hotspots.allPriorities')}</option>
                      <option value="Critical">{t('admin.hotspots.criticalOnly')}</option>
                      <option value="High">{t('admin.hotspots.highPriority')}</option>
                      <option value="Medium">{translatePriority(t, 'Medium')}</option>
                      <option value="Low">{translatePriority(t, 'Low')}</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-12 items-start">
                  <div className="lg:col-span-8 space-y-3">
                    <KarnatakaMap
                      mode="hotspot"
                      complaints={hotspotComplaints}
                      hotspots={hotspotClusters}
                      onSelectComplaint={(c) => setInspectingId(c.id)}
                      heightClass="h-[520px]"
                    />

                    <div className="flex flex-wrap items-center gap-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {t('admin.hotspots.legendLabel')}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-600" />{' '}
                        {t('admin.hotspots.legendCritical')}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-orange-600" />{' '}
                        {t('admin.hotspots.legendHigh')}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />{' '}
                        {t('admin.hotspots.legendMedium')}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />{' '}
                        {t('admin.hotspots.legendResolved')}
                      </span>
                    </div>
                  </div>

                  {/* Hotspot Cluster Sidebar */}
                  <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div>
                      <h3 className="font-display text-base font-semibold text-slate-900">
                        {t('admin.hotspots.clustersTitle')}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {t('admin.hotspots.clustersSub')}
                      </p>
                    </div>

                    <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                      {hotspotClusters.length === 0 ? (
                        <p className="text-xs text-slate-500">{t('admin.hotspots.emptyClusters')}</p>
                      ) : (
                        hotspotClusters.map((spot) => (
                          <div
                            key={`${spot.district}-${spot.locality}`}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {spot.locality}, {translateDistrict(t, spot.district)}
                              </span>
                              <span className="font-mono tabular-nums text-xs font-bold text-slate-800">
                                {t('admin.hotspots.activeCount', { count: spot.count })}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600">
                              {t('admin.hotspots.primaryIssue', {
                                category: translateCategory(t, spot.topCategory),
                              })}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>
                                {t('admin.hotspots.peakPriority', { score: spot.maxPriority })}
                              </span>
                              {spot.criticalCount > 0 && (
                                <span className="font-semibold text-red-700">
                                  {t('admin.hotspots.criticalBadge', { count: spot.criticalCount })}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. DEPARTMENT MANAGEMENT */}
          {activeTab === 'departments' && (
            <AdminDepartmentManagementView
              complaints={complaints}
              onInspectComplaintId={(id) => setInspectingId(id)}
            />
          )}

          {/* 5. OFFICIAL PROVISIONING & INVITES */}
          {activeTab === 'provisioning' && (
            <AdminProvisioningView currentUser={user} refreshTrigger={refreshTick} />
          )}

          {/* 6. SLA BREACH MONITORING */}
          {activeTab === 'sla_breaches' && (
            <AdminSlaBreachesView
              complaints={complaints}
              onInspectComplaintId={(id) => setInspectingId(id)}
            />
          )}

          {/* 7. LEGAL ESCALATION TRACKING */}
          {activeTab === 'escalations' && (
            <AdminLegalEscalationsView
              complaints={complaints}
              onInspectComplaintId={(id) => setInspectingId(id)}
            />
          )}

          {/* 8. ANALYTICS & REPORTS */}
          {activeTab === 'analytics' && <AdminAnalyticsView refreshTrigger={refreshTick} />}

          {/* 9. AUDIT LOGS */}
          {activeTab === 'audit_logs' && <AdminAuditLogsView refreshTrigger={refreshTick} />}

          {/* 10. SYSTEM SETTINGS */}
          {activeTab === 'settings' && (
            <AdminSettingsView currentUser={user} refreshTrigger={refreshTick} />
          )}
        </main>
      </div>

      <AdminComplaintInspector
        complaintId={inspectingId}
        adminName={user.full_name}
        onClose={() => setInspectingId(null)}
        onUpdated={handleUpdated}
        onSelectRelatedId={(id) => setInspectingId(id)}
      />
    </div>
  );
};
