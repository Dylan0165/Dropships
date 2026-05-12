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
    port INTEGER,
    health_status TEXT NOT NULL DEFAULT 'unknown',
    health_checked_at TEXT,
    health_response_ms INTEGER,
    health_error TEXT,
    ai_diagnosis TEXT,
    ai_diagnosed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
  );

  -- Voeg kolommen toe aan bestaande DB (idempotent via ALTER TABLE)
  CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY);

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

  CREATE TABLE IF NOT EXISTS agent_outputs (
    run_id        TEXT NOT NULL,
    agent_id      TEXT NOT NULL,
    output_json   TEXT NOT NULL,
    completed_at  TEXT NOT NULL,
    PRIMARY KEY (run_id, agent_id),
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
  );

  CREATE INDEX IF NOT EXISTS idx_agent_outputs_run ON agent_outputs(run_id);
`)


// ── Lifecycle events ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS lifecycle_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id   TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload    TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lifecycle_store ON lifecycle_events(store_id);
  CREATE INDEX IF NOT EXISTS idx_lifecycle_type  ON lifecycle_events(event_type);

  CREATE TABLE IF NOT EXISTS store_products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id   TEXT NOT NULL,
    product_id TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    price      REAL NOT NULL DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'active',
    added_at   TEXT NOT NULL,
    UNIQUE(store_id, product_id)
  );
  CREATE INDEX IF NOT EXISTS idx_store_products ON store_products(store_id);

  -- Skills performance tracking
  CREATE TABLE IF NOT EXISTS skills_performance (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id           TEXT NOT NULL,
    agent_id         TEXT NOT NULL,
    success          INTEGER NOT NULL DEFAULT 1,
    attempts         INTEGER NOT NULL DEFAULT 1,
    duration_ms      INTEGER NOT NULL DEFAULT 0,
    cost_eur         REAL    NOT NULL DEFAULT 0,
    validation_errors TEXT   NOT NULL DEFAULT '[]',
    output_quality   INTEGER NOT NULL DEFAULT 70,
    created_at       TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_skills_agent ON skills_performance(agent_id);
  CREATE INDEX IF NOT EXISTS idx_skills_run   ON skills_performance(run_id);

  -- Component A/B experiments
  CREATE TABLE IF NOT EXISTS component_experiments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id  TEXT NOT NULL UNIQUE,
    component_name TEXT NOT NULL,
    variant_a      TEXT NOT NULL,
    variant_b      TEXT NOT NULL,
    store_id       TEXT NOT NULL DEFAULT '',
    impressions_a  INTEGER NOT NULL DEFAULT 0,
    impressions_b  INTEGER NOT NULL DEFAULT 0,
    conversions_a  INTEGER NOT NULL DEFAULT 0,
    conversions_b  INTEGER NOT NULL DEFAULT 0,
    winner         TEXT,
    declared_at    TEXT,
    created_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_experiments_store ON component_experiments(store_id);
  CREATE INDEX IF NOT EXISTS idx_experiments_comp  ON component_experiments(component_name);

  CREATE TABLE IF NOT EXISTS ads (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id           TEXT NOT NULL,
    run_id             TEXT,
    platform           TEXT NOT NULL DEFAULT 'meta',
    format             TEXT NOT NULL DEFAULT 'image',
    phase              TEXT NOT NULL DEFAULT 'static',
    status             TEXT NOT NULL DEFAULT 'queued',
    higgsfield_job_id  TEXT,
    creative_url       TEXT,
    hook               TEXT NOT NULL DEFAULT '',
    primary_text       TEXT NOT NULL DEFAULT '',
    headline           TEXT,
    performance_score  REAL,
    created_at         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ads_store  ON ads(store_id);
  CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);

  CREATE TABLE IF NOT EXISTS higgsfield_jobs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id            INTEGER NOT NULL,
    job_id           TEXT UNIQUE,
    status           TEXT NOT NULL DEFAULT 'pending',
    input_image_url  TEXT,
    output_video_url TEXT,
    prompt           TEXT,
    created_at       TEXT NOT NULL,
    completed_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_hf_ad_id ON higgsfield_jobs(ad_id);
`)

// ── Nieuwe tables voor pipeline v2 ───────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_executions (
    id           TEXT PRIMARY KEY,
    run_id       TEXT NOT NULL,
    agent_name   TEXT NOT NULL,
    stage        TEXT NOT NULL,
    status       TEXT NOT NULL,
    input_json   TEXT,
    output_json  TEXT,
    error_message TEXT,
    cost_usd     REAL    DEFAULT 0,
    tokens_in    INTEGER DEFAULT 0,
    tokens_out   INTEGER DEFAULT 0,
    duration_ms  INTEGER DEFAULT 0,
    retry_count  INTEGER DEFAULT 0,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
  );
  CREATE INDEX IF NOT EXISTS idx_executions_run   ON agent_executions(run_id);
  CREATE INDEX IF NOT EXISTS idx_executions_agent ON agent_executions(agent_name);
  CREATE INDEX IF NOT EXISTS idx_executions_status ON agent_executions(status);

  CREATE TABLE IF NOT EXISTS stage_outputs (
    run_id       TEXT NOT NULL,
    stage        TEXT NOT NULL,
    output_json  TEXT NOT NULL,
    approved_at  TEXT NOT NULL,
    PRIMARY KEY (run_id, stage)
  );

  CREATE TABLE IF NOT EXISTS port_allocations (
    port         INTEGER PRIMARY KEY,
    store_id     TEXT NOT NULL,
    allocated_at TEXT NOT NULL,
    released_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_ports_store ON port_allocations(store_id);
`)

// ── Idempotente migrations voor bestaande databases ──────────────────────────
const storesCols = (db.prepare(`PRAGMA table_info(stores)`).all() as { name: string }[]).map(c => c.name)
const storeMigrations: [string, string][] = [
  ['port',              'ALTER TABLE stores ADD COLUMN port INTEGER'],
  ['health_status',     "ALTER TABLE stores ADD COLUMN health_status TEXT NOT NULL DEFAULT 'unknown'"],
  ['health_checked_at', 'ALTER TABLE stores ADD COLUMN health_checked_at TEXT'],
  ['health_response_ms','ALTER TABLE stores ADD COLUMN health_response_ms INTEGER'],
  ['health_error',      'ALTER TABLE stores ADD COLUMN health_error TEXT'],
  ['ai_diagnosis',      'ALTER TABLE stores ADD COLUMN ai_diagnosis TEXT'],
  ['ai_diagnosed_at',   'ALTER TABLE stores ADD COLUMN ai_diagnosed_at TEXT'],
  ['store_data',        'ALTER TABLE stores ADD COLUMN store_data TEXT'],       // originele StoreData JSON (voor rebuild)
  ['custom_data',       'ALTER TABLE stores ADD COLUMN custom_data TEXT'],      // CMS overrides JSON
]
for (const [col, sql] of storeMigrations) {
  if (!storesCols.includes(col)) {
    try { db.prepare(sql).run() } catch { /* already exists */ }
  }
}

// ── Migrations voor runs (pipeline v3 — state machine) ───────────────────────
const runsCols = (db.prepare(`PRAGMA table_info(runs)`).all() as { name: string }[]).map(c => c.name)
const runMigrations: [string, string][] = [
  ['current_stage', 'ALTER TABLE runs ADD COLUMN current_stage TEXT'],
  ['state_json',    'ALTER TABLE runs ADD COLUMN state_json TEXT'],
  ['paused',        'ALTER TABLE runs ADD COLUMN paused INTEGER NOT NULL DEFAULT 0'],
]
for (const [col, sql] of runMigrations) {
  if (!runsCols.includes(col)) {
    try { db.prepare(sql).run() } catch { /* already exists */ }
  }
}

// Helper for the runner to persist agent outputs immediately on completion.
export function saveAgentOutput(runId: string, agentId: string, output: Record<string, unknown>): void {
  try {
    db.prepare(
      `INSERT OR REPLACE INTO agent_outputs (run_id, agent_id, output_json, completed_at)
       VALUES (?, ?, ?, ?)`,
    ).run(runId, agentId, JSON.stringify(output), new Date().toISOString())
  } catch (err) {
    console.error(`[db] saveAgentOutput(${runId}, ${agentId}) failed:`, err)
  }
}

export function getAgentOutput(runId: string, agentId: string): Record<string, unknown> | null {
  try {
    const row = db.prepare(
      `SELECT output_json FROM agent_outputs WHERE run_id = ? AND agent_id = ?`,
    ).get(runId, agentId) as { output_json: string } | undefined
    if (!row) return null
    return JSON.parse(row.output_json) as Record<string, unknown>
  } catch (err) {
    console.error(`[db] getAgentOutput(${runId}, ${agentId}) failed:`, err)
    return null
  }
}

export function logAgentExecution(exec: {
  id: string; runId: string; agentName: string; stage: string; status: string
  inputJson?: string; outputJson?: string; errorMessage?: string
  costUsd?: number; tokensIn?: number; tokensOut?: number
  durationMs?: number; retryCount?: number; startedAt: string; finishedAt?: string
}): void {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO agent_executions
        (id, run_id, agent_name, stage, status, input_json, output_json, error_message,
         cost_usd, tokens_in, tokens_out, duration_ms, retry_count, started_at, finished_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      exec.id, exec.runId, exec.agentName, exec.stage, exec.status,
      exec.inputJson ?? null, exec.outputJson ?? null, exec.errorMessage ?? null,
      exec.costUsd ?? 0, exec.tokensIn ?? 0, exec.tokensOut ?? 0,
      exec.durationMs ?? 0, exec.retryCount ?? 0, exec.startedAt, exec.finishedAt ?? null,
    )
  } catch (err) {
    console.error('[db] logAgentExecution failed:', err)
  }
}

export function saveStageOutput(runId: string, stage: string, output: Record<string, unknown>): void {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO stage_outputs (run_id, stage, output_json, approved_at) VALUES (?,?,?,?)
    `).run(runId, stage, JSON.stringify(output), new Date().toISOString())
  } catch (err) {
    console.error('[db] saveStageOutput failed:', err)
  }
}

export function getStageOutput(runId: string, stage: string): Record<string, unknown> | null {
  try {
    const row = db.prepare(`SELECT output_json FROM stage_outputs WHERE run_id=? AND stage=?`).get(runId, stage) as { output_json: string } | undefined
    return row ? JSON.parse(row.output_json) as Record<string, unknown> : null
  } catch { return null }
}

export function claimPort(storeId: string): number {
  const now = new Date().toISOString()
  return db.transaction(() => {
    const maxRow = db.prepare(
      `SELECT MAX(port) as m FROM port_allocations WHERE released_at IS NULL`
    ).get() as { m: number | null } | undefined
    const next = (maxRow?.m ?? 4000) + 1
    db.prepare(`INSERT INTO port_allocations (port, store_id, allocated_at) VALUES (?,?,?)`).run(next, storeId, now)
    return next
  })()
}

export function releasePort(storeId: string): void {
  try {
    db.prepare(`UPDATE port_allocations SET released_at=? WHERE store_id=? AND released_at IS NULL`)
      .run(new Date().toISOString(), storeId)
  } catch { /* ignore */ }
}

export function getResumableRuns(): { runId: string; niche: string }[] {
  try {
    const rows = db.prepare(
      `SELECT run_id, niche FROM runs WHERE status = 'running'`,
    ).all() as { run_id: string; niche: string }[]
    return rows.map(r => ({ runId: r.run_id, niche: r.niche }))
  } catch (err) {
    console.error('[db] getResumableRuns failed:', err)
    return []
  }
}

export default db
