import React, { useEffect, useMemo, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { downloadComplaintsCsv, fetchAnalytics } from '../../lib/api.ts';
import {
  translateCategory,
  translateDistrict,
  translatePriority,
} from '../../lib/i18nHelpers.ts';
import type { AnalyticsResponse } from '../../types/index.ts';

const PRIORITY_CHART_COLORS: Record<string, string> = {
  Critical: '#DC2626',
  High: '#EA580C',
  Medium: '#D97706',
  Low: '#0D9488',
};

export const AdminAnalyticsView: React.FC<{ refreshTrigger: number }> = ({ refreshTrigger }) => {
  const { t } = useTranslation();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAnalytics({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then((res) => {
        if (active) setData(res.analytics);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dateFrom, dateTo, refreshTrigger]);

  const translatedPriorityData = useMemo(() => {
    if (!data) return [];
    return data.byPriority.map((entry) => ({
      ...entry,
      translatedLevel: translatePriority(t, entry.level),
    }));
  }, [data, t]);

  const pendingVsResolved = data
    ? [
        { name: t('admin.analytics.seriesResolved'), value: data.kpis.resolved, color: '#16A34A' },
        { name: t('admin.analytics.pendingActive'), value: data.kpis.pending, color: '#0F294A' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-slate-500">{t('admin.analytics.kicker')}</div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            {t('admin.analytics.title')}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs">
            <span className="text-slate-500">{t('admin.analytics.from')}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-slate-900 focus:outline-none"
            />
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">{t('admin.analytics.to')}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-slate-900 focus:outline-none"
            />
          </div>

          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t('admin.analytics.reset')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              void downloadComplaintsCsv({
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
              })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t('admin.analytics.exportCsv')}</span>
          </button>
        </div>
      </div>

      {loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 animate-pulse rounded-xl bg-white border border-slate-200" />
          ))}
        </div>
      ) : (
        <>
          {/* Summary Strip */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">{t('admin.analytics.kpiTotal')}</div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
                {data.kpis.total}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">{t('admin.analytics.kpiAvgTime')}</div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
                {data.kpis.avgResolutionHours} {t('common.hrs')}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">{t('admin.analytics.kpiRate')}</div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-700">
                {data.kpis.resolutionRate}%
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">{t('admin.analytics.kpiSplit')}</div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
                {data.kpis.pending} / {data.kpis.resolved}
              </div>
            </div>
          </div>

          {/* Charts Row 1 */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {t('admin.analytics.monthlyTitle')}
              </h2>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#475569' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="submitted"
                      name={t('admin.analytics.seriesSubmitted')}
                      stroke="#0F294A"
                      strokeWidth={2.5}
                    />
                    <Line
                      type="monotone"
                      dataKey="resolved"
                      name={t('admin.analytics.seriesResolved')}
                      stroke="#16A34A"
                      strokeWidth={2.5}
                    />
                    <Line
                      type="monotone"
                      dataKey="critical"
                      name={t('admin.analytics.seriesCritical')}
                      stroke="#DC2626"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {t('admin.analytics.districtTitle')}
              </h2>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byDistrict}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis
                      dataKey="district"
                      tick={{ fontSize: 11, fill: '#475569' }}
                      tickFormatter={(val) => translateDistrict(t, String(val))}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip labelFormatter={(val) => translateDistrict(t, String(val))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="count"
                      name={t('admin.analytics.seriesTotal')}
                      fill="#2563EB"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="resolvedCount"
                      name={t('admin.analytics.seriesResolved')}
                      fill="#16A34A"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {t('admin.analytics.categoryTitle')}
              </h2>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byCategory} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                    <YAxis
                      dataKey="category"
                      type="category"
                      width={175}
                      tick={{ fontSize: 11, fill: '#334155' }}
                      tickFormatter={(val) => translateCategory(t, String(val))}
                    />
                    <Tooltip labelFormatter={(val) => translateCategory(t, String(val))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="count"
                      name={t('admin.analytics.seriesTotalComplaints')}
                      fill="#0F294A"
                      radius={[0, 4, 4, 0]}
                    />
                    <Bar
                      dataKey="criticalCount"
                      name={t('admin.analytics.seriesCritical')}
                      fill="#DC2626"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  {t('admin.analytics.prioritySplitTitle')}
                </h2>
                <div className="mt-3 h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={translatedPriorityData}
                        dataKey="count"
                        nameKey="translatedLevel"
                        innerRadius={42}
                        outerRadius={68}
                        paddingAngle={2}
                      >
                        {translatedPriorityData.map((entry) => (
                          <Cell key={entry.level} fill={PRIORITY_CHART_COLORS[entry.level] ?? '#64748B'} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="text-xs font-semibold text-slate-700">
                  {t('admin.analytics.kpiSplit')}
                </div>
                {pendingVsResolved.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{item.name}</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Frequently Reported Problems Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {t('admin.analytics.frequentTitle')}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-6 py-3">{t('admin.analytics.colCluster')}</th>
                    <th className="px-4 py-3">{t('admin.analytics.colDistrict')}</th>
                    <th className="px-4 py-3 text-right">{t('admin.analytics.colReports')}</th>
                    <th className="px-6 py-3 text-right">{t('admin.analytics.colAvgPriority')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.frequentProblems.map((p) => {
                    const parts = p.label.split(' — ');
                    const displayLabel =
                      parts.length >= 2
                        ? `${translateCategory(t, parts[0])} — ${parts.slice(1).join(' — ')}`
                        : p.label;
                    return (
                      <tr key={p.label}>
                        <td className="px-6 py-3 font-medium text-slate-900">{displayLabel}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {translateDistrict(t, p.district)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {p.count}
                        </td>
                        <td className="px-6 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {p.avgPriority}/100
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
