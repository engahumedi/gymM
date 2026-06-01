import Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      address     TEXT,
      phone       TEXT,
      manager_name TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL CHECK (role IN ('admin','receptionist')),
      branch_id     INTEGER REFERENCES branches(id) ON DELETE SET NULL,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT    NOT NULL UNIQUE,
      expires_at TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

    CREATE TABLE IF NOT EXISTS members (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      member_code             TEXT    NOT NULL UNIQUE,
      name_ar                 TEXT    NOT NULL,
      name_en                 TEXT,
      phone                   TEXT,
      email                   TEXT,
      photo_path              TEXT,
      gender                  TEXT    CHECK (gender IN ('male','female')),
      dob                     TEXT,
      national_id             TEXT    UNIQUE,
      emergency_contact_name  TEXT,
      emergency_contact_phone TEXT,
      health_notes            TEXT,
      join_date               TEXT    NOT NULL DEFAULT (date('now')),
      status                  TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','cancelled')),
      home_branch_id          INTEGER NOT NULL REFERENCES branches(id),
      created_by              INTEGER REFERENCES users(id),
      is_active               INTEGER NOT NULL DEFAULT 1,
      created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_members_home_branch_id ON members(home_branch_id);
    CREATE INDEX IF NOT EXISTS idx_members_member_code    ON members(member_code);
    CREATE INDEX IF NOT EXISTS idx_members_phone          ON members(phone);
    CREATE INDEX IF NOT EXISTS idx_members_national_id    ON members(national_id);

    CREATE TABLE IF NOT EXISTS subscription_plans (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      duration_days INTEGER NOT NULL,
      price         REAL    NOT NULL,
      description   TEXT,
      features_json TEXT    DEFAULT '[]',
      sessions_per_day INTEGER,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id        INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      plan_id          INTEGER NOT NULL REFERENCES subscription_plans(id),
      branch_id        INTEGER NOT NULL REFERENCES branches(id),
      start_date       TEXT    NOT NULL,
      end_date         TEXT    NOT NULL,
      price_paid       REAL    NOT NULL,
      discount_amount  REAL    NOT NULL DEFAULT 0,
      discount_reason  TEXT,
      payment_method   TEXT    NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','transfer','card','online')),
      payment_reference TEXT,
      processed_by     INTEGER REFERENCES users(id),
      notes            TEXT,
      status           TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','frozen','cancelled')),
      freeze_count     INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_member_id ON subscriptions(member_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_branch_id ON subscriptions(branch_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status    ON subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date  ON subscriptions(end_date);

    CREATE TABLE IF NOT EXISTS subscription_freezes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      freeze_start    TEXT    NOT NULL,
      freeze_end      TEXT    NOT NULL,
      days_frozen     INTEGER NOT NULL,
      reason          TEXT,
      created_by      INTEGER REFERENCES users(id),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_freezes_subscription_id ON subscription_freezes(subscription_id);

    CREATE TABLE IF NOT EXISTS attendance (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      subscription_id INTEGER REFERENCES subscriptions(id),
      branch_id       INTEGER NOT NULL REFERENCES branches(id),
      check_in_time   TEXT    NOT NULL DEFAULT (datetime('now')),
      check_out_time  TEXT,
      method          TEXT    NOT NULL DEFAULT 'manual' CHECK (method IN ('qr','manual','id_entry')),
      processed_by    INTEGER REFERENCES users(id),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_member_id     ON attendance(member_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_branch_id     ON attendance(branch_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_check_in_time ON attendance(check_in_time);

    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT    NOT NULL CHECK (type IN ('expiring_soon','expired_today','no_checkin','new_member','system')),
      title       TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      member_id   INTEGER REFERENCES members(id) ON DELETE CASCADE,
      target_role TEXT    DEFAULT 'all',
      branch_id   INTEGER REFERENCES branches(id),
      is_read     INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_is_read   ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_notifications_branch_id ON notifications(branch_id);

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT NOT NULL PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO settings(key, value) VALUES ('member_code_counter', '0');
    INSERT OR IGNORE INTO settings(key, value) VALUES ('gym_name', 'صالة الرياضية');
    INSERT OR IGNORE INTO settings(key, value) VALUES ('gym_phone', '');
    INSERT OR IGNORE INTO settings(key, value) VALUES ('gym_address', '');
    INSERT OR IGNORE INTO settings(key, value) VALUES ('gym_cr', '');
    INSERT OR IGNORE INTO settings(key, value) VALUES ('currency', 'ريال');
    INSERT OR IGNORE INTO settings(key, value) VALUES ('timezone', 'Asia/Riyadh');
  `);
}
