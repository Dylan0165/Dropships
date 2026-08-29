// ═══════ Marketing-agent: concept-social-content per winkel ═══════
//
// Zodra een winkel gebouwd is, staat alles klaar wat je nodig hebt om erover te
// posten: merknaam, toon, producten, prijzen, USP's. Dit bestand maakt daar
// concept-content van: caption-varianten per platform, bijpassende hashtags en
// per product een "wat te filmen"-suggestie.
//
// WAT DIT NIET DOET: er wordt NIETS gepost. Alles komt als `draft` in de
// database en de operator bekijkt, bewerkt en plaatst het zelf. Geen koppeling
// met TikTok/Instagram, geen scheduler, geen automatische publicatie.
//
// Kwaliteitseisen zijn dezelfde als voor de site-copy, en met hetzelfde
// gereedschap: `sanitizeCopyDeep` haalt AI-emoji eruit (die filter bestond al
// voor de winkels zelf) en `checkClaims` weigert verzonnen sociale bewijskracht.
// Een caption die "join 10,000+ happy customers" belooft is niet alleen
// generiek, hij is onwaar — en dat komt straks op een echt account te staan.

import db from './db.js'
import { sanitizeCopyDeep } from './design/sanitize.js'

const LLM_BASE = process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1'

// ── Tabel ─────────────────────────────────────────────────────────────────────
// Zelfde SQLite-bestand als de rest; geen nieuwe opslagtechniek.

db.exec(`
  CREATE TABLE IF NOT EXISTS marketing_content (
    id            TEXT PRIMARY KEY,
    store_id      TEXT NOT NULL,
    platform      TEXT NOT NULL,
    kind          TEXT NOT NULL,
    content_text  TEXT NOT NULL,
    hashtags      TEXT NOT NULL DEFAULT '',
    product_title TEXT,
    status        TEXT NOT NULL DEFAULT 'draft',
    notes         TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_marketing_store ON marketing_content(store_id);
`)

export type MarketingPlatform = 'tiktok' | 'instagram' | 'shot-idea'
export type MarketingStatus = 'draft' | 'edited' | 'used'

export interface MarketingItem {
  id: string
  storeId: string
  platform: MarketingPlatform
  kind: 'caption' | 'shot'
  contentText: string
  hashtags: string[]
  productTitle?: string
  status: MarketingStatus
  notes?: string
  createdAt: string
  updatedAt?: string
}

type Row = Record<string, unknown>

function toItem(r: Row): MarketingItem {
  return {
    id: String(r.id),
    storeId: String(r.store_id),
    platform: String(r.platform) as MarketingPlatform,
    kind: String(r.kind) as 'caption' | 'shot',
    contentText: String(r.content_text),
    hashtags: String(r.hashtags ?? '').split(/\s+/).filter(Boolean),
    productTitle: r.product_title ? String(r.product_title) : undefined,
    status: String(r.status) as MarketingStatus,
    notes: r.notes ? String(r.notes) : undefined,
    createdAt: String(r.created_at),
    updatedAt: r.updated_at ? String(r.updated_at) : undefined,
  }
}

export function listMarketingContent(storeId: string): MarketingItem[] {
  return (db.prepare('SELECT * FROM marketing_content WHERE store_id = ? ORDER BY kind, platform, created_at')
    .all(storeId) as Row[]).map(toItem)
}

export function getMarketingItem(id: string): MarketingItem | null {
  const r = db.prepare('SELECT * FROM marketing_content WHERE id = ?').get(id) as Row | undefined
  return r ? toItem(r) : null
}

export interface UpdateMarketingInput {
  contentText?: string
  hashtags?: string[]
  status?: MarketingStatus
}

/**
 * Bewerken door de operator. Tekst aanpassen zet de status automatisch op
 * `edited` (tenzij hij expliciet iets anders meegeeft) — zo zie je in één
 * oogopslag wat nog ruwe AI-output is en wat een mens heeft nagelopen.
 */
export function updateMarketingItem(id: string, input: UpdateMarketingInput): MarketingItem | null {
  const current = getMarketingItem(id)
  if (!current) return null

  const text = input.contentText != null ? sanitizeCopyDeep(input.contentText).value : current.contentText
  const tags = input.hashtags != null ? input.hashtags : current.hashtags
  const status = input.status
    ?? (input.contentText != null && input.contentText !== current.contentText ? 'edited' : current.status)

  db.prepare('UPDATE marketing_content SET content_text = ?, hashtags = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(text, normalizeHashtags(tags).join(' '), status, new Date().toISOString(), id)
  return getMarketingItem(id)
}

export function deleteMarketingContent(storeId: string): number {
  return db.prepare('DELETE FROM marketing_content WHERE store_id = ?').run(storeId).changes
}

// ── Kwaliteitspoort: geen verzonnen bewijskracht ─────────────────────────────
//
// De site-copy heeft dezelfde regel ("nooit feiten verzinnen die je niet gekregen
// hebt"). Op social is de verleiding groter en de schade groter: dit gaat naar
// een publiek account. Deterministisch, geen tweede LLM-oordeel.

const CLAIM_PATTERNS: Array<{ re: RegExp; why: string }> = [
  {
    re: /\b\d[\d.,]*\s*(k|m|\+)?\s*(happy\s+)?(customers|klanten|orders|bestellingen|reviews|sold|verkocht)\b/i,
    why: 'verzonnen klant-/verkoopaantal',
  },
  { re: /\b(thousands|millions|duizenden|miljoenen)\s+of\s+\w+/i, why: 'verzonnen aantal' },
  {
    re: /\b(#\s?1|number one|nummer 1|best[-\s]?selling|award[-\s]?winning|bekroond)\b/i,
    why: 'onbewijsbare marktpositie',
  },
  {
    re: /\b\d(\.\d)?\s*\/\s*5\b|\b\d(\.\d)?\s*stars?\b|\b\d{2,3}\s*%\s*(satisfaction|tevreden|of customers)/i,
    why: 'verzonnen beoordelingscijfer',
  },
  { re: /\b(clinically|scientifically)\s+(proven|tested)|\bklinisch bewezen\b/i, why: 'medische/wetenschappelijke claim' },
  { re: /\b(guaranteed|gegarandeerd)\s+(results|resultaat|weight loss|growth)\b/i, why: 'gegarandeerd resultaat' },
  { re: /\b(going viral|trending #1)\b/i, why: 'claim over eigen bereik' },
]

export interface ClaimCheck { ok: boolean; issues: string[] }

export function checkClaims(text: string): ClaimCheck {
  const issues: string[] = []
  for (const { re, why } of CLAIM_PATTERNS) {
    const m = text.match(re)
    if (m) issues.push(`${why} ("${m[0].trim()}")`)
  }
  return { ok: issues.length === 0, issues }
}

/** #hashtag-vorm afdwingen, ontdubbelen, en de emoji-filter erover. */
export function normalizeHashtags(tags: unknown): string[] {
  const list = Array.isArray(tags) ? tags : String(tags ?? '').split(/\s+/)
  const out: string[] = []
  for (const raw of list) {
    const clean = sanitizeCopyDeep(String(raw)).value
      .replace(/[^\p{L}\p{N}_#]/gu, '')
      .replace(/^#+/, '')
    if (!clean) continue
    const tag = `#${clean}`
    if (!out.includes(tag)) out.push(tag)
  }
  return out.slice(0, 12)
}

// ── Generatie ─────────────────────────────────────────────────────────────────

export interface MarketingProduct {
  title: string
  price?: number
  productType?: string
  description?: string
}

export interface MarketingInput {
  storeId: string
  brandName: string
  niche: string
  /** Toon uit het design-DNA / de brand-agent. */
  tone?: string
  storeUrl?: string
  products: MarketingProduct[]
  usps?: Array<{ title: string; desc: string }>
  storyAngle?: string
}

export interface MarketingResult {
  ok: boolean
  storeId: string
  created: number
  captions: number
  shots: number
  /** Varianten die op een verzonnen claim sneuvelden. */
  rejected: Array<{ text: string; issues: string[] }>
  emojiStripped: number
  error?: string
}

interface LlmShape {
  tiktok?: Array<{ caption?: string; hashtags?: string[] }>
  instagram?: Array<{ caption?: string; hashtags?: string[] }>
  shots?: Array<{ product?: string; idea?: string }>
}

async function askDeepSeek(system: string, user: string): Promise<LlmShape> {
  const apiKey = process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('LLM_API_KEY niet geconfigureerd')
  const resp = await fetch(`${LLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL_CONTENT ?? process.env.LLM_MODEL_EXECUTOR ?? 'deepseek-chat',
      messages: [
        { role: 'system', content: `${system}\nAntwoord UITSLUITEND met geldige JSON.` },
        { role: 'user', content: user },
      ],
      max_tokens: 3072,
      temperature: 0.85,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 160)}`)
  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  const content = data.choices[0]?.message?.content ?? ''
  const m = content.match(/[{[][\s\S]*[}\]]/)
  if (!m) throw new Error('LLM gaf geen JSON terug')
  return JSON.parse(m[0]) as LlmShape
}

export function buildPrompt(input: MarketingInput): { system: string; user: string } {
  const products = input.products.slice(0, 8).map(p => ({
    title: p.title.slice(0, 90),
    type: p.productType,
    priceEur: p.price,
  }))
  return {
    system:
      'Je schrijft social-media-content voor een kleine Europese webshop. Je schrijft zoals de ' +
      'eigenaar zelf zou praten: concreet, nuchter, zonder verkooppraat. Je verzint NOOIT feiten.',
    user: `Winkel: ${input.brandName}
Niche: ${input.niche}
${input.tone ? `Toon: ${input.tone}` : ''}
${input.storyAngle ? `Waar de winkel voor staat: ${input.storyAngle}` : ''}
${input.usps?.length ? `USP's:\n${input.usps.map(u => `- ${u.title}: ${u.desc}`).join('\n')}` : ''}
Producten:
${JSON.stringify(products, null, 1)}

Schrijf concept-content. ALLES in het Engels — de winkels zijn Engelstalig.

1. "tiktok": 4 caption-varianten. Kort (max 150 tekens), gesproken toon, één haak
   per caption. Denk aan wat iemand in beeld zou zeggen bij dit product.
2. "instagram": 4 caption-varianten. Iets langer (max 300 tekens), mag een regel
   context bevatten, maar nog steeds spreektaal.
3. "shots": per product één suggestie wat je zou filmen — één concrete zin, geen
   scriptvorm. Bijvoorbeeld "hand die de dop losdraait, close-up op de dosering".

Per caption 4-8 hashtags die echt bij de niche horen (geen #love, geen #instagood).

HARDE REGELS — hier wordt automatisch op gecontroleerd:
- GEEN emoji. Geen enkele.
- GEEN verzonnen cijfers: geen klantaantallen, geen sterren, geen "#1", geen
  "10.000+ verkocht", geen percentages tevredenheid, geen "klinisch bewezen".
  Je weet niet hoeveel er verkocht is, dus schrijf er niets over.
- Geen superlatieven zonder onderbouwing ("de beste", "ongeevenaard").
- Wel concreet: materiaal, formaat, levertijd, prijs, waar het voor is. Een zin
  die op elke andere webshop zou kunnen staan, is fout.

JSON:
{"tiktok":[{"caption":"...","hashtags":["#..."]}],
 "instagram":[{"caption":"...","hashtags":["#..."]}],
 "shots":[{"product":"<producttitel>","idea":"..."}]}`,
  }
}

export type MarketingJudge = (system: string, user: string) => Promise<LlmShape>

/**
 * Genereert en bewaart concept-content voor één winkel. Bestaande content voor
 * die winkel wordt vervangen — behalve wat al op `used` staat, want dat is
 * geplaatst en hoort niet stilletjes te verdwijnen.
 */
export async function generateMarketingContent(
  input: MarketingInput,
  opts: { judge?: MarketingJudge; onLog?: (m: string) => void } = {},
): Promise<MarketingResult> {
  const log = opts.onLog ?? ((m: string) => console.log(`[marketing] ${m}`))
  const judge = opts.judge ?? askDeepSeek
  const base: MarketingResult = {
    ok: false, storeId: input.storeId, created: 0, captions: 0, shots: 0,
    rejected: [], emojiStripped: 0,
  }

  let raw: LlmShape
  try {
    const { system, user } = buildPrompt(input)
    raw = await judge(system, user)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`generatie mislukt voor ${input.brandName}: ${msg}`)
    return { ...base, error: msg }
  }

  // Emoji-filter over ALLES in één keer — zelfde poort als de site-copy.
  const sanitized = sanitizeCopyDeep(raw)
  const clean = sanitized.value
  if (sanitized.report.changed > 0) {
    log(`${sanitized.report.changed} veld(en) ontdaan van emoji (${sanitized.report.blocked.join(' ')})`)
  }

  const now = new Date().toISOString()
  const rows: Array<[string, string, string, string, string, string, string | null]> = []
  const rejected: MarketingResult['rejected'] = []

  const addCaption = (platform: 'tiktok' | 'instagram', caption: unknown, hashtags: unknown, i: number) => {
    const text = String(caption ?? '').trim()
    if (text.length < 10) return
    const claims = checkClaims(text)
    if (!claims.ok) {
      rejected.push({ text: text.slice(0, 80), issues: claims.issues })
      log(`✗ variant geweigerd (${platform}): ${claims.issues.join(', ')} — "${text.slice(0, 60)}"`)
      return
    }
    rows.push([
      `mc-${input.storeId}-${platform}-${i}-${Date.now().toString(36)}`,
      input.storeId, platform, 'caption', text,
      normalizeHashtags(hashtags).join(' '), null,
    ])
  }

  ;(clean.tiktok ?? []).slice(0, 5).forEach((c, i) => addCaption('tiktok', c?.caption, c?.hashtags, i))
  ;(clean.instagram ?? []).slice(0, 5).forEach((c, i) => addCaption('instagram', c?.caption, c?.hashtags, i))
  ;(clean.shots ?? []).slice(0, 10).forEach((s, i) => {
    const idea = String(s?.idea ?? '').trim()
    if (idea.length < 10) return
    const claims = checkClaims(idea)
    if (!claims.ok) {
      rejected.push({ text: idea.slice(0, 80), issues: claims.issues })
      return
    }
    rows.push([
      `mc-${input.storeId}-shot-${i}-${Date.now().toString(36)}`,
      input.storeId, 'shot-idea', 'shot', idea, '', String(s?.product ?? '').slice(0, 120) || null,
    ])
  })

  if (rows.length === 0) {
    log(`geen bruikbare content voor ${input.brandName} — alles sneuvelde op de kwaliteitspoort of kwam leeg terug`)
    return { ...base, rejected, emojiStripped: sanitized.report.changed, error: 'geen bruikbare varianten' }
  }

  const insert = db.prepare(`
    INSERT INTO marketing_content (id, store_id, platform, kind, content_text, hashtags, product_title, status, created_at)
    VALUES (?,?,?,?,?,?,?,'draft',?)
  `)
  const replace = db.transaction((list: typeof rows) => {
    // Alleen concepten opruimen; geplaatste content blijft staan.
    db.prepare("DELETE FROM marketing_content WHERE store_id = ? AND status != 'used'").run(input.storeId)
    for (const r of list) insert.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], now)
  })
  replace(rows)

  const captions = rows.filter(r => r[3] === 'caption').length
  const shotCount = rows.filter(r => r[3] === 'shot').length
  log(`${input.brandName}: ${captions} captions + ${shotCount} film-suggesties opgeslagen als concept` +
    (rejected.length ? `, ${rejected.length} geweigerd op verzonnen claims` : ''))

  return {
    ok: true, storeId: input.storeId, created: rows.length,
    captions, shots: shotCount, rejected, emojiStripped: sanitized.report.changed,
  }
}

/**
 * Fire-and-forget-variant voor in de pipeline. Marketing-content is nooit een
 * reden om een winkel niet live te zetten, dus dit mag falen zonder gevolgen —
 * en het draait door terwijl build-validate en deploy hun gang gaan.
 */
export function generateMarketingContentDetached(
  input: MarketingInput,
  onLog?: (m: string) => void,
): void {
  generateMarketingContent(input, { onLog })
    .catch(err => (onLog ?? console.warn)(`[marketing] onverwachte fout: ${err instanceof Error ? err.message : err}`))
}
