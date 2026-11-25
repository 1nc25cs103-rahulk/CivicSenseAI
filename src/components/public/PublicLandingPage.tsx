import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  Globe,
  Layers,
  MapPin,
  Mic,
  Scale,
  ShieldCheck,
  Users,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AI_TRIAGE_SIMULATOR_SCENARIOS } from '../../../shared/sla.ts';
import { fetchPublicHotspots, fetchPublicStats } from '../../lib/api.ts';
import { translateCategory, translateDistrict } from '../../lib/i18nHelpers.ts';
import type {
  AuthRoute,
  Complaint,
  InfrastructureCategory,
  PublicHotspotsResponse,
  PublicStatsResponse,
  User,
} from '../../types/index.ts';
import { isAdminRole, KARNATAKA_DISTRICTS } from '../../types/index.ts';
import { LanguageSelector } from '../common/LanguageSelector.tsx';
import { PWAInstallButton } from '../common/PWAInstallButton.tsx';
import { KarnatakaMap } from '../maps/KarnatakaMap.tsx';

interface PublicLandingPageProps {
  currentUser: User | null;
  onNavigate: (route: AuthRoute) => void;
}

const PUBLIC_CATEGORIES: Array<{ label: string; value: 'All' | InfrastructureCategory }> = [
  { label: 'All Issues', value: 'All' },
  { label: 'Roads', value: 'Road damage and potholes' },
  { label: 'Water', value: 'Water leakage' },
  { label: 'Drainage', value: 'Drainage and sewage problems' },
  { label: 'Streetlights', value: 'Broken streetlights' },
  { label: 'Waste', value: 'Improper waste disposal' },
];

const FEATURED_DISTRICTS = ['All', 'Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi', 'Kalaburagi'];

export const PublicLandingPage: React.FC<PublicLandingPageProps> = ({ currentUser, onNavigate }) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<PublicStatsResponse | null>(null);
  const [hotspotsData, setHotspotsData] = useState<PublicHotspotsResponse | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<'All' | InfrastructureCategory>('All');
  const [activeScenarioId, setActiveScenarioId] = useState<'open_manhole_school' | 'faded_zebra_crossing'>(
    'open_manhole_school'
  );
  const [bentoTab, setBentoTab] = useState<'citizens' | 'authorities'>('citizens');

  useEffect(() => {
    let active = true;
    fetchPublicStats()
      .then((res) => {
        if (active) setStats(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchPublicHotspots({
      district: selectedDistrict === 'All' ? undefined : selectedDistrict,
      category: selectedCategory === 'All' ? undefined : selectedCategory,
    })
      .then((res) => {
        if (active) setHotspotsData(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedDistrict, selectedCategory]);

  const activeScenario = useMemo(
    () =>
      AI_TRIAGE_SIMULATOR_SCENARIOS.find((s) => s.id === activeScenarioId) ??
      AI_TRIAGE_SIMULATOR_SCENARIOS[0],
    [activeScenarioId]
  );

  // Adapt public anonymized hotspot items into KarnatakaMap's complaint shape without any PII
  const mapComplaints = useMemo<Complaint[]>(() => {
    if (!hotspotsData) return [];
    return hotspotsData.items.map((item) => ({
      id: item.id,
      complaint_code: item.complaint_code,
      user_id: 0,
      title: item.title,
      description: '',
      category: item.category,
      predicted_category: item.category,
      image_path: null,
      location: item.locality,
      locality: item.locality,
      district: item.district,
      latitude: item.latitude,
      longitude: item.longitude,
      incident_date: item.created_at.slice(0, 10),
      contact_info: '',
      affected_citizens: 0,
      severity: item.priority_level,
      priority_score: item.priority_score,
      priority_level: item.priority_level,
      ai_keywords: [],
      ai_explanation: '',
      suggested_action: '',
      factor_breakdown: {
        severityPoints: 0,
        safetyRiskPoints: 0,
        duplicatePoints: 0,
        affectedCitizensPoints: 0,
        areaFrequencyPoints: 0,
        agePoints: 0,
      },
      critical_safety_flag: item.priority_level === 'Critical',
      ai_source: 'rules',
      status: item.status,
      is_demo: false,
      sla_deadline: item.sla_deadline,
      escalation_notice_generated: false,
      escalation_notice_sent_at: null,
      escalation_language: null,
      escalation_document: null,
      escalation_generation_method: null,
      sla_breach_simulated: false,
      created_at: item.created_at,
      updated_at: item.created_at,
    }));
  }, [hotspotsData]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePortalEntry = () => {
    if (currentUser) {
      onNavigate(isAdminRole(currentUser.role) ? '/admin' : '/dashboard');
    } else {
      onNavigate('/auth');
    }
  };

  const gaugeRadius = 56;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference * (1 - activeScenario.totalScore / 100);
  const gaugeStroke = activeScenario.totalScore >= 80 ? '#EF4444' : activeScenario.totalScore >= 60 ? '#F59E0B' : '#10B981';

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 selection:bg-emerald-500/30">
      {/* Subtle architectural background grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.16) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#020617]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 shrink-0 cursor-pointer text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-sm font-bold tracking-tight text-white whitespace-nowrap">
                {t('common.appName')}
              </div>
              <div className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                Karnataka Civic Command
              </div>
            </div>
          </button>

          {/* Zone 2: 4 Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-300">
            <button
              type="button"
              onClick={() => scrollToSection('telemetry')}
              className="whitespace-nowrap shrink-0 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              {t('landing.navTelemetry')}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('ai-triage')}
              className="whitespace-nowrap shrink-0 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              {t('landing.navTriage')}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('civic-map')}
              className="whitespace-nowrap shrink-0 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              {t('landing.navMap')}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('platform-features')}
              className="whitespace-nowrap shrink-0 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              {t('landing.navFeatures')}
            </button>
          </nav>

          {/* Zone 3: Language + Primary CTA */}
          <div className="flex items-center gap-2.5 shrink-0">
            <LanguageSelector variant="navy" />
            <PWAInstallButton variant="navy" />
            <button
              type="button"
              onClick={handlePortalEntry}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>
                {currentUser
                  ? isAdminRole(currentUser.role)
                    ? 'Admin Console'
                    : 'My Dashboard'
                  : t('landing.navSignIn')}
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Section 1: Interactive Hero Section */}
        <section className="relative overflow-hidden border-b border-slate-800/80">
          <div className="pointer-events-none absolute -top-40 right-0 h-[420px] w-[420px] rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-10 h-[320px] w-[320px] rounded-full bg-amber-500/10 blur-3xl" />

          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8 lg:py-24">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold tracking-wider text-emerald-400 uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>{t('landing.liveBadge')}</span>
              </div>

              <h1
                className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[54px] lg:leading-[1.08]"
                style={{ textWrap: 'balance' }}
              >
                {t('landing.heroTitle')}
              </h1>

              <p className="max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                {t('landing.heroSubtitle')}
              </p>

              <div className="flex flex-wrap items-center gap-3.5 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate(currentUser && !isAdminRole(currentUser.role) ? '/dashboard' : '/auth')}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-colors cursor-pointer"
                >
                  <span>{t('landing.ctaReport')}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('civic-map')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-6 py-3.5 text-sm font-semibold text-slate-100 hover:border-emerald-500/50 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <MapPin className="h-4 w-4 text-emerald-400" />
                  <span>{t('landing.ctaMap')}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-3 text-xs text-slate-400">
                <span>English · ಕನ್ನಡ · हिन्दी</span>
                <span aria-hidden="true">·</span>
                <span>Karnataka Municipal SLA Tracking</span>
                <span aria-hidden="true">·</span>
                <span>Automated RTI / Legal Representation</span>
              </div>
            </div>

            {/* Right Hero Command Card: Live SLA & Accountability Snapshot */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-6 backdrop-blur-md shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400">
                      Civic Command Pipeline
                    </div>
                    <div className="mt-0.5 font-display text-base font-bold text-white">
                      End-to-End Accountability Loop
                    </div>
                  </div>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    {KARNATAKA_DISTRICTS.length} Districts
                  </span>
                </div>

                <ol className="mt-5 space-y-4">
                  <li className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 font-mono text-xs font-bold text-emerald-400">
                      01
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-white">Multilingual & GPS Capture</div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Report via text, voice dictation, or photo in English, Kannada, or Hindi—even offline.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/15 font-mono text-xs font-bold text-amber-400">
                      02
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-white">Explainable 0–100 AI Triage</div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Clusters duplicates automatically and flags life-safety hazards for 48-hour Critical SLA.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500/15 font-mono text-xs font-bold text-sky-400">
                      03
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-white">SLA Deadlines & Legal Escalation</div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Live countdown timers unlock print-ready formal escalation & RTI notices if deadlines breach.
                      </p>
                    </div>
                  </li>
                </ol>

                <div className="mt-6 grid grid-cols-3 gap-2.5 border-t border-slate-800 pt-4 text-center">
                  <div className="rounded-lg bg-slate-950/70 px-2 py-2.5">
                    <div className="font-mono text-sm font-bold text-red-400 tabular-nums">48h</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">Critical SLA</div>
                  </div>
                  <div className="rounded-lg bg-slate-950/70 px-2 py-2.5">
                    <div className="font-mono text-sm font-bold text-amber-400 tabular-nums">7d</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">High SLA</div>
                  </div>
                  <div className="rounded-lg bg-slate-950/70 px-2 py-2.5">
                    <div className="font-mono text-sm font-bold text-emerald-400 tabular-nums">15d</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">Normal SLA</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Live Civic Telemetry Dashboard */}
        <section id="telemetry" className="border-b border-slate-800/80 bg-slate-950/70">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-emerald-400">
                  Real-Time SQLite Telemetry
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
                  {t('landing.telemetryTitle')}
                </h2>
              </div>
              {stats?.isDemoSeeded && (
                <div className="text-xs text-slate-400">
                  {t('landing.telemetryDemoLabel')}
                </div>
              )}
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{t('landing.statIssues')}</span>
                  <Layers className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-3 font-mono text-3xl font-bold text-white tabular-nums">
                  {stats ? stats.totalIssues : '—'}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {stats ? `${stats.resolvedIssues} resolved · ${stats.criticalIssues} critical` : 'Loading live count...'}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{t('landing.statTriage')}</span>
                  <Cpu className="h-4 w-4 text-amber-400" />
                </div>
                <div className="mt-3 font-mono text-3xl font-bold text-white tabular-nums">
                  {stats ? `${stats.avgTriageTimeSeconds.toFixed(1)}s` : '2.4s'}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  6-factor NLP + geospatial clustering
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{t('landing.statSla')}</span>
                  <Clock className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-3 font-mono text-3xl font-bold text-emerald-400 tabular-nums">
                  {stats ? `${stats.slaComplianceRate}%` : '—'}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Tracked across 48h / 7d / 15d SLAs
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{t('landing.statWards')}</span>
                  <MapPin className="h-4 w-4 text-sky-400" />
                </div>
                <div className="mt-3 font-mono text-3xl font-bold text-white tabular-nums">
                  {stats ? stats.activeWards : '—'}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Bengaluru, Mysuru, Hubballi & more
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: How Hybrid AI Triage Works — Interactive Simulator */}
        <section id="ai-triage" className="border-b border-slate-800/80 py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <div className="font-mono text-xs uppercase tracking-wider text-emerald-400">
                {t('landing.simulatorKicker')}
              </div>
              <h2 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
                {t('landing.simulatorTitle')}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-base">
                {t('landing.simulatorSubtitle')}
              </p>
            </div>

            {/* Scenario Switcher */}
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {AI_TRIAGE_SIMULATOR_SCENARIOS.map((scenario) => {
                const isSelected = scenario.id === activeScenario.id;
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => setActiveScenarioId(scenario.id)}
                    className={`rounded-xl border p-5 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500/70 bg-slate-900 shadow-lg shadow-emerald-500/10'
                        : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-[11px] font-semibold uppercase tracking-wide ${
                          scenario.safetyFlag ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {scenario.badge}
                      </span>
                      <span className="font-mono text-sm font-bold text-white tabular-nums">
                        {scenario.totalScore}/100
                      </span>
                    </div>
                    <div className="mt-2 font-display text-base font-bold text-white">
                      {scenario.title}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                      {scenario.citizenReport}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Simulator Results Panel */}
            <div className="mt-6 grid gap-6 rounded-2xl border border-slate-800 bg-slate-900/75 p-6 lg:grid-cols-12">
              {/* Left: Circular Score Gauge + Summary */}
              <div className="lg:col-span-4 flex flex-col items-center justify-center border-b border-slate-800 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
                <div className="relative flex h-36 w-36 items-center justify-center">
                  <svg className="h-36 w-36 -rotate-90" viewBox="0 0 132 132" aria-hidden="true">
                    <circle
                      cx="66"
                      cy="66"
                      r={gaugeRadius}
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth="10"
                    />
                    <circle
                      cx="66"
                      cy="66"
                      r={gaugeRadius}
                      fill="none"
                      stroke={gaugeStroke}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={gaugeCircumference}
                      strokeDashoffset={gaugeOffset}
                      className="transition-all duration-500 ease-out"
                    />
                  </svg>
                  <div className="absolute text-center">
                    <div className="font-mono text-3xl font-bold text-white tabular-nums">
                      {activeScenario.totalScore}
                    </div>
                    <div className="text-[11px] font-medium text-slate-400">/ 100 pts</div>
                  </div>
                </div>

                <div className="mt-4 text-center space-y-1">
                  <div
                    className={`font-display text-sm font-bold ${
                      activeScenario.safetyFlag ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {activeScenario.priorityLevel} Priority · SLA {activeScenario.slaWindow}
                  </div>
                  <div className="text-xs text-slate-300">{activeScenario.recommendedDepartment}</div>
                  <div className="text-[11px] text-slate-500">{activeScenario.location}</div>
                </div>
              </div>

              {/* Right: 6 Factor Breakdown Bars */}
              <div className="lg:col-span-8 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-white">
                    6-Factor Explainable Score Breakdown
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {t('landing.simulatorDisclaimer')}
                  </span>
                </div>

                <div className="grid gap-3.5 sm:grid-cols-2">
                  {activeScenario.factors.map((factor) => {
                    const pct = Math.round((factor.points / factor.maxPoints) * 100);
                    return (
                      <div key={factor.key} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-200">{factor.label}</span>
                          <span className="font-mono font-semibold text-white tabular-nums">
                            {factor.points}/{factor.maxPoints}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              activeScenario.safetyFlag ? 'bg-amber-400' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-400">{factor.detail}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 text-xs leading-relaxed text-slate-300">
                  <strong className="text-emerald-400">AI Triage Explanation: </strong>
                  {activeScenario.explanation}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Public Karnataka Hotspot Map */}
        <section id="civic-map" className="border-b border-slate-800/80 bg-slate-950/60 py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <div className="font-mono text-xs uppercase tracking-wider text-emerald-400">
                  {t('landing.mapKicker')}
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
                  {t('landing.mapTitle')}
                </h2>
                <p className="mt-2 text-sm text-slate-400">{t('landing.mapSubtitle')}</p>
              </div>
              <div className="text-xs font-mono text-slate-400 tabular-nums">
                Showing {hotspotsData?.items.length ?? 0} anonymized public records
              </div>
            </div>

            {/* District & Category Filters */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {FEATURED_DISTRICTS.map((dist) => (
                  <button
                    key={dist}
                    type="button"
                    onClick={() => setSelectedDistrict(dist)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      selectedDistrict === dist
                        ? 'bg-emerald-500 text-slate-950'
                        : 'border border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {dist === 'All' ? 'All Karnataka' : translateDistrict(t, dist)}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {PUBLIC_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setSelectedCategory(cat.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      selectedCategory === cat.value
                        ? 'bg-amber-500/20 border border-amber-400/60 text-amber-300'
                        : 'border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat.value === 'All' ? cat.label : translateCategory(t, cat.value)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <KarnatakaMap
                  mode="hotspot"
                  complaints={mapComplaints}
                  hotspots={hotspotsData?.hotspots ?? []}
                  heightClass="h-[420px]"
                />
              </div>
              <div className="lg:col-span-4 rounded-xl border border-slate-800 bg-slate-900/75 p-5 flex flex-col justify-between">
                <div>
                  <h3 className="font-display text-sm font-bold text-white">
                    Top Active Karnataka Clusters
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Public-safe anonymized locality clusters ranked by active reports.
                  </p>
                  <div className="mt-4 space-y-2.5">
                    {(hotspotsData?.hotspots ?? []).slice(0, 5).map((spot) => (
                      <div
                        key={`${spot.district}-${spot.locality}`}
                        className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-white">
                            {spot.locality}, {translateDistrict(t, spot.district)}
                          </span>
                          <span className="font-mono font-bold text-amber-400 tabular-nums">
                            {spot.count} active
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                          <span className="truncate">{translateCategory(t, spot.topCategory)}</span>
                          <span className="font-mono shrink-0 ml-2">Peak {spot.maxPriority}/100</span>
                        </div>
                      </div>
                    ))}
                    {(!hotspotsData || hotspotsData.hotspots.length === 0) && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
                        No active hotspots match the current filter selection.
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate('/auth')}
                  className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                >
                  <span>Sign in to submit or inspect tickets</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Role-Based Bento Feature Showcase */}
        <section id="platform-features" className="border-b border-slate-800/80 py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-emerald-400">
                  {t('landing.bentoKicker')}
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
                  {t('landing.bentoTitle')}
                </h2>
              </div>

              <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900 p-1">
                <button
                  type="button"
                  onClick={() => setBentoTab('citizens')}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    bentoTab === 'citizens'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>{t('landing.tabCitizens')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBentoTab('authorities')}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    bentoTab === 'authorities'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>{t('landing.tabAuthorities')}</span>
                </button>
              </div>
            </div>

            {bentoTab === 'citizens' ? (
              <div className="mt-8 grid gap-4 md:grid-cols-12">
                <div className="md:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/75 p-6">
                  <Scale className="h-6 w-6 text-amber-400" />
                  <h3 className="mt-4 font-display text-lg font-bold text-white">
                    Automated SLA Tracking & Legal / RTI Escalation
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    Every submitted complaint receives a live SLA deadline countdown (48 hours Critical, 7 days High, 15 days Normal). If municipal teams miss the deadline, unlock an instant formal escalation representation in English, Kannada, or Hindi with direct print-ready PDF download.
                  </p>
                </div>

                <div className="md:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/75 p-6">
                  <Mic className="h-6 w-6 text-emerald-400" />
                  <h3 className="mt-4 font-display text-lg font-bold text-white">
                    Multilingual Text & Voice Reporting
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    Submit complaints in English, ಕನ್ನಡ, or हिन्दी with optional speech-to-text dictation. AI automatically translates regional narratives for engineering teams.
                  </p>
                </div>

                <div className="md:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/75 p-6">
                  <WifiOff className="h-6 w-6 text-sky-400" />
                  <h3 className="mt-4 font-display text-lg font-bold text-white">
                    Offline-First PWA Queue
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    Capture GPS coordinates and photo evidence even without mobile data; drafts automatically sync to the server upon reconnection.
                  </p>
                </div>

                <div className="md:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/75 p-6">
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  <h3 className="mt-4 font-display text-lg font-bold text-white">
                    Transparent End-to-End Audit Timeline
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    Track every department routing, engineer assignment, field remark, and resolution timestamp in real time with complete accountability.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-8 grid gap-4 md:grid-cols-12">
                <div className="md:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/75 p-6">
                  <ShieldCheck className="h-6 w-6 text-emerald-400" />
                  <h3 className="mt-4 font-display text-lg font-bold text-white">
                    Two-Tier Secure Government Onboarding
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    Atomic Central Command Super Admin bootstrap followed by cryptographically generated single-use 8-character department invite codes and approval queues for municipal officers.
                  </p>
                </div>

                <div className="md:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/75 p-6">
                  <AlertTriangle className="h-6 w-6 text-red-400" />
                  <h3 className="mt-4 font-display text-lg font-bold text-white">
                    High-Visibility SLA & Escalation Alerts
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    Dedicated SLA Breach Monitoring and Legal Escalation queues surface escalated complaints immediately across municipal command views.
                  </p>
                </div>

                <div className="md:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/75 p-6">
                  <Globe className="h-6 w-6 text-amber-400" />
                  <h3 className="mt-4 font-display text-lg font-bold text-white">
                    Spatial Clusters & Duplicate Linking
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    Detects overlapping citizen reports within nearby GPS radii while preserving every citizen record for complete audit integrity.
                  </p>
                </div>

                <div className="md:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/75 p-6">
                  <FileText className="h-6 w-6 text-sky-400" />
                  <h3 className="mt-4 font-display text-lg font-bold text-white">
                    Analytics, CSV Exports & Full Audit Logs
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    Track resolution trends by district and department, export filtered compliance reports, and audit every officer onboarding and status action.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 bg-[#020617] py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div>
            <div className="font-display text-sm font-bold text-white">{t('common.appName')}</div>
            <div className="mt-1 text-xs text-slate-400">{t('landing.footerTagline')}</div>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-400">
            <button
              type="button"
              onClick={() => onNavigate('/auth')}
              className="hover:text-emerald-400 transition-colors cursor-pointer"
            >
              Citizen & Official Portal
            </button>
            <span aria-hidden="true">·</span>
            <span>Karnataka Civic Governance Prototype</span>
            <span aria-hidden="true">·</span>
            <span>Role-Based Access Control</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
