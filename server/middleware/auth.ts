import type { NextFunction, Request, Response } from 'express';
import type { User, UserRole } from '../../shared/types.ts';
import { validateSessionToken } from '../services/authService.ts';

export const SESSION_COOKIE_NAME = 'civicsense_session';

export interface AuthenticatedRequest extends Request {
  authUser?: User;
  authToken?: string;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

export function extractAuthToken(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] ?? '';
}

export function setNoStoreHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  setNoStoreHeaders(res);
  const token = extractAuthToken(req);
  const user = validateSessionToken(token);

  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please log in to continue.' });
    return;
  }

  req.authUser = user;
  req.authToken = token;
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    setNoStoreHeaders(res);
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      res.status(403).json({
        error: 'Access denied. You do not have permission to access this resource.',
      });
      return;
    }
    next();
  };
}
