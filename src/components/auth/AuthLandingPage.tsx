import React, { useState } from 'react';
import { ArrowRight, Building2, ShieldCheck, User, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AuthRoute } from '../../types/index.ts';
import { LanguageSelector } from '../common/LanguageSelector.tsx';
import { PWAInstallButton } from '../common/PWAInstallButton.tsx';

interface AuthLandingPageProps {
  onNavigate: (route: AuthRoute) => void;
  aiMode: 'rules' | 'hybrid-gemini';
}

export const AuthLandingPage: React.FC<AuthLandingPageProps> = ({ onNavigate, aiMode }) => {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-12">
      {/* Left Brand & Platform Showcase Section */}
      <section className="lg:col-span-6 bg-[#0F294A] text-white flex flex-col justify-between px-6 py-10 sm:px-10 lg:px-14 lg:py-12">
        <div className="space-y-8">
          <div className="flex items-center justify-between gap-4">
            <span className="font-display text-xl font-bold tracking-tight text-white">
              {t('common.appName')}
            </span>
            <span className="text-xs font-medium text-teal-300">
              {aiMode === 'hybrid-gemini'
                ? t('auth.landing.hybridBadge')
                : t('auth.landing.triageBadge')}
            </span>
          </div>

          <div className="space-y-4">
            <h1
              className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.65rem] leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              {t('common.tagline')}
            </h1>
            <p className="max-w-xl text-sm sm:text-base leading-relaxed text-slate-200">
              {t('auth.landing.platformIntro')}
            </p>
          </div>

          {/* Smart City Infrastructure Illustration with Zero-Broken-Image Fallback */}
          <div className="overflow-hidden rounded-xl border border-white/15 bg-slate-900/40">
            {!imgError ? (
              <img
                src="/demo-images/smart_city_civic_illustration_1794634497695.jpg"
                alt={t('auth.landing.fallbackTitle')}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="h-56 sm:h-64 w-full object-cover"
              />
            ) : (
              <div className="flex h-56 sm:h-64 w-full flex-col items-center justify-center bg-gradient-to-br from-slate-800 via-[#0F294A] to-teal-900 px-6 text-center">
                <Building2 className="h-10 w-10 text-teal-300" />
                <div className="mt-3 font-display text-base font-semibold text-white">
                  {t('auth.landing.fallbackTitle')}
                </div>
                <p className="mt-1 max-w-sm text-xs text-slate-300">
                  {t('auth.landing.fallbackDesc')}
                </p>
              </div>
            )}
          </div>

          {/* Platform Highlights */}
          <div className="grid gap-4 border-t border-white/15 pt-6 sm:grid-cols-3">
            <div>
              <div className="font-mono text-xs font-semibold text-teal-300">
                {t('auth.landing.highlight1Title')}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-200">
                {t('auth.landing.highlight1Desc')}
              </p>
            </div>
            <div>
              <div className="font-mono text-xs font-semibold text-teal-300">
                {t('auth.landing.highlight2Title')}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-200">
                {t('auth.landing.highlight2Desc')}
              </p>
            </div>
            <div>
              <div className="font-mono text-xs font-semibold text-teal-300">
                {t('auth.landing.highlight3Title')}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-200">
                {t('auth.landing.highlight3Desc')}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-5 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
          <span>{t('auth.landing.footerLeft')}</span>
          <span>{t('auth.landing.footerRight')}</span>
        </div>
      </section>

      {/* Right Explicit Account-Type Selection Section */}
      <section className="lg:col-span-6 flex flex-col justify-between px-6 py-8 sm:px-10 lg:px-14 lg:py-12 bg-slate-50">
        <div className="flex items-center justify-end gap-2.5">
          <LanguageSelector variant="light" />
          <PWAInstallButton />
        </div>

        <div className="mx-auto my-auto w-full max-w-md py-8 space-y-7">
          <div>
            <div className="text-xs font-medium text-slate-500">
              {t('auth.landing.gatewayLabel')}
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">
              {t('auth.landing.selectTitle')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {t('auth.landing.selectSubtitle')}
            </p>
          </div>

          <div className="space-y-4">
            {/* Option 1: Citizen Login */}
            <button
              type="button"
              onClick={() => onNavigate('/login/citizen')}
              className="group w-full rounded-xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display text-base font-bold text-slate-900">
                      {t('auth.landing.citizenTitle')}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {t('auth.landing.citizenDesc')}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-teal-700 transition-colors mt-1" />
              </div>
            </button>

            {/* Option 2: Government Administrator Login */}
            <button
              type="button"
              onClick={() => onNavigate('/login/admin')}
              className="group w-full rounded-xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display text-base font-bold text-slate-900">
                      {t('auth.landing.adminTitle')}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {t('auth.landing.adminDesc')}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-900 transition-colors mt-1" />
              </div>
            </button>
          </div>

          <div className="border-t border-slate-200 pt-5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <button
              type="button"
              onClick={() => onNavigate('/register/citizen')}
              className="inline-flex items-center gap-1.5 font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>{t('auth.landing.registerLink')}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/forgot-password')}
              className="font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              {t('auth.landing.forgotLink')}
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-slate-500 lg:text-left">
          {t('auth.landing.securityFooter')}
        </div>
      </section>
    </div>
  );
};
