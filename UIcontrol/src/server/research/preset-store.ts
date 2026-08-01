// ═══════ Presetbibliotheek ═══════
//
// Een preset is een compleet, doordacht assortiment voor één niche: 7-15
// verschillende producten met hun scores, redenen en producttypes, plus een
// onderbouwing waaróm ze samen een winkel vormen.
//
// Waarom dit bestaat: nu stelt élke wizard-run live een assortiment samen —
// onder tijdsdruk, tegen de CJ-rate-limit aan, met LLM-calls in de kritieke pad.
// Datzelfde werk offline doen en bewaren maakt de wizard snel en het resultaat
// beter (offline mag het grondig).
//
// LET OP — mock-presets: op een machine zonder CJ-key levert de adapter
// mock-producten. Die mogen NOOIT in een echte winkel belanden. Elke preset
// draagt daarom `is_mock`; `findPresetForNiche` weigert mock-presets zodra er
// een echte leverancier is. Zonder die scheiding zou een lokale testrun
// productie vergiftigen.

import db from '../db.js'

db.exec(`
  CREATE TABLE IF NOT EXISTS niche_presets (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    niche           TEXT NOT NULL,
    category_id     TEXT,
    category_name   TEXT,
    parent_name     TEXT,
    persona_json    TEXT NOT NULL,
    products_json   TEXT NOT NULL,
    types_json      TEXT NOT NULL,
    rationale       TEXT NOT NULL,
    problem         TEXT,
    keywords        TEXT NOT NULL,
    product_count   INTEGER NOT NULL,
    distinct_types  INTEGER NOT NULL,
    avg_score       REAL,
    shipping_profile TEXT,
    source          TEXT NOT NULL,
    supplier        TEXT NOT NULL DEFAULT 'cj',
    is_mock         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    used_count      INTEGER NOT NULL DEFAULT 0,
    last_used_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_presets_mock ON niche_presets(is_mock);

  -- Categorieën waar bewust GEEN preset van gemaakt is, met de reden. Zonder
  -- dit zou een volgende batch-run ze eindeloos opnieuw proberen.
  CREATE TABLE IF NOT EXISTS preset_skips (
    category_id   TEXT PRIMARY KEY,
    category_name TEXT,
    reason        TEXT NOT NULL,
    found         INTEGER NOT NULL DEFAULT 0,
    is_mock       INTEGER NOT NULL DEFAULT 0,
    checked_at    TEXT NOT NULL
  );
`)

export interface PresetProduct {
  productId: string
  variantId?: string
  supplier: string
  title: string
  image: string
  costPrice: number
  currency: string
  warehouse?: string
  shippingDays?: { min: number; max: number }
  rating?: number
  inventory?: number
  url?: string
  productType: string
  productTier: 'entry' | 'mid' | 'premium'
  typeRole: string
  relevanceScore?: number
  relevanceReason?: string
  suggestedPriceEur: number
  marginEur: number
  marginPct: number
  reason: string
}

export interface NichePreset {
  id: string
  slug: string
  niche: string
  categoryId?: string
  categoryName?: string
  parentName?: string
  persona: Record<string, unknown>
  products: PresetProduct[]
  types: Array<{ id: string; name: string; searchTerm: string; tier: string; role: string }>
  /** "Waarom dit assortiment" — verplicht, zie Taak C. */
  rationale: string
  /** Welk klantprobleem de winkel oplost. */
  problem?: string
  keywords: string[]
  productCount: number
  distinctTypes: number
  avgScore?: number
  shippingProfile?: string
  source: 'batch' | 'wizard-fallback'
  supplier: string
  isMock: boolean
  createdAt: string
  usedCount: number
  lastUsedAt?: string
}

type Row = Record<string, unknown>

function toPreset(r: Row): NichePreset {
  return {
    id: String(r.id),
    slug: String(r.slug),
    niche: String(r.niche),
    categoryId: r.category_id ? String(r.category_id) : undefined,
    categoryName: r.category_name ? String(r.category_name) : undefined,
    parentName: r.parent_name ? String(r.parent_name) : undefined,
    persona: JSON.parse(String(r.persona_json)) as Record<string, unknown>,
    products: JSON.parse(String(r.products_json)) as PresetProduct[],
    types: JSON.parse(String(r.types_json)) as NichePreset['types'],
    rationale: String(r.rationale),
    problem: r.problem ? String(r.problem) : undefined,
    keywords: String(r.keywords).split(',').map(s => s.trim()).filter(Boolean),
    productCount: Number(r.product_count),
    distinctTypes: Number(r.distinct_types),
    avgScore: r.avg_score != null ? Number(r.avg_score) : undefined,
    shippingProfile: r.shipping_profile ? String(r.shipping_profile) : undefined,
    source: String(r.source) as NichePreset['source'],
    supplier: String(r.supplier),
    isMock: Number(r.is_mock) === 1,
    createdAt: String(r.created_at),
    usedCount: Number(r.used_count),
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : undefined,
  }
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'preset'
}

export interface SavePresetInput {
  niche: string
  categoryId?: string
  categoryName?: string
  parentName?: string
  persona: Record<string, unknown>
  products: PresetProduct[]
  types: NichePreset['types']
  rationale: string
  problem?: string
  keywords: string[]
  shippingProfile?: string
  source: 'batch' | 'wizard-fallback'
  supplier?: string
  isMock: boolean
}

/** Slaat een preset op (of vervangt de bestaande met dezelfde slug). */
export function savePreset(input: SavePresetInput): NichePreset {
  const slug = slugify(input.niche)
  const id = `preset-${slug}`
  const scores = input.products.map(p => p.relevanceScore).filter((n): n is number => typeof n === 'number')
  const distinct = new Set(input.products.map(p => p.productType)).size
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO niche_presets (
      id, slug, niche, category_id, category_name, parent_name, persona_json,
      products_json, types_json, rationale, problem, keywords, product_count,
      distinct_types, avg_score, shipping_profile, source, supplier, is_mock, created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(slug) DO UPDATE SET
      niche = excluded.niche, category_id = excluded.category_id,
      category_name = excluded.category_name, parent_name = excluded.parent_name,
      persona_json = excluded.persona_json, products_json = excluded.products_json,
      types_json = excluded.types_json, rationale = excluded.rationale,
      problem = excluded.problem, keywords = excluded.keywords,
      product_count = excluded.product_count, distinct_types = excluded.distinct_types,
      avg_score = excluded.avg_score, shipping_profile = excluded.shipping_profile,
      source = excluded.source, is_mock = excluded.is_mock, created_at = excluded.created_at
  `).run(
    id, slug, input.niche, input.categoryId ?? null, input.categoryName ?? null,
    input.parentName ?? null, JSON.stringify(input.persona), JSON.stringify(input.products),
    JSON.stringify(input.types), input.rationale, input.problem ?? null,
    input.keywords.join(', '), input.products.length, distinct,
    scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    input.shippingProfile ?? null, input.source, input.supplier ?? 'cj',
    input.isMock ? 1 : 0, now,
  )
  return getPreset(slug)!
}

export function getPreset(slug: string): NichePreset | null {
  const row = db.prepare('SELECT * FROM niche_presets WHERE slug = ?').get(slug) as Row | undefined
  return row ? toPreset(row) : null
}

export interface ListPresetOptions {
  /** Mock-presets meenemen. Default false: die horen nergens in productie. */
  includeMock?: boolean
  limit?: number
  source?: 'batch' | 'wizard-fallback'
}

export function listPresets(opts: ListPresetOptions = {}): NichePreset[] {
  const where: string[] = []
  const args: unknown[] = []
  if (!opts.includeMock) where.push('is_mock = 0')
  if (opts.source) { where.push('source = ?'); args.push(opts.source) }
  const sql = `SELECT * FROM niche_presets ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY product_count DESC, created_at DESC LIMIT ?`
  args.push(opts.limit ?? 500)
  return (db.prepare(sql).all(...args) as Row[]).map(toPreset)
}

export function markPresetUsed(slug: string): void {
  db.prepare('UPDATE niche_presets SET used_count = used_count + 1, last_used_at = ? WHERE slug = ?')
    .run(new Date().toISOString(), slug)
}

export function deletePreset(slug: string): boolean {
  return db.prepare('DELETE FROM niche_presets WHERE slug = ?').run(slug).changes > 0
}

// ── Overgeslagen categorieën ──────────────────────────────────────────────────

export function recordSkip(categoryId: string, categoryName: string, reason: string, found: number, isMock: boolean): void {
  db.prepare(`
    INSERT INTO preset_skips (category_id, category_name, reason, found, is_mock, checked_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(category_id) DO UPDATE SET
      category_name = excluded.category_name, reason = excluded.reason,
      found = excluded.found, is_mock = excluded.is_mock, checked_at = excluded.checked_at
  `).run(categoryId, categoryName, reason, found, isMock ? 1 : 0, new Date().toISOString())
}

export interface SkipRow { categoryId: string; categoryName: string; reason: string; found: number; checkedAt: string }

export function listSkips(limit = 200): SkipRow[] {
  return (db.prepare('SELECT * FROM preset_skips ORDER BY checked_at DESC LIMIT ?').all(limit) as Row[])
    .map(r => ({
      categoryId: String(r.category_id), categoryName: String(r.category_name ?? ''),
      reason: String(r.reason), found: Number(r.found), checkedAt: String(r.checked_at),
    }))
}

/** Al eerder behandeld (preset óf skip) binnen `maxAgeDays`? Dan overslaan. */
export function alreadyHandled(categoryId: string, maxAgeDays = 30): boolean {
  const cutoff = new Date(Date.now() - maxAgeDays * 864e5).toISOString()
  const p = db.prepare('SELECT 1 FROM niche_presets WHERE category_id = ? AND created_at > ?').get(categoryId, cutoff)
  if (p) return true
  const s = db.prepare('SELECT 1 FROM preset_skips WHERE category_id = ? AND checked_at > ?').get(categoryId, cutoff)
  return !!s
}

export function presetStats(): {
  total: number; real: number; mock: number; batch: number; fallback: number
  products: number; skips: number; avgProducts: number
} {
  const row = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN is_mock = 0 THEN 1 ELSE 0 END) AS real,
           SUM(CASE WHEN is_mock = 1 THEN 1 ELSE 0 END) AS mock,
           SUM(CASE WHEN source = 'batch' THEN 1 ELSE 0 END) AS batch,
           SUM(CASE WHEN source = 'wizard-fallback' THEN 1 ELSE 0 END) AS fallback,
           SUM(product_count) AS products
    FROM niche_presets
  `).get() as Row
  const skips = db.prepare('SELECT COUNT(*) AS n FROM preset_skips').get() as Row
  const total = Number(row.total ?? 0)
  return {
    total,
    real: Number(row.real ?? 0),
    mock: Number(row.mock ?? 0),
    batch: Number(row.batch ?? 0),
    fallback: Number(row.fallback ?? 0),
    products: Number(row.products ?? 0),
    skips: Number(skips.n ?? 0),
    avgProducts: total ? Math.round((Number(row.products ?? 0) / total) * 10) / 10 : 0,
  }
}
