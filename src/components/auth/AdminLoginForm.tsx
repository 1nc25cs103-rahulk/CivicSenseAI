import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchAuthPolicy, loginAdminApi } from '../../lib/api.ts';
import type { AuthRoute, User } from '../../types/index.ts';
import { LanguageSelector } from '../common/LanguageSelector.tsx';
import { PasswordField } from './PasswordField.tsx';

interface AdminLoginFormProps {
  onNavigate: (route: AuthRoute) => void;
  onAuthenticated: (user: User) => void;
  bannerMessage?: string | null;
}

export const AdminLoginForm: React.FC<AdminLoginFormProps> = ({
  onNavigate,
  onAuthenticated,
  bannerMessage,
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [allowedDomains, setAllowedDomains] = useState<string[]>([
    'civicsense.gov.in',
    'karnataka.gov.in',
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAuthPolicy()
      .then((p) => {
        if (p.allowedAdminDomains?.length) {
          setAllowedDomains(p.allowedAdminDomains);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError(t('auth.adminLogin.errMissing'));
      return;
    }

    setSubmitting(true);
    try {
      const session = await loginAdminApi(email.trim(), password);
      onAuthenticated(session.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.adminLogin.errGeneric'));
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
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              {t('auth.adminLogin.title')}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {t('auth.adminLogin.subtitle')}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 space-y-1">
          <div className="font-semibold text-slate-900">{t('auth.adminLogin.policyTitle')}</div>
          <p className="text-[11px] leading-relaxed text-slate-600">
            {t('auth.adminLogin.policyDesc')}{' '}
            <span className="font-mono font-medium text-slate-900">
              {allowedDomains.join(', ')}
            </span>
          </p>
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
            <label className="block text-xs font-semibold text-slate-700" htmlFor="admin-login-email">
              {t('auth.adminLogin.emailLabel')}
            </label>
            <input
              id="admin-login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.adminLogin.emailPlaceholder')}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
            />
          </div>

          <PasswordField
            id="admin-login-password"
            label={t('auth.adminLogin.passwordLabel')}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            accent="navy"
          />

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => onNavigate('/forgot-password')}
              className="text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
            >
              {t('auth.landing.forgotLink')}
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60"
          >
            <Lock className="h-4 w-4" />
            <span>
              {submitting ? t('auth.adminLogin.submittingBtn') : t('auth.adminLogin.submitBtn')}
            </span>
          </button>
        </form>

        <div className="border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-500">
          {t('auth.adminLogin.note')}
        </div>
      </main>

      <div className="text-center text-xs text-slate-500">
        {t('auth.adminLogin.footer')}
      </div>
    </div>
  );
};
