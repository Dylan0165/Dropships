// Wegwerp-seed voor de UI-verificatie: één winkel in een tijdelijke database.
process.env.DATABASE_PATH = process.env.MARKETING_DB ?? ''
const { default: db } = await import('../src/server/db.js')
// stores.run_id verwijst naar runs — die rij moet er eerst zijn.
const now = new Date().toISOString()
db.prepare(`INSERT OR IGNORE INTO runs (run_id, niche, status, started_at, updated_at) VALUES (?,?,?,?,?)`)
  .run('run-verify', 'portable gym equipment', 'completed', now, now)
db.prepare(`INSERT INTO stores (store_id, run_id, subdomein, niche, preview_url, port, status, created_at, store_data)
  VALUES (?,?,?,?,?,?,?,?,?)
  ON CONFLICT(store_id) DO UPDATE SET store_data = excluded.store_data, status = excluded.status`).run(
  'store-verify-marketing', 'run-verify', 'trailform', 'portable gym equipment',
  'http://localhost:4001', 4001, 'live', new Date().toISOString(),
  JSON.stringify({
    brand_name: 'Trailform',
    slogan: 'Gear that survives the gym bag',
    products: [
      { id: 'p1', title: 'Resistance Band Set 5-Piece', price: 24.95, productType: 'resistance band', image: '' },
      { id: 'p2', title: 'Steel Jump Rope 3m', price: 18.95, productType: 'jump rope', image: '' },
    ],
  }),
)
console.log('store geseed in', process.env.DATABASE_PATH)
