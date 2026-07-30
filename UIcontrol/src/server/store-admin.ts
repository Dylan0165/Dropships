// ═══════ Store-beheer: bewerken, prijzen, producten toevoegen ═══════
// Alles wat je aan een LIVE store kunt veranderen zonder de pipeline opnieuw te
// draaien. Wijzigingen komen als overrides in `stores.custom_data`; de originele
// `store_data` blijft ongemoeid, zodat je altijd terug kunt naar de staat zoals
// de pipeline hem opleverde.
//
// De rebuild-stap zelf zit in store-platform.ts (`POST /api/stores/:id/rebuild`)
// en is ongewijzigd — deze module bereidt alleen de data voor.

import db from './db.js'
import { z } from 'zod'
import { runAgent } from './pipeline/agent.js'
import { sanitizeCopyDeep } from './design/sanitize.js'
import { getSupplier } from './suppliers/index.js'
import type { SupplierProduct } from './suppliers/types.js'

export interface EditableProduct {
  id: string
  title?: string
  description?: string
  price?: number
  image?: string
  compareAtPrice?: number
  supplier?: string
  supplierProductId?: string
  supplierVariantId?: string
  [k: string]: unknown
}

interface StoreRow {
  store_id: string; subdomein: string; niche: string; status: string
  store_data: string | null; custom_data: string | null
}

export interface MergedStore {
  storeId: string
  subdomain: string
  niche: string
  status: string
  brandName: string
  slogan: string
  products: EditableProduct[]
}

function row(storeId: string): StoreRow | undefined {
  return db.prepare(
    `SELECT store_id, subdomein, niche, status, store_data, custom_data FROM stores WHERE store_id = ?`,
  ).get(storeId) as StoreRow | undefined
}

const parse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback
  try { return JSON.parse(s) as T } catch { return fallback }
}

/** De store zoals hij nu op de site staat: basis + overrides, per product samengevoegd. */
export function mergedStore(storeId: string): MergedStore | null {
  const r = row(storeId)
  if (!r) return null
  const base = parse<Record<string, unknown>>(r.store_data, {})
  const over = parse<Record<string, unknown>>(r.custom_data, {})
  const baseProducts = (base.products as EditableProduct[] | undefined) ?? []
  const overProducts = (over.products as EditableProduct[] | undefined) ?? []
  const products = baseProducts.map(p => {
    const o = overProducts.find(x => x.id === p.id)
    return o ? { ...p, ...o } : p
  })
  // Producten die alleen in de overrides zitten zijn later toegevoegd
  for (const o of overProducts) if (!products.some(p => p.id === o.id)) products.push(o)

  return {
    storeId: r.store_id,
    subdomain: r.subdomein,
    niche: r.niche,
    status: r.status,
    brandName: String(over.brand_name ?? base.brand_name ?? r.subdomein),
    slogan: String(over.slogan ?? base.slogan ?? ''),
    products,
  }
}

/**
 * Schrijft overrides weg. Bestaande overrides blijven staan tenzij ze expliciet
 * overschreven worden; productwijzigingen worden per id samengevoegd.
 */
export function saveOverrides(storeId: string, patch: {
  brand_name?: string; slogan?: string; products?: EditableProduct[]
}): { ok: boolean; changedProducts: number } {
  const r = row(storeId)
  if (!r) return { ok: false, changedProducts: 0 }
  const current = parse<Record<string, unknown>>(r.custom_data, {})
  const currentProducts = (current.products as EditableProduct[] | undefined) ?? []

  let changed = 0
  const next = [...currentProducts]
  for (const p of patch.products ?? []) {
    if (!p.id) continue
    const i = next.findIndex(x => x.id === p.id)
    if (i >= 0) next[i] = { ...next[i], ...p }
    else next.push(p)
    changed++
  }

  const merged: Record<string, unknown> = { ...current }
  if (patch.brand_name !== undefined) merged.brand_name = patch.brand_name
  if (patch.slogan !== undefined) merged.slogan = patch.slogan
  if (patch.products) merged.products = next

  db.prepare(`UPDATE stores SET custom_data = ? WHERE store_id = ?`).run(JSON.stringify(merged), storeId)
  return { ok: true, changedProducts: changed }
}

// ── Prijzen in bulk ───────────────────────────────────────────────────────────

export interface PriceChange {
  /** Procentuele wijziging, bv. +10 of -15. */
  percent?: number
  /** Vast bedrag erbij of eraf in euro. */
  delta?: number
  /** Afronden op een "charme"-eindcijfer, bv. 0.95 → 24.95. */
  roundTo?: number
  /** Alleen deze producten; leeg = alle. */
  productIds?: string[]
}

export interface PriceResult {
  ok: boolean
  error?: string
  changes: Array<{ id: string; title: string; from: number; to: number }>
}

const MIN_PRICE = 1

/**
 * Berekent nieuwe prijzen. Wijzigt niets dat een prijs onder €1 zou opleveren —
 * een bulkactie mag nooit stil een product op nul zetten.
 */
export function applyPriceChange(storeId: string, change: PriceChange): PriceResult {
  const store = mergedStore(storeId)
  if (!store) return { ok: false, error: 'Store niet gevonden', changes: [] }
  if (change.percent === undefined && change.delta === undefined && change.roundTo === undefined) {
    return { ok: false, error: 'Geef percent, delta of roundTo op', changes: [] }
  }

  const only = change.productIds?.length ? new Set(change.productIds) : null
  const changes: PriceResult['changes'] = []
  const patch: EditableProduct[] = []

  for (const p of store.products) {
    if (only && !only.has(p.id)) continue
    const from = Number(p.price)
    if (!Number.isFinite(from) || from <= 0) continue

    let to = from
    if (change.percent !== undefined) to = to * (1 + change.percent / 100)
    if (change.delta !== undefined) to = to + change.delta
    if (change.roundTo !== undefined) {
      // Naar het dichtstbijzijnde hele bedrag + het gewenste eindcijfer
      const base = Math.floor(to)
      const target = base + change.roundTo
      to = target < to ? target + 1 : target
    }
    to = Math.round(to * 100) / 100

    if (to < MIN_PRICE || to === from) continue
    changes.push({ id: p.id, title: String(p.title ?? p.id), from, to })
    patch.push({ id: p.id, price: to })
  }

  if (!changes.length) return { ok: true, changes: [] }
  saveOverrides(storeId, { products: patch })
  return { ok: true, changes }
}

// ── AI-bewerking ──────────────────────────────────────────────────────────────

const AiEditSchema = z.object({
  brand_name: z.string().min(1).max(60).optional(),
  slogan: z.string().max(200).optional(),
  products: z.array(z.object({
    id: z.string().min(1),
    title: z.string().max(160).optional(),
    description: z.string().max(1200).optional(),
    price: z.number().positive().max(5000).optional(),
  })).max(30).optional(),
  summary: z.string().max(400).optional(),
})
export type AiEdit = z.infer<typeof AiEditSchema>

export interface AiEditResult {
  ok: boolean
  error?: string
  summary?: string
  applied?: { brandName: boolean; slogan: boolean; products: number }
  diff?: Array<{ id: string; field: string; from: string; to: string }>
}

/**
 * Laat de LLM een instructie in gewone taal omzetten naar concrete wijzigingen.
 *
 * Twee dingen die de LLM NIET mag: producten toevoegen of verwijderen, en
 * supplier-velden aanraken. Beide worden hier afgedwongen, niet alleen in de
 * prompt — het schema laat ze niet toe en onbekende product-id's worden
 * genegeerd. De uitkomst gaat door dezelfde emoji-filter als de pipeline.
 */
export async function aiEditStore(storeId: string, instruction: string): Promise<AiEditResult> {
  const store = mergedStore(storeId)
  if (!store) return { ok: false, error: 'Store niet gevonden' }
  if (!instruction.trim()) return { ok: false, error: 'Geef een instructie op' }

  // De agent-executielog heeft een foreign key naar `runs`. Een bewerking is
  // geen pipeline-run, dus die rij bestaat niet — zonder deze regel mislukt het
  // loggen stil en zijn de kosten van AI-bewerkingen onzichtbaar in de
  // observability-weergave.
  const editRunId = `store-edit-${storeId.slice(0, 8)}`
  const now = new Date().toISOString()
  try {
    db.prepare(
      `INSERT OR IGNORE INTO runs (run_id, niche, status, started_at, updated_at) VALUES (?,?,?,?,?)`,
    ).run(editRunId, `bewerkingen: ${store.subdomain}`, 'completed', now, now)
  } catch { /* loggen mag de bewerking nooit blokkeren */ }

  const result = await runAgent({
    runId: editRunId,
    stage: 'store-edit',
    agentName: 'store-editor',
    skillName: 'store-editor',
    model: process.env.LLM_MODEL_EDIT ?? 'deepseek-chat',
    input: {
      instruction,
      store: {
        brand_name: store.brandName,
        niche: store.niche,
        slogan: store.slogan,
        products: store.products.map(p => ({
          id: p.id, title: p.title, description: p.description, price: p.price,
        })),
      },
    },
    outputSchema: AiEditSchema,
    timeoutMs: 120_000,
    retries: 2,
    temperature: 0.6,
  })

  if (!result.ok || !result.parsed) {
    return { ok: false, error: result.error ?? 'De AI gaf geen bruikbaar antwoord' }
  }
  return applyAiEdit(storeId, store, result.parsed)
}

/**
 * De nabewerking van een AI-antwoord: filteren, vergelijken en opslaan. Los van
 * de LLM-aanroep gehouden zodat dit deel testbaar is zonder een echte API-call —
 * en dit is nu juist het deel dat de LLM in toom houdt.
 */
export function applyAiEdit(storeId: string, store: MergedStore, raw: AiEdit): AiEditResult {
  const { value: edit } = sanitizeCopyDeep(raw)

  // Alleen bekende producten; onbekende id's zijn hallucinatie en gaan eruit.
  const known = new Map(store.products.map(p => [p.id, p]))
  const diff: NonNullable<AiEditResult['diff']> = []
  const patch: EditableProduct[] = []

  for (const p of edit.products ?? []) {
    const current = known.get(p.id)
    if (!current) continue
    const fields: EditableProduct = { id: p.id }
    for (const f of ['title', 'description', 'price'] as const) {
      const next = p[f]
      if (next === undefined) continue
      const before = current[f]
      if (String(before ?? '') === String(next)) continue
      // `f` is een union van drie sleutels met verschillende typen; de
      // indexsignatuur van EditableProduct vangt dat op.
      ;(fields as Record<string, unknown>)[f] = next
      diff.push({ id: p.id, field: f, from: String(before ?? '—'), to: String(next) })
    }
    if (Object.keys(fields).length > 1) patch.push(fields)
  }

  const brandChanged = !!edit.brand_name && edit.brand_name !== store.brandName
  const sloganChanged = edit.slogan !== undefined && edit.slogan !== store.slogan
  if (brandChanged) diff.push({ id: '(store)', field: 'brand_name', from: store.brandName, to: edit.brand_name! })
  if (sloganChanged) diff.push({ id: '(store)', field: 'slogan', from: store.slogan, to: edit.slogan! })

  if (patch.length || brandChanged || sloganChanged) {
    saveOverrides(storeId, {
      ...(brandChanged ? { brand_name: edit.brand_name } : {}),
      ...(sloganChanged ? { slogan: edit.slogan } : {}),
      ...(patch.length ? { products: patch } : {}),
    })
  }

  return {
    ok: true,
    summary: edit.summary,
    applied: { brandName: brandChanged, slogan: sloganChanged, products: patch.length },
    diff,
  }
}

/** Valideert een ruw LLM-antwoord tegen het schema (voor tests/hergebruik). */
export function parseAiEdit(raw: unknown): { ok: true; edit: AiEdit } | { ok: false; error: string } {
  const r = AiEditSchema.safeParse(raw)
  return r.success ? { ok: true, edit: r.data } : { ok: false, error: r.error.issues.map(i => i.message).join('; ') }
}

// ── Producten toevoegen vanuit CJ ─────────────────────────────────────────────

export interface AddProductsResult {
  ok: boolean
  error?: string
  added: Array<{ id: string; title: string; price: number }>
  skipped: Array<{ id: string; reason: string }>
  total: number
}

/** Verkoopprijs uit de inkoopprijs, met dezelfde markup als de pipeline. */
const MARKUP = Number(process.env.PRODUCT_MARKUP ?? 2.8)
const priceFrom = (cost: number): number => Math.round(cost * MARKUP * 100) / 100 || 0

/**
 * Voegt producten toe aan een bestaande store. De aanroeper levert supplier-
 * product-id's; de gegevens worden bij de leverancier opgehaald, niet van de
 * client overgenomen — dat is wat fulfillment straks bestelt.
 */
export async function addProductsToStore(storeId: string, supplierProductIds: string[]): Promise<AddProductsResult> {
  const store = mergedStore(storeId)
  if (!store) return { ok: false, error: 'Store niet gevonden', added: [], skipped: [], total: 0 }
  if (!supplierProductIds.length) return { ok: false, error: 'Geen producten opgegeven', added: [], skipped: [], total: store.products.length }

  const adapter = getSupplier('cj')
  const existing = new Set(store.products.map(p => String(p.supplierProductId ?? p.id)))
  const added: AddProductsResult['added'] = []
  const skipped: AddProductsResult['skipped'] = []
  const patch: EditableProduct[] = []

  for (const pid of supplierProductIds.slice(0, 15)) {
    if (existing.has(pid)) { skipped.push({ id: pid, reason: 'zit al in deze winkel' }); continue }
    let detail: SupplierProduct | null = null
    try {
      detail = await adapter.getProduct(pid)
    } catch (err) {
      skipped.push({ id: pid, reason: err instanceof Error ? err.message : 'ophalen mislukt' })
      continue
    }
    if (!detail) { skipped.push({ id: pid, reason: 'niet gevonden bij de leverancier' }); continue }

    const price = detail.suggestedPrice && detail.suggestedPrice > 0
      ? Math.round(detail.suggestedPrice * 100) / 100
      : priceFrom(detail.costPrice)
    if (!price) { skipped.push({ id: pid, reason: 'geen bruikbare prijs' }); continue }

    // Een eigen weergave-id houdt de store-interne ids stabiel, ook als dezelfde
    // supplier-sku later in een andere winkel opduikt.
    const displayId = `added-${pid}`.slice(0, 60)
    const product: EditableProduct = {
      id: displayId,
      title: detail.title || pid,
      description: detail.description ?? '',
      price,
      image: detail.image ?? '',
      supplier: detail.supplier || 'cj',
      supplierProductId: detail.productId || pid,
      supplierVariantId: detail.variantId ?? '',
    }
    patch.push(product)
    added.push({ id: displayId, title: String(product.title), price })
    existing.add(pid)
  }

  if (patch.length) saveOverrides(storeId, { products: patch })
  return { ok: true, added, skipped, total: store.products.length + patch.length }
}

/** Zoekt bij CJ naar producten die bij de niche van deze store passen. */
export async function suggestProductsForStore(storeId: string, query?: string): Promise<{
  ok: boolean; error?: string; query: string; results: unknown[]
}> {
  const store = mergedStore(storeId)
  if (!store) return { ok: false, error: 'Store niet gevonden', query: '', results: [] }
  const q = (query ?? store.niche).trim()
  try {
    const found = await getSupplier('cj').searchProducts(q, { maxResults: 12 })
    // Producten bijzetten bij een LIVE winkel liep langs elke relevantiecontrole
    // heen. Verkleedkleding voor mensen gaat er hier gewoon uit — dit is geen
    // zoekscherm waar de operator bewust naar kostuums zoekt maar een
    // "vul mijn winkel aan"-knop.
    const results = found.filter(p => !costumeDisqualification(store.niche, p).rejected)
    const geweerd = found.length - results.length
    if (geweerd > 0) console.log(`[store-admin] ${geweerd} verkleed-/kostuumartikel(en) niet voorgesteld voor "${store.niche}"`)
    return { ok: true, query: q, results }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'zoeken mislukt', query: q, results: [] }
  }
}
