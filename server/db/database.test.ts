import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { openDatabaseWithRecovery } from './database.ts';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'civicsense-db-test-'));
}

test('openDatabaseWithRecovery initializes fresh database in DELETE journal mode', () => {
  const dir = makeTempDir();
  const dbPath = path.join(dir, 'fresh.db');
  try {
    const db = openDatabaseWithRecovery(dbPath);
    const mode = db.pragma('journal_mode', { simple: true });
    assert.equal(String(mode).toLowerCase(), 'delete');

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
    ).map((r) => r.name);
    assert.ok(tables.includes('Users'));
    assert.ok(tables.includes('Complaints'));
    assert.ok(tables.includes('Sessions'));
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('openDatabaseWithRecovery recovers when WAL/SHM sidecar files are corrupted while preserving main DB', () => {
  const dir = makeTempDir();
  const dbPath = path.join(dir, 'wal-corrupt.db');
  try {
    // Create a valid database in WAL mode and checkpoint data into the main file
    const initial = new Database(dbPath);
    initial.pragma('journal_mode = WAL');
    initial.exec(`
      CREATE TABLE Users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        mobile TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL CHECK(role IN ('CITIZEN', 'ADMIN')),
        security_question TEXT NOT NULL DEFAULT '',
        security_answer_hash TEXT NOT NULL DEFAULT '',
        account_status TEXT NOT NULL DEFAULT 'active',
        preferred_language TEXT NOT NULL DEFAULT 'en',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO Users (full_name, email, role) VALUES ('Test Citizen', 'citizen@example.com', 'CITIZEN');
    `);
    initial.pragma('wal_checkpoint(FULL)');
    initial.close();

    // Simulate a corrupted WAL file left behind after an unclean snapshot/shutdown
    fs.writeFileSync(`${dbPath}-wal`, Buffer.alloc(8192, 0xab));
    fs.writeFileSync(`${dbPath}-shm`, Buffer.alloc(32768, 0xcd));

    const recovered = openDatabaseWithRecovery(dbPath);
    const user = recovered.prepare('SELECT email FROM Users WHERE email = ?').get('citizen@example.com') as
      | { email: string }
      | undefined;
    assert.equal(user?.email, 'citizen@example.com');
    assert.equal(fs.existsSync(`${dbPath}-wal`), false);
    recovered.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('openDatabaseWithRecovery recreates a fresh database when the main DB file is unreadable', () => {
  const dir = makeTempDir();
  const dbPath = path.join(dir, 'broken.db');
  try {
    fs.writeFileSync(dbPath, 'not a valid sqlite database file at all');

    const fresh = openDatabaseWithRecovery(dbPath);
    const check = fresh.pragma('quick_check', { simple: true });
    assert.equal(check, 'ok');

    const count = (fresh.prepare('SELECT COUNT(*) as c FROM Users').get() as { c: number }).c;
    assert.equal(count, 0);

    const backups = fs.readdirSync(dir).filter((f) => f.startsWith('broken.db.corrupt.'));
    assert.equal(backups.length, 1);
    fresh.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
