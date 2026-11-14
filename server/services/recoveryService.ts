import crypto from 'crypto';
import { SUGGESTED_SECURITY_QUESTIONS } from '../../shared/types.ts';
import { getDb } from '../db/database.ts';
import {
  hashSecret,
  invalidateAllUserSessions,
  normalizeEmail,
  normalizeSecurityAnswer,
  type RawUserRow,
  validateEmailFormat,
  validatePasswordStrength,
  verifySecret,
} from './authService.ts';

const MAX_RECOVERY_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const CHALLENGE_TTL_MINUTES = 15;

export interface RecoveryProvider {
  initiateChallenge(email: string): Promise<{ question: string; challengeToken: string; expiresAt: string }>;
  verifyChallenge(challengeToken: string, answer: string): Promise<{ verified: boolean; resetToken: string }>;
}

function getRecoveryLock(identifier: string): { locked: boolean; minutesLeft: number } {
  const db = getDb();
  const row = db
    .prepare('SELECT attempt_count, locked_until FROM Password_Recovery_Attempts WHERE identifier = ?')
    .get(identifier) as { attempt_count: number; locked_until: string | null } | undefined;

  if (!row || !row.locked_until) return { locked: false, minutesLeft: 0 };
  const until = new Date(row.locked_until).getTime();
  if (until > Date.now()) {
    return {
      locked: true,
      minutesLeft: Math.max(1, Math.ceil((until - Date.now()) / 60000)),
    };
  }
  return { locked: false, minutesLeft: 0 };
}

function incrementRecoveryAttempt(identifier: string): number {
  const db = getDb();
  const row = db
    .prepare('SELECT attempt_count, locked_until FROM Password_Recovery_Attempts WHERE identifier = ?')
    .get(identifier) as { attempt_count: number; locked_until: string | null } | undefined;

  const lockExpired = row?.locked_until ? new Date(row.locked_until).getTime() <= Date.now() : false;
  const nextCount = lockExpired ? 1 : (row?.attempt_count ?? 0) + 1;
  const lockedUntil =
    nextCount >= MAX_RECOVERY_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
      : null;

  db.prepare(
    `INSERT INTO Password_Recovery_Attempts (identifier, attempt_count, locked_until, last_attempt_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(identifier) DO UPDATE SET
       attempt_count = excluded.attempt_count,
       locked_until = excluded.locked_until,
       last_attempt_at = excluded.last_attempt_at`
  ).run(identifier, nextCount, lockedUntil, new Date().toISOString());

  return nextCount;
}

function clearRecoveryAttempts(identifier: string): void {
  const db = getDb();
  db.prepare('DELETE FROM Password_Recovery_Attempts WHERE identifier = ?').run(identifier);
}

function getDeterministicDecoyQuestion(email: string): string {
  const digest = crypto.createHash('sha256').update(email).digest();
  const idx = digest[0] % SUGGESTED_SECURITY_QUESTIONS.length;
  return SUGGESTED_SECURITY_QUESTIONS[idx];
}

export class SecurityQuestionRecoveryProvider implements RecoveryProvider {
  async initiateChallenge(emailRaw: string): Promise<{ question: string; challengeToken: string; expiresAt: string }> {
    const email = normalizeEmail(emailRaw);
    if (!validateEmailFormat(email)) {
      throw new Error('Please enter a valid email address.');
    }

    const lockKey = `recovery:${email}`;
    const lock = getRecoveryLock(lockKey);
    if (lock.locked) {
      throw new Error(`Password recovery temporarily blocked due to repeated incorrect attempts. Try again in ${lock.minutesLeft} minute(s).`);
    }

    const db = getDb();
    db.prepare('DELETE FROM Recovery_Challenges WHERE expires_at <= ?').run(new Date().toISOString());

    const user = db.prepare('SELECT id, security_question, account_status FROM Users WHERE email = ?').get(email) as
      | Pick<RawUserRow, 'id' | 'security_question' | 'account_status'>
      | undefined;

    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000).toISOString();

    const validAccount = user && user.account_status === 'active' && Boolean(user.security_question);

    db.prepare(
      'INSERT INTO Recovery_Challenges (token, user_id, email, verified, used, expires_at) VALUES (?, ?, ?, 0, 0, ?)'
    ).run(tokenHash, validAccount ? user.id : null, email, expiresAt);

    // Avoid revealing whether email is registered: return real question if active, or deterministic decoy if absent
    const question = validAccount ? user.security_question : getDeterministicDecoyQuestion(email);

    return {
      question,
      challengeToken: rawToken,
      expiresAt,
    };
  }

  async verifyChallenge(challengeToken: string, answerRaw: string): Promise<{ verified: boolean; resetToken: string }> {
    const answer = normalizeSecurityAnswer(answerRaw);
    if (!challengeToken || !answer) {
      throw new Error('Please provide your security answer.');
    }

    const db = getDb();
    const tokenHash = crypto.createHash('sha256').update(challengeToken).digest('hex');
    const challenge = db
      .prepare('SELECT token, user_id, email, used, expires_at FROM Recovery_Challenges WHERE token = ?')
      .get(tokenHash) as
      | { token: string; user_id: number | null; email: string; used: number; expires_at: string }
      | undefined;

    if (!challenge || challenge.used || new Date(challenge.expires_at).getTime() <= Date.now()) {
      throw new Error('Recovery session has expired. Please start password recovery again.');
    }

    const lockKey = `recovery:${challenge.email}`;
    const lock = getRecoveryLock(lockKey);
    if (lock.locked) {
      throw new Error(`Too many incorrect answers. Password recovery is temporarily blocked for ${lock.minutesLeft} minute(s).`);
    }

    if (!challenge.user_id) {
      const attempts = incrementRecoveryAttempt(lockKey);
      if (attempts >= MAX_RECOVERY_ATTEMPTS) {
        throw new Error(`Too many incorrect answers. Password recovery is temporarily blocked for ${LOCK_MINUTES} minutes.`);
      }
      throw new Error('Security answer verification failed. Please check your details and try again.');
    }

    const user = db.prepare('SELECT id, security_answer_hash, account_status FROM Users WHERE id = ?').get(challenge.user_id) as
      | Pick<RawUserRow, 'id' | 'security_answer_hash' | 'account_status'>
      | undefined;

    if (!user || user.account_status !== 'active' || !verifySecret(answer, user.security_answer_hash)) {
      const attempts = incrementRecoveryAttempt(lockKey);
      if (attempts >= MAX_RECOVERY_ATTEMPTS) {
        throw new Error(`Too many incorrect answers. Password recovery is temporarily blocked for ${LOCK_MINUTES} minutes.`);
      }
      throw new Error('Security answer verification failed. Please check your details and try again.');
    }

    clearRecoveryAttempts(lockKey);
    db.prepare('UPDATE Recovery_Challenges SET verified = 1 WHERE token = ?').run(tokenHash);

    return {
      verified: true,
      resetToken: challengeToken,
    };
  }
}

export const activeRecoveryProvider: RecoveryProvider = new SecurityQuestionRecoveryProvider();

export function resetPasswordWithToken(
  resetToken: string,
  newPassword: string,
  confirmPassword: string
): { success: true } {
  if (!resetToken) {
    throw new Error('Invalid or expired recovery token.');
  }

  const strengthErr = validatePasswordStrength(newPassword);
  if (strengthErr) {
    throw new Error(strengthErr);
  }
  if (newPassword !== confirmPassword) {
    throw new Error('New password and confirmation password do not match.');
  }

  const db = getDb();
  const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const challenge = db
    .prepare('SELECT token, user_id, email, verified, used, expires_at FROM Recovery_Challenges WHERE token = ?')
    .get(tokenHash) as
    | { token: string; user_id: number | null; email: string; verified: number; used: number; expires_at: string }
    | undefined;

  if (
    !challenge ||
    !challenge.user_id ||
    !challenge.verified ||
    challenge.used ||
    new Date(challenge.expires_at).getTime() <= Date.now()
  ) {
    throw new Error('Password reset verification has expired or is invalid. Please restart recovery.');
  }

  const newHash = hashSecret(newPassword);
  const nowIso = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare('UPDATE Users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, nowIso, challenge.user_id);
    db.prepare('UPDATE Recovery_Challenges SET used = 1 WHERE token = ?').run(tokenHash);
    // Security requirement: invalidate all existing active sessions after password reset
    invalidateAllUserSessions(challenge.user_id!);
    clearRecoveryAttempts(`recovery:${challenge.email}`);
    clearRecoveryAttempts(`login:citizen:${challenge.email}`);
    clearRecoveryAttempts(`login:admin:${challenge.email}`);
  });

  tx();
  return { success: true };
}
