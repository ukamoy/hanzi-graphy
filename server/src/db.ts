import Database from 'better-sqlite3'
import path from 'path'
import { hashPassword, createSalt } from './hash.js'
import { DEFAULT_HANZI_TEXT } from './defaultText.js'

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data.db')

let db: Database.Database

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    init()
  }
  return db
}

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      chars TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'default',
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS practice_records (
      practice_key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      character TEXT NOT NULL,
      paths TEXT NOT NULL DEFAULT '[]',
      score REAL,
      quiz TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_practice_records_user_id ON practice_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_courses_user_id ON courses(user_id);

    CREATE TABLE IF NOT EXISTS grade_texts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      chars TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  const row = db.prepare('SELECT COUNT(*) as count FROM users WHERE id = ?').get('admin') as { count: number }
  if (row.count === 0) {
    seed()
  }
}

function seed() {
  const now = Date.now()
  const salt = createSalt('admin')
  const hash = hashPassword('n9RzWpQYNnZw', salt)

  db.prepare(`INSERT INTO users (id, name, role, password_salt, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run('admin', '管理员', 'admin', salt, hash, 1)
  db.prepare(`INSERT INTO app_config (key, value) VALUES (?, ?)`).run('default_text', DEFAULT_HANZI_TEXT)
  db.prepare(`INSERT INTO grade_texts (id, name, chars) VALUES (?, ?, ?)`).run('grade-1', '一年级', DEFAULT_HANZI_TEXT)
}
