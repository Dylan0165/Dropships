// ═══════ CJ Dropshipping adapter (API v2) ═══════
// Docs: https://developers.cjdropshipping.com/api2.0/overview
//
// - Auth via /authentication/getAccessToken (token 15 dagen geldig, refresh 180 dagen).
//   CJ limiteert die call tot 1× per 5 minuten → tokens worden gecachet in de settings-tabel.
// - Alle calls lopen door een queue met minimaal 1.1s tussenruimte (CJ rate limit ~1 req/s)
//   en retry met backoff op 429 / "Too Many Requests".
// - CJ_ENV=sandbox: orders worden aangemaakt maar NOOIT betaald/bevestigd (payBalance wordt
//   overgeslagen). CJ_ENV=production: order wordt na aanmaken bevestigd via payBalance.
// - Geen CJ_API_KEY geconfigureerd → mock-modus met deterministische sample-producten,
//   zodat UI/pipeline-development zonder account werkt.

import db from '../db.js'
import { isConfigured } from '../load-env.js'
import {
  EU_WAREHOUSES,
  type InventoryInfo,
  type PlacedOrder,
  type ProductSearchOptions,
  type SupplierAdapter,
  type SupplierOrderData,
  type SupplierProduct,
  type SupplierVariant,
  type TrackingInfo,
} from './types.js'

const CJ_BASE = process.env.CJ_BASE_URL ?? 'https://developers.cjdropshipping.com/api2.0/v1'
const AUTH_MIN_INTERVAL_MS = 5 * 60_000     // CJ: getAccessToken max 1× per 5 min
const REQUEST_SPACING_MS = 1_100            // CJ: ~1 request per seconde
const MARKUP_FACTOR = 2.8                   // default verkoopprijs-indicatie

function cjEnv() {
  return {
    email: process.env.CJ_EMAIL ?? '',
    apiKey: process.env.CJ_API_KEY ?? '',
    env: (process.env.CJ_ENV ?? 'sandbox').toLowerCase() as 'sandbox' | 'production',
    logisticName: process.env.CJ_LOGISTIC_NAME ?? 'CJPacket Ordinary',
  }
}

// ── Settings-tabel helpers (token cache overleeft server restarts) ────────────

function settingGet(key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  } catch { return null }
}

function settingSet(key: string, value: string): void {
  try {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
      .run(key, value, value)
  } catch (err) {
    console.error(`[cj] settingSet(${key}) failed:`, err)
  }
}

// ── CJ API response envelope ──────────────────────────────────────────────────

interface CjEnvelope<T> {
  code: number
  result: boolean
  message: string
  data: T | null
}

export class CJApiError extends Error {
  constructor(message: string, public code?: number, public retryable = false) {
    super(message)
    this.name = 'CJApiError'
  }
}

// ── Request queue: serialiseer calls met vaste tussenruimte ───────────────────
// HARDE throttle: elke CJ-call (ook auth) loopt door deze queue, dus er gaat
// nooit meer dan 1 request per ~seconde naar CJ, hoeveel gelijktijdige
// aanvragen (wizard, pipeline, fulfillment) er ook binnenkomen.

let queueTail: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

// ── Runtime-status (voor UI-feedback tijdens retries) ─────────────────────────

export interface CjRetryStatus {
  path: string
  attempt: number
  maxAttempts: number
  resumeAt: number      // epoch ms waarop de retry gaat lopen
}

const cjStatus: { queueDepth: number; retry: CjRetryStatus | null } = {
  queueDepth: 0,
  retry: null,
}

/** Momentopname voor de UI: bezig? wachtend op een 429-backoff? hoelang nog? */
export function getCjStatus() {
  return {
    busy: cjStatus.queueDepth > 0 || cjStatus.retry !== null,
    queueDepth: cjStatus.queueDepth,
    retry: cjStatus.retry
      ? { ...cjStatus.retry, resumeInMs: Math.max(0, cjStatus.retry.resumeAt - Date.now()) }
      : null,
  }
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  cjStatus.queueDepth++
  const run = queueTail.then(async () => {
    const wait = lastRequestAt + REQUEST_SPACING_MS - Date.now()
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastRequestAt = Date.now()
    return task()
  })
  queueTail = run
    .catch(() => { /* queue mag niet breken op een failed call */ })
    .then(() => { cjStatus.queueDepth = Math.max(0, cjStatus.queueDepth - 1) })
  return run
}

// ── 429 backoff: exponentieel 3s → 6s → 12s → 24s → 48s ──────────────────────

const MAX_ATTEMPTS = 6            // 1 poging + 5 retries
const BACKOFF_BASE_MS = 3_000

async function rateLimitBackoff(path: string, attempt: number): Promise<void> {
  const backoff = BACKOFF_BASE_MS * 2 ** (attempt - 1)
  cjStatus.retry = { path, attempt, maxAttempts: MAX_ATTEMPTS - 1, resumeAt: Date.now() + backoff }
  console.warn(`[cj] rate limit (429) op ${path} — retry ${attempt}/${MAX_ATTEMPTS - 1} over ${backoff / 1000}s`)
  try {
    await new Promise(r => setTimeout(r, backoff))
  } finally {
    cjStatus.retry = null
  }
}

// ═══════ Adapter ═══════

export class CJAdapter implements SupplierAdapter {
  readonly name = 'cj'

  // Mock-modus zolang er geen ECHTE key is (leeg of placeholder telt niet mee).
  get isMock(): boolean {
    return !isConfigured(cjEnv().apiKey)
  }

  // ── Auth: token caching + refresh ──────────────────────────────────────────

  private async getToken(): Promise<string> {
    const now = Date.now()

    const token = settingGet('cj_access_token')
    const expiry = parseInt(settingGet('cj_access_token_expiry') ?? '0', 10)
    // 24h marge zodat we nooit met een bijna-verlopen token werken
    if (token && expiry - now > 24 * 3600_000) return token

    // Probeer eerst refresh (geen rate limit issue)
    const refreshToken = settingGet('cj_refresh_token')
    const refreshExpiry = parseInt(settingGet('cj_refresh_token_expiry') ?? '0', 10)
    if (refreshToken && refreshExpiry - now > 3600_000) {
      try {
        return await this.refreshAccessToken(refreshToken)
      } catch (err) {
        console.warn('[cj] refreshAccessToken mislukt, val terug op volledige auth:', err)
      }
    }

    return this.authenticate()
  }

  private async authenticate(): Promise<string> {
    const { email, apiKey } = cjEnv()
    if (!isConfigured(apiKey)) throw new CJApiError('CJ_API_KEY niet geconfigureerd')
    if (!isConfigured(email)) throw new CJApiError('CJ_EMAIL ontbreekt — vul zowel CJ_EMAIL als CJ_API_KEY in (.env)')

    const lastAuth = parseInt(settingGet('cj_last_auth_at') ?? '0', 10)
    const sinceLast = Date.now() - lastAuth
    if (sinceLast < AUTH_MIN_INTERVAL_MS) {
      throw new CJApiError(
        `CJ auth rate limit: getAccessToken mag max 1× per 5 min (nog ${Math.ceil((AUTH_MIN_INTERVAL_MS - sinceLast) / 1000)}s wachten)`,
        429, true,
      )
    }
    settingSet('cj_last_auth_at', String(Date.now()))

    const resp = await enqueue(() => fetch(`${CJ_BASE}/authentication/getAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: apiKey }),
      signal: AbortSignal.timeout(15_000),
    }))
    const body = await resp.json() as CjEnvelope<{
      accessToken: string; accessTokenExpiryDate: string
      refreshToken: string; refreshTokenExpiryDate: string
    }>
    if (!resp.ok || !body.result || !body.data) {
      throw new CJApiError(`CJ auth mislukt: ${body.message ?? resp.status}`, body.code)
    }

    settingSet('cj_access_token', body.data.accessToken)
    settingSet('cj_access_token_expiry', String(new Date(body.data.accessTokenExpiryDate).getTime()))
    settingSet('cj_refresh_token', body.data.refreshToken)
    settingSet('cj_refresh_token_expiry', String(new Date(body.data.refreshTokenExpiryDate).getTime()))
    console.log('[cj] nieuw access token opgehaald (geldig tot', body.data.accessTokenExpiryDate, ')')
    return body.data.accessToken
  }

  private async refreshAccessToken(refreshToken: string): Promise<string> {
    const resp = await enqueue(() => fetch(`${CJ_BASE}/authentication/refreshAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(15_000),
    }))
    const body = await resp.json() as CjEnvelope<{
      accessToken: string; accessTokenExpiryDate: string
      refreshToken: string; refreshTokenExpiryDate: string
    }>
    if (!resp.ok || !body.result || !body.data) {
      throw new CJApiError(`CJ token refresh mislukt: ${body.message ?? resp.status}`, body.code)
    }
    settingSet('cj_access_token', body.data.accessToken)
    settingSet('cj_access_token_expiry', String(new Date(body.data.accessTokenExpiryDate).getTime()))
    settingSet('cj_refresh_token', body.data.refreshToken)
    settingSet('cj_refresh_token_expiry', String(new Date(body.data.refreshTokenExpiryDate).getTime()))
    console.log('[cj] access token vernieuwd via refresh token')
    return body.data.accessToken
  }

  // ── Core request met queue + retry/backoff ─────────────────────────────────

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    payload?: Record<string, unknown>,
    attempt = 1,
  ): Promise<T> {
    const MAX_ATTEMPTS = 3
    const token = await this.getToken()

    const url = method === 'GET' && payload
      ? `${CJ_BASE}${path}?${new URLSearchParams(
          Object.fromEntries(Object.entries(payload)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => [k, String(v)])),
        ).toString()}`
      : `${CJ_BASE}${path}`

    const doFetch = () => fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'CJ-Access-Token': token,
      },
      body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
      signal: AbortSignal.timeout(30_000),
    })

    const resp = await enqueue(doFetch)

    // HTTP-level rate limit
    if (resp.status === 429) {
      if (attempt >= MAX_ATTEMPTS) throw new CJApiError('CJ rate limit (429) — max retries bereikt', 429, true)
      const backoff = attempt * 3_000
      console.warn(`[cj] 429 op ${path} — retry ${attempt}/${MAX_ATTEMPTS - 1} na ${backoff}ms`)
      await new Promise(r => setTimeout(r, backoff))
      return this.request<T>(method, path, payload, attempt + 1)
    }

    const body = await resp.json().catch(() => null) as CjEnvelope<T> | null
    if (!body) throw new CJApiError(`CJ gaf geen geldige JSON terug (HTTP ${resp.status}) op ${path}`)

    // CJ zet errors vaak in de envelope met HTTP 200
    if (!body.result || body.code !== 200) {
      const msg = body.message ?? `code ${body.code}`
      const isRateLimit = body.code === 429 || /too many|frequent/i.test(msg)
      if (isRateLimit && attempt < MAX_ATTEMPTS) {
        const backoff = attempt * 3_000
        console.warn(`[cj] rate limit in envelope op ${path} — retry na ${backoff}ms`)
        await new Promise(r => setTimeout(r, backoff))
        return this.request<T>(method, path, payload, attempt + 1)
      }
      // Token verlopen/ongeldig → cache wissen en 1× opnieuw
      if ((body.code === 1600100 || /token/i.test(msg)) && attempt < MAX_ATTEMPTS) {
        console.warn(`[cj] token afgewezen op ${path} — cache wissen en opnieuw`)
        settingSet('cj_access_token', '')
        settingSet('cj_access_token_expiry', '0')
        return this.request<T>(method, path, payload, attempt + 1)
      }
      throw new CJApiError(`CJ API error op ${path}: ${msg}`, body.code, isRateLimit)
    }

    return body.data as T
  }

  // ── searchProducts ──────────────────────────────────────────────────────────

  async searchProducts(niche: string, options: ProductSearchOptions = {}): Promise<SupplierProduct[]> {
    if (this.isMock) return mockProducts(niche, options)

    // Auth vooraf: config-/auth-/rate-limit-fouten komen zo als duidelijke error
    // naar boven (state b) i.p.v. stilzwijgend als "geen resultaten" (was verwarrend).
    await this.getToken()

    const warehouses = options.warehouseCountries ?? [...EU_WAREHOUSES]
    const pageSize = options.pageSize ?? 20
    const maxResults = options.maxResults ?? 30
    const seen = new Map<string, SupplierProduct>()
    const warehouseErrors: string[] = []

    for (const countryCode of warehouses) {
      if (seen.size >= maxResults) break
      try {
        const data = await this.request<{
          pageNum: number; pageSize: number; total: number
          list: Array<Record<string, unknown>>
        }>('GET', '/product/list', {
          pageNum: options.page ?? 1,
          pageSize,
          productNameEn: niche,
          countryCode,
        })
        for (const raw of data?.list ?? []) {
          const p = mapCjListProduct(raw, countryCode)
          if (p && !seen.has(p.productId)) seen.set(p.productId, p)
          if (seen.size >= maxResults) break
        }
      } catch (err) {
        // Eén warehouse dat faalt mag de hele zoekopdracht niet breken...
        const msg = err instanceof Error ? err.message : String(err)
        warehouseErrors.push(`${countryCode}: ${msg}`)
        console.warn(`[cj] product search voor warehouse ${countryCode} mislukt:`, msg)
      }
    }

    // ...maar als ÁLLE warehouses faalden en er niets gevonden is, is dat een
    // echte CJ-fout die de gebruiker moet zien — niet stil leeg teruggeven.
    if (seen.size === 0 && warehouseErrors.length === warehouses.length) {
      throw new CJApiError(`CJ productzoekopdracht faalde voor alle warehouses — ${warehouseErrors[0]}`)
    }

    return Array.from(seen.values())
  }

  // ── getProduct (details + varianten) ───────────────────────────────────────

  async getProduct(productId: string): Promise<SupplierProduct | null> {
    if (this.isMock) {
      return mockProducts('detail', {}).find(p => p.productId === productId)
        ?? { ...mockProducts('detail', {})[0], productId }
    }

    const detail = await this.request<Record<string, unknown>>('GET', '/product/query', { pid: productId })
    if (!detail) return null

    let variants: SupplierVariant[] = []
    try {
      const vData = await this.request<Array<Record<string, unknown>>>('GET', '/product/variant/query', { pid: productId })
      variants = (vData ?? []).map(v => ({
        variantId: String(v.vid ?? ''),
        sku: v.variantSku ? String(v.variantSku) : undefined,
        name: v.variantNameEn ? String(v.variantNameEn) : undefined,
        costPrice: parsePrice(v.variantSellPrice) ?? 0,
        image: v.variantImage ? String(v.variantImage) : undefined,
      })).filter(v => v.variantId)
    } catch (err) {
      console.warn(`[cj] variant query voor ${productId} mislukt:`, err instanceof Error ? err.message : err)
    }

    const base = mapCjListProduct(detail, undefined)
    if (!base) return null
    return {
      ...base,
      description: detail.description ? String(detail.description) : base.description,
      variants,
      variantId: base.variantId ?? variants[0]?.variantId,
    }
  }

  // ── placeOrder ──────────────────────────────────────────────────────────────

  async placeOrder(orderData: SupplierOrderData): Promise<PlacedOrder> {
    const { env, logisticName } = cjEnv()

    if (this.isMock) {
      console.log(`[cj] MOCK order geplaatst: ${orderData.orderNumber} (${orderData.items.length} items)`)
      return { ok: true, supplierOrderId: `mock-cj-${orderData.orderNumber}`, status: 'CREATED', unconfirmed: true }
    }

    const s = orderData.shipping
    const missing = ['name', 'street', 'zip', 'city', 'countryCode'].filter(k => !s[k as keyof typeof s])
    if (missing.length) {
      return { ok: false, error: `Verzendadres incompleet: ${missing.join(', ')} ontbreekt` }
    }
    const badItems = orderData.items.filter(i => !i.variantId)
    if (badItems.length) {
      return { ok: false, error: `Items zonder CJ variant ID (vid): ${badItems.map(i => i.title ?? i.productId).join(', ')}` }
    }

    try {
      const data = await this.request<{ orderId?: string } | string>('POST', '/shopping/order/createOrderV2', {
        orderNumber: orderData.orderNumber,
        shippingCustomerName: s.name,
        shippingPhone: s.phone ?? '0000000000',
        shippingAddress: s.houseNumber ? `${s.street} ${s.houseNumber}` : s.street,
        shippingCity: s.city,
        shippingProvince: s.province ?? s.city,
        shippingZip: s.zip,
        shippingCountryCode: s.countryCode.toUpperCase(),
        email: s.email,
        remark: orderData.remark ?? `Auto-order via Dropships (${env})`,
        fromCountryCode: orderData.fromCountryCode ?? 'DE',
        logisticName: orderData.logisticName ?? logisticName,
        payType: 2,
        products: orderData.items.map(i => ({ vid: i.variantId, quantity: i.quantity })),
      })

      const orderId = typeof data === 'string' ? data : data?.orderId
      if (!orderId) return { ok: false, error: 'CJ gaf geen orderId terug' }

      // Sandbox: order NIET bevestigen/betalen — testaccount heeft $0 balance
      if (env !== 'production') {
        console.log(`[cj] sandbox: order ${orderId} aangemaakt, betaling overgeslagen`)
        return { ok: true, supplierOrderId: orderId, status: 'CREATED', unconfirmed: true }
      }

      // Productie: bevestig de order via balance payment
      try {
        await this.request('POST', '/shopping/pay/payBalance', { orderId })
        return { ok: true, supplierOrderId: orderId, status: 'CONFIRMED' }
      } catch (payErr) {
        const msg = payErr instanceof Error ? payErr.message : String(payErr)
        console.error(`[cj] order ${orderId} aangemaakt maar payBalance mislukt:`, msg)
        return { ok: true, supplierOrderId: orderId, status: 'CREATED_UNPAID', unconfirmed: true, error: `Betaling mislukt: ${msg}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cj] placeOrder ${orderData.orderNumber} mislukt:`, msg)
      return { ok: false, error: msg }
    }
  }

  // ── getTracking ─────────────────────────────────────────────────────────────

  async getTracking(supplierOrderId: string): Promise<TrackingInfo> {
    if (this.isMock) {
      return {
        ok: true, orderStatus: 'SHIPPED', trackingNumber: `MOCKTRACK${supplierOrderId.slice(-6)}`,
        logisticName: 'CJPacket Ordinary',
        events: [{ time: new Date().toISOString(), status: 'Pakket onderweg (mock)', location: 'Warehouse DE' }],
      }
    }

    try {
      const detail = await this.request<Record<string, unknown>>(
        'GET', '/shopping/order/getOrderDetail', { orderId: supplierOrderId },
      )
      if (!detail) return { ok: false, error: 'Order niet gevonden bij CJ' }

      const trackingNumber = (detail.trackNumber ?? detail.trackingNumber) as string | undefined
      const info: TrackingInfo = {
        ok: true,
        orderStatus: detail.orderStatus ? String(detail.orderStatus) : undefined,
        trackingNumber,
        logisticName: detail.logisticName ? String(detail.logisticName) : undefined,
      }

      if (trackingNumber) {
        try {
          const track = await this.request<Array<Record<string, unknown>>>(
            'GET', '/logistic/getTrackInfo', { trackNumber: trackingNumber },
          )
          info.events = (track ?? []).map(e => ({
            time: String(e.date ?? e.time ?? ''),
            status: String(e.trackingStatus ?? e.status ?? ''),
            location: e.address ? String(e.address) : undefined,
          }))
        } catch { /* tracking events zijn nice-to-have */ }
      }
      return info
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── getInventory ────────────────────────────────────────────────────────────

  async getInventory(productId: string): Promise<InventoryInfo> {
    if (this.isMock) {
      return {
        ok: true, productId, total: 250,
        byWarehouse: [{ countryCode: 'DE', quantity: 180 }, { countryCode: 'PL', quantity: 70 }],
      }
    }

    try {
      // Voorraad hangt aan varianten → pak de default variant van het product
      const product = await this.getProduct(productId)
      const vid = product?.variantId
      if (!vid) return { ok: false, productId, total: 0, byWarehouse: [], error: 'Geen variant (vid) gevonden voor product' }

      const stock = await this.request<Array<Record<string, unknown>>>(
        'GET', '/product/stock/queryByVid', { vid },
      )
      const byWarehouse = (stock ?? []).map(s => ({
        countryCode: String(s.countryCode ?? s.areaEn ?? '??'),
        quantity: Number(s.storageNum ?? s.num ?? 0),
      }))
      return {
        ok: true, productId,
        total: byWarehouse.reduce((a, w) => a + w.quantity, 0),
        byWarehouse,
      }
    } catch (err) {
      return { ok: false, productId, total: 0, byWarehouse: [], error: err instanceof Error ? err.message : String(err) }
    }
  }
}

// ── Mapping helpers ────────────────────────────────────────────────────────────

/** CJ prijzen kunnen een range-string zijn ("1.50 -- 2.30") of een number */
function parsePrice(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    const m = v.match(/[\d.]+/)
    if (m) return parseFloat(m[0])
  }
  return null
}

function suggestPrice(cost: number): number {
  const raw = cost * MARKUP_FACTOR
  // psychologische prijs: afronden op X.95
  return Math.max(9.95, Math.floor(raw) + 0.95)
}

function mapCjListProduct(raw: Record<string, unknown>, warehouse?: string): SupplierProduct | null {
  const pid = raw.pid ?? raw.productId
  const cost = parsePrice(raw.sellPrice ?? raw.variantSellPrice ?? raw.price)
  if (!pid || cost === null) return null

  const title = String(raw.productNameEn ?? raw.nameEn ?? raw.productName ?? 'Onbekend product')
  return {
    supplier: 'cj',
    productId: String(pid),
    variantId: raw.vid ? String(raw.vid) : undefined,
    title,
    description: raw.remark ? String(raw.remark) : undefined,
    image: String(raw.productImage ?? raw.bigImage ?? raw.image ?? ''),
    costPrice: cost,
    suggestedPrice: suggestPrice(cost),
    currency: 'USD',
    shippingDays: { min: 3, max: 8 },   // EU warehouse levertijd-indicatie
    warehouse,
    category: raw.categoryName ? String(raw.categoryName) : undefined,
    rating: raw.score ? Number(raw.score) : undefined,
    url: `https://www.cjdropshipping.com/product/-p-${String(pid)}.html`,
  }
}

// ── Mock data (geen CJ_API_KEY) ────────────────────────────────────────────────

function mockProducts(niche: string, options: ProductSearchOptions): SupplierProduct[] {
  const seed = niche.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const count = Math.min(options.maxResults ?? 8, 8)
  const warehouses = options.warehouseCountries ?? [...EU_WAREHOUSES]

  return Array.from({ length: count }, (_, i) => {
    const cost = 4 + ((seed + i * 7) % 20) + ((seed + i) % 100) / 100
    return {
      supplier: 'cj',
      productId: `mock-pid-${seed}-${i}`,
      variantId: `mock-vid-${seed}-${i}`,
      title: `${niche} — variant ${i + 1} (mock)`,
      description: `Sample product voor "${niche}". Configureer CJ_API_KEY voor echte CJ data.`,
      image: `https://picsum.photos/seed/${seed + i}/600/600`,
      costPrice: Math.round(cost * 100) / 100,
      suggestedPrice: suggestPrice(cost),
      currency: 'USD',
      shippingDays: { min: 3, max: 8 },
      warehouse: warehouses[i % warehouses.length],
      inventory: 50 + ((seed + i * 13) % 400),
      rating: 3.8 + ((seed + i) % 12) / 10,
      category: 'Mock',
      url: 'https://www.cjdropshipping.com',
      variants: [{
        variantId: `mock-vid-${seed}-${i}`,
        sku: `MOCK-${seed}-${i}`,
        name: 'Default',
        costPrice: Math.round(cost * 100) / 100,
      }],
    }
  })
}
