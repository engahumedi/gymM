import Database from 'better-sqlite3';
import path from 'path';
import { runMigrations } from './migrations';

// On Render: DB_PATH=/data/gym.db (persistent disk). Locally: ./gym.db
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'gym.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    runMigrations(_db);
  }
  return _db;
}

export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
}) as any;

export function initDb(): void {
  getDb();
  console.log(`Database initialized at ${DB_PATH}`);
}
