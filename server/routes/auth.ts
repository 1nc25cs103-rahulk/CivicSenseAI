import { Router, type Request, type Response } from 'express';
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
  getAllowedAdminDomains,
  invalidateSession,
  registerCitizen,
  updateUserLanguagePreference,
} from '../services/authService.ts';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../shared/types.ts';
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
  if (isHttps) parts.push('Secure');
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
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

authRouter.get('/policy', (_req, res) => {
  res.json({
    allowedAdminDomains: getAllowedAdminDomains(),
  });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  setNoStoreHeaders(res);
  res.json({ user: req.authUser });
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
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save language preference.' });
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
    res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
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
    const message = err instanceof Error ? err.message : 'Authentication failed.';
    const status = message.includes('locked') || message.includes('Too many') ? 429 : 401;
    res.status(status).json({ error: message });
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
    const message = err instanceof Error ? err.message : 'Unauthorized administrator login attempt.';
    const status = message.includes('locked')
      ? 429
      : message.includes('not permitted') || message.includes('not authorized')
        ? 403
        : 401;
    res.status(status).json({ error: message });
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

authRouter.post('/forgot-password/question', async (req, res) => {
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
});

authRouter.post('/forgot-password/verify', async (req, res) => {
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
});

authRouter.post('/forgot-password/reset', (req, res) => {
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
});
