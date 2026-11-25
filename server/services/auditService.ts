import type { AuditLogEntry } from '../../shared/types.ts';
import { getDb } from '../db/database.ts';

export function recordAuditLog(entry: {
  actorId?: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string | number | null;
  details: string;
}): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_logs (actor_id, actor_name, actor_role, action, target_type, target_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.actorId ?? null,
      entry.actorName,
      entry.actorRole,
      entry.action,
      entry.targetType,
      entry.targetId !== undefined && entry.targetId !== null ? String(entry.targetId) : null,
      entry.details,
      new Date().toISOString()
    );
  } catch (err) {
    console.warn('[CivicSense Audit] Failed to write audit log:', err instanceof Error ? err.message : err);
  }
}

export function listAuditLogs(options: { search?: string; action?: string; limit?: number } = {}): AuditLogEntry[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.search && options.search.trim()) {
    const like = `%${options.search.trim()}%`;
    clauses.push('(actor_name LIKE ? OR action LIKE ? OR target_type LIKE ? OR target_id LIKE ? OR details LIKE ?)');
    params.push(like, like, like, like, like);
  }
  if (options.action && options.action !== 'All') {
    clauses.push('action = ?');
    params.push(options.action);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.max(10, Math.min(250, options.limit ?? 120));

  return db
    .prepare(`SELECT * FROM audit_logs ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(...params, limit) as AuditLogEntry[];
}
