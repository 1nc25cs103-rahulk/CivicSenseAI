import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type {
  AccountStatus,
  AdminBootstrapStatus,
  AdminInvite,
  SupportedLanguage,
  User,
  UserRole,
} from '../../shared/types.ts';
import {
  isAdminRole,
  normalizeUserRole,
  OFFICIAL_DEPARTMENTS,
  SUPPORTED_LANGUAGES,
} from '../../shared/types.ts';
import { getDb } from '../db/database.ts';
import { recordAuditLog } from './auditService.ts';

const BCRYPT_ROUNDS = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
export const DEMO_ADMIN_EMAIL = 'demo.admin@civicsense.local';
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class HttpAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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
  role: string;
  department?: string | null;
  employee_id?: string | null;
  designation?: string | null;
  approved_by?: number | null;
  security_question: string;
  security_answer_hash: string;
  account_status: AccountStatus;
  preferred_language?: string;
  created_at: string;
  updated_at: string;
}

export function isPrototypeMode(): boolean {
  const raw = process.env.CIVICSENSE_PROTOTYPE_MODE;
  if (raw === undefined || raw.trim() === '') return true;
  return raw.trim().toLowerCase() !== 'false';
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
  const defaultDomains = [
    'bbmp.gov.in',
    'karnataka.gov.in',
    'bwssb.gov.in',
    'bescom.org',
    'nic.in',
    'civicsense.gov.in',
  ];
  const raw = process.env.ALLOWED_ADMIN_DOMAINS?.trim();
  const configured = raw
    ? raw
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean)
    : [];
  return Array.from(new Set([...defaultDomains, ...configured]));
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
    role: normalizeUserRole(row.role),
    department: row.department ?? null,
    employee_id: row.employee_id ?? null,
    designation: row.designation ?? null,
    approved_by: row.approved_by ?? null,
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
    throw new HttpAuthError(404, 'User account not found.');
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
    normalizeUserRole(role),
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

export function getAdminBootstrapStatus(): AdminBootstrapStatus {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM Users WHERE role IN ('admin', 'super_admin') AND email != ?")
    .get(DEMO_ADMIN_EMAIL) as { count: number };
  const prototypeMode = isPrototypeMode();
  return {
    bootstrapAvailable: row.count === 0,
    prototypeMode,
    demoAdminEnabled: prototypeMode,
    allowedAdminDomains: getAllowedAdminDomains(),
    officialCount: row.count,
  };
}

export function registerInitialAdmin(input: {
  full_name: string;
  email: string;
  employee_id: string;
  designation: string;
  mobile?: string;
  password: string;
  confirmPassword: string;
  security_question: string;
  security_answer: string;
  preferred_language?: unknown;
}): { user: User; token: string; expiresAt: string } {
  const fullName = String(input.full_name ?? '').trim();
  const email = normalizeEmail(String(input.email ?? ''));
  const employeeId = String(input.employee_id ?? '').trim();
  const designation = String(input.designation ?? '').trim();
  const mobileRaw = String(input.mobile ?? '').trim();
  const mobile = mobileRaw ? normalizeMobile(mobileRaw) : '';
  const password = String(input.password ?? '');
  const confirmPassword = String(input.confirmPassword ?? '');
  const securityQuestion = String(input.security_question ?? '').trim();
  const securityAnswer = normalizeSecurityAnswer(String(input.security_answer ?? ''));
  const preferredLanguage = normalizeLanguage(input.preferred_language);

  if (fullName.length < 2) {
    throw new HttpAuthError(400, 'Full name must be at least 2 characters.');
  }
  if (!validateEmailFormat(email)) {
    throw new HttpAuthError(400, 'Please enter a valid email address.');
  }
  if (employeeId.length < 3) {
    throw new HttpAuthError(400, 'Employee ID must be at least 3 characters.');
  }
  if (designation.length < 2) {
    throw new HttpAuthError(400, 'Designation is required.');
  }
  if (mobile && !validateMobileFormat(mobile)) {
    throw new HttpAuthError(400, 'Please enter a valid 10-digit Indian mobile number.');
  }
  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    throw new HttpAuthError(400, strengthError);
  }
  if (password !== confirmPassword) {
    throw new HttpAuthError(400, 'Password and confirmation password do not match.');
  }
  if (securityQuestion.length < 8) {
    throw new HttpAuthError(400, 'Please select or enter a valid security question.');
  }
  if (securityAnswer.length < 2) {
    throw new HttpAuthError(400, 'Please provide an answer to your security question.');
  }

  const db = getDb();
  const passwordHash = hashSecret(password);
  const answerHash = hashSecret(securityAnswer);
  const nowIso = new Date().toISOString();

  // Atomic immediate transaction guarantees single-winner initial Super Admin bootstrap
  const bootstrapTx = db.transaction(() => {
    const existingOfficials = db
      .prepare("SELECT COUNT(*) as count FROM Users WHERE role IN ('admin', 'super_admin') AND email != ?")
      .get(DEMO_ADMIN_EMAIL) as { count: number };

    if (existingOfficials.count > 0) {
      throw new HttpAuthError(
        403,
        'Initial Super Administrator bootstrap is permanently disabled because an administrator account already exists.'
      );
    }

    const emailExists = db.prepare('SELECT id FROM Users WHERE email = ?').get(email) as { id: number } | undefined;
    if (emailExists) {
      throw new HttpAuthError(409, 'An account with this email address is already registered.');
    }

    const result = db
      .prepare(
        `INSERT INTO Users (
          full_name, email, mobile, password_hash, role, department, employee_id, designation,
          security_question, security_answer_hash, account_status, preferred_language, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'super_admin', 'Central Command', ?, ?, ?, ?, 'active', ?, ?, ?)`
      )
      .run(
        fullName,
        email,
        mobile,
        passwordHash,
        employeeId,
        designation,
        securityQuestion,
        answerHash,
        preferredLanguage,
        nowIso,
        nowIso
      );

    return db.prepare('SELECT * FROM Users WHERE id = ?').get(Number(result.lastInsertRowid)) as RawUserRow;
  });

  const createdRow = bootstrapTx.immediate();
  const safeUser = toSafeUser(createdRow);
  const { rawToken, expiresAt } = createSession(safeUser.id, 'super_admin');

  recordAuditLog({
    actorId: safeUser.id,
    actorName: safeUser.full_name,
    actorRole: 'super_admin',
    action: 'SUPER_ADMIN_BOOTSTRAP',
    targetType: 'user',
    targetId: safeUser.id,
    details: `Initial Super Administrator (${safeUser.email}, ${employeeId}) bootstrapped Central Command and permanently locked public bootstrap.`,
  });

  return { user: safeUser, token: rawToken, expiresAt };
}

function generateSecureInviteCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return code;
}

export function generateAdminInvite(input: {
  department: string;
  expiresInDays?: number;
  actor: User;
}): AdminInvite {
  if (input.actor.role !== 'super_admin') {
    throw new HttpAuthError(403, 'Only a Super Administrator can generate official invite codes.');
  }

  const department = String(input.department ?? '').trim();
  if (!department || !(OFFICIAL_DEPARTMENTS as readonly string[]).includes(department)) {
    throw new HttpAuthError(400, 'Please select a valid municipal department for the invite code.');
  }

  const days = Math.max(1, Math.min(30, Number(input.expiresInDays) || 7));
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const db = getDb();

  let createdId = 0;
  let code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateSecureInviteCode();
    try {
      const res = db
        .prepare(
          `INSERT INTO admin_invites (code, department, created_by, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(code, department, input.actor.id, nowIso, expiresAt);
      createdId = Number(res.lastInsertRowid);
      break;
    } catch {
      // Retry on rare code collision
    }
  }

  if (!createdId) {
    throw new HttpAuthError(500, 'Failed to generate unique invite code. Please try again.');
  }

  recordAuditLog({
    actorId: input.actor.id,
    actorName: input.actor.full_name,
    actorRole: input.actor.role,
    action: 'INVITE_GENERATED',
    targetType: 'admin_invite',
    targetId: code,
    details: `Generated single-use 8-character invite code ${code} for ${department} (expires ${expiresAt.slice(0, 10)}).`,
  });

  return {
    id: createdId,
    code,
    department,
    created_by: input.actor.id,
    created_by_name: input.actor.full_name,
    used_by: null,
    used_by_name: null,
    created_at: nowIso,
    expires_at: expiresAt,
    used_at: null,
    revoked_at: null,
    status: 'active',
  };
}

export function listAdminInvites(): AdminInvite[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT i.*,
              c.full_name AS created_by_name,
              u.full_name AS used_by_name
       FROM admin_invites i
       LEFT JOIN Users c ON c.id = i.created_by
       LEFT JOIN Users u ON u.id = i.used_by
       ORDER BY i.created_at DESC, i.id DESC`
    )
    .all() as Array<{
    id: number;
    code: string;
    department: string;
    created_by: number;
    created_by_name?: string;
    used_by: number | null;
    used_by_name?: string | null;
    created_at: string;
    expires_at: string;
    used_at: string | null;
    revoked_at: string | null;
  }>;

  const now = Date.now();
  return rows.map((r) => {
    let status: AdminInvite['status'] = 'active';
    if (r.revoked_at) status = 'revoked';
    else if (r.used_at || r.used_by) status = 'used';
    else if (Date.parse(r.expires_at) <= now) status = 'expired';
    return {
      ...r,
      status,
    };
  });
}

export function revokeAdminInvite(inviteId: number, actor: User): void {
  if (actor.role !== 'super_admin') {
    throw new HttpAuthError(403, 'Only a Super Administrator can revoke invite codes.');
  }
  const db = getDb();
  const invite = db.prepare('SELECT id, code, used_at, revoked_at FROM admin_invites WHERE id = ?').get(inviteId) as
    | { id: number; code: string; used_at: string | null; revoked_at: string | null }
    | undefined;

  if (!invite) {
    throw new HttpAuthError(404, 'Invite code not found.');
  }
  if (invite.used_at) {
    throw new HttpAuthError(400, 'This invite code has already been redeemed and cannot be revoked.');
  }
  if (invite.revoked_at) {
    return;
  }

  db.prepare('UPDATE admin_invites SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), inviteId);
  recordAuditLog({
    actorId: actor.id,
    actorName: actor.full_name,
    actorRole: actor.role,
    action: 'INVITE_REVOKED',
    targetType: 'admin_invite',
    targetId: invite.code,
    details: `Revoked unused invite code ${invite.code}.`,
  });
}

export function registerOfficial(input: {
  registration_method: 'invite' | 'email';
  invite_code?: string;
  full_name: string;
  email: string;
  department: string;
  employee_id: string;
  designation: string;
  mobile?: string;
  password: string;
  confirmPassword: string;
  security_question: string;
  security_answer: string;
  preferred_language?: unknown;
}): { user: User; status: 'active' | 'pending'; message: string; token?: string; expiresAt?: string } {
  const method = input.registration_method === 'invite' || Boolean(input.invite_code?.trim()) ? 'invite' : 'email';
  const inviteCode = String(input.invite_code ?? '').trim().toUpperCase();
  const fullName = String(input.full_name ?? '').trim();
  const email = normalizeEmail(String(input.email ?? ''));
  const departmentInput = String(input.department ?? '').trim();
  const employeeId = String(input.employee_id ?? '').trim();
  const designation = String(input.designation ?? '').trim();
  const mobileRaw = String(input.mobile ?? '').trim();
  const mobile = mobileRaw ? normalizeMobile(mobileRaw) : '';
  const password = String(input.password ?? '');
  const confirmPassword = String(input.confirmPassword ?? '');
  const securityQuestion = String(input.security_question ?? '').trim();
  const securityAnswer = normalizeSecurityAnswer(String(input.security_answer ?? ''));
  const preferredLanguage = normalizeLanguage(input.preferred_language);

  if (fullName.length < 2) {
    throw new HttpAuthError(400, 'Full name must be at least 2 characters.');
  }
  if (!validateEmailFormat(email)) {
    throw new HttpAuthError(400, 'Please enter a valid email address.');
  }
  if (employeeId.length < 3) {
    throw new HttpAuthError(400, 'Employee ID must be at least 3 characters.');
  }
  if (designation.length < 2) {
    throw new HttpAuthError(400, 'Designation is required.');
  }
  if (mobile && !validateMobileFormat(mobile)) {
    throw new HttpAuthError(400, 'Please enter a valid 10-digit Indian mobile number.');
  }
  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    throw new HttpAuthError(400, strengthError);
  }
  if (password !== confirmPassword) {
    throw new HttpAuthError(400, 'Password and confirmation password do not match.');
  }
  if (securityQuestion.length < 8) {
    throw new HttpAuthError(400, 'Please select or enter a valid security question.');
  }
  if (securityAnswer.length < 2) {
    throw new HttpAuthError(400, 'Please provide an answer to your security question.');
  }

  const db = getDb();
  const passwordHash = hashSecret(password);
  const answerHash = hashSecret(securityAnswer);
  const nowIso = new Date().toISOString();

  if (method === 'invite') {
    if (!inviteCode || inviteCode.length < 6) {
      throw new HttpAuthError(400, 'Please enter a valid 8-character administrator invite code.');
    }

    const redeemTx = db.transaction(() => {
      const invite = db
        .prepare('SELECT * FROM admin_invites WHERE code = ?')
        .get(inviteCode) as
        | {
            id: number;
            code: string;
            department: string;
            created_by: number;
            used_by: number | null;
            expires_at: string;
            used_at: string | null;
            revoked_at: string | null;
          }
        | undefined;

      if (!invite) {
        throw new HttpAuthError(400, 'Invalid invite code. Please check with your Super Administrator.');
      }
      if (invite.revoked_at) {
        throw new HttpAuthError(400, 'This invite code has been revoked.');
      }
      if (invite.used_at || invite.used_by) {
        throw new HttpAuthError(400, 'This invite code has already been used.');
      }
      if (Date.parse(invite.expires_at) <= Date.now()) {
        throw new HttpAuthError(400, 'This invite code has expired.');
      }

      const existingEmail = db.prepare('SELECT id FROM Users WHERE email = ?').get(email) as { id: number } | undefined;
      if (existingEmail) {
        throw new HttpAuthError(409, 'An account with this email address is already registered.');
      }

      const assignedDepartment = invite.department;
      const result = db
        .prepare(
          `INSERT INTO Users (
            full_name, email, mobile, password_hash, role, department, employee_id, designation, approved_by,
            security_question, security_answer_hash, account_status, preferred_language, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'admin', ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
        )
        .run(
          fullName,
          email,
          mobile,
          passwordHash,
          assignedDepartment,
          employeeId,
          designation,
          invite.created_by,
          securityQuestion,
          answerHash,
          preferredLanguage,
          nowIso,
          nowIso
        );

      const newUserId = Number(result.lastInsertRowid);
      db.prepare('UPDATE admin_invites SET used_by = ?, used_at = ? WHERE id = ?').run(newUserId, nowIso, invite.id);

      return db.prepare('SELECT * FROM Users WHERE id = ?').get(newUserId) as RawUserRow;
    });

    const createdRow = redeemTx.immediate();
    const safeUser = toSafeUser(createdRow);
    const { rawToken, expiresAt } = createSession(safeUser.id, 'admin');

    recordAuditLog({
      actorId: safeUser.id,
      actorName: safeUser.full_name,
      actorRole: 'admin',
      action: 'OFFICIAL_REGISTERED_INVITE',
      targetType: 'user',
      targetId: safeUser.id,
      details: `Activated official account ${safeUser.email} (${safeUser.department}) using single-use invite code ${inviteCode}.`,
    });

    return {
      user: safeUser,
      status: 'active',
      message: `Official account activated for ${safeUser.department}.`,
      token: rawToken,
      expiresAt,
    };
  }

  // Method 2: Official Email Application (no invite code) -> pending Super Admin approval
  if (!departmentInput || !(OFFICIAL_DEPARTMENTS as readonly string[]).includes(departmentInput)) {
    throw new HttpAuthError(400, 'Please select your municipal department.');
  }

  if (!isPrototypeMode()) {
    if (isPersonalEmailDomain(email) || !isApprovedAdminDomain(email)) {
      throw new HttpAuthError(
        403,
        'Strict government mode requires an approved official email domain (e.g., @bbmp.gov.in, @karnataka.gov.in, @bwssb.gov.in, @bescom.org, @nic.in).'
      );
    }
  }

  const existingEmail = db.prepare('SELECT id FROM Users WHERE email = ?').get(email) as { id: number } | undefined;
  if (existingEmail) {
    throw new HttpAuthError(409, 'An account with this email address is already registered.');
  }

  const res = db
    .prepare(
      `INSERT INTO Users (
        full_name, email, mobile, password_hash, role, department, employee_id, designation,
        security_question, security_answer_hash, account_status, preferred_language, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'admin', ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    )
    .run(
      fullName,
      email,
      mobile,
      passwordHash,
      departmentInput,
      employeeId,
      designation,
      securityQuestion,
      answerHash,
      preferredLanguage,
      nowIso,
      nowIso
    );

  const createdRow = db.prepare('SELECT * FROM Users WHERE id = ?').get(Number(res.lastInsertRowid)) as RawUserRow;
  const safeUser = toSafeUser(createdRow);

  recordAuditLog({
    actorId: safeUser.id,
    actorName: safeUser.full_name,
    actorRole: 'admin',
    action: 'OFFICIAL_APPLICATION_SUBMITTED',
    targetType: 'user',
    targetId: safeUser.id,
    details: `Submitted pending official registration for ${safeUser.email} (${departmentInput}, ID: ${employeeId}) awaiting Super Admin approval.`,
  });

  return {
    user: safeUser,
    status: 'pending',
    message:
      'Official registration submitted with Pending Approval status. A Super Administrator must approve your account before sign-in.',
  };
}

export function listOfficers(): Array<User & { approver_name?: string | null }> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.*, a.full_name AS approver_name
       FROM Users u
       LEFT JOIN Users a ON a.id = u.approved_by
       WHERE u.role IN ('admin', 'super_admin')
       ORDER BY CASE u.account_status WHEN 'pending' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,
                CASE u.role WHEN 'super_admin' THEN 1 ELSE 2 END,
                u.created_at DESC`
    )
    .all() as Array<RawUserRow & { approver_name?: string | null }>;

  return rows.map((r) => ({
    ...toSafeUser(r),
    approver_name: r.approver_name ?? null,
  }));
}

export function updateOfficerStatus(officerId: number, status: AccountStatus, actor: User): User {
  if (actor.role !== 'super_admin') {
    throw new HttpAuthError(403, 'Only a Super Administrator can approve or suspend official accounts.');
  }
  if (!['active', 'pending', 'suspended'].includes(status)) {
    throw new HttpAuthError(400, 'Invalid account status.');
  }
  if (officerId === actor.id && status !== 'active') {
    throw new HttpAuthError(400, 'You cannot suspend your own Super Administrator account.');
  }

  const db = getDb();
  const target = db.prepare('SELECT * FROM Users WHERE id = ?').get(officerId) as RawUserRow | undefined;
  if (!target || !isAdminRole(target.role)) {
    throw new HttpAuthError(404, 'Government official account not found.');
  }

  const nowIso = new Date().toISOString();
  const approvedBy = status === 'active' ? actor.id : target.approved_by ?? null;
  db.prepare('UPDATE Users SET account_status = ?, approved_by = ?, updated_at = ? WHERE id = ?').run(
    status,
    approvedBy,
    nowIso,
    officerId
  );

  if (status !== 'active') {
    invalidateAllUserSessions(officerId);
  }

  const updated = db.prepare('SELECT * FROM Users WHERE id = ?').get(officerId) as RawUserRow;
  const safeUser = toSafeUser(updated);

  recordAuditLog({
    actorId: actor.id,
    actorName: actor.full_name,
    actorRole: actor.role,
    action: status === 'active' ? 'OFFICIAL_APPROVED' : 'OFFICIAL_STATUS_UPDATED',
    targetType: 'user',
    targetId: safeUser.id,
    details: `Updated official ${safeUser.full_name} (${safeUser.email}) account status to ${status}.`,
  });

  return safeUser;
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
    throw new HttpAuthError(400, 'Full name must be at least 2 characters.');
  }
  if (!validateEmailFormat(email)) {
    throw new HttpAuthError(400, 'Please enter a valid email address.');
  }
  if (!validateMobileFormat(mobile)) {
    throw new HttpAuthError(400, 'Please enter a valid 10-digit Indian mobile number.');
  }
  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    throw new HttpAuthError(400, strengthError);
  }
  if (password !== confirmPassword) {
    throw new HttpAuthError(400, 'Password and confirmation password do not match.');
  }
  if (securityQuestion.length < 8) {
    throw new HttpAuthError(400, 'Please select or enter a valid security question.');
  }
  if (securityAnswer.length < 2) {
    throw new HttpAuthError(400, 'Please provide an answer to your security question.');
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM Users WHERE email = ?').get(email) as { id: number } | undefined;
  if (existing) {
    throw new HttpAuthError(409, 'An account with this email address is already registered.');
  }

  const nowIso = new Date().toISOString();
  const passwordHash = hashSecret(password);
  const answerHash = hashSecret(securityAnswer);

  // Public registration strictly creates citizen accounts regardless of payload tampering
  const res = db
    .prepare(
      `INSERT INTO Users (
        full_name, email, mobile, password_hash, role,
        security_question, security_answer_hash, account_status, preferred_language, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'citizen', ?, ?, 'active', ?, ?, ?)`
    )
    .run(fullName, email, mobile, passwordHash, securityQuestion, answerHash, preferredLanguage, nowIso, nowIso);

  const created = db.prepare('SELECT * FROM Users WHERE id = ?').get(Number(res.lastInsertRowid)) as RawUserRow;
  return { user: toSafeUser(created) };
}

export function authenticateUnified(
  emailRaw: string,
  password: string,
  expectedGroup?: 'citizen' | 'official'
): { user: User; token: string; expiresAt: string } {
  const email = normalizeEmail(emailRaw);
  if (!validateEmailFormat(email) || !password) {
    throw new HttpAuthError(400, 'Please enter a valid email address and password.');
  }

  if (expectedGroup === 'official' && !isPrototypeMode()) {
    if (isPersonalEmailDomain(email)) {
      throw new HttpAuthError(
        403,
        'Personal email domains are not permitted for Government Administrator access when strict mode is enabled.'
      );
    }
    if (!isApprovedAdminDomain(email)) {
      throw new HttpAuthError(
        403,
        'This email domain is not authorized for Government Administrator access. Contact your municipal IT administrator.'
      );
    }
  }

  const lockKey = `login:${expectedGroup ?? 'unified'}:${email}`;
  const lock = getLockStatus(lockKey);
  if (lock.locked) {
    throw new HttpAuthError(
      429,
      `Too many unsuccessful login attempts. Try again in ${lock.minutesLeft} minute(s).`
    );
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM Users WHERE email = ?').get(email) as RawUserRow | undefined;

  if (!row || !verifySecret(password, row.password_hash)) {
    recordFailedAttempt(lockKey);
    throw new HttpAuthError(401, 'Invalid email address or password.');
  }

  const normalizedRole = normalizeUserRole(row.role);
  if (expectedGroup === 'citizen' && normalizedRole !== 'citizen') {
    recordFailedAttempt(lockKey);
    throw new HttpAuthError(401, 'Invalid citizen credentials. Officials should sign in via the Government Official tab.');
  }
  if (expectedGroup === 'official' && !isAdminRole(normalizedRole)) {
    recordFailedAttempt(lockKey);
    throw new HttpAuthError(403, 'This account does not have Government Administrator privileges.');
  }

  if (row.account_status === 'pending') {
    throw new HttpAuthError(
      403,
      'Your official account is pending approval by a Super Administrator. Please check back once approved.'
    );
  }
  if (row.account_status !== 'active') {
    throw new HttpAuthError(403, 'This account has been suspended. Please contact civic administration.');
  }

  clearAttempts(lockKey);
  const { rawToken, expiresAt } = createSession(row.id, normalizedRole);
  const safeUser = toSafeUser(row);

  if (isAdminRole(normalizedRole)) {
    recordAuditLog({
      actorId: safeUser.id,
      actorName: safeUser.full_name,
      actorRole: safeUser.role,
      action: 'OFFICIAL_SIGN_IN',
      targetType: 'session',
      targetId: safeUser.id,
      details: `${safeUser.full_name} (${safeUser.role}) signed in to the Government Administration Console.`,
    });
  }

  return { user: safeUser, token: rawToken, expiresAt };
}

export function authenticateCitizen(emailRaw: string, password: string): { user: User; token: string; expiresAt: string } {
  return authenticateUnified(emailRaw, password, 'citizen');
}

export function authenticateAdmin(emailRaw: string, password: string): { user: User; token: string; expiresAt: string } {
  return authenticateUnified(emailRaw, password, 'official');
}

export function authenticateDemoAdmin(): { user: User; token: string; expiresAt: string } {
  if (!isPrototypeMode()) {
    throw new HttpAuthError(403, 'Demo Administrator login is disabled outside prototype mode.');
  }

  const db = getDb();
  let demoRow = db.prepare('SELECT * FROM Users WHERE email = ?').get(DEMO_ADMIN_EMAIL) as RawUserRow | undefined;
  const nowIso = new Date().toISOString();

  if (!demoRow) {
    const randomPassword = crypto.randomBytes(24).toString('hex') + 'Aa1!';
    const res = db
      .prepare(
        `INSERT INTO Users (
          full_name, email, mobile, password_hash, role, department, employee_id, designation,
          security_question, security_answer_hash, account_status, preferred_language, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'admin', 'Central Command', 'DEMO-KA-001', 'Prototype Municipal Officer', '', '', 'active', 'en', ?, ?)`
      )
      .run('Meera Deshpande (Demo Admin)', DEMO_ADMIN_EMAIL, '9845000002', hashSecret(randomPassword), nowIso, nowIso);
    demoRow = db.prepare('SELECT * FROM Users WHERE id = ?').get(Number(res.lastInsertRowid)) as RawUserRow;
  } else if (demoRow.account_status !== 'active') {
    db.prepare("UPDATE Users SET account_status = 'active', updated_at = ? WHERE id = ?").run(nowIso, demoRow.id);
    demoRow = db.prepare('SELECT * FROM Users WHERE id = ?').get(demoRow.id) as RawUserRow;
  }

  const safeUser = toSafeUser(demoRow);
  const { rawToken, expiresAt } = createSession(safeUser.id, safeUser.role);

  recordAuditLog({
    actorId: safeUser.id,
    actorName: safeUser.full_name,
    actorRole: safeUser.role,
    action: 'DEMO_ADMIN_SIGN_IN',
    targetType: 'session',
    targetId: safeUser.id,
    details: 'Signed into Government Administration Console via Prototype Quick Demo Admin Login.',
  });

  return { user: safeUser, token: rawToken, expiresAt };
}
