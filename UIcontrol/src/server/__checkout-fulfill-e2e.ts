// Volledige keten: store-checkout → centrale gateway → Stripe-sessie →
// ondertekende webhook → fulfillment → CJ-order (mock). Bewijst dat de webhook
// het ENIGE fulfillment-triggerpunt blijft en dat de order bij de juiste winkel
// en de juiste supplier-producten uitkomt.
import fs from 'node:fs'
import Stripe from 'stripe'
import db from './db.js'

const B = process.env.TEST_BASE ?? 'http://127.0.0.1:3312'
const GOOD = 'https://trailform.clynado.com'
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_secret_for_e2e'
let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

const CATALOG = [
  { id: 'p-1', title: 'Folding kettlebell', price: 49.95, supplier: 'cj', supplierProductId: 'CJ-AAA', supplierVariantId: 'V1' },
]

function seed() {
  const now = new Date().toISOString()
  db.prepare(`INSERT OR IGNORE INTO runs (run_id,niche,status,started_at,updated_at) VALUES ('cf-run','fulfill test','completed',?,?)`).run(now, now)
  db.prepare(`INSERT OR REPLACE INTO stores (store_id,run_id,subdomein,niche,preview_url,created_at,status,port,store_data)
              VALUES ('cf-live','cf-run','trailform','portable gym equipment','',?,'live',NULL,?)`)
    .run(now, JSON.stringify({ brand_name: 'Trailform', products: CATALOG }))
}
function cleanup() {
  try {
    db.prepare(`DELETE FROM checkout_orders WHERE store_id = 'cf-live'`).run()
    db.prepare(`DELETE FROM stores WHERE store_id = 'cf-live'`).run()
    db.prepare(`DELETE FROM runs WHERE run_id = 'cf-run'`).run()
  } catch { /* opruimen bepaalt de uitslag niet */ }
}

async function main() {
  seed()

  say('═══ 1. STORE START EEN BETALING VIA DE CENTRALE GATEWAY ═══')
  const r = await fetch(`${B}/api/checkout/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: GOOD },
    body: JSON.stringify({
      storeId: 'cf-live',
      items: [{ id: 'p-1', quantity: 2 }],
      customer: {
        name: 'Test Koper', email: 'koper@example.com', phone: '+31600000000',
        street: 'Teststraat', houseNumber: '12', zip: '1234AB', city: 'Amsterdam', countryCode: 'NL',
        // Een veld dat niet in de allowlist staat mag niet doorgegeven worden
        adminNote: 'DIT MAG NIET DOOR',
      },
    }),
  })
  const body = await r.json() as { checkoutUrl?: string }
  check('sessie aangemaakt', r.status === 200 && !!body.checkoutUrl, `HTTP ${r.status}`)

  const order = db.prepare(
    `SELECT id, mollie_payment_id AS ref, amount_eur, status, cj_order_id, customer_json, items_json, subdomain
     FROM checkout_orders WHERE store_id='cf-live' ORDER BY id DESC LIMIT 1`,
  ).get() as { id: number; ref: string; amount_eur: number; status: string; cj_order_id: string; customer_json: string; items_json: string; subdomain: string }

  check('order-rij aangemaakt met status open', order?.status === 'open', `id=${order?.id} status=${order?.status}`)
  check('bedrag uit de catalogus', order.amount_eur === 99.9, `EUR ${order.amount_eur} (2 x 49.95)`)
  check('winkel-metadata bewaard', order.subdomain === 'trailform', `subdomain=${order.subdomain}`)
  const cust = JSON.parse(order.customer_json) as Record<string, string>
  check('klantgegevens bewaard', cust.city === 'Amsterdam' && cust.zip === '1234AB', `city=${cust.city} zip=${cust.zip}`)
  check('onbekend klantveld niet doorgegeven', cust.adminNote === undefined,
    `adminNote=${cust.adminNote ?? '(afwezig, goed)'}`)
  check('nog GEEN CJ-order vóór de webhook', !order.cj_order_id,
    `cj_order_id="${order.cj_order_id}" — fulfillment mag alleen door de webhook komen`)

  say('')
  say('═══ 2. ONDERTEKENDE STRIPE-WEBHOOK ═══')
  const event = {
    id: 'evt_test_1', object: 'event', type: 'checkout.session.completed',
    data: { object: { id: order.ref, object: 'checkout.session', payment_status: 'paid',
      client_reference_id: String(order.id), metadata: { storeId: 'cf-live', subdomain: 'trailform' } } },
  }
  const payload = JSON.stringify(event)
  const sig = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })

  const bad = await fetch(`${B}/api/webhooks/stripe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=nep' }, body: payload,
  })
  check('webhook met foute handtekening geweigerd', bad.status === 400, `HTTP ${bad.status}`)

  const okHook = await fetch(`${B}/api/webhooks/stripe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': sig }, body: payload,
  })
  check('webhook met geldige handtekening geaccepteerd', okHook.status === 200, `HTTP ${okHook.status}`)

  say('')
  say('═══ 3. FULFILLMENT NAAR CJ (mock-modus) ═══')
  await new Promise(res => setTimeout(res, 2500))
  const after = db.prepare(
    `SELECT status, cj_order_id FROM checkout_orders WHERE id = ?`,
  ).get(order.id) as { status: string; cj_order_id: string }
  check('order-status bijgewerkt na betaling', after.status !== 'open', `status=${after.status}`)
  check('CJ-order aangemaakt', !!after.cj_order_id, `cj_order_id=${after.cj_order_id || '(leeg)'}`)

  say('')
  say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
  cleanup()
  fs.writeFileSync(process.env.LOGFILE ?? 'checkout-fulfill.txt', out.join('\n'), 'utf-8')
  process.exit(fail === 0 ? 0 : 1)
}
main().catch(e => { console.error(e); cleanup(); process.exit(1) })
