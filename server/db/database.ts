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

export function getDb(): Database.Database {
  if (!dbInstance) {
    const dbPath = resolveDbPath();
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    initializeSchema(dbInstance);
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
      role TEXT NOT NULL CHECK(role IN ('CITIZEN', 'ADMIN')),
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
