// ═══════ Centrale checkout-gateway ═══════
// Elke gegenereerde store heeft een eigen adresformulier, maar géén eigen
// betaallogica: het formulier POST't naar dit ene endpoint op api.clynado.com.
// Eén plek waar Stripe-sessies ontstaan betekent één plek om te beveiligen, te
// loggen en te wijzigen — en de webhook blijft het enige fulfillment-trigger.
//
// Dit endpoint is bewust PUBLIEK (het wordt aangeroepen door een browser op een
// ander domein, die geen sessiecookie heeft). Het is daarmee ook het enige
// publieke endpoint dat geld raakt, dus het verdedigt zichzelf op drie manieren:
//
//  1. ORIGIN — alleen `https://<iets>.<STORE_BASE_DOMAIN>` en de apex mogen een
//     sessie aanmaken. Geen wildcard-CORS meer die elke origin terugkaatst.
//  2. STORE — de storeId moet bestaan en `live` zijn. Een verwijderde store kan
//     geen betalingen meer starten.
//  3. PRIJS — het bedrag wordt HERBEREKEND uit de opgeslagen productprijzen.
//     De client mag zeggen wát hij wil kopen, niet wat het kost.

import type { Express, Request, Response } from 'express'
import db from './db.js'
import { createCheckoutSession } from './stripe.js'
import { getPublicBaseUrl } from './public-url.js'

// ── Origin-controle ───────────────────────────────────────────────────────────

function baseDomain(): string {
  return (process.env.STORE_BASE_DOMAIN || '').trim().toLowerCase()
}

function isDev(): boolean {
  // Op de VPS staat DEPLOY_MODE=local; zonder die vlag draaien we lokaal en
  // moeten preview-stores op localhost wél kunnen afrekenen.
  return (process.env.DEPLOY_MODE ?? '').trim().toLowerCase() !== 'local'
}

/**
 * Mag deze origin een checkout-sessie starten? Alleen het eigen domein:
 * `https://<sub>.<domein>`, `https://<domein>` en `https://www.<domein>`.
 *
 * Subdomeinen worden op suffix gecontroleerd én op het aantal punten, zodat
 * `https://evil.com/?x=.clynado.com` of `https://clynado.com.evil.com` niet
 * doorglippen.
 */
export function isAllowedCheckoutOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  let url: URL
  try { url = new URL(origin) } catch { return false }

  const host = url.hostname.toLowerCase()

  if (isDev() && (host === 'localhost' || host === '127.0.0.1' || host === '::1')) return true

  const domain = baseDomain()
  if (!domain) return false
  if (url.protocol !== 'https:') return false
  if (host === domain || host === `www.${domain}`) return true
  return host.endsWith(`.${domain}`) && host.length > domain.length + 1
}

export function setCheckoutCors(req: Request, res: Response): boolean {
  const origin = req.headers.origin
  // Vary is niet cosmetisch: zonder deze header mag een cache het antwoord voor
  // de ene origin aan een andere teruggeven, en dan lekt de toestemming.
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (!isAllowedCheckoutOrigin(origin)) return false
  res.setHeader('Access-Control-Allow-Origin', origin as string)
  return true
}

// ── Store- en prijscontrole ───────────────────────────────────────────────────

export interface CheckoutItem {
  id: string
  title?: string
  price?: number
  quantity?: number
  supplier?: string
  supplierProductId?: string
  supplierVariantId?: string
}

interface StoreRow { store_id: string; subdomein: string; status: string; run_id: string; store_data: string | null }

interface CatalogProduct {
  id?: string; title?: string; price?: number
  supplier?: string; supplierProductId?: string; supplierVariantId?: string
}

/** De prijslijst zoals die bij het deployen is vastgelegd. */
function catalogFor(store: StoreRow): Map<string, CatalogProduct> {
  const map = new Map<string, CatalogProduct>()
  if (!store.store_data) return map
  try {
    const sd = JSON.parse(store.store_data) as { products?: CatalogProduct[] }
    for (const p of sd.products ?? []) if (p.id) map.set(String(p.id), p)
  } catch { /* corrupt store_data → lege catalogus, zie validate() */ }
  return map
}

export interface ValidationResult {
  ok: boolean
  status: number
  error?: string
  store?: StoreRow
  items?: CheckoutItem[]
  amountEur?: number
  description?: string
  /** Gevuld als de prijzen niet gecontroleerd konden worden. */
  warning?: string
}

const MAX_ORDER_EUR = 5000
const MAX_QTY_PER_ITEM = 20

export function validateCheckout(body: Record<string, unknown>): ValidationResult {
  const storeId = String(body.storeId ?? '').trim()
  const rawItems = Array.isArray(body.items) ? (body.items as CheckoutItem[]) : []

  if (!storeId) return { ok: false, status: 400, error: 'storeId is verplicht' }
  if (!rawItems.length) return { ok: false, status: 400, error: 'items is verplicht' }

  const store = db.prepare(
    `SELECT store_id, subdomein, status, run_id, store_data FROM stores WHERE store_id = ?`,
  ).get(storeId) as StoreRow | undefined

  if (!store) return { ok: false, status: 404, error: 'Onbekende winkel' }
  if (store.status !== 'live') return { ok: false, status: 409, error: 'Deze winkel neemt geen bestellingen aan' }

  const catalog = catalogFor(store)
  const items: CheckoutItem[] = []
  let total = 0
  let warning: string | undefined

  for (const raw of rawItems.slice(0, 20)) {
    const id = String(raw.id ?? '').trim()
    if (!id) return { ok: false, status: 400, error: 'Elk item heeft een id nodig' }
    const qty = Math.min(Math.max(Math.trunc(Number(raw.quantity ?? 1)) || 1, 1), MAX_QTY_PER_ITEM)

    const known = catalog.get(id)
    if (catalog.size > 0 && !known) {
      return { ok: false, status: 400, error: `Product ${id} hoort niet bij deze winkel` }
    }

    // De prijs komt uit de catalogus, nooit uit de request. Alleen als er geen
    // catalogus is (oude store zonder store_data) vallen we terug op de opgegeven
    // prijs — mét een waarschuwing in de log, zodat dat opvalt.
    let unit: number
    if (known && typeof known.price === 'number' && known.price > 0) {
      unit = known.price
    } else {
      unit = Number(raw.price ?? 0)
      warning = `geen prijsbron voor ${id} — clientprijs geaccepteerd`
    }
    if (!Number.isFinite(unit) || unit <= 0) {
      return { ok: false, status: 400, error: `Ongeldige prijs voor product ${id}` }
    }

    total += unit * qty
    items.push({
      id,
      title: known?.title ?? String(raw.title ?? id),
      price: unit,
      quantity: qty,
      // Supplier-velden komen uit de catalogus: fulfillment.ts bestelt hierop bij
      // CJ, dus dit mag de client onder geen beding bepalen.
      supplier: known?.supplier ?? raw.supplier,
      supplierProductId: known?.supplierProductId ?? raw.supplierProductId,
      supplierVariantId: known?.supplierVariantId ?? raw.supplierVariantId,
    })
  }

  const amountEur = Math.round(total * 100) / 100
  if (amountEur <= 0) return { ok: false, status: 400, error: 'Bedrag is nul' }
  if (amountEur > MAX_ORDER_EUR) return { ok: false, status: 400, error: 'Bedrag overschrijdt de limiet' }

  const description = items.map(i => `${i.quantity}x ${i.title}`).join(', ').slice(0, 250)
  return { ok: true, status: 200, store, items, amountEur, description, warning }
}

// ── Klantgegevens ─────────────────────────────────────────────────────────────

const CUSTOMER_FIELDS = ['name', 'email', 'phone', 'street', 'houseNumber', 'zip', 'city', 'countryCode'] as const

/** Neemt alleen de bekende velden over en kapt ze af — geen vrije doorvoer. */
function cleanCustomer(raw: unknown): Record<string, string> {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const f of CUSTOMER_FIELDS) {
    const v = src[f]
    if (typeof v === 'string' && v.trim()) out[f] = v.trim().slice(0, 200)
  }
  return out
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * MOET vóór `requireAuth` gemount worden: de aanroeper is een browser op een
 * store-domein zonder sessiecookie. De origin-check vervangt de sessie.
 */
export function registerCheckoutRoutes(app: Express): void {
  app.options('/api/checkout/session', (req, res) => {
    const allowed = setCheckoutCors(req, res)
    res.sendStatus(allowed ? 204 : 403)
  })

  app.post('/api/checkout/session', async (req, res) => {
    const allowed = setCheckoutCors(req, res)
    if (!allowed) {
      console.warn(`[checkout] geweigerde origin: ${req.headers.origin ?? '(geen)'}`)
      res.status(403).json({ error: 'Deze herkomst mag geen betaling starten' })
      return
    }

    const body = (req.body ?? {}) as Record<string, unknown>
    const v = validateCheckout(body)
    if (!v.ok || !v.store) {
      console.warn(`[checkout] geweigerd: ${v.error}`)
      res.status(v.status).json({ error: v.error })
      return
    }
    if (v.warning) console.warn(`[checkout] ${v.warning}`)

    const sub = v.store.subdomein
    const storeOrigin = req.headers.origin as string
    const success = `${storeOrigin}/thank-you/`
    const cancel = `${storeOrigin}/checkout/`

    try {
      const checkoutUrl = await createCheckoutSession({
        storeId: v.store.store_id,
        subdomain: sub,
        runId: v.store.run_id,
        amountEur: v.amountEur!,
        description: v.description!,
        successUrl: success,
        cancelUrl: cancel,
        items: v.items,
        customer: cleanCustomer(body.customer),
      })
      console.log(`[checkout] sessie voor ${sub} — EUR ${v.amountEur!.toFixed(2)}, ${v.items!.length} item(s)`)
      res.json({ checkoutUrl })
    } catch (err) {
      console.error('[checkout] sessie aanmaken mislukt:', err)
      res.status(500).json({ error: 'Betaling kon niet worden gestart' })
    }
  })
}

/**
 * De URL die in de checkout-pagina van elke store terechtkomt. Bij voorkeur het
 * publieke tunnel-adres; zonder dat een lokaal adres voor preview-stores.
 * Er is geen hardgecodeerd IP meer — dat was de bron van de stale-IP-bug.
 */
export function checkoutApiUrl(): string {
  const base = getPublicBaseUrl()
    ?? process.env.UICONTROL_PUBLIC_URL
    ?? `http://localhost:${process.env.PORT ?? 3001}`
  return `${base.replace(/\/+$/, '')}/api/checkout/session`
}
