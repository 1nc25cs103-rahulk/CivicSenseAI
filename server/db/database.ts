import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { runAuthMigrations } from './migrations.ts';

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH?.trim();
  const resolved = configured
    ? path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured)
    : path.resolve(process.cwd(), 'data', 'civicsense.db');
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return resolved;
}

export const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

let dbInstance: Database.Database | null = null;

function isCorruptionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code ?? '';
  const msg = err.message.toLowerCase();
  return (
    code === 'SQLITE_CORRUPT' ||
    code === 'SQLITE_NOTADB' ||
    code === 'SQLITE_IOERR' ||
    msg.includes('database disk image is malformed') ||
    msg.includes('file is not a database')
  );
}

function removeSidecarFiles(dbPath: string): boolean {
  let removed = false;
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const sidecar = `${dbPath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.rmSync(sidecar, { force: true });
      removed = true;
    }
  }
  return removed;
}

function openAndValidateDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  try {
    // Use DELETE journal mode to avoid stale/corrupted WAL sidecar files across container snapshots.
    db.pragma('journal_mode = DELETE');
    db.pragma('foreign_keys = ON');
    const check = db.pragma('quick_check', { simple: true });
    if (check !== 'ok') {
      throw new Error(`SQLite integrity check failed: ${String(check)}`);
    }
    return db;
  } catch (err) {
    try {
      db.close();
    } catch {
      // Ignore close error on malformed handle
    }
    throw err;
  }
}

export function openDatabaseWithRecovery(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    const db = openAndValidateDatabase(dbPath);
    initializeSchema(db);
    return db;
  } catch (err) {
    if (!isCorruptionError(err) && !(err instanceof Error && err.message.includes('integrity check failed'))) {
      throw err;
    }

    // Step 1: If WAL/SHM sidecar files exist, discard them and try recovering the main DB file intact.
    if (removeSidecarFiles(dbPath)) {
      console.warn(`[CivicSense DB] Removed corrupted SQLite sidecar files for ${dbPath}; retrying open.`);
      try {
        const recovered = openAndValidateDatabase(dbPath);
        initializeSchema(recovered);
        return recovered;
      } catch {
        // Fall through to full recreation if the main DB file itself is damaged.
      }
    }

    // Step 2: Back up the unreadable database file and create a clean database.
    if (fs.existsSync(dbPath)) {
      const backupPath = `${dbPath}.corrupt.${Date.now()}`;
      try {
        fs.renameSync(dbPath, backupPath);
        console.warn(`[CivicSense DB] Backed up corrupted database to ${backupPath} and recreating fresh database.`);
      } catch {
        fs.rmSync(dbPath, { force: true });
      }
    }
    removeSidecarFiles(dbPath);

    const fresh = openAndValidateDatabase(dbPath);
    initializeSchema(fresh);
    return fresh;
  }
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    const dbPath = resolveDbPath();
    dbInstance = openDatabaseWithRecovery(dbPath);
  }
  return dbInstance;
}

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      mobile TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('citizen', 'admin', 'super_admin')),
      department TEXT,
      employee_id TEXT,
      designation TEXT,
      approved_by INTEGER REFERENCES Users(id),
      security_question TEXT NOT NULL DEFAULT '',
      security_answer_hash TEXT NOT NULL DEFAULT '',
      account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active', 'pending', 'suspended')),
      preferred_language TEXT NOT NULL DEFAULT 'en' CHECK(preferred_language IN ('en', 'kn', 'hi')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_code TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      predicted_category TEXT NOT NULL,
      image_path TEXT,
      location TEXT NOT NULL,
      locality TEXT NOT NULL,
      district TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      incident_date TEXT NOT NULL,
      contact_info TEXT NOT NULL,
      affected_citizens INTEGER NOT NULL DEFAULT 25,
      severity TEXT NOT NULL CHECK(severity IN ('Critical', 'High', 'Medium', 'Low')),
      priority_score INTEGER NOT NULL,
      priority_level TEXT NOT NULL CHECK(priority_level IN ('Critical', 'High', 'Medium', 'Low')),
      ai_keywords TEXT NOT NULL DEFAULT '[]',
      ai_explanation TEXT NOT NULL,
      suggested_action TEXT NOT NULL,
      factor_breakdown TEXT NOT NULL,
      critical_safety_flag INTEGER NOT NULL DEFAULT 0,
      ai_source TEXT NOT NULL DEFAULT 'rules',
      original_language TEXT NOT NULL DEFAULT 'en',
      english_title TEXT,
      english_description TEXT,
      english_location TEXT,
      status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      sla_deadline TEXT,
      escalation_notice_generated INTEGER NOT NULL DEFAULT 0,
      escalation_notice_sent_at TEXT,
      escalation_language TEXT,
      escalation_document TEXT,
      escalation_generation_method TEXT,
      sla_breach_simulated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES Users(id)
    );

    CREATE TABLE IF NOT EXISTS Complaint_Duplicates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      related_complaint_id INTEGER NOT NULL,
      similarity_score INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (complaint_id) REFERENCES Complaints(id) ON DELETE CASCADE,
      FOREIGN KEY (related_complaint_id) REFERENCES Complaints(id) ON DELETE CASCADE,
      UNIQUE(complaint_id, related_complaint_id)
    );

    CREATE TABLE IF NOT EXISTS Department_Assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL UNIQUE,
      department TEXT NOT NULL,
      assigned_to TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (complaint_id) REFERENCES Complaints(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Complaint_Updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected')),
      remarks TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT 'System',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (complaint_id) REFERENCES Complaints(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_district ON Complaints(district);
    CREATE INDEX IF NOT EXISTS idx_complaints_category ON Complaints(category);
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON Complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_priority ON Complaints(priority_score DESC);
    CREATE INDEX IF NOT EXISTS idx_complaints_created ON Complaints(created_at DESC);
  `);

  runAuthMigrations(db);
}
