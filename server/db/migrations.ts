import type Database from 'better-sqlite3';

interface TableColumnInfo {
  name: string;
}

export function runAuthMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Schema_Migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT id FROM Schema_Migrations').all() as Array<{ id: string }>).map((r) => r.id)
  );

  if (!applied.has('001_extend_users_and_auth_tables')) {
    const columns = db.prepare('PRAGMA table_info(Users)').all() as TableColumnInfo[];
    const colNames = new Set(columns.map((c) => c.name));
    const needsRebuild = !colNames.has('password_hash') || !colNames.has('full_name') || !colNames.has('account_status');

    if (needsRebuild) {
      // Rebuild Users non-destructively inside a transaction while preserving all IDs & foreign keys from Complaints
      db.pragma('foreign_keys = OFF');
      const migrateTx = db.transaction(() => {
        db.exec(`
          CREATE TABLE Users_migrated (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            mobile TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL CHECK(role IN ('CITIZEN', 'ADMIN')),
            security_question TEXT NOT NULL DEFAULT '',
            security_answer_hash TEXT NOT NULL DEFAULT '',
            account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active', 'pending', 'suspended')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `);

        const existingRows = db.prepare('SELECT id, name, email, role, created_at FROM Users').all() as Array<{
          id: number;
          name: string;
          email: string;
          role: string;
          created_at: string;
        }>;

        const insertStmt = db.prepare(`
          INSERT INTO Users_migrated (
            id, full_name, email, mobile, password_hash, role,
            security_question, security_answer_hash, account_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, '', ?, '', '', 'active', ?, ?)
        `);

        for (const row of existingRows) {
          const normalizedRole = row.role.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'CITIZEN';
          const normalizedEmail =
            normalizedRole === 'ADMIN' && row.email === 'meera.admin@civicsense.gov.demo'
              ? (process.env.ADMIN_SEED_EMAIL || 'meera.admin@civicsense.gov.in').toLowerCase()
              : row.email.toLowerCase();
          insertStmt.run(
            row.id,
            row.name,
            normalizedEmail,
            normalizedRole === 'ADMIN' ? '9845000002' : '9845000001',
            normalizedRole,
            row.created_at,
            row.created_at
          );
        }

        db.exec('DROP TABLE Users;');
        db.exec('ALTER TABLE Users_migrated RENAME TO Users;');
      });
      migrateTx();
      db.pragma('foreign_keys = ON');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS Sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('CITIZEN', 'ADMIN')),
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS Password_Recovery_Attempts (
        identifier TEXT PRIMARY KEY,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        last_attempt_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS Recovery_Challenges (
        token TEXT PRIMARY KEY,
        user_id INTEGER,
        email TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        used INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user ON Sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON Sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_users_email ON Users(email);
    `);

    db.prepare('INSERT OR IGNORE INTO Schema_Migrations (id) VALUES (?)').run('001_extend_users_and_auth_tables');
  }

  if (!applied.has('002_multilingual_support')) {
    const userCols = new Set(
      (db.prepare('PRAGMA table_info(Users)').all() as TableColumnInfo[]).map((c) => c.name)
    );
    if (!userCols.has('preferred_language')) {
      db.exec(`ALTER TABLE Users ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en';`);
    }

    const complaintCols = new Set(
      (db.prepare('PRAGMA table_info(Complaints)').all() as TableColumnInfo[]).map((c) => c.name)
    );
    if (!complaintCols.has('original_language')) {
      db.exec(`ALTER TABLE Complaints ADD COLUMN original_language TEXT NOT NULL DEFAULT 'en';`);
    }
    if (!complaintCols.has('english_title')) {
      db.exec(`ALTER TABLE Complaints ADD COLUMN english_title TEXT;`);
    }
    if (!complaintCols.has('english_description')) {
      db.exec(`ALTER TABLE Complaints ADD COLUMN english_description TEXT;`);
    }
    if (!complaintCols.has('english_location')) {
      db.exec(`ALTER TABLE Complaints ADD COLUMN english_location TEXT;`);
    }

    db.prepare('INSERT OR IGNORE INTO Schema_Migrations (id) VALUES (?)').run('002_multilingual_support');
  }
}
