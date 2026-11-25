import type Database from 'better-sqlite3';
import { calculateSlaDeadline } from '../../shared/sla.ts';
import { normalizeUserRole } from '../../shared/types.ts';

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
      db.pragma('foreign_keys = OFF');
      const migrateTx = db.transaction(() => {
        db.exec(`
          CREATE TABLE Users_migrated (
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
            security_question, security_answer_hash, account_status, preferred_language, created_at, updated_at
          ) VALUES (?, ?, ?, ?, '', ?, '', '', 'active', 'en', ?, ?)
        `);

        for (const row of existingRows) {
          const normalizedRole = normalizeUserRole(row.role);
          const normalizedEmail =
            normalizedRole !== 'citizen' && row.email === 'meera.admin@civicsense.gov.demo'
              ? (process.env.ADMIN_SEED_EMAIL || 'meera.admin@civicsense.gov.in').toLowerCase()
              : row.email.toLowerCase();
          insertStmt.run(
            row.id,
            row.name,
            normalizedEmail,
            normalizedRole !== 'citizen' ? '9845000002' : '9845000001',
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
        role TEXT NOT NULL CHECK(role IN ('citizen', 'admin', 'super_admin')),
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

  if (!applied.has('003_two_tier_admin_and_sla_escalation')) {
    const usersTableSqlRow = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'Users'")
      .get() as { sql?: string } | undefined;
    const usersCols = new Set(
      (db.prepare('PRAGMA table_info(Users)').all() as TableColumnInfo[]).map((c) => c.name)
    );
    const usersNeedsRebuild =
      !usersCols.has('department') ||
      !usersCols.has('employee_id') ||
      !usersCols.has('designation') ||
      !usersCols.has('approved_by') ||
      Boolean(usersTableSqlRow?.sql && !usersTableSqlRow.sql.includes("'super_admin'"));

    const sessionsTableSqlRow = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'Sessions'")
      .get() as { sql?: string } | undefined;
    const sessionsNeedsRebuild = Boolean(
      sessionsTableSqlRow?.sql && !sessionsTableSqlRow.sql.includes("'super_admin'")
    );

    if (usersNeedsRebuild || sessionsNeedsRebuild) {
      db.pragma('foreign_keys = OFF');
      const rebuildTx = db.transaction(() => {
        if (usersNeedsRebuild) {
          db.exec(`
            CREATE TABLE Users_v3 (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              full_name TEXT NOT NULL,
              email TEXT NOT NULL UNIQUE,
              mobile TEXT NOT NULL DEFAULT '',
              password_hash TEXT NOT NULL DEFAULT '',
              role TEXT NOT NULL CHECK(role IN ('citizen', 'admin', 'super_admin')),
              department TEXT,
              employee_id TEXT,
              designation TEXT,
              approved_by INTEGER REFERENCES Users_v3(id),
              security_question TEXT NOT NULL DEFAULT '',
              security_answer_hash TEXT NOT NULL DEFAULT '',
              account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active', 'pending', 'suspended')),
              preferred_language TEXT NOT NULL DEFAULT 'en' CHECK(preferred_language IN ('en', 'kn', 'hi')),
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
          `);

          const existingUsers = db.prepare('SELECT * FROM Users').all() as Array<Record<string, unknown>>;
          const insertUser = db.prepare(`
            INSERT INTO Users_v3 (
              id, full_name, email, mobile, password_hash, role,
              department, employee_id, designation, approved_by,
              security_question, security_answer_hash, account_status, preferred_language,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const row of existingUsers) {
            const normRole = normalizeUserRole(String(row.role ?? 'citizen'));
            insertUser.run(
              row.id,
              String(row.full_name ?? 'User'),
              String(row.email ?? '').toLowerCase(),
              String(row.mobile ?? ''),
              String(row.password_hash ?? ''),
              normRole,
              (row.department as string | null | undefined) ?? (normRole === 'super_admin' ? 'Central Command' : null),
              (row.employee_id as string | null | undefined) ?? null,
              (row.designation as string | null | undefined) ?? null,
              (row.approved_by as number | null | undefined) ?? null,
              String(row.security_question ?? ''),
              String(row.security_answer_hash ?? ''),
              String(row.account_status ?? 'active'),
              String(row.preferred_language ?? 'en'),
              String(row.created_at ?? new Date().toISOString()),
              String(row.updated_at ?? new Date().toISOString())
            );
          }

          db.exec('DROP TABLE Users;');
          db.exec('ALTER TABLE Users_v3 RENAME TO Users;');
        }

        if (sessionsNeedsRebuild) {
          db.exec(`
            CREATE TABLE Sessions_v3 (
              id TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL,
              role TEXT NOT NULL CHECK(role IN ('citizen', 'admin', 'super_admin')),
              expires_at TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
            );
          `);

          const existingSessions = db.prepare('SELECT id, user_id, role, expires_at, created_at FROM Sessions').all() as Array<{
            id: string;
            user_id: number;
            role: string;
            expires_at: string;
            created_at: string;
          }>;
          const insertSession = db.prepare(
            'INSERT INTO Sessions_v3 (id, user_id, role, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
          );
          for (const s of existingSessions) {
            insertSession.run(s.id, s.user_id, normalizeUserRole(s.role), s.expires_at, s.created_at);
          }

          db.exec('DROP TABLE Sessions;');
          db.exec('ALTER TABLE Sessions_v3 RENAME TO Sessions;');
        }
      });
      rebuildTx();
      db.pragma('foreign_keys = ON');
    }

    // Create admin_invites & audit_logs tables + indexes
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        department TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        used_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        used_at TEXT,
        revoked_at TEXT,
        FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE CASCADE,
        FOREIGN KEY (used_by) REFERENCES Users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER,
        actor_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (actor_id) REFERENCES Users(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON Users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON Users(role);
      CREATE INDEX IF NOT EXISTS idx_users_status ON Users(account_status);
      CREATE INDEX IF NOT EXISTS idx_users_department ON Users(department);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON Sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON Sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_admin_invites_code ON admin_invites(code);
      CREATE INDEX IF NOT EXISTS idx_admin_invites_expires ON admin_invites(expires_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    `);

    // Add SLA & legal escalation columns to Complaints safely
    const complaintCols = new Set(
      (db.prepare('PRAGMA table_info(Complaints)').all() as TableColumnInfo[]).map((c) => c.name)
    );
    if (!complaintCols.has('sla_deadline')) {
      db.exec('ALTER TABLE Complaints ADD COLUMN sla_deadline TEXT;');
    }
    if (!complaintCols.has('escalation_notice_generated')) {
      db.exec('ALTER TABLE Complaints ADD COLUMN escalation_notice_generated INTEGER NOT NULL DEFAULT 0;');
    }
    if (!complaintCols.has('escalation_notice_sent_at')) {
      db.exec('ALTER TABLE Complaints ADD COLUMN escalation_notice_sent_at TEXT;');
    }
    if (!complaintCols.has('escalation_language')) {
      db.exec('ALTER TABLE Complaints ADD COLUMN escalation_language TEXT;');
    }
    if (!complaintCols.has('escalation_document')) {
      db.exec('ALTER TABLE Complaints ADD COLUMN escalation_document TEXT;');
    }
    if (!complaintCols.has('escalation_generation_method')) {
      db.exec('ALTER TABLE Complaints ADD COLUMN escalation_generation_method TEXT;');
    }
    if (!complaintCols.has('sla_breach_simulated')) {
      db.exec('ALTER TABLE Complaints ADD COLUMN sla_breach_simulated INTEGER NOT NULL DEFAULT 0;');
    }

    // Backfill sla_deadline for all existing complaints
    const missingDeadlines = db
      .prepare("SELECT id, created_at, priority_score FROM Complaints WHERE sla_deadline IS NULL OR sla_deadline = ''")
      .all() as Array<{ id: number; created_at: string; priority_score: number }>;

    if (missingDeadlines.length > 0) {
      const updateDeadline = db.prepare('UPDATE Complaints SET sla_deadline = ? WHERE id = ?');
      const backfillTx = db.transaction(() => {
        for (const row of missingDeadlines) {
          updateDeadline.run(calculateSlaDeadline(row.created_at, row.priority_score), row.id);
        }
      });
      backfillTx();
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_complaints_sla_deadline ON Complaints(sla_deadline);
      CREATE INDEX IF NOT EXISTS idx_complaints_escalation ON Complaints(escalation_notice_generated);
    `);

    db.prepare('INSERT OR IGNORE INTO Schema_Migrations (id) VALUES (?)').run('003_two_tier_admin_and_sla_escalation');
  }
}
