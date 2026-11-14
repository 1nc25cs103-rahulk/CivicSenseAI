import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Copy, Info, Languages, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  translateCategory,
  translateLanguageName,
  translatePriority,
} from '../../lib/i18nHelpers.ts';
import type { AIAnalysisResult } from '../../types/index.ts';
import { PriorityIndicator } from '../common/SemanticIndicators.tsx';

interface AIAnalysisPanelProps {
  analysis: AIAnalysisResult;
  complaintCode?: string;
}

export const AIAnalysisPanel: React.FC<AIAnalysisPanelProps> = ({ analysis, complaintCode }) => {
  const { t } = useTranslation();

  const factors = [
    {
      key: 'severity',
      label: t('citizen.aiPanel.factorSeverity'),
      pts: analysis.factorBreakdown.severityPoints,
      max: 30,
    },
    {
      key: 'safety',
      label: t('citizen.aiPanel.factorSafety'),
      pts: analysis.factorBreakdown.safetyRiskPoints,
      max: 25,
    },
    {
      key: 'duplicates',
      label: t('citizen.aiPanel.factorDuplicates'),
      pts: analysis.factorBreakdown.duplicatePoints,
      max: 15,
    },
    {
      key: 'citizens',
      label: t('citizen.aiPanel.factorCitizens'),
      pts: analysis.factorBreakdown.affectedCitizensPoints,
      max: 10,
    },
    {
      key: 'freq',
      label: t('citizen.aiPanel.factorFrequency'),
      pts: analysis.factorBreakdown.areaFrequencyPoints,
      max: 10,
    },
    {
      key: 'age',
      label: t('citizen.aiPanel.factorAge'),
      pts: analysis.factorBreakdown.agePoints,
      max: 10,
    },
  ];

  const barColor =
    analysis.priorityScore >= 80
      ? 'bg-red-600'
      : analysis.priorityScore >= 60
        ? 'bg-orange-500'
        : analysis.priorityScore >= 40
          ? 'bg-amber-500'
          : 'bg-teal-600';

  const predictedCategoryLabel = translateCategory(t, analysis.predictedCategory);
  const detectedLangCode = analysis.detectedLanguage || 'en';
  const detectedLangLabel = translateLanguageName(t, detectedLangCode);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span>{t('citizen.aiPanel.header')}</span>
            {complaintCode && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-700">{complaintCode}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>
              {analysis.aiSource === 'hybrid-gemini'
                ? t('citizen.aiPanel.hybridSource')
                : t('citizen.aiPanel.rulesSource')}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-teal-700 font-semibold">
              <Languages className="h-3.5 w-3.5" />
              <span>{t('citizen.aiPanel.detectedLanguage', { lang: detectedLangLabel })}</span>
            </span>
          </div>
          <h3 className="mt-1 font-display text-lg font-bold text-slate-900">
            {t('citizen.aiPanel.predictedCategory', { category: predictedCategoryLabel })}
          </h3>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-500">{t('citizen.aiPanel.priorityScore')}</div>
          <div className="mt-0.5 flex items-center justify-end gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-slate-900">
              {analysis.priorityScore}
              <span className="text-sm font-normal text-slate-400">/100</span>
            </span>
            <PriorityIndicator level={analysis.priorityLevel} showScore={false} />
          </div>
        </div>
      </div>

      {analysis.criticalSafetyFlag && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-900">
          <ShieldAlert className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">{t('citizen.aiPanel.criticalBannerTitle')}</span>{' '}
            {t('citizen.aiPanel.criticalBannerDesc')}
          </div>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3.5">
          <div className="text-xs text-slate-500">{t('citizen.aiPanel.estimatedSeverity')}</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {translatePriority(t, analysis.estimatedSeverity)}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3.5">
          <div className="text-xs text-slate-500">{t('citizen.aiPanel.categoryConfidence')}</div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900">
            {analysis.categoryConfidence}%
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3.5">
          <div className="text-xs text-slate-500">{t('citizen.aiPanel.localComplaints')}</div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900">
            {t('common.inArea', { count: analysis.affectedAreaCount })}
          </div>
        </div>
      </div>

      {/* English Translation Preview for Regional Complaints */}
      {detectedLangCode !== 'en' && analysis.englishTranslation && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
            <Languages className="h-3.5 w-3.5 text-blue-700" />
            <span>{t('citizen.aiPanel.englishSummaryTitle')}</span>
          </div>
          <div className="text-xs font-semibold text-slate-900">
            {analysis.englishTranslation.title}
          </div>
          <p className="text-xs leading-relaxed text-slate-700">
            {analysis.englishTranslation.description}
          </p>
        </div>
      )}

      {/* Detected Keywords */}
      <div>
        <div className="text-xs font-semibold text-slate-700">
          {t('citizen.aiPanel.detectedKeywords')}
        </div>
        <p className="mt-1.5 text-sm text-slate-600">
          {analysis.detectedKeywords.length > 0
            ? analysis.detectedKeywords.join(' · ')
            : t('citizen.aiPanel.noKeywords')}
        </p>
      </div>

      {/* Priority Factor Breakdown */}
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span>{t('citizen.aiPanel.breakdownTitle')}</span>
          <span className="font-mono tabular-nums text-slate-500">
            {t('citizen.aiPanel.totalPoints', { score: analysis.priorityScore })}
          </span>
        </div>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {factors.map((f) => (
            <div key={f.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{f.label}</span>
                <span className="font-mono tabular-nums font-medium text-slate-800">
                  {f.pts}/{f.max}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${Math.min(100, Math.round((f.pts / f.max) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Explanation & Suggested Action */}
      <div className="grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Info className="h-3.5 w-3.5 text-blue-600" />
            <span>{t('citizen.aiPanel.whyTitle')}</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{analysis.explanation}</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
            <span>{t('citizen.aiPanel.actionTitle')}</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{analysis.suggestedAction}</p>
        </div>
      </div>

      {/* Duplicate Detection Warning */}
      {analysis.duplicates.length > 0 ? (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-900">
            <Copy className="h-4 w-4 text-orange-600 shrink-0" />
            <span>
              {t('citizen.aiPanel.duplicatesTitle', { count: analysis.duplicates.length })}
            </span>
          </div>
          <ul className="mt-2.5 space-y-2">
            {analysis.duplicates.map((dup) => (
              <li
                key={dup.related_complaint_id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-orange-200/70 pt-2 text-xs text-orange-950"
              >
                <div>
                  <span className="font-mono font-semibold">ID #{dup.related_complaint_id}</span>
                  <span className="mx-1.5 text-orange-400">·</span>
                  <span>{dup.related_title}</span>
                  {dup.reason && <span className="block text-[11px] text-orange-800">{dup.reason}</span>}
                </div>
                <span className="font-mono tabular-nums font-semibold text-orange-800">
                  {t('common.matchPercent', { score: dup.similarity_score })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
          <span>{t('citizen.aiPanel.noDuplicates')}</span>
        </div>
      )}

      {/* Explicit Prototype Transparency Note */}
      <div className="flex items-start gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <AlertOctagon className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
        <span>{t('citizen.aiPanel.prototypeNote')}</span>
      </div>
    </div>
  );
};
