import db from './db.js'
import { mergedStore, aiEditStore, applyPriceChange } from './store-admin.js'
const now = new Date().toISOString()
const CAT = [
  { id: 'p-1', title: 'Compact Folding Kettlebell', description: 'A kettlebell that folds flat so it fits in a gym bag. Adjustable from 4 to 16 kilos.', price: 59.95, supplier: 'cj', supplierProductId: 'CJ-1', supplierVariantId: 'V1' },
  { id: 'p-2', title: 'Travel Yoga Mat', description: 'A thin mat that rolls up tight. Grippy on both sides.', price: 29.5, supplier: 'cj', supplierProductId: 'CJ-2', supplierVariantId: 'V2' },
]
db.prepare(`INSERT OR IGNORE INTO runs (run_id,niche,status,started_at,updated_at) VALUES ('ai-run','ai edit','completed',?,?)`).run(now, now)
db.prepare(`INSERT OR REPLACE INTO stores (store_id,run_id,subdomein,niche,preview_url,created_at,status,port,store_data,custom_data)
            VALUES ('ai-store','ai-run','aitest','portable gym equipment','',?, 'live', NULL, ?, NULL)`)
  .run(now, JSON.stringify({ brand_name: 'Trailform', slogan: 'Train anywhere', products: CAT }))

const before = mergedStore('ai-store')!
console.log('VOOR:')
for (const p of before.products) console.log(`  ${p.id}  EUR ${p.price}  ${p.title}`)
console.log(`  slogan: "${before.slogan}"`)

console.log('\n── AI-instructie: "maak de productbeschrijvingen korter en zakelijker" ──')
const r1 = await aiEditStore('ai-store', 'maak de productbeschrijvingen korter en zakelijker')
console.log('ok:', r1.ok, '| error:', r1.error, '| samenvatting:', r1.summary)
console.log('toegepast:', JSON.stringify(r1.applied))
for (const d of r1.diff ?? []) console.log(`  ${d.id}.${d.field}:\n    van: ${d.from}\n    naar: ${d.to}`)

console.log('\n── AI-instructie: "verhoog alle prijzen met 10 procent" ──')
const r2 = await aiEditStore('ai-store', 'verhoog alle prijzen met 10 procent')
console.log('ok:', r2.ok, '| samenvatting:', r2.summary)
for (const d of (r2.diff ?? []).filter(d => d.field === 'price')) console.log(`  ${d.id}: ${d.from} → ${d.to}`)

console.log('\n── Deterministische prijsactie (zonder AI): +10% en afronden op .95 ──')
const r3 = applyPriceChange('ai-store', { percent: 10, roundTo: 0.95 })
for (const c of r3.changes) console.log(`  ${c.title}: ${c.from} → ${c.to}`)

const after = mergedStore('ai-store')!
console.log('\nNA:')
for (const p of after.products) console.log(`  ${p.id}  EUR ${p.price}  ${p.title}`)
const raw = JSON.parse((db.prepare(`SELECT store_data FROM stores WHERE store_id='ai-store'`).get() as any).store_data)
console.log(`\nOrigineel store_data ONGEWIJZIGD: p-1 = EUR ${raw.products[0].price}, "${raw.products[0].description.slice(0,40)}…"`)
console.log('Supplier-velden intact:', after.products.map(p => p.supplierProductId).join(', '))

db.prepare(`DELETE FROM stores WHERE store_id='ai-store'`).run()
db.prepare(`DELETE FROM runs WHERE run_id='ai-run'`).run()
