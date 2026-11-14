import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { AccountStatus, SupportedLanguage, User, UserRole } from '../../shared/types.ts';
import { SUPPORTED_LANGUAGES } from '../../shared/types.ts';
import { getDb } from '../db/database.ts';

const BCRYPT_ROUNDS = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

export const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.in',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'protonmail.com',
  'proton.me',
  'rediffmail.com',
  'aol.com',
  'zoho.com',
  'gmx.com',
  'yandex.com',
  'mail.com',
]);

export interface RawUserRow {
  id: number;
  full_name: string;
  email: string;
  mobile: string;
  password_hash: string;
  role: UserRole;
  security_question: string;
  security_answer_hash: string;
  account_status: AccountStatus;
  preferred_language?: string;
  created_at: string;
  updated_at: string;
}

export function normalizeLanguage(lang?: unknown): SupportedLanguage {
  if (typeof lang === 'string') {
    const trimmed = lang.trim().toLowerCase();
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(trimmed)) {
      return trimmed as SupportedLanguage;
    }
  }
  return 'en';
}

export function getAllowedAdminDomains(): string[] {
  const raw = process.env.ALLOWED_ADMIN_DOMAINS || 'civicsense.gov.in,karnataka.gov.in';
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

export function normalizeSecurityAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function validateEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function validateMobileFormat(mobile: string): boolean {
  const normalized = normalizeMobile(mobile);
  return /^[6-9]\d{9}$/.test(normalized);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one special character (e.g., !@#$%).';
  }
  return null;
}

export function extractDomain(email: string): string {
  const parts = normalizeEmail(email).split('@');
  return parts.length === 2 ? parts[1] : '';
}

export function isPersonalEmailDomain(email: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(extractDomain(email));
}

export function isApprovedAdminDomain(email: string): boolean {
  const domain = extractDomain(email);
  return getAllowedAdminDomains().includes(domain);
}

export function hashSecret(plainText: string): string {
  return bcrypt.hashSync(plainText, BCRYPT_ROUNDS);
}

export function verifySecret(plainText: string, hash: string): boolean {
  if (!hash) return false;
  return bcrypt.compareSync(plainText, hash);
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function toSafeUser(row: RawUserRow): User {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    mobile: row.mobile,
    role: row.role,
    account_status: row.account_status,
    preferred_language: normalizeLanguage(row.preferred_language),
    security_question: row.security_question,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function updateUserLanguagePreference(userId: number, language: SupportedLanguage): User {
  const db = getDb();
  const normalized = normalizeLanguage(language);
  const nowIso = new Date().toISOString();
  db.prepare('UPDATE Users SET preferred_language = ?, updated_at = ? WHERE id = ?').run(normalized, nowIso, userId);
  const updated = db.prepare('SELECT * FROM Users WHERE id = ?').get(userId) as RawUserRow | undefined;
  if (!updated) {
    throw new Error('User account not found.');
  }
  return toSafeUser(updated);
}

function getLockStatus(identifier: string): { locked: boolean; minutesLeft: number } {
  const db = getDb();
  const row = db
    .prepare('SELECT attempt_count, locked_until FROM Password_Recovery_Attempts WHERE identifier = ?')
    .get(identifier) as { attempt_count: number; locked_until: string | null } | undefined;

  if (!row || !row.locked_until) return { locked: false, minutesLeft: 0 };
  const lockEnd = new Date(row.locked_until).getTime();
  if (lockEnd > Date.now()) {
    return {
      locked: true,
      minutesLeft: Math.max(1, Math.ceil((lockEnd - Date.now()) / 60000)),
    };
  }
  return { locked: false, minutesLeft: 0 };
}

function recordFailedAttempt(identifier: string): void {
  const db = getDb();
  const row = db
    .prepare('SELECT attempt_count FROM Password_Recovery_Attempts WHERE identifier = ?')
    .get(identifier) as { attempt_count: number } | undefined;

  const nextCount = (row?.attempt_count ?? 0) + 1;
  const lockedUntil =
    nextCount >= MAX_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString()
      : null;

  db.prepare(
    `INSERT INTO Password_Recovery_Attempts (identifier, attempt_count, locked_until, last_attempt_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(identifier) DO UPDATE SET
       attempt_count = excluded.attempt_count,
       locked_until = excluded.locked_until,
       last_attempt_at = excluded.last_attempt_at`
  ).run(identifier, nextCount, lockedUntil, new Date().toISOString());
}

function clearAttempts(identifier: string): void {
  const db = getDb();
  db.prepare('DELETE FROM Password_Recovery_Attempts WHERE identifier = ?').run(identifier);
}

export function createSession(userId: number, role: UserRole): { rawToken: string; expiresAt: string } {
  const db = getDb();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const ttlHours = Math.max(1, Number(process.env.SESSION_TTL_HOURS) || 24);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  db.prepare('DELETE FROM Sessions WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare('INSERT INTO Sessions (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)').run(
    tokenHash,
    userId,
    role,
    expiresAt
  );

  return { rawToken, expiresAt };
}

export function validateSessionToken(rawToken: string): User | null {
  if (!rawToken) return null;
  const db = getDb();
  const tokenHash = hashSessionToken(rawToken);
  const row = db
    .prepare(
      `SELECT u.*
       FROM Sessions s
       JOIN Users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ? AND u.account_status = 'active'`
    )
    .get(tokenHash, new Date().toISOString()) as RawUserRow | undefined;

  if (!row) return null;
  return toSafeUser(row);
}

export function invalidateSession(rawToken: string): void {
  if (!rawToken) return;
  const db = getDb();
  db.prepare('DELETE FROM Sessions WHERE id = ?').run(hashSessionToken(rawToken));
}

export function invalidateAllUserSessions(userId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM Sessions WHERE user_id = ?').run(userId);
}

export function registerCitizen(input: {
  full_name: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  security_question: string;
  security_answer: string;
  preferred_language?: unknown;
}): { user: User } {
  const fullName = String(input.full_name ?? '').trim();
  const email = normalizeEmail(String(input.email ?? ''));
  const mobile = normalizeMobile(String(input.mobile ?? ''));
  const password = String(input.password ?? '');
  const confirmPassword = String(input.confirmPassword ?? '');
  const securityQuestion = String(input.security_question ?? '').trim();
  const securityAnswer = normalizeSecurityAnswer(String(input.security_answer ?? ''));
  const preferredLanguage = normalizeLanguage(input.preferred_language);

  if (fullName.length < 2) {
    throw new Error('Full name must be at least 2 characters.');
  }
  if (!validateEmailFormat(email)) {
    throw new Error('Please enter a valid email address.');
  }
  if (!validateMobileFormat(mobile)) {
    throw new Error('Please enter a valid 10-digit Indian mobile number.');
  }
  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    throw new Error(strengthError);
  }
  if (password !== confirmPassword) {
    throw new Error('Password and confirmation password do not match.');
  }
  if (securityQuestion.length < 8) {
    throw new Error('Please select or enter a valid security question.');
  }
  if (securityAnswer.length < 2) {
    throw new Error('Please provide an answer to your security question.');
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM Users WHERE email = ?').get(email) as { id: number } | undefined;
  if (existing) {
    throw new Error('An account with this email address is already registered.');
  }

  const nowIso = new Date().toISOString();
  const passwordHash = hashSecret(password);
  const answerHash = hashSecret(securityAnswer);

  // Public registration strictly creates CITIZEN accounts regardless of any payload tampering
  const res = db
    .prepare(
      `INSERT INTO Users (
        full_name, email, mobile, password_hash, role,
        security_question, security_answer_hash, account_status, preferred_language, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'CITIZEN', ?, ?, 'active', ?, ?, ?)`
    )
    .run(fullName, email, mobile, passwordHash, securityQuestion, answerHash, preferredLanguage, nowIso, nowIso);

  const created = db.prepare('SELECT * FROM Users WHERE id = ?').get(Number(res.lastInsertRowid)) as RawUserRow;
  return { user: toSafeUser(created) };
}

export function authenticateCitizen(emailRaw: string, password: string): { user: User; token: string; expiresAt: string } {
  const email = normalizeEmail(emailRaw);
  if (!validateEmailFormat(email) || !password) {
    throw new Error('Please enter a valid email address and password.');
  }

  const lockKey = `login:citizen:${email}`;
  const lock = getLockStatus(lockKey);
  if (lock.locked) {
    throw new Error(`Too many unsuccessful login attempts. Try again in ${lock.minutesLeft} minute(s).`);
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM Users WHERE email = ?').get(email) as RawUserRow | undefined;

  if (!row || row.role !== 'CITIZEN' || !verifySecret(password, row.password_hash)) {
    recordFailedAttempt(lockKey);
    throw new Error('Invalid citizen email address or password.');
  }

  if (row.account_status !== 'active') {
    throw new Error('This account is not currently active. Please contact civic support.');
  }

  clearAttempts(lockKey);
  const { rawToken, expiresAt } = createSession(row.id, 'CITIZEN');
  return { user: toSafeUser(row), token: rawToken, expiresAt };
}

export function authenticateAdmin(emailRaw: string, password: string): { user: User; token: string; expiresAt: string } {
  const email = normalizeEmail(emailRaw);
  if (!validateEmailFormat(email) || !password) {
    throw new Error('Please enter your official work email address and password.');
  }

  if (isPersonalEmailDomain(email)) {
    throw new Error(
      'Personal email domains (such as Gmail, Yahoo, or Outlook) are not permitted for Government Administrator access. Please use an approved official work email.'
    );
  }

  if (!isApprovedAdminDomain(email)) {
    throw new Error(
      'This email domain is not authorized for Government Administrator access. Contact your municipal IT administrator.'
    );
  }

  const lockKey = `login:admin:${email}`;
  const lock = getLockStatus(lockKey);
  if (lock.locked) {
    throw new Error(`Administrator login temporarily locked due to repeated failures. Try again in ${lock.minutesLeft} minute(s).`);
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM Users WHERE email = ?').get(email) as RawUserRow | undefined;

  // Verify explicitly provisioned ADMIN role + active status + password hash
  if (!row || row.role !== 'ADMIN' || row.account_status !== 'active' || !verifySecret(password, row.password_hash)) {
    recordFailedAttempt(lockKey);
    throw new Error(
      'Unauthorized administrator credentials. Only provisioned and approved municipal administrator accounts may sign in.'
    );
  }

  clearAttempts(lockKey);
  const { rawToken, expiresAt } = createSession(row.id, 'ADMIN');
  return { user: toSafeUser(row), token: rawToken, expiresAt };
}
