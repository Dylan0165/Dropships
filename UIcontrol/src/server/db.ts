import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(__dirname, '../../data/dropship.db')

// Ensure data directory exists
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db = new Database(dbPath)

// Enable WAL mode for better concurrent reads
db.pragma('journal_mode = WAL')

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    niche TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    data TEXT NOT NULL DEFAULT '{}',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stores (
    store_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    subdomein TEXT NOT NULL,
    niche TEXT NOT NULL,
    preview_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    roas REAL,
    status TEXT NOT NULL DEFAULT 'building',
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
  );

  CREATE INDEX IF NOT EXISTS idx_stores_run_id ON stores(run_id);
  CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

  CREATE TABLE IF NOT EXISTS niches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    trending_score INTEGER NOT NULL DEFAULT 50,
    active_advertisers INTEGER NOT NULL DEFAULT 0,
    market_size_eu TEXT NOT NULL DEFAULT 'medium',
    viral_potential INTEGER NOT NULL DEFAULT 50,
    sources TEXT NOT NULL DEFAULT '[]',
    reasoning TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'suggested',
    run_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

export default db
