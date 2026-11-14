import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  requestSecurityQuestionApi,
  resetPasswordApi,
  verifySecurityAnswerApi,
} from '../../lib/api.ts';
import type { AuthRoute } from '../../types/index.ts';
import { LanguageSelector } from '../common/LanguageSelector.tsx';
import { isStrongPassword, PasswordField } from './PasswordField.tsx';

interface ForgotPasswordFlowProps {
  onNavigate: (route: AuthRoute) => void;
  onResetComplete: (message: string, suggestedLoginRoute: AuthRoute) => void;
}

type RecoveryStep = 1 | 2 | 3;

export const ForgotPasswordFlow: React.FC<ForgotPasswordFlowProps> = ({
  onNavigate,
  onResetComplete,
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<RecoveryStep>(1);
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [answer, setAnswer] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError(t('auth.forgot.errEmail'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await requestSecurityQuestionApi(email.trim());
      setQuestion(res.question);
      setChallengeToken(res.challengeToken);
      setAnswer('');
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.forgot.errEmail'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!answer.trim()) {
      setError(t('auth.forgot.errAnswer'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await verifySecurityAnswerApi(challengeToken, answer.trim());
      setResetToken(res.resetToken);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.forgot.errAnswer'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isStrongPassword(newPassword)) {
      setError(t('auth.forgot.errStrength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.forgot.errMatch'));
      return;
    }

    setSubmitting(true);
    try {
      await resetPasswordApi(resetToken, newPassword, confirmPassword);
      const isLikelyAdmin =
        email.trim().toLowerCase().endsWith('.gov.in') ||
        email.trim().toLowerCase().includes('admin@civicsense');
      onResetComplete(
        t('auth.forgot.successMessage'),
        isLikelyAdmin ? '/login/admin' : '/login/citizen'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.forgot.errStrength'));
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
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              {t('auth.forgot.title')}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {t('auth.forgot.subtitle')}
            </p>
          </div>
        </div>

        {/* Clean Step Progress */}
        <div className="grid grid-cols-3 gap-2 border-y border-slate-100 py-3 text-[11px] font-medium">
          <div className={step === 1 ? 'font-semibold text-slate-900' : step > 1 ? 'text-emerald-700' : 'text-slate-400'}>
            {t('auth.forgot.step1')}
          </div>
          <div className={step === 2 ? 'font-semibold text-slate-900' : step > 2 ? 'text-emerald-700' : 'text-slate-400'}>
            {t('auth.forgot.step2')}
          </div>
          <div className={step === 3 ? 'font-semibold text-slate-900' : 'text-slate-400'}>
            {t('auth.forgot.step3')}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-900">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={(e) => void handleRequestQuestion(e)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700" htmlFor="recovery-email">
                {t('auth.forgot.emailLabel')}
              </label>
              <input
                id="recovery-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.forgot.emailPlaceholder')}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60"
            >
              {submitting ? t('auth.forgot.checkingBtn') : t('auth.forgot.continueBtn')}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={(e) => void handleVerifyAnswer(e)} className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-[11px] font-semibold text-slate-500">
                {t('auth.forgot.questionHeading')}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {t(`securityQuestions.${question}`, { defaultValue: question })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700" htmlFor="recovery-answer">
                {t('auth.forgot.answerLabel')}
              </label>
              <input
                id="recovery-answer"
                type="text"
                required
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={t('auth.forgot.answerPlaceholder')}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {t('auth.forgot.changeEmailBtn')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60"
              >
                {submitting ? t('auth.forgot.verifyingBtn') : t('auth.forgot.verifyBtn')}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={(e) => void handleResetPassword(e)} className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{t('auth.forgot.verifiedBanner')}</span>
            </div>

            <PasswordField
              id="recovery-new-password"
              label={t('auth.forgot.newPasswordLabel')}
              value={newPassword}
              onChange={setNewPassword}
              placeholder={t('auth.forgot.newPasswordPlaceholder')}
              autoComplete="new-password"
              showStrengthRules
              accent="navy"
            />

            <PasswordField
              id="recovery-confirm-password"
              label={t('auth.forgot.confirmPasswordLabel')}
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder={t('auth.forgot.confirmPasswordPlaceholder')}
              autoComplete="new-password"
              accent="navy"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60"
            >
              {submitting ? t('auth.forgot.resettingBtn') : t('auth.forgot.resetBtn')}
            </button>
          </form>
        )}

        <div className="border-t border-slate-100 pt-4 flex items-center justify-between text-xs text-slate-600">
          <button
            type="button"
            onClick={() => onNavigate('/login/citizen')}
            className="font-medium text-teal-700 hover:text-teal-800 cursor-pointer"
          >
            {t('auth.landing.citizenTitle')}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/login/admin')}
            className="font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            {t('auth.forgot.adminLoginLink')}
          </button>
        </div>
      </main>

      <div className="text-center text-xs text-slate-500">
        {t('auth.forgot.footer')}
      </div>
    </div>
  );
};
