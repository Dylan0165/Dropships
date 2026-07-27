import './marketplace.js'
import db from './db.js'
const now = new Date().toISOString()
const STORES = [
  { id: 'mkt-test-1', sub: 'trailform', niche: 'portable gym equipment', brand: 'Trailform', colors: { primary: '#1f2a44', accent: '#e2683c' }, img: 'https://example.invalid/gym.jpg' },
  { id: 'mkt-test-2', sub: 'mealkind', niche: 'kitchen prep tools', brand: 'Mealkind', colors: { primary: '#2d4032', accent: '#c8a33e' }, img: 'https://example.invalid/kitchen.jpg' },
  { id: 'mkt-test-3', sub: 'nightwell', niche: 'sleep and wellness aids', brand: 'Nightwell', colors: { primary: '#332b46', accent: '#8f7fd0' }, img: '' },
]
db.prepare(`INSERT OR IGNORE INTO runs (run_id, niche, status, started_at, updated_at) VALUES ('mkt-test-run','market test','completed',?,?)`).run(now, now)
for (const s of STORES) {
  db.prepare(`INSERT OR REPLACE INTO stores (store_id, run_id, subdomein, niche, preview_url, created_at, status, port, store_data) VALUES (?,?,?,?,?,?, 'live', NULL, ?)`)
    .run(s.id, 'mkt-test-run', s.sub, s.niche, `https://${s.sub}.clynado.com/`, now,
      JSON.stringify({ brand_name: s.brand, colors: s.colors, products: s.img ? [{ image: s.img }] : [] }))
}
db.prepare(`DELETE FROM market_deals WHERE title LIKE 'TEST %'`).run()
db.prepare(`INSERT INTO market_deals (store_id,title,subtitle,label,url,active,sort_order,created_at) VALUES (?,?,?,?,?,1,0,?)`).run('mkt-test-1','TEST Winterkorting op trainingsmatten','Deze week, zolang de voorraad strekt','-20%','',now)
db.prepare(`INSERT INTO market_deals (store_id,title,subtitle,label,url,active,sort_order,created_at) VALUES (?,?,?,?,?,1,1,?)`).run('mkt-test-2','TEST Gratis verzending op keukensets','Vanaf 40 euro','Gratis verzending','',now)
db.prepare(`INSERT INTO market_deals (store_id,title,subtitle,label,url,active,sort_order,created_at) VALUES (?,?,?,?,?,0,2,?)`).run('','TEST Verborgen deal','mag niet zichtbaar zijn','GEHEIM','',now)
console.log('geseed: 3 live stores, 3 deals (1 inactief)')
