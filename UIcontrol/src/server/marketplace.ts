// ═══════ Clynado — publiek kopers-dashboard (apex clynado.com) ═══════
// Dit is NIET het admin-dashboard. Het admin-dashboard blijft op
// api.clynado.com achter de 2FA-gate; dit is de etalage die iedereen mag zien:
// alle live stores, doorzoekbaar en gefilterd op categorie, plus een deals-strip
// die vanuit het admin-dashboard beheerd wordt.
//
// Waarom in dezelfde Express-app en niet een losse Next-app: de data zit hier al
// (dezelfde SQLite-verbinding), er komt geen extra PM2-proces bij, en een store
// die deployt of verdwijnt verschijnt of verdwijnt vanzelf — geen synchronisatie
// tussen twee processen die uit de pas kan lopen.
//
// De pagina is server-rendered HTML zonder build-stap, net als de auth-pagina's.
// Dat maakt hem met `curl` te verifiëren en zonder JavaScript bruikbaar; het
// filteren erbovenop is progressive enhancement.

import type { Express, Request, Response } from 'express'
import db from './db.js'
import { iconThemeFor, type IconTheme } from './design/components/icons.js'

// ── Deals (beheerd vanuit het admin-dashboard) ────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS market_deals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id    TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL,
    subtitle    TEXT NOT NULL DEFAULT '',
    label       TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    starts_at   TEXT,
    ends_at     TEXT,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_market_deals_active ON market_deals(active, sort_order);
`)

export interface Deal {
  id: number
  storeId: string
  title: string
  subtitle: string
  label: string
  url: string
  active: boolean
  sortOrder: number
  startsAt: string | null
  endsAt: string | null
}

interface DealRow {
  id: number; store_id: string; title: string; subtitle: string; label: string
  url: string; active: number; sort_order: number; starts_at: string | null; ends_at: string | null
}

const toDeal = (r: DealRow): Deal => ({
  id: r.id, storeId: r.store_id, title: r.title, subtitle: r.subtitle, label: r.label,
  url: r.url, active: r.active === 1, sortOrder: r.sort_order, startsAt: r.starts_at, endsAt: r.ends_at,
})

export function listDeals(onlyActive: boolean): Deal[] {
  try {
    const rows = db.prepare(
      `SELECT * FROM market_deals ${onlyActive ? 'WHERE active = 1' : ''} ORDER BY sort_order ASC, id DESC`,
    ).all() as DealRow[]
    const deals = rows.map(toDeal)
    if (!onlyActive) return deals
    // Een deal met een venster telt alleen binnen dat venster. De check hoort
    // hier en niet in SQL: dan geldt hij ook voor deals die via de admin-API
    // worden opgehaald om te tonen wat er nú live staat.
    const now = new Date().toISOString()
    return deals.filter(d => (!d.startsAt || d.startsAt <= now) && (!d.endsAt || d.endsAt >= now))
  } catch { return [] }
}

export function upsertDeal(input: Partial<Deal> & { title: string }): Deal | null {
  const now = new Date().toISOString()
  try {
    if (input.id) {
      db.prepare(`
        UPDATE market_deals SET store_id=?, title=?, subtitle=?, label=?, url=?, active=?, sort_order=?, starts_at=?, ends_at=?
        WHERE id=?
      `).run(input.storeId ?? '', input.title, input.subtitle ?? '', input.label ?? '', input.url ?? '',
        input.active === false ? 0 : 1, input.sortOrder ?? 0, input.startsAt ?? null, input.endsAt ?? null, input.id)
      const row = db.prepare(`SELECT * FROM market_deals WHERE id = ?`).get(input.id) as DealRow | undefined
      return row ? toDeal(row) : null
    }
    const info = db.prepare(`
      INSERT INTO market_deals (store_id, title, subtitle, label, url, active, sort_order, starts_at, ends_at, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(input.storeId ?? '', input.title, input.subtitle ?? '', input.label ?? '', input.url ?? '',
      input.active === false ? 0 : 1, input.sortOrder ?? 0, input.startsAt ?? null, input.endsAt ?? null, now)
    const row = db.prepare(`SELECT * FROM market_deals WHERE id = ?`).get(info.lastInsertRowid) as DealRow | undefined
    return row ? toDeal(row) : null
  } catch (err) {
    console.error('[marketplace] upsertDeal failed:', err)
    return null
  }
}

export function deleteDeal(id: number): boolean {
  try { return db.prepare(`DELETE FROM market_deals WHERE id = ?`).run(id).changes > 0 }
  catch { return false }
}

// ── Publieke store-lijst ──────────────────────────────────────────────────────

/** Nederlandse labels voor de categorieën die iconThemeFor oplevert. */
export const CATEGORY_LABELS: Record<IconTheme, string> = {
  sport: 'Sport', wellness: 'Wellness', home: 'Huishouden', tech: 'Tech',
  fashion: 'Mode', outdoor: 'Outdoor', kids: 'Kids', pets: 'Dieren',
  beauty: 'Beauty', kitchen: 'Keuken', universal: 'Overig',
}

export interface PublicStore {
  storeId: string
  subdomain: string
  brand: string
  niche: string
  category: IconTheme
  categoryLabel: string
  url: string
  thumbnail: string
  colors: { primary: string; accent: string }
  createdAt: string
}

interface StoreRow {
  store_id: string; subdomein: string; niche: string; preview_url: string
  created_at: string; status: string; store_data: string | null
}

function baseDomain(): string {
  return process.env.STORE_BASE_DOMAIN || 'clynado.com'
}

/** Zet een subdomein-slug om naar iets leesbaars als er geen merknaam bekend is. */
function titleFromSlug(slug: string): string {
  return slug.split('-').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * De live stores, zoals een bezoeker ze hoort te zien. Alleen `status = 'live'`
 * — een store die gebouwd wordt of gefaald is hoort niet in de etalage.
 *
 * Merknaam, kleuren en het eerste productbeeld komen uit `store_data` (de JSON
 * die de pipeline bij het deployen wegschrijft). Ontbreekt die, dan valt alles
 * terug op iets bruikbaars; een store zonder beeld toont een kleurvlak in plaats
 * van een kapot plaatje.
 */
export function listPublicStores(): PublicStore[] {
  let rows: StoreRow[] = []
  try {
    rows = db.prepare(`
      SELECT store_id, subdomein, niche, preview_url, created_at, status, store_data
      FROM stores WHERE status = 'live' ORDER BY created_at DESC
    `).all() as StoreRow[]
  } catch { return [] }

  const domain = baseDomain()
  return rows.map(r => {
    let brand = ''
    let thumbnail = ''
    let primary = '#1d2433'
    let accent = '#e0653a'
    if (r.store_data) {
      try {
        const sd = JSON.parse(r.store_data) as Record<string, unknown>
        brand = String(sd.brand_name ?? sd.brandName ?? '') || ''
        const colors = sd.colors as Record<string, string> | undefined
        if (colors?.primary) primary = colors.primary
        if (colors?.accent) accent = colors.accent
        else if (typeof sd.primary_color === 'string') primary = sd.primary_color
        const prods = sd.products as Array<{ image?: string }> | undefined
        thumbnail = prods?.find(p => p.image)?.image ?? ''
      } catch { /* store_data corrupt → alle fallbacks blijven staan */ }
    }
    const category = iconThemeFor(r.niche)
    return {
      storeId: r.store_id,
      subdomain: r.subdomein,
      brand: brand || titleFromSlug(r.subdomein),
      niche: r.niche,
      category,
      categoryLabel: CATEGORY_LABELS[category],
      url: `https://${r.subdomein}.${domain}/`,
      thumbnail,
      colors: { primary, accent },
      createdAt: r.created_at,
    }
  })
}

// ── HTML ──────────────────────────────────────────────────────────────────────

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function pageCss(): string {
  return `
:root{
  --ink:#12151c; --ink-soft:#39404f; --line:#e3e6ec; --paper:#ffffff; --wash:#f6f7f9;
  --brand:#1b3a6b; --brand-soft:#eaf0fa; --accent:#d1552f; --radius:14px;
  --shadow:0 1px 2px rgba(18,21,28,.05), 0 12px 28px -18px rgba(18,21,28,.35);
}
*{box-sizing:border-box}
body{margin:0;background:var(--wash);color:var(--ink);
  font-family:'Inter var','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%}
:focus-visible{outline:2px solid var(--brand);outline-offset:3px;border-radius:4px}
.wrap{max-width:1180px;margin:0 auto;padding:0 clamp(1rem,4vw,2rem)}

header.top{background:var(--paper);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10}
.top-in{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 0}
.mark{display:flex;align-items:center;gap:.65rem;font-weight:700;letter-spacing:-.02em;font-size:1.12rem}
.mark .dot{width:26px;height:26px;border-radius:8px;background:var(--brand);color:#fff;display:grid;place-items:center;font-size:.7rem;font-weight:800}
.top-note{color:var(--ink-soft);font-size:.82rem}

.hero{padding:clamp(2.2rem,6vw,3.6rem) 0 1.6rem}
.hero h1{font-size:clamp(1.7rem,4vw,2.6rem);line-height:1.15;letter-spacing:-.025em;margin:0 0 .6rem;max-width:20ch}
.hero p{color:var(--ink-soft);margin:0;max-width:56ch;font-size:1.02rem}

.deals{margin:1.6rem 0 .4rem}
.deals h2,.stores h2{font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-soft);margin:0 0 .9rem;font-weight:700}
.deal-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:.9rem}
.deal{background:var(--brand);color:#fff;border-radius:var(--radius);padding:1.1rem 1.2rem;display:flex;flex-direction:column;gap:.3rem;min-height:104px;transition:transform .2s,box-shadow .2s}
.deal:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.deal .tag{align-self:flex-start;background:var(--accent);color:#fff;font-size:.63rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:.2rem .5rem;border-radius:6px;margin-bottom:.35rem}
.deal b{font-size:1.02rem;font-weight:650;letter-spacing:-.01em}
.deal span.sub{opacity:.78;font-size:.85rem}

.controls{display:flex;gap:.7rem;align-items:center;flex-wrap:wrap;margin:1.8rem 0 1.1rem}
.search{flex:1 1 260px;position:relative}
.search input{width:100%;padding:.68rem .9rem .68rem 2.3rem;border:1px solid var(--line);border-radius:10px;background:var(--paper);font:inherit;font-size:.92rem;color:var(--ink)}
.search svg{position:absolute;left:.75rem;top:50%;transform:translateY(-50%);color:var(--ink-soft)}
.chips{display:flex;gap:.4rem;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--paper);color:var(--ink-soft);font:inherit;font-size:.82rem;font-weight:550;padding:.45rem .85rem;border-radius:999px;cursor:pointer;transition:all .16s}
.chip:hover{border-color:var(--brand);color:var(--brand)}
.chip[aria-pressed="true"]{background:var(--brand);border-color:var(--brand);color:#fff}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1.1rem;padding-bottom:3rem}
.card{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column;transition:transform .22s cubic-bezier(.22,1,.36,1),box-shadow .22s,border-color .22s}
.card:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:#cfd5df}
.thumb{aspect-ratio:16/10;position:relative;overflow:hidden;background:var(--wash)}
.thumb img{width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.22,1,.36,1)}
.card:hover .thumb img{transform:scale(1.04)}
.thumb .fallback{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-weight:700;font-size:1.5rem;letter-spacing:-.02em}
.badge{position:absolute;top:.6rem;left:.6rem;background:rgba(255,255,255,.94);color:var(--ink);font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:.26rem .55rem;border-radius:6px}
.card .body{padding:.95rem 1rem 1.1rem;display:flex;flex-direction:column;gap:.25rem;flex:1}
.card h3{margin:0;font-size:1rem;font-weight:650;letter-spacing:-.01em}
.card .niche{color:var(--ink-soft);font-size:.84rem;flex:1}
.card .go{margin-top:.6rem;font-size:.82rem;font-weight:600;color:var(--brand);display:inline-flex;align-items:center;gap:.3rem}

.empty{grid-column:1/-1;text-align:center;padding:3.5rem 1rem;color:var(--ink-soft);background:var(--paper);border:1px dashed var(--line);border-radius:var(--radius)}
footer.foot{border-top:1px solid var(--line);background:var(--paper);padding:1.6rem 0;color:var(--ink-soft);font-size:.82rem}
.foot-in{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}

@media(prefers-reduced-motion:reduce){*{transition:none !important;animation:none !important}}
@media(prefers-color-scheme:dark){
  :root{--ink:#eef1f6;--ink-soft:#9aa3b4;--line:#242a35;--paper:#141922;--wash:#0e1219;--brand:#6f9ae0;--brand-soft:#1a2434;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 14px 30px -18px rgba(0,0,0,.8)}
  .deal{color:#0e1219}
  .badge{background:rgba(20,25,34,.92);color:#eef1f6}
}
`.trim()
}

function storeCard(s: PublicStore): string {
  const initials = s.brand.split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase() || '?'
  // Het kleurvlak staat er ALTIJD onder, ook als er een afbeelding is. Een
  // productbeeld komt van de leverancier en kan zonder waarschuwing verdwijnen;
  // zonder deze laag zou de kaart dan een leeg gat tonen in plaats van een
  // herkenbaar merkvlak. De <img> dekt hem af zolang hij laadt.
  const fallback = `<span class="fallback" style="background:linear-gradient(135deg, ${esc(s.colors.primary)}, ${esc(s.colors.accent)})">${esc(initials)}</span>`
  const img = s.thumbnail
    ? `<img src="${esc(s.thumbnail)}" alt="" loading="lazy" onerror="this.remove()" />`
    : ''
  return `<a class="card" href="${esc(s.url)}" data-cat="${esc(s.category)}" data-text="${esc((s.brand + ' ' + s.niche + ' ' + s.categoryLabel).toLowerCase())}">
  <div class="thumb">${fallback}${img}<span class="badge">${esc(s.categoryLabel)}</span></div>
  <div class="body">
    <h3>${esc(s.brand)}</h3>
    <span class="niche">${esc(s.niche)}</span>
    <span class="go">Bekijk winkel <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
  </div>
</a>`
}

function dealCard(d: Deal, storeById: Map<string, PublicStore>): string {
  const href = d.url || storeById.get(d.storeId)?.url || '#'
  return `<a class="deal" href="${esc(href)}">
  ${d.label ? `<span class="tag">${esc(d.label)}</span>` : ''}
  <b>${esc(d.title)}</b>
  ${d.subtitle ? `<span class="sub">${esc(d.subtitle)}</span>` : ''}
</a>`
}

export function renderMarketplace(): string {
  const stores = listPublicStores()
  const deals = listDeals(true)
  const byId = new Map(stores.map(s => [s.storeId, s]))

  // Alleen categorieën tonen waar ook echt een winkel in zit — lege filters
  // geven de indruk dat er iets kapot is.
  const cats = [...new Set(stores.map(s => s.category))]
    .map(c => ({ id: c, label: CATEGORY_LABELS[c], n: stores.filter(s => s.category === c).length }))
    .sort((a, b) => b.n - a.n)

  const grid = stores.length
    ? stores.map(storeCard).join('\n')
    : `<div class="empty"><b>Nog geen winkels online.</b><br />Zodra de eerste winkel live gaat, verschijnt hij hier vanzelf.</div>`

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Clynado — alle winkels op één plek</title>
<meta name="description" content="Ontdek alle Clynado-winkels: sport, wellness, huishouden, tech en meer. Verzonden vanuit Europa." />
<meta name="robots" content="index,follow" />
<style>${pageCss()}</style>
</head>
<body>
<header class="top">
  <div class="wrap top-in">
    <a class="mark" href="/"><span class="dot">C</span> Clynado</a>
    <span class="top-note">${stores.length} ${stores.length === 1 ? 'winkel' : 'winkels'} online</span>
  </div>
</header>

<main class="wrap">
  <section class="hero">
    <h1>Alle Clynado-winkels op één plek</h1>
    <p>Elke winkel is gespecialiseerd in één ding. Verzending vanuit Europese magazijnen, 30 dagen retour, betalen via Stripe.</p>
  </section>

  ${deals.length ? `<section class="deals">
    <h2>Uitgelicht</h2>
    <div class="deal-row">${deals.map(d => dealCard(d, byId)).join('\n')}</div>
  </section>` : ''}

  <section class="stores">
    <div class="controls">
      <div class="search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="q" type="search" placeholder="Zoek op winkel, product of categorie" aria-label="Zoeken" autocomplete="off" />
      </div>
      <div class="chips" id="chips">
        <button class="chip" type="button" data-cat="" aria-pressed="true">Alles (${stores.length})</button>
        ${cats.map(c => `<button class="chip" type="button" data-cat="${esc(c.id)}" aria-pressed="false">${esc(c.label)} (${c.n})</button>`).join('')}
      </div>
    </div>
    <div class="grid" id="grid">${grid}</div>
  </section>
</main>

<footer class="foot"><div class="wrap foot-in">
  <span>&copy; ${new Date().getFullYear()} Clynado</span>
  <span>Verzonden vanuit Europa &middot; 30 dagen retour</span>
</div></footer>

<script>
// Filteren is progressive enhancement: zonder JS staat de volledige lijst er al.
(function(){
  var q = document.getElementById('q');
  var grid = document.getElementById('grid');
  var chips = Array.prototype.slice.call(document.querySelectorAll('#chips .chip'));
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));
  var cat = '';
  var empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = 'Geen winkels gevonden. Probeer een andere zoekterm.';
  function apply(){
    var term = (q.value || '').trim().toLowerCase();
    var shown = 0;
    cards.forEach(function(c){
      var ok = (!cat || c.getAttribute('data-cat') === cat)
            && (!term || c.getAttribute('data-text').indexOf(term) !== -1);
      c.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    if (!shown && !empty.parentNode) grid.appendChild(empty);
    if (shown && empty.parentNode) grid.removeChild(empty);
  }
  q.addEventListener('input', apply);
  chips.forEach(function(b){
    b.addEventListener('click', function(){
      cat = b.getAttribute('data-cat') || '';
      chips.forEach(function(o){ o.setAttribute('aria-pressed', String(o === b)); });
      apply();
    });
  });
})();
</script>
</body>
</html>`
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * Publieke routes. MOETEN vóór `requireAuth` gemount worden en in `isPublicPath`
 * staan — dit is de enige plek in de app die bewust voor iedereen open is.
 */
export function registerMarketplaceRoutes(app: Express): void {
  const html = (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    // Kort cachen: nieuwe stores moeten snel zichtbaar zijn, maar een
    // refresh-storm hoeft de database niet te raken.
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(renderMarketplace())
  }
  app.get('/market', html)
  app.get('/market/', html)

  app.get('/api/market/stores', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.json(listPublicStores())
  })
  app.get('/api/market/deals', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.json(listDeals(true))
  })
}
