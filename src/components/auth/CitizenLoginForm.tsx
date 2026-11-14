import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, LogIn, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { loginCitizenApi } from '../../lib/api.ts';
import type { AuthRoute, User as UserType } from '../../types/index.ts';
import { LanguageSelector } from '../common/LanguageSelector.tsx';
import { PasswordField } from './PasswordField.tsx';

interface CitizenLoginFormProps {
  onNavigate: (route: AuthRoute) => void;
  onAuthenticated: (user: UserType) => void;
  bannerMessage?: string | null;
}

export const CitizenLoginForm: React.FC<CitizenLoginFormProps> = ({
  onNavigate,
  onAuthenticated,
  bannerMessage,
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(t('auth.citizenLogin.errMissing'));
      return;
    }

    setSubmitting(true);
    try {
      const session = await loginCitizenApi(email.trim(), password);
      onAuthenticated(session.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.citizenLogin.errGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between px-6 py-8">
      <div className="mx-auto w-full max-w-md flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span>{t('common.backToPortal')}</span>
        </button>
        <div className="flex items-center gap-2.5">
          <span className="font-display text-sm font-bold text-slate-900 hidden sm:inline">
            {t('common.appName')}
          </span>
          <LanguageSelector variant="light" />
        </div>
      </div>

      <main className="mx-auto my-8 w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 sm:p-8 space-y-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              {t('auth.citizenLogin.title')}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {t('auth.citizenLogin.subtitle')}
            </p>
          </div>
        </div>

        {bannerMessage && (
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-950">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{bannerMessage}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-900">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700" htmlFor="citizen-login-email">
              {t('auth.citizenLogin.emailLabel')}
            </label>
            <input
              id="citizen-login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.citizenLogin.emailPlaceholder')}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <PasswordField
            id="citizen-login-password"
            label={t('auth.citizenLogin.passwordLabel')}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            accent="teal"
          />

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => onNavigate('/forgot-password')}
              className="text-xs font-medium text-teal-700 hover:text-teal-800 cursor-pointer"
            >
              {t('auth.landing.forgotLink')}
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            <span>
              {submitting ? t('auth.citizenLogin.submittingBtn') : t('auth.citizenLogin.submitBtn')}
            </span>
          </button>
        </form>

        <div className="border-t border-slate-100 pt-4 flex items-center justify-between text-xs">
          <span className="text-slate-600">{t('auth.citizenLogin.newHere')}</span>
          <button
            type="button"
            onClick={() => onNavigate('/register/citizen')}
            className="font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
          >
            {t('auth.citizenLogin.registerAction')}
          </button>
        </div>
      </main>

      <div className="text-center text-xs text-slate-500">
        {t('auth.citizenLogin.footer')}
      </div>
    </div>
  );
};
