import db from './db.js'
import { fulfillOrderForPayment } from './fulfillment.js'

const MOLLIE_API = 'https://api.mollie.com/v2'
const MOLLIE_API_KEY = () => process.env.MOLLIE_API_KEY || ''

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

export interface MolliePaymentParams {
  storeId: string
  subdomain: string
  runId?: string
  amountEur: number
  description: string
  redirectUrl: string
  webhookUrl: string
  items?: unknown[]
  /** Verzendgegevens van de klant — vereist voor automatische supplier fulfillment */
  customer?: Record<string, string>
}

export async function createPayment(params: MolliePaymentParams): Promise<string> {
  const {
    storeId, subdomain, runId = '', amountEur, description,
    redirectUrl, webhookUrl, items = [], customer = {},
  } = params

  const apiKey = MOLLIE_API_KEY()

  if (!apiKey) {
    console.log(`[mollie] mock: payment aangemaakt voor ${subdomain} €${amountEur.toFixed(2)}`)
    const mockId = `mock_${Date.now()}`
    db.prepare(
      `INSERT INTO checkout_orders (mollie_payment_id, store_id, subdomain, run_id, amount_eur, items_json, customer_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    ).run(mockId, storeId, subdomain, runId, amountEur, JSON.stringify(items), JSON.stringify(customer), new Date().toISOString())
    return 'https://mollie.com/checkout/test'
  }

  const body = {
    amount: { currency: 'EUR', value: amountEur.toFixed(2) },
    description,
    redirectUrl,
    webhookUrl,
    method: ['ideal', 'bancontact', 'creditcard', 'paypal'],
    metadata: { storeId, subdomain, runId },
  }

  const resp = await fetch(`${MOLLIE_API}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })

  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Mollie API error ${resp.status}: ${txt.slice(0, 300)}`)
  }

  const data = await resp.json() as { id: string; _links: { checkout: { href: string } } }

  db.prepare(
    `INSERT INTO checkout_orders (mollie_payment_id, store_id, subdomain, run_id, amount_eur, items_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
  ).run(data.id, storeId, subdomain, runId, amountEur, JSON.stringify(items), new Date().toISOString())

  return data._links.checkout.href
}

export async function handleWebhook(body: URLSearchParams): Promise<void> {
  const paymentId = body.get('id')
  if (!paymentId) return

  const apiKey = MOLLIE_API_KEY()

  if (!apiKey) {
    db.prepare(`UPDATE checkout_orders SET status = 'paid' WHERE mollie_payment_id = ?`).run(paymentId)
    console.log(`[mollie] mock webhook: ${paymentId} gemarkeerd als betaald`)
    fulfillOrderForPayment(paymentId).catch(err => console.error('[mollie] fulfillment (mock) mislukt:', err))
    return
  }

  const resp = await fetch(`${MOLLIE_API}/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })

  if (!resp.ok) {
    console.error(`[mollie] webhook: ophalen payment ${paymentId} mislukt: ${resp.status}`)
    return
  }

  const payment = await resp.json() as {
    id: string
    status: string
    metadata?: { storeId?: string; subdomain?: string; runId?: string }
  }

  db.prepare(`UPDATE checkout_orders SET status = ? WHERE mollie_payment_id = ?`)
    .run(payment.status, payment.id)

  if (payment.status === 'paid') {
    console.log(`[mollie] payment ${payment.id} betaald (winkel: ${payment.metadata?.subdomain ?? 'onbekend'})`)
    // Future: trigger CJ fulfillment via Trendscraper POST /orders
  }
}

export function getCheckoutOrders(limit = 50): unknown[] {
  return db.prepare('SELECT * FROM checkout_orders ORDER BY id DESC LIMIT ?').all(limit) as unknown[]
}
