// ═══════ Stripe checkout (vervangt Mollie) ═══════
// Flow: het vaste checkout-component POST't naar /api/checkout/session →
// createCheckoutSession() maakt een Stripe Checkout Session → klant betaalt →
// Stripe stuurt `checkout.session.completed` naar /api/webhooks/stripe →
// handleStripeWebhook() verifieert de handtekening → fulfillment.ts → CJ order.
//
// fulfillment.ts is ONGEWIJZIGD: alleen de trigger komt nu van Stripe i.p.v.
// Mollie. De checkout_orders-tabel wordt hergebruikt; `mollie_payment_id` bevat
// nu de Stripe session-id (kolomnaam behouden voor compat, semantiek = payment ref).
//
// Geen STRIPE_SECRET_KEY (of placeholder) → mock-modus, zodat UI/pipeline-
// ontwikkeling zonder Stripe-account werkt (net als bij CJ/Mollie).

import Stripe from 'stripe'
import db from './db.js'
import { isConfigured } from './load-env.js'
import { fulfillOrderForPayment } from './fulfillment.js'

// checkout_orders wordt al aangemaakt in mollie.ts-tijd; hier defensief herhalen
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
`)

function secretKey(): string { return process.env.STRIPE_SECRET_KEY ?? '' }
function webhookSecret(): string { return process.env.STRIPE_WEBHOOK_SECRET ?? '' }
export function stripeIsMock(): boolean { return !isConfigured(secretKey()) }

let _client: Stripe | null = null
function client(): Stripe {
  // Dummy-key als fallback: webhooks.constructEvent verifieert offline met het
  // webhook-secret en raakt de API niet — zo werkt signatuur-verificatie ook als
  // session-creatie in mock-modus draait (geen STRIPE_SECRET_KEY).
  if (!_client) _client = new Stripe(secretKey() || 'sk_test_dummy_for_webhook_verify', { apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion })
  return _client
}

export interface StripeCheckoutParams {
  storeId: string
  subdomain: string
  runId?: string
  amountEur: number
  description: string
  successUrl: string
  cancelUrl: string
  items?: unknown[]
  customer?: Record<string, string>
}

/** Maakt een Stripe Checkout Session aan en retourneert de betaal-URL. */
export async function createCheckoutSession(params: StripeCheckoutParams): Promise<string> {
  const { storeId, subdomain, runId = '', amountEur, description, successUrl, cancelUrl, items = [], customer = {} } = params

  // De order-rij eerst aanmaken; z'n id koppelen we aan de sessie (client_reference_id)
  const insert = db.prepare(
    `INSERT INTO checkout_orders (mollie_payment_id, store_id, subdomain, run_id, amount_eur, items_json, customer_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
  )

  if (stripeIsMock()) {
    const mockId = `cs_test_mock_${Date.now()}`
    insert.run(mockId, storeId, subdomain, runId, amountEur, JSON.stringify(items), JSON.stringify(customer), new Date().toISOString())
    console.log(`[stripe] MOCK checkout session voor ${subdomain} €${amountEur.toFixed(2)} (${mockId})`)
    return `https://checkout.stripe.com/c/pay/mock#${mockId}`
  }

  const info = insert.run('', storeId, subdomain, runId, amountEur, JSON.stringify(items), JSON.stringify(customer), new Date().toISOString())
  const orderRowId = String(info.lastInsertRowid)

  const session = await client().checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(amountEur * 100),
        product_data: { name: description.slice(0, 250) || `Order ${subdomain}` },
      },
    }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: orderRowId,
    ...(customer.email ? { customer_email: customer.email } : {}),
    // metadata is klein (limiet 500 tekens/waarde) → alleen refs; items/customer
    // staan al veilig in de checkout_orders-rij.
    metadata: { storeId, subdomain, runId, orderRowId },
  })

  // Session-id opslaan zodat de webhook de rij terugvindt (naast client_reference_id)
  db.prepare(`UPDATE checkout_orders SET mollie_payment_id = ? WHERE id = ?`).run(session.id, orderRowId)
  return session.url ?? cancelUrl
}

/**
 * Verwerkt een Stripe-webhook. Verifieert de handtekening (STRIPE_WEBHOOK_SECRET)
 * en triggert fulfillment op `checkout.session.completed`. `rawBody` MOET de
 * onbewerkte request-body zijn (niet de geparste JSON) voor de signatuur.
 */
export async function handleStripeWebhook(rawBody: Buffer | string, signature: string | undefined): Promise<{ ok: boolean; status: number; error?: string }> {
  // Signatuur-verificatie hangt ALLEEN af van het webhook-secret, niet van de
  // API-key: ook met mock session-creatie moet een echte webhook geverifieerd
  // worden. Zonder webhook-secret (pure dev) → geparsete event accepteren.
  if (!isConfigured(webhookSecret())) {
    try {
      const evt = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8')) as Stripe.Event
      await routeEvent(evt)
      return { ok: true, status: 200 }
    } catch (err) {
      return { ok: false, status: 400, error: err instanceof Error ? err.message : 'dev webhook parse mislukt' }
    }
  }

  if (!signature) return { ok: false, status: 400, error: 'ontbrekende Stripe-Signature header' }
  let event: Stripe.Event
  try {
    event = client().webhooks.constructEvent(rawBody, signature, webhookSecret())
  } catch (err) {
    // Handtekening klopt niet → 400 (Stripe stuurt opnieuw)
    return { ok: false, status: 400, error: `signatuur-verificatie mislukt: ${err instanceof Error ? err.message : String(err)}` }
  }
  await routeEvent(event)
  return { ok: true, status: 200 }
}

async function routeEvent(event: Stripe.Event): Promise<void> {
  if (event.type !== 'checkout.session.completed') {
    console.log(`[stripe] event ${event.type} genegeerd`)
    return
  }
  const session = event.data.object as Stripe.Checkout.Session
  // Alleen betaalde sessies fulfillen
  if (session.payment_status && session.payment_status !== 'paid') {
    console.log(`[stripe] sessie ${session.id} payment_status=${session.payment_status} — niet fulfillen`)
    return
  }
  const ref = session.id
  db.prepare(`UPDATE checkout_orders SET status = 'paid' WHERE mollie_payment_id = ? OR id = ?`)
    .run(ref, Number(session.client_reference_id) || -1)
  console.log(`[stripe] checkout.session.completed ${session.id} (winkel: ${session.metadata?.subdomain ?? '?'}) — fulfillment starten`)
  // fulfillment zoekt op de payment-ref (session-id); val terug op de rij-id
  const byRef = db.prepare(`SELECT mollie_payment_id as ref FROM checkout_orders WHERE mollie_payment_id = ? OR id = ?`)
    .get(ref, Number(session.client_reference_id) || -1) as { ref: string } | undefined
  await fulfillOrderForPayment(byRef?.ref || ref)
}
