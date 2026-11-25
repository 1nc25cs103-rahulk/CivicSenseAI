import { Router, type Request, type Response } from 'express';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../shared/types.ts';
import {
  extractAuthToken,
  requireAuth,
  SESSION_COOKIE_NAME,
  setNoStoreHeaders,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  authenticateAdmin,
  authenticateCitizen,
  authenticateDemoAdmin,
  authenticateUnified,
  getAdminBootstrapStatus,
  getAllowedAdminDomains,
  HttpAuthError,
  invalidateSession,
  isPrototypeMode,
  registerCitizen,
  registerInitialAdmin,
  registerOfficial,
  updateUserLanguagePreference,
  validateSessionToken,
} from '../services/authService.ts';
import { activeRecoveryProvider, resetPasswordWithToken } from '../services/recoveryService.ts';

export const authRouter = Router();

function setSessionCookie(req: Request, res: Response, rawToken: string, expiresAt: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const maxAgeSeconds = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) {
    parts.push('Secure');
    parts.push('Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) {
    parts.push('Secure');
    parts.push('Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function sendAuthError(res: Response, err: unknown, fallbackMessage: string, fallbackStatus = 400): void {
  if (err instanceof HttpAuthError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : fallbackMessage;
  res.status(fallbackStatus).json({ error: message });
}

authRouter.get('/policy', (_req, res) => {
  res.json({
    allowedAdminDomains: getAllowedAdminDomains(),
    prototypeMode: isPrototypeMode(),
  });
});

authRouter.get('/admin-bootstrap-status', (_req, res) => {
  setNoStoreHeaders(res);
  res.json(getAdminBootstrapStatus());
});

authRouter.get('/me', (req, res) => {
  setNoStoreHeaders(res);
  const token = extractAuthToken(req);
  if (!token) {
    res.json({ authenticated: false, user: null });
    return;
  }
  const user = validateSessionToken(token);
  if (!user) {
    res.json({ authenticated: false, user: null });
    return;
  }
  res.json({ authenticated: true, user });
});

authRouter.patch('/preferences', requireAuth, (req: AuthenticatedRequest, res) => {
  setNoStoreHeaders(res);
  try {
    const { preferred_language } = req.body ?? {};
    if (
      typeof preferred_language !== 'string' ||
      !(SUPPORTED_LANGUAGES as readonly string[]).includes(preferred_language.trim().toLowerCase())
    ) {
      res.status(400).json({ error: 'Unsupported language selection. Allowed values: en, kn, hi.' });
      return;
    }
    const lang = preferred_language.trim().toLowerCase() as SupportedLanguage;
    const user = updateUserLanguagePreference(req.authUser!.id, lang);
    res.json({ user });
  } catch (err) {
    sendAuthError(res, err, 'Unable to save language preference.');
  }
});

authRouter.post('/register', (req, res) => {
  setNoStoreHeaders(res);
  try {
    const {
      full_name,
      email,
      mobile,
      password,
      confirmPassword,
      security_question,
      security_answer,
      preferred_language,
    } = req.body ?? {};
    const result = registerCitizen({
      full_name,
      email,
      mobile,
      password,
      confirmPassword,
      security_question,
      security_answer,
      preferred_language,
    });
    res.status(201).json({
      message: 'Registration successful. Please sign in with your registered email and password.',
      user: result.user,
    });
  } catch (err) {
    sendAuthError(res, err, 'Registration failed.');
  }
});

authRouter.post('/register-initial-admin', (req, res) => {
  setNoStoreHeaders(res);
  try {
    const {
      full_name,
      email,
      employee_id,
      designation,
      mobile,
      password,
      confirmPassword,
      security_question,
      security_answer,
      preferred_language,
    } = req.body ?? {};

    const session = registerInitialAdmin({
      full_name,
      email,
      employee_id,
      designation,
      mobile,
      password,
      confirmPassword,
      security_question,
      security_answer,
      preferred_language,
    });

    setSessionCookie(req, res, session.token, session.expiresAt);
    res.status(201).json({
      message: 'Super Administrator account initialized for Central Command. Public bootstrap is now permanently locked.',
      user: session.user,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    sendAuthError(res, err, 'Initial administrator registration failed.');
  }
});

authRouter.post('/register-official', (req, res) => {
  setNoStoreHeaders(res);
  try {
    const {
      registration_method,
      invite_code,
      full_name,
      email,
      department,
      employee_id,
      designation,
      mobile,
      password,
      confirmPassword,
      security_question,
      security_answer,
      preferred_language,
    } = req.body ?? {};

    const result = registerOfficial({
      registration_method,
      invite_code,
      full_name,
      email,
      department,
      employee_id,
      designation,
      mobile,
      password,
      confirmPassword,
      security_question,
      security_answer,
      preferred_language,
    });

    if (result.token && result.expiresAt) {
      setSessionCookie(req, res, result.token, result.expiresAt);
    }

    res.status(201).json(result);
  } catch (err) {
    sendAuthError(res, err, 'Official registration failed.');
  }
});

authRouter.post('/login', (req, res) => {
  setNoStoreHeaders(res);
  try {
    const { email, password, portal } = req.body ?? {};
    const expectedGroup =
      portal === 'citizen' ? 'citizen' : portal === 'official' || portal === 'admin' ? 'official' : undefined;
    const session = authenticateUnified(String(email ?? ''), String(password ?? ''), expectedGroup);
    setSessionCookie(req, res, session.token, session.expiresAt);
    res.json({
      user: session.user,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    sendAuthError(res, err, 'Authentication failed.', 401);
  }
});

authRouter.post('/login/citizen', (req, res) => {
  setNoStoreHeaders(res);
  try {
    const { email, password } = req.body ?? {};
    const session = authenticateCitizen(String(email ?? ''), String(password ?? ''));
    setSessionCookie(req, res, session.token, session.expiresAt);
    res.json({
      user: session.user,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    sendAuthError(res, err, 'Authentication failed.', 401);
  }
});

authRouter.post('/login/admin', (req, res) => {
  setNoStoreHeaders(res);
  try {
    const { email, password } = req.body ?? {};
    const session = authenticateAdmin(String(email ?? ''), String(password ?? ''));
    setSessionCookie(req, res, session.token, session.expiresAt);
    res.json({
      user: session.user,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    sendAuthError(res, err, 'Unauthorized administrator login attempt.', 401);
  }
});

authRouter.post('/demo-admin', (req, res) => {
  setNoStoreHeaders(res);
  try {
    const session = authenticateDemoAdmin();
    setSessionCookie(req, res, session.token, session.expiresAt);
    res.json({
      user: session.user,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    sendAuthError(res, err, 'Demo admin login unavailable.', 403);
  }
});

authRouter.post('/logout', (req, res) => {
  setNoStoreHeaders(res);
  const token = extractAuthToken(req);
  if (token) {
    invalidateSession(token);
  }
  clearSessionCookie(req, res);
  res.json({ message: 'Logged out successfully.' });
});

async function handleForgotPasswordInitiate(req: Request, res: Response) {
  setNoStoreHeaders(res);
  try {
    const { email } = req.body ?? {};
    const result = await activeRecoveryProvider.initiateChallenge(String(email ?? ''));
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to start password recovery.';
    const status = message.includes('blocked') ? 429 : 400;
    res.status(status).json({ error: message });
  }
}

async function handleVerifySecurityAnswer(req: Request, res: Response) {
  setNoStoreHeaders(res);
  try {
    const { challengeToken, answer } = req.body ?? {};
    const result = await activeRecoveryProvider.verifyChallenge(String(challengeToken ?? ''), String(answer ?? ''));
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed.';
    const status = message.includes('blocked') ? 429 : 400;
    res.status(status).json({ error: message });
  }
}

function handleResetPassword(req: Request, res: Response) {
  setNoStoreHeaders(res);
  try {
    const { resetToken, newPassword, confirmPassword } = req.body ?? {};
    const result = resetPasswordWithToken(
      String(resetToken ?? ''),
      String(newPassword ?? ''),
      String(confirmPassword ?? '')
    );
    clearSessionCookie(req, res);
    res.json({
      ...result,
      message: 'Password has been reset successfully. Existing sessions have been invalidated.',
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Password reset failed.' });
  }
}

authRouter.post('/forgot-password', handleForgotPasswordInitiate);
authRouter.post('/forgot-password/question', handleForgotPasswordInitiate);

authRouter.post('/verify-security-answer', handleVerifySecurityAnswer);
authRouter.post('/forgot-password/verify', handleVerifySecurityAnswer);

authRouter.post('/reset-password', handleResetPassword);
authRouter.post('/forgot-password/reset', handleResetPassword);
