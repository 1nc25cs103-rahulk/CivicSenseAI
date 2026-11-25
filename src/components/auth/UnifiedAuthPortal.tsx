import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  KeyRound,
  Lock,
  Shield,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Wifi,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  fetchAdminBootstrapStatus,
  fetchPublicStats,
  loginCitizenApi,
  loginDemoAdminApi,
  loginUnifiedApi,
  registerCitizenApi,
  registerInitialAdminApi,
  registerOfficialApi,
  requestSecurityQuestionApi,
  resetPasswordApi,
  verifySecurityAnswerApi,
} from '../../lib/api.ts';
import { translateSecurityQuestion } from '../../lib/i18nHelpers.ts';
import type {
  AdminBootstrapStatus,
  AuthRoute,
  PublicStatsResponse,
  User,
} from '../../types/index.ts';
import {
  MUNICIPAL_DEPARTMENTS,
  SUGGESTED_SECURITY_QUESTIONS,
} from '../../types/index.ts';
import { LanguageSelector } from '../common/LanguageSelector.tsx';
import { PasswordField } from './PasswordField.tsx';

export type AuthPortalTab = 'citizen' | 'official_signin' | 'official_register' | 'forgot';

interface UnifiedAuthPortalProps {
  initialTab?: AuthPortalTab;
  initialCitizenMode?: 'signin' | 'register';
  bannerMessage?: string | null;
  onNavigate: (route: AuthRoute) => void;
  onAuthenticated: (user: User) => void;
}

function isStrongPassword(pw: string): boolean {
  return (
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

export const UnifiedAuthPortal: React.FC<UnifiedAuthPortalProps> = ({
  initialTab = 'citizen',
  initialCitizenMode = 'signin',
  bannerMessage,
  onNavigate,
  onAuthenticated,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AuthPortalTab>(initialTab);
  const [citizenMode, setCitizenMode] = useState<'signin' | 'register'>(initialCitizenMode);
  const [officialRegMethod, setOfficialRegMethod] = useState<'invite' | 'email'>('invite');

  const [bootstrapStatus, setBootstrapStatus] = useState<AdminBootstrapStatus | null>(null);
  const [publicStats, setPublicStats] = useState<PublicStatsResponse | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(bannerMessage ?? null);
  const [submitting, setSubmitting] = useState(false);

  // Citizen / Official Sign-in fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Shared Registration fields
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState<string>(MUNICIPAL_DEPARTMENTS[0]);
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState<string>(SUGGESTED_SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');

  // Forgot Password 3-step state
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotQuestion, setForgotQuestion] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [forgotAnswer, setForgotAnswer] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setCitizenMode(initialCitizenMode);
  }, [initialCitizenMode]);

  useEffect(() => {
    if (bannerMessage) setSuccessMsg(bannerMessage);
  }, [bannerMessage]);

  const refreshBootstrap = () => {
    fetchAdminBootstrapStatus()
      .then((res) => setBootstrapStatus(res))
      .catch(() => {});
  };

  useEffect(() => {
    refreshBootstrap();
    fetchPublicStats()
      .then((res) => setPublicStats(res))
      .catch(() => {});
  }, []);

  const clearFeedback = () => {
    setError(null);
    setSuccessMsg(null);
  };

  const resetRegPasswords = () => {
    setPassword('');
    setConfirmPassword('');
    setSecurityAnswer('');
  };

  const handleCitizenSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (!loginEmail.trim() || !loginPassword) {
      setError('Please enter your registered email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      const session = await loginCitizenApi(loginEmail.trim(), loginPassword);
      onAuthenticated(session.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCitizenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (fullName.trim().length < 2) {
      setError('Full name must be at least 2 characters.');
      return;
    }
    if (!isStrongPassword(password)) {
      setError('Password must be at least 8 characters with uppercase, lowercase, number, and special character.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and confirmation password do not match.');
      return;
    }
    if (securityAnswer.trim().length < 2) {
      setError('Please provide an answer to your security question.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await registerCitizenApi({
        full_name: fullName.trim(),
        email: regEmail.trim(),
        mobile: mobile.trim(),
        password,
        confirmPassword,
        security_question: securityQuestion,
        security_answer: securityAnswer.trim(),
      });
      setLoginEmail(regEmail.trim());
      setLoginPassword('');
      resetRegPasswords();
      setCitizenMode('signin');
      setSuccessMsg(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Citizen registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOfficialSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (!loginEmail.trim() || !loginPassword) {
      setError('Please enter your official email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      const session = await loginUnifiedApi(loginEmail.trim(), loginPassword, 'official');
      onAuthenticated(session.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Official sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoAdminLogin = async () => {
    clearFeedback();
    setSubmitting(true);
    try {
      const session = await loginDemoAdminApi();
      onAuthenticated(session.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo admin sign-in unavailable.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitialBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (!isStrongPassword(password)) {
      setError('Password must be at least 8 characters with uppercase, lowercase, number, and special character.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and confirmation password do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await registerInitialAdminApi({
        full_name: fullName.trim(),
        email: regEmail.trim(),
        employee_id: employeeId.trim(),
        designation: designation.trim(),
        mobile: mobile.trim() || undefined,
        password,
        confirmPassword,
        security_question: securityQuestion,
        security_answer: securityAnswer.trim(),
      });
      refreshBootstrap();
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Super Administrator initialization failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOfficialRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (!isStrongPassword(password)) {
      setError('Password must be at least 8 characters with uppercase, lowercase, number, and special character.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and confirmation password do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await registerOfficialApi({
        registration_method: officialRegMethod,
        invite_code: officialRegMethod === 'invite' ? inviteCode.trim().toUpperCase() : undefined,
        full_name: fullName.trim(),
        email: regEmail.trim(),
        department,
        employee_id: employeeId.trim(),
        designation: designation.trim(),
        mobile: mobile.trim() || undefined,
        password,
        confirmPassword,
        security_question: securityQuestion,
        security_answer: securityAnswer.trim(),
      });

      if (res.status === 'active' && res.token) {
        onAuthenticated(res.user);
      } else {
        resetRegPasswords();
        setInviteCode('');
        setActiveTab('official_signin');
        setLoginEmail(regEmail.trim());
        setSuccessMsg(res.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Official registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setSubmitting(true);
    try {
      const res = await requestSecurityQuestionApi(forgotEmail.trim());
      setForgotQuestion(res.question);
      setChallengeToken(res.challengeToken);
      setForgotStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start recovery.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setSubmitting(true);
    try {
      const res = await verifySecurityAnswerApi(challengeToken, forgotAnswer.trim());
      setResetToken(res.resetToken);
      setForgotStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Security verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (!isStrongPassword(newPassword)) {
      setError('New password must meet all strength requirements.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New password and confirmation password do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await resetPasswordApi(resetToken, newPassword, confirmNewPassword);
      setForgotStep(1);
      setForgotAnswer('');
      setNewPassword('');
      setConfirmNewPassword('');
      setActiveTab('citizen');
      setCitizenMode('signin');
      setLoginEmail(forgotEmail.trim());
      setSuccessMsg(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 lg:grid lg:grid-cols-12">
      {/* Left Brand & Dynamic Civic Telemetry Panel */}
      <aside className="relative flex flex-col justify-between overflow-hidden border-b border-slate-800 bg-slate-950 p-6 sm:p-10 lg:col-span-5 lg:border-b-0 lg:border-r">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(16,185,129,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(16,185,129,0.22) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t('authPortal.backToLanding')}</span>
            </button>
            <LanguageSelector variant="navy" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="font-display text-lg font-bold text-white">{t('common.appName')}</div>
              <div className="text-xs text-emerald-400">{t('common.tagline')}</div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <h1 className="font-display text-2xl font-bold text-white sm:text-3xl leading-tight">
              Unified Civic Access & Two-Tier Government Command
            </h1>
            <p className="text-xs leading-relaxed text-slate-400 sm:text-sm">
              Sign in as a Karnataka citizen to report infrastructure hazards with live SLA countdowns, or authenticate as a municipal official with role-based governance permissions.
            </p>
          </div>

          {/* Dynamic Telemetry Cards from SQLite */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="text-[11px] text-slate-400">Tracked Issues</div>
              <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                {publicStats ? publicStats.totalIssues : '—'}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="text-[11px] text-slate-400">SLA Compliance</div>
              <div className="mt-1 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                {publicStats ? `${publicStats.slaComplianceRate}%` : '—'}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="text-[11px] text-slate-400">Active Wards</div>
              <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                {publicStats ? publicStats.activeWards : '—'}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="text-[11px] text-slate-400">Critical Alerts</div>
              <div className="mt-1 font-mono text-2xl font-bold text-amber-400 tabular-nums">
                {publicStats ? publicStats.criticalIssues : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-8 space-y-3 border-t border-slate-800 pt-5 text-xs text-slate-400">
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <Wifi className="h-3.5 w-3.5" />
            <span>{t('authPortal.offlineReady')} · English, ಕನ್ನಡ, हिन्दी</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Protected by bcrypt password hashing, server-verified HttpOnly sessions, atomic Super Admin bootstrap, and single-use invite provisioning.
          </p>
        </div>
      </aside>

      {/* Right Interactive Auth Panel */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8 lg:col-span-7">
        <div className="w-full max-w-xl space-y-6">
          {/* Primary 3-Tab Switcher */}
          {activeTab !== 'forgot' && (
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 p-1.5">
              <button
                type="button"
                onClick={() => {
                  clearFeedback();
                  setActiveTab('citizen');
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'citizen'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('authPortal.tabCitizen')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  clearFeedback();
                  setActiveTab('official_signin');
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'official_signin'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('authPortal.tabOfficialSignIn')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  clearFeedback();
                  setActiveTab('official_register');
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'official_register'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <UserPlus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('authPortal.tabOfficialRegister')}</span>
              </button>
            </div>
          )}

          {/* Prototype Mode Notice on Official Tabs */}
          {(activeTab === 'official_signin' || activeTab === 'official_register') &&
            bootstrapStatus?.prototypeMode && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 leading-relaxed">
                <strong className="text-amber-300">Academic Prototype Mode: </strong>
                {t('authPortal.prototypeBanner')}
              </div>
            )}

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Card Container */}
          <div className="rounded-2xl border border-slate-800 bg-white p-6 text-slate-900 shadow-2xl sm:p-8">
            {/* TAB 1: CITIZEN PORTAL (Sign In / Register) */}
            {activeTab === 'citizen' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      {citizenMode === 'signin' ? 'Citizen Sign In' : 'Create Citizen Account'}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Report civic hazards, track SLA countdowns, and generate escalation notices.
                    </p>
                  </div>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        clearFeedback();
                        setCitizenMode('signin');
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                        citizenMode === 'signin' ? 'bg-slate-900 text-white' : 'text-slate-600'
                      }`}
                    >
                      {t('authPortal.citizenSignIn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearFeedback();
                        setCitizenMode('register');
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                        citizenMode === 'register' ? 'bg-slate-900 text-white' : 'text-slate-600'
                      }`}
                    >
                      {t('authPortal.citizenRegister')}
                    </button>
                  </div>
                </div>

                {citizenMode === 'signin' ? (
                  <form onSubmit={(e) => void handleCitizenSignIn(e)} className="space-y-4">
                    <div>
                      <label htmlFor="citizen-email" className="block text-xs font-semibold text-slate-700">
                        Registered Email Address
                      </label>
                      <input
                        id="citizen-email"
                        type="email"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="you@gmail.com"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <PasswordField
                      id="citizen-password"
                      label="Password"
                      value={loginPassword}
                      onChange={setLoginPassword}
                      required
                    />
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          clearFeedback();
                          setForgotStep(1);
                          setActiveTab('forgot');
                        }}
                        className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                    >
                      {submitting ? 'Signing in...' : 'Sign In to Citizen Dashboard'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={(e) => void handleCitizenRegister(e)} className="space-y-3.5">
                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <div>
                        <label htmlFor="cit-reg-name" className="block text-xs font-semibold text-slate-700">
                          Full Name *
                        </label>
                        <input
                          id="cit-reg-name"
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g., Ananya Rao"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="cit-reg-mobile" className="block text-xs font-semibold text-slate-700">
                          Mobile Number *
                        </label>
                        <input
                          id="cit-reg-mobile"
                          type="tel"
                          required
                          value={mobile}
                          onChange={(e) => setMobile(e.target.value)}
                          placeholder="9845012345"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="cit-reg-email" className="block text-xs font-semibold text-slate-700">
                        Email Address *
                      </label>
                      <input
                        id="cit-reg-email"
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="ananya@gmail.com"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>

                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <PasswordField
                        id="cit-reg-pw"
                        label="Password *"
                        value={password}
                        onChange={setPassword}
                        showStrengthChecklist
                        required
                      />
                      <PasswordField
                        id="cit-reg-confirm"
                        label="Confirm Password *"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="cit-reg-sq" className="block text-xs font-semibold text-slate-700">
                        Security Question *
                      </label>
                      <select
                        id="cit-reg-sq"
                        value={securityQuestion}
                        onChange={(e) => setSecurityQuestion(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                      >
                        {SUGGESTED_SECURITY_QUESTIONS.map((q) => (
                          <option key={q} value={q}>
                            {translateSecurityQuestion(t, q)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="cit-reg-sa" className="block text-xs font-semibold text-slate-700">
                        Security Answer *
                      </label>
                      <input
                        id="cit-reg-sa"
                        type="text"
                        required
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        placeholder="Stored securely hashed"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                    >
                      {submitting ? 'Creating Account...' : 'Create Citizen Account'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* TAB 2: GOVERNMENT OFFICIAL SIGN IN */}
            {activeTab === 'official_signin' && (
              <div className="space-y-5">
                <div className="border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                    <Shield className="h-4 w-4" />
                    <span>Municipal & Super Admin Access</span>
                  </div>
                  <h2 className="mt-1 font-display text-xl font-bold text-slate-900">
                    Government Official Sign In
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Authenticate as an approved Municipal Official or Central Command Super Administrator.
                  </p>
                </div>

                <form onSubmit={(e) => void handleOfficialSignIn(e)} className="space-y-4">
                  <div>
                    <label htmlFor="official-email" className="block text-xs font-semibold text-slate-700">
                      Official Email Address
                    </label>
                    <input
                      id="official-email"
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder={bootstrapStatus?.prototypeMode ? 'official@example.com or officer@bbmp.gov.in' : 'officer@bbmp.gov.in'}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <PasswordField
                    id="official-password"
                    label="Password"
                    value={loginPassword}
                    onChange={setLoginPassword}
                    required
                  />
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        clearFeedback();
                        setActiveTab('official_register');
                      }}
                      className="font-semibold text-slate-700 hover:text-emerald-700 cursor-pointer"
                    >
                      {bootstrapStatus?.bootstrapAvailable
                        ? 'Need to initialize Super Admin?'
                        : 'Register with invite code →'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearFeedback();
                        setForgotStep(1);
                        setActiveTab('forgot');
                      }}
                      className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                  >
                    {submitting ? 'Verifying Credentials...' : 'Sign In to Admin Console'}
                  </button>
                </form>

                {bootstrapStatus?.demoAdminEnabled && (
                  <div className="border-t border-slate-200 pt-4 space-y-2.5">
                    <div className="text-[11px] font-medium text-slate-500">
                      Evaluating the prototype? Explore the Administration Console without locking Super Admin Bootstrap:
                    </div>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleDemoAdminLogin()}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-60 cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                      <span>{t('authPortal.quickDemoAdmin')}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: OFFICIAL REGISTRATION (Phase A Bootstrap OR Phase B Invite/Email) */}
            {activeTab === 'official_register' && (
              <div className="space-y-5">
                {bootstrapStatus?.bootstrapAvailable ? (
                  <>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                        <KeyRound className="h-4 w-4 text-emerald-700" />
                        <span>Phase A · {t('authPortal.bootstrapTitle')}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                        {t('authPortal.bootstrapSubtitle')}
                      </p>
                    </div>

                    <form onSubmit={(e) => void handleInitialBootstrap(e)} className="space-y-3.5">
                      <div className="grid gap-3.5 sm:grid-cols-2">
                        <div>
                          <label htmlFor="boot-name" className="block text-xs font-semibold text-slate-700">
                            Full Name *
                          </label>
                          <input
                            id="boot-name"
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g., Meera Deshpande"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="boot-email" className="block text-xs font-semibold text-slate-700">
                            Official Email (Any valid email allowed) *
                          </label>
                          <input
                            id="boot-email"
                            type="email"
                            required
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            placeholder="commissioner@example.com"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3.5 sm:grid-cols-3">
                        <div>
                          <label htmlFor="boot-empid" className="block text-xs font-semibold text-slate-700">
                            Employee ID *
                          </label>
                          <input
                            id="boot-empid"
                            type="text"
                            required
                            value={employeeId}
                            onChange={(e) => setEmployeeId(e.target.value)}
                            placeholder="GOV-KA-001"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="boot-desig" className="block text-xs font-semibold text-slate-700">
                            Designation *
                          </label>
                          <input
                            id="boot-desig"
                            type="text"
                            required
                            value={designation}
                            onChange={(e) => setDesignation(e.target.value)}
                            placeholder="Civic Commissioner"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            Department (Auto)
                          </label>
                          <input
                            type="text"
                            readOnly
                            value="Central Command"
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3.5 sm:grid-cols-2">
                        <PasswordField
                          id="boot-pw"
                          label="Password *"
                          value={password}
                          onChange={setPassword}
                          showStrengthChecklist
                          required
                        />
                        <PasswordField
                          id="boot-confirm"
                          label="Confirm Password *"
                          value={confirmPassword}
                          onChange={setConfirmPassword}
                          required
                        />
                      </div>

                      <div className="grid gap-3.5 sm:grid-cols-2">
                        <div>
                          <label htmlFor="boot-sq" className="block text-xs font-semibold text-slate-700">
                            Security Question *
                          </label>
                          <select
                            id="boot-sq"
                            value={securityQuestion}
                            onChange={(e) => setSecurityQuestion(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          >
                            {SUGGESTED_SECURITY_QUESTIONS.map((q) => (
                              <option key={q} value={q}>
                                {translateSecurityQuestion(t, q)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="boot-sa" className="block text-xs font-semibold text-slate-700">
                            Security Answer *
                          </label>
                          <input
                            id="boot-sa"
                            type="text"
                            required
                            value={securityAnswer}
                            onChange={(e) => setSecurityAnswer(e.target.value)}
                            placeholder="Recovery answer"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                      >
                        {submitting
                          ? 'Initializing Central Command...'
                          : 'Initialize Super Administrator & Lock Bootstrap'}
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <div className="border-b border-slate-200 pb-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <Lock className="h-3.5 w-3.5 text-emerald-700" />
                        <span>Super Admin Bootstrap Locked · Two-Tier Onboarding Active</span>
                      </div>
                      <h2 className="mt-1 font-display text-xl font-bold text-slate-900">
                        Government Official Registration
                      </h2>
                      <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1">
                        <button
                          type="button"
                          onClick={() => {
                            clearFeedback();
                            setOfficialRegMethod('invite');
                          }}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                            officialRegMethod === 'invite'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          {t('authPortal.methodInvite')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearFeedback();
                            setOfficialRegMethod('email');
                          }}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                            officialRegMethod === 'email'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          {t('authPortal.methodEmail')}
                        </button>
                      </div>
                    </div>

                    {officialRegMethod === 'email' && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        {t('authPortal.pendingNotice')}
                      </div>
                    )}

                    <form onSubmit={(e) => void handleOfficialRegister(e)} className="space-y-3.5">
                      {officialRegMethod === 'invite' && (
                        <div>
                          <label htmlFor="off-invite" className="block text-xs font-semibold text-slate-700">
                            8-Character Super Admin Invite Code *
                          </label>
                          <input
                            id="off-invite"
                            type="text"
                            required
                            maxLength={12}
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                            placeholder="e.g., K8M4P9X2"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase tracking-widest text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                      )}

                      <div className="grid gap-3.5 sm:grid-cols-2">
                        <div>
                          <label htmlFor="off-name" className="block text-xs font-semibold text-slate-700">
                            Full Name *
                          </label>
                          <input
                            id="off-name"
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g., R. Venkatesh"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="off-email" className="block text-xs font-semibold text-slate-700">
                            Email Address *
                          </label>
                          <input
                            id="off-email"
                            type="email"
                            required
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            placeholder="officer@bbmp.gov.in"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3.5 sm:grid-cols-3">
                        <div>
                          <label htmlFor="off-empid" className="block text-xs font-semibold text-slate-700">
                            Employee ID *
                          </label>
                          <input
                            id="off-empid"
                            type="text"
                            required
                            value={employeeId}
                            onChange={(e) => setEmployeeId(e.target.value)}
                            placeholder="BBMP-204"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="off-desig" className="block text-xs font-semibold text-slate-700">
                            Designation *
                          </label>
                          <input
                            id="off-desig"
                            type="text"
                            required
                            value={designation}
                            onChange={(e) => setDesignation(e.target.value)}
                            placeholder="Asst. Executive Engineer"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="off-dept" className="block text-xs font-semibold text-slate-700">
                            Department *
                          </label>
                          <select
                            id="off-dept"
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                          >
                            {MUNICIPAL_DEPARTMENTS.map((dept) => (
                              <option key={dept} value={dept}>
                                {dept}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid gap-3.5 sm:grid-cols-2">
                        <PasswordField
                          id="off-pw"
                          label="Password *"
                          value={password}
                          onChange={setPassword}
                          showStrengthChecklist
                          required
                        />
                        <PasswordField
                          id="off-confirm"
                          label="Confirm Password *"
                          value={confirmPassword}
                          onChange={setConfirmPassword}
                          required
                        />
                      </div>

                      <div className="grid gap-3.5 sm:grid-cols-2">
                        <div>
                          <label htmlFor="off-sq" className="block text-xs font-semibold text-slate-700">
                            Security Question *
                          </label>
                          <select
                            id="off-sq"
                            value={securityQuestion}
                            onChange={(e) => setSecurityQuestion(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          >
                            {SUGGESTED_SECURITY_QUESTIONS.map((q) => (
                              <option key={q} value={q}>
                                {translateSecurityQuestion(t, q)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="off-sa" className="block text-xs font-semibold text-slate-700">
                            Security Answer *
                          </label>
                          <input
                            id="off-sa"
                            type="text"
                            required
                            value={securityAnswer}
                            onChange={(e) => setSecurityAnswer(e.target.value)}
                            placeholder="Recovery answer"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                      >
                        {submitting
                          ? 'Submitting...'
                          : officialRegMethod === 'invite'
                            ? 'Redeem Invite & Activate Official Account'
                            : 'Submit Official Application for Approval'}
                      </button>
                    </form>
                  </>
                )}
              </div>
            )}

            {/* FORGOT PASSWORD 3-STEP RECOVERY */}
            {activeTab === 'forgot' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      Password Recovery
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Step {forgotStep} of 3 · Verify your security question to reset password.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      clearFeedback();
                      setActiveTab('citizen');
                    }}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>

                {forgotStep === 1 && (
                  <form onSubmit={(e) => void handleForgotStep1(e)} className="space-y-4">
                    <div>
                      <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-700">
                        Registered Email Address
                      </label>
                      <input
                        id="forgot-email"
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                    >
                      {submitting ? 'Checking...' : 'Continue to Security Question'}
                    </button>
                  </form>
                )}

                {forgotStep === 2 && (
                  <form onSubmit={(e) => void handleForgotStep2(e)} className="space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Security Question
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {translateSecurityQuestion(t, forgotQuestion)}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="forgot-answer" className="block text-xs font-semibold text-slate-700">
                        Your Security Answer
                      </label>
                      <input
                        id="forgot-answer"
                        type="text"
                        required
                        value={forgotAnswer}
                        onChange={(e) => setForgotAnswer(e.target.value)}
                        placeholder="Enter your answer"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setForgotStep(1)}
                        className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Change Email
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                      >
                        {submitting ? 'Verifying...' : 'Verify Security Answer'}
                      </button>
                    </div>
                  </form>
                )}

                {forgotStep === 3 && (
                  <form onSubmit={(e) => void handleForgotStep3(e)} className="space-y-4">
                    <PasswordField
                      id="forgot-new-pw"
                      label="New Password *"
                      value={newPassword}
                      onChange={setNewPassword}
                      showStrengthChecklist
                      required
                    />
                    <PasswordField
                      id="forgot-confirm-pw"
                      label="Confirm New Password *"
                      value={confirmNewPassword}
                      onChange={setConfirmNewPassword}
                      required
                    />
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                    >
                      {submitting ? 'Resetting Password...' : 'Reset Password & Sign In'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
