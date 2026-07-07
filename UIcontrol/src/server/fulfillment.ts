// ═══════ Order fulfillment ═══════
// Koppelt betaalde checkout-orders (Mollie) aan de supplier-laag (CJ):
//   Mollie webhook 'paid' → fulfillOrderForPayment() → SupplierAdapter.placeOrder()
//
// Statusflow in checkout_orders:
//   open → paid → fulfilling → fulfilled
//                            → manual_required   (geen supplier variant ID op items)
//                            → fulfillment_failed (na 3 pogingen; handmatig te retryen)

import db from './db.js'
import { getSupplier } from './suppliers/index.js'
import type { OrderItem, ShippingAddress } from './suppliers/index.js'

// Tabel hier aanmaken (niet alleen in mollie.ts): deze module wordt door mollie.ts
// geïmporteerd en draait dus eerder — de ALTERs hieronder vereisen dat de tabel bestaat.
db.exec(`
  CREATE TABLE IF NOT EXISTS checkout_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mollie_payment_id TEXT NOT NULL DEFAULT '',
    store_id TEXT NOT NULL,
    subdomain TEXT NOT NULL,
    run_id TEXT NOT NULL DEFAULT '',
    amount_eur REAL NOT NULL,
    items_json TEXT NOT NULL DEFAULT '[]',
    cj_order_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_checkout_mollie_id ON checkout_orders(mollie_payment_id);
`)

// Idempotente migratie: extra kolommen op checkout_orders voor fulfillment
const cols = (db.prepare(`PRAGMA table_info(checkout_orders)`).all() as { name: string }[]).map(c => c.name)
const migrations: [string, string][] = [
  ['customer_json',      `ALTER TABLE checkout_orders ADD COLUMN customer_json TEXT NOT NULL DEFAULT '{}'`],
  ['supplier',           `ALTER TABLE checkout_orders ADD COLUMN supplier TEXT NOT NULL DEFAULT 'cj'`],
  ['fulfillment_error',  `ALTER TABLE checkout_orders ADD COLUMN fulfillment_error TEXT`],
  ['fulfillment_attempts', `ALTER TABLE checkout_orders ADD COLUMN fulfillment_attempts INTEGER NOT NULL DEFAULT 0`],
  ['fulfilled_at',       `ALTER TABLE checkout_orders ADD COLUMN fulfilled_at TEXT`],
  ['tracking_number',    `ALTER TABLE checkout_orders ADD COLUMN tracking_number TEXT`],
]
for (const [col, sql] of migrations) {
  if (!cols.includes(col)) {
    try { db.prepare(sql).run() } catch { /* bestaat al */ }
  }
}

interface CheckoutOrderRow {
  id: number
  mollie_payment_id: string
  store_id: string
  subdomain: string
  run_id: string
  amount_eur: number
  items_json: string
  cj_order_id: string
  status: string
  created_at: string
  customer_json: string
  supplier: string
  fulfillment_error: string | null
  fulfillment_attempts: number
  fulfilled_at: string | null
  tracking_number: string | null
}

interface CheckoutItem {
  id?: string
  title?: string
  price?: number
  quantity?: number
  supplier?: string
  supplierProductId?: string
  supplierVariantId?: string
}

const MAX_ATTEMPTS = 3

function getOrderRow(orderId: number): CheckoutOrderRow | undefined {
  return db.prepare(`SELECT * FROM checkout_orders WHERE id = ?`).get(orderId) as CheckoutOrderRow | undefined
}

function setStatus(orderId: number, status: string, patch: { error?: string | null; cjOrderId?: string; fulfilledAt?: string } = {}): void {
  db.prepare(`
    UPDATE checkout_orders SET
      status = ?,
      fulfillment_error = COALESCE(?, fulfillment_error),
      cj_order_id = COALESCE(?, cj_order_id),
      fulfilled_at = COALESCE(?, fulfilled_at)
    WHERE id = ?
  `).run(status, patch.error ?? null, patch.cjOrderId ?? null, patch.fulfilledAt ?? null, orderId)
}

/** Entry point vanuit de Mollie webhook (payment is zojuist op 'paid' gezet). */
export async function fulfillOrderForPayment(molliePaymentId: string): Promise<void> {
  const row = db.prepare(`SELECT id FROM checkout_orders WHERE mollie_payment_id = ?`)
    .get(molliePaymentId) as { id: number } | undefined
  if (!row) {
    console.warn(`[fulfillment] geen order gevonden voor payment ${molliePaymentId}`)
    return
  }
  await fulfillOrder(row.id)
}

/** Plaats de supplier-order voor een betaalde checkout-order. Idempotent. */
export async function fulfillOrder(orderId: number): Promise<{ ok: boolean; status: string; error?: string }> {
  const order = getOrderRow(orderId)
  if (!order) return { ok: false, status: 'not_found', error: `Order ${orderId} niet gevonden` }

  // Idempotentie: al gefulfilled of al bezig → niets doen
  if (order.status === 'fulfilled' || order.cj_order_id) {
    return { ok: true, status: 'fulfilled' }
  }
  if (order.status === 'fulfilling') {
    return { ok: true, status: 'fulfilling' }
  }

  let items: CheckoutItem[] = []
  try { items = JSON.parse(order.items_json) as CheckoutItem[] } catch { /* leeg laten */ }

  let customer: Record<string, string> = {}
  try { customer = JSON.parse(order.customer_json || '{}') as Record<string, string> } catch { /* leeg */ }

  // Zonder supplier variant ID kunnen we niet automatisch bestellen
  const orderItems: OrderItem[] = items
    .filter(i => i.supplierVariantId)
    .map(i => ({
      productId: i.supplierProductId ?? i.id ?? '',
      variantId: i.supplierVariantId!,
      quantity: i.quantity ?? 1,
      title: i.title,
    }))

  if (orderItems.length === 0) {
    setStatus(orderId, 'manual_required', { error: 'Geen supplier variant IDs op de items — handmatig bestellen bij de supplier' })
    console.warn(`[fulfillment] order ${orderId} (${order.subdomain}): geen vid's — manual_required`)
    return { ok: false, status: 'manual_required', error: 'Geen supplier variant IDs' }
  }

  if (!customer.name || !customer.street || !customer.zip || !customer.city) {
    setStatus(orderId, 'manual_required', { error: 'Verzendadres ontbreekt of is incompleet' })
    return { ok: false, status: 'manual_required', error: 'Verzendadres incompleet' }
  }

  const shipping: ShippingAddress = {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    street: customer.street,
    houseNumber: customer.houseNumber,
    zip: customer.zip,
    city: customer.city,
    countryCode: customer.countryCode || 'NL',
  }

  setStatus(orderId, 'fulfilling')
  db.prepare(`UPDATE checkout_orders SET fulfillment_attempts = fulfillment_attempts + 1 WHERE id = ?`).run(orderId)

  const adapter = getSupplier(order.supplier || 'cj')
  const result = await adapter.placeOrder({
    orderNumber: `${order.subdomain.split('.')[0]}-${order.id}`,
    items: orderItems,
    shipping,
    remark: `Store: ${order.subdomain} | Mollie: ${order.mollie_payment_id}`,
  })

  if (result.ok && result.supplierOrderId) {
    setStatus(orderId, 'fulfilled', {
      cjOrderId: result.supplierOrderId,
      fulfilledAt: new Date().toISOString(),
      error: result.error ?? null,
    })
    console.log(`[fulfillment] order ${orderId} → ${adapter.name} order ${result.supplierOrderId}${result.unconfirmed ? ' (unconfirmed/sandbox)' : ''}`)
    return { ok: true, status: 'fulfilled' }
  }

  const attempts = (getOrderRow(orderId)?.fulfillment_attempts ?? 1)
  const failed = attempts >= MAX_ATTEMPTS
  setStatus(orderId, failed ? 'fulfillment_failed' : 'paid', { error: result.error ?? 'onbekende fout' })
  console.error(`[fulfillment] order ${orderId} poging ${attempts}/${MAX_ATTEMPTS} mislukt: ${result.error}`)

  // Nog een poging over → automatische retry met backoff
  if (!failed) {
    const delay = attempts * 30_000
    setTimeout(() => { fulfillOrder(orderId).catch(err => console.error('[fulfillment] retry crash:', err)) }, delay)
  }
  return { ok: false, status: failed ? 'fulfillment_failed' : 'retrying', error: result.error }
}

/** Tracking opvragen voor een order (en tracking_number cachen). */
export async function getOrderTracking(orderId: number): Promise<Record<string, unknown>> {
  const order = getOrderRow(orderId)
  if (!order) return { ok: false, error: 'Order niet gevonden' }
  if (!order.cj_order_id) return { ok: false, error: 'Order is nog niet gefulfilled bij de supplier' }

  const adapter = getSupplier(order.supplier || 'cj')
  const tracking = await adapter.getTracking(order.cj_order_id)
  if (tracking.ok && tracking.trackingNumber && tracking.trackingNumber !== order.tracking_number) {
    db.prepare(`UPDATE checkout_orders SET tracking_number = ? WHERE id = ?`).run(tracking.trackingNumber, orderId)
  }
  return { ok: tracking.ok, orderId, supplierOrderId: order.cj_order_id, ...tracking }
}

export function listOrders(limit = 100): unknown[] {
  return db.prepare(`
    SELECT id, mollie_payment_id as molliePaymentId, store_id as storeId, subdomain,
           run_id as runId, amount_eur as amountEur, items_json as itemsJson,
           customer_json as customerJson, cj_order_id as supplierOrderId, supplier,
           status, fulfillment_error as fulfillmentError, fulfillment_attempts as fulfillmentAttempts,
           fulfilled_at as fulfilledAt, tracking_number as trackingNumber, created_at as createdAt
    FROM checkout_orders ORDER BY id DESC LIMIT ?
  `).all(limit) as unknown[]
}
