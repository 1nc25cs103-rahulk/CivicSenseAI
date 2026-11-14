import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { registerCitizenApi } from '../../lib/api.ts';
import type { AuthRoute } from '../../types/index.ts';
import { SUGGESTED_SECURITY_QUESTIONS } from '../../types/index.ts';
import { LanguageSelector } from '../common/LanguageSelector.tsx';
import { isStrongPassword, PasswordField } from './PasswordField.tsx';

interface CitizenRegisterFormProps {
  onNavigate: (route: AuthRoute) => void;
  onRegisteredSuccess: (message: string) => void;
}

const CUSTOM_QUESTION_VALUE = '__CUSTOM__';

export const CitizenRegisterForm: React.FC<CitizenRegisterFormProps> = ({
  onNavigate,
  onRegisteredSuccess,
}) => {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [questionChoice, setQuestionChoice] = useState<string>(SUGGESTED_SECURITY_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveQuestion =
    questionChoice === CUSTOM_QUESTION_VALUE ? customQuestion.trim() : questionChoice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (fullName.trim().length < 2) {
      setError(t('auth.register.errFullName'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError(t('auth.register.errEmail'));
      return;
    }
    const digits = mobile.replace(/\D/g, '');
    const normalizedDigits =
      digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : digits.length === 11 && digits.startsWith('0')
          ? digits.slice(1)
          : digits;
    if (!/^[6-9]\d{9}$/.test(normalizedDigits)) {
      setError(t('auth.register.errMobile'));
      return;
    }
    if (!isStrongPassword(password)) {
      setError(t('auth.register.errPasswordStrength'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.register.errPasswordMatch'));
      return;
    }
    if (effectiveQuestion.length < 8) {
      setError(t('auth.register.errQuestion'));
      return;
    }
    if (securityAnswer.trim().length < 2) {
      setError(t('auth.register.errAnswer'));
      return;
    }

    setSubmitting(true);
    try {
      await registerCitizenApi({
        full_name: fullName.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        password,
        confirmPassword,
        security_question: effectiveQuestion,
        security_answer: securityAnswer.trim(),
      });
      onRegisteredSuccess(t('auth.register.successMessage'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.register.errGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between px-6 py-8">
      <div className="mx-auto w-full max-w-lg flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigate('/login/citizen')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span>{t('common.backToCitizenLogin')}</span>
        </button>
        <div className="flex items-center gap-2.5">
          <span className="font-display text-sm font-bold text-slate-900 hidden sm:inline">
            {t('common.appName')}
          </span>
          <LanguageSelector variant="light" />
        </div>
      </div>

      <main className="mx-auto my-8 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-7 sm:p-8 space-y-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              {t('auth.register.title')}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {t('auth.register.subtitle')}
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-900">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700" htmlFor="reg-fullname">
              {t('auth.register.fullNameLabel')}
            </label>
            <input
              id="reg-fullname"
              type="text"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('auth.register.fullNamePlaceholder')}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700" htmlFor="reg-email">
                {t('auth.register.emailLabel')}
              </label>
              <input
                id="reg-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.register.emailPlaceholder')}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700" htmlFor="reg-mobile">
                {t('auth.register.mobileLabel')}
              </label>
              <input
                id="reg-mobile"
                type="tel"
                required
                autoComplete="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder={t('auth.register.mobilePlaceholder')}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm tabular-nums text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>
          </div>

          <PasswordField
            id="reg-password"
            label={t('auth.register.passwordLabel')}
            value={password}
            onChange={setPassword}
            placeholder={t('auth.register.passwordPlaceholder')}
            autoComplete="new-password"
            showStrengthRules
            accent="teal"
          />

          <PasswordField
            id="reg-confirm-password"
            label={t('auth.register.confirmPasswordLabel')}
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder={t('auth.register.confirmPasswordPlaceholder')}
            autoComplete="new-password"
            accent="teal"
          />

          <div className="border-t border-slate-100 pt-3 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700" htmlFor="reg-security-question">
                {t('auth.register.securityQuestionLabel')}
              </label>
              <select
                id="reg-security-question"
                value={questionChoice}
                onChange={(e) => setQuestionChoice(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              >
                {SUGGESTED_SECURITY_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {t(`securityQuestions.${q}`, { defaultValue: q })}
                  </option>
                ))}
                <option value={CUSTOM_QUESTION_VALUE}>{t('auth.register.customOption')}</option>
              </select>
            </div>

            {questionChoice === CUSTOM_QUESTION_VALUE && (
              <div>
                <label className="block text-xs font-semibold text-slate-700" htmlFor="reg-custom-question">
                  {t('auth.register.customQuestionLabel')}
                </label>
                <input
                  id="reg-custom-question"
                  type="text"
                  required
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder={t('auth.register.customQuestionPlaceholder')}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700" htmlFor="reg-security-answer">
                {t('auth.register.securityAnswerLabel')}
              </label>
              <input
                id="reg-security-answer"
                type="text"
                required
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder={t('auth.register.securityAnswerPlaceholder')}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" />
            <span>
              {submitting ? t('auth.register.submittingBtn') : t('auth.register.submitBtn')}
            </span>
          </button>
        </form>

        <div className="border-t border-slate-100 pt-4 flex items-center justify-between text-xs">
          <span className="text-slate-600">{t('auth.register.alreadyAccount')}</span>
          <button
            type="button"
            onClick={() => onNavigate('/login/citizen')}
            className="font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
          >
            {t('auth.register.signInInstead')}
          </button>
        </div>
      </main>

      <div className="text-center text-xs text-slate-500">
        {t('auth.register.footer')}
      </div>
    </div>
  );
};
