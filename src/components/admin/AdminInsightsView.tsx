import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy, Cpu, Lightbulb, MapPin, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchInsights } from '../../lib/api.ts';
import { formatLocaleTime, translateDistrict } from '../../lib/i18nHelpers.ts';
import type { InsightsResponse } from '../../types/index.ts';
import { PriorityIndicator } from '../common/SemanticIndicators.tsx';

interface AdminInsightsViewProps {
  refreshTrigger: number;
  onInspectComplaintId: (id: number) => void;
}

export const AdminInsightsView: React.FC<AdminInsightsViewProps> = ({
  refreshTrigger,
  onInspectComplaintId,
}) => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchInsights()
      .then((res) => {
        if (active) setData(res.insights);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshTrigger, i18n.language]);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
    );
  }

  const engineModeLabel =
    data.engineMode === 'hybrid-gemini'
      ? t('admin.insights.modeHybrid')
      : t('admin.insights.modeRules');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-slate-500">
            {t('admin.insights.kicker', { mode: engineModeLabel })}
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            {t('admin.insights.title')}
          </h1>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-500">
          {t('admin.insights.updatedAt', {
            time: formatLocaleTime(data.generatedAt, i18n.language),
          })}
        </div>
      </div>

      {/* Classification & Triage Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">
            {t('admin.insights.kpiAnalyzed')}
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {data.classificationSummary.totalAnalyzed}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {t('admin.insights.kpiAlignment', {
              rate: data.classificationSummary.categoryMatchRate,
            })}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">
            {t('admin.insights.kpiSafety')}
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-red-700">
            {data.classificationSummary.criticalSafetyCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">{t('admin.insights.kpiSafetySub')}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">
            {t('admin.insights.kpiDuplicates')}
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-orange-600">
            {data.classificationSummary.duplicateClusterCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {t('admin.insights.kpiDuplicatesSub')}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">
            {t('admin.insights.kpiMeanScore')}
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {data.classificationSummary.avgPriorityScore}/100
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {t('admin.insights.kpiMeanScoreSub')}
          </div>
        </div>
      </div>

      {/* Data-Backed Recurring Issue & Hotspot Recommendations */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-teal-600" />
          <h2 className="font-display text-lg font-bold text-slate-900">
            {t('admin.insights.recurringTitle')}
          </h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {data.insights.map((insight) => (
            <div key={insight.id} className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <PriorityIndicator level={insight.severity} score={insight.metrics.avgPriorityScore} />
                  <span className="text-xs font-medium text-slate-500">
                    {translateDistrict(t, insight.district)} · {insight.locality}
                  </span>
                </div>
                <h3 className="font-display text-base font-bold text-slate-900">{insight.title}</h3>
                <p className="text-xs leading-relaxed text-slate-600">{insight.summary}</p>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
                  <span className="font-semibold text-teal-800">
                    {t('admin.insights.recommendedAction')}{' '}
                  </span>
                  {insight.recommendation}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-slate-500 font-mono tabular-nums">
                  {t('admin.insights.metricsSummary', {
                    reports: insight.metrics.reportCount,
                    citizens: insight.metrics.estimatedAffectedCitizens,
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {insight.supportingComplaintIds.map((cid, idx) => (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => onInspectComplaintId(cid)}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer"
                    >
                      {insight.supportingCodes[idx] ?? `#${cid}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Duplicate Detection Clusters */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-orange-600" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              {t('admin.insights.clustersTitle')}
            </h2>
          </div>
          <span className="text-xs text-slate-500">{t('admin.insights.clustersSub')}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-6 py-3">{t('admin.insights.colPrimaryId')}</th>
                <th className="px-4 py-3">{t('admin.insights.colTitle')}</th>
                <th className="px-4 py-3">{t('admin.insights.colLocality')}</th>
                <th className="px-4 py-3 text-right">{t('admin.insights.colRelated')}</th>
                <th className="px-6 py-3 text-right">{t('admin.insights.colSimilarity')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.duplicateGroups.map((g) => (
                <tr
                  key={g.primaryId}
                  onClick={() => onInspectComplaintId(g.primaryId)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-6 py-3 font-mono text-xs font-semibold text-blue-700 whitespace-nowrap">
                    {g.primaryCode}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900 max-w-sm truncate">{g.primaryTitle}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {g.locality}, {translateDistrict(t, g.district)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 font-semibold">
                    {g.relatedCount}
                  </td>
                  <td className="px-6 py-3 text-right font-mono tabular-nums font-semibold text-orange-700">
                    {g.maxSimilarity}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Transparent Engine Methodology */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Cpu className="h-4 w-4 text-slate-700" />
          <span>{t('admin.insights.methodologyTitle')}</span>
        </div>
        <p className="mt-2 text-xs text-slate-600 leading-relaxed">
          {t('admin.insights.methodologyDesc')}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
              <span>{t('admin.insights.method1Title')}</span>
            </div>
            <p className="mt-1 text-slate-600">{t('admin.insights.method1Desc')}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-teal-600" />
              <span>{t('admin.insights.method2Title')}</span>
            </div>
            <p className="mt-1 text-slate-600">{t('admin.insights.method2Desc')}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-blue-600" />
              <span>{t('admin.insights.method3Title')}</span>
            </div>
            <p className="mt-1 text-slate-600">{t('admin.insights.method3Desc')}</p>
          </div>
        </div>
      </section>
    </div>
  );
};
