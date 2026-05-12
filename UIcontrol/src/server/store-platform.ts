/**
 * Store deployment platform.
 *
 * Two modes:
 *   - LOCAL  (default, no STORE_SERVER_HOST set):
 *       Writes a generated static store to ./data/stores/{subdomain}/ and serves
 *       it from http://localhost:{PLATFORM_PORT}/preview/{subdomain}.
 *       status = 'local'.
 *
 *   - REMOTE (STORE_SERVER_HOST set):
 *       Generates a Next.js project scaffold in the OS tmp dir, runs
 *       `npm install && next build`, scp's the build artefacts to the store VPS,
 *       writes an nginx vhost, and reloads nginx via SSH.
 *       status = 'live'.
 *
 * Templates are copied from Websitecomponentscodes/ and have these placeholders
 * replaced: {{BRAND_NAME}}, {{SLOGAN}}, {{PRIMARY_COLOR}}, {{PRODUCTS_JSON}}.
 */
import 'dotenv/config'
import express from 'express'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import db, { saveAgentOutput as _saveAgentOutput } from './db.js'
void _saveAgentOutput

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../../../')
const COMPONENTS_DIR = path.join(workspaceRoot, 'Websitecomponentscodes')

const PORT = parseInt(process.env.PLATFORM_PORT ?? '3002', 10)
const STORE_SERVER_HOST = process.env.STORE_SERVER_HOST || ''
const STORE_SERVER_USER = process.env.STORE_SERVER_USER || 'deploy'
const STORE_SSH_KEY_PATH = process.env.STORE_SSH_KEY_PATH || ''
const STORE_BASE_DOMAIN = process.env.STORE_BASE_DOMAIN || 'localhost'
const LOCAL_STORES_DIR = path.resolve(workspaceRoot, 'UIcontrol/data/stores')
const TMP_BUILD_DIR = path.join(os.tmpdir(), 'stores')

// Max producten per store — branded stores zijn focused, geen catalogus
const MAX_PRODUCTS_PER_STORE = parseInt(process.env.MAX_PRODUCTS_PER_STORE ?? '3', 10)

const COMPONENT_NAMES = [
  'navigation',
  'hero-banner',
  'usp-section',
  'product-grid',
  'social-proof',
  'checkout-flow',
  'footer',
  'announcement-bar',
  'countdown-timer',
  'trust-badges',
  'review-card',
] as const

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreProduct {
  id: string
  title: string
  image: string
  price: number
  compareAtPrice?: number
  badge?: string
}

export interface StoreData {
  brand_name: string
  niche: string
  slogan: string
  primary_color?: string   // hex, e.g. '#7c3aed'
  products: StoreProduct[]
  subdomain?: string       // optional override; auto-generated from brand_name otherwise
  runId?: string           // optional pipeline run association
  storeId?: string         // pre-assigned store ID (filled in after uuid generation)
  checkoutUrl?: string     // Mollie checkout URL — replaces {{CHECKOUT_URL}}
  imageUrls?: string[]     // Flux image URLs — replaces {{PRODUCT_IMAGE_1}} etc.
}

export interface DeployedStore {
  storeId: string
  subdomain: string
  niche: string
  status: 'local' | 'live' | 'building' | 'failed'
  previewUrl: string
  filesPath: string
  createdAt: string
  errorMessage?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'store'
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function rmDirRecursive(p: string): void {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

function applyPlaceholders(content: string, data: StoreData & { _storeId?: string }): string {
  const imgs = data.imageUrls ?? []
  return content
    .replace(/\{\{BRAND_NAME\}\}/g, data.brand_name)
    .replace(/\{\{SLOGAN\}\}/g, data.slogan)
    .replace(/\{\{PRIMARY_COLOR\}\}/g, data.primary_color || '#7c3aed')
    .replace(/\{\{NICHE\}\}/g, data.niche)
    .replace(/\{\{PRODUCTS_JSON\}\}/g, JSON.stringify(data.products))
    .replace(/\{\{STORE_ID\}\}/g, data._storeId ?? data.storeId ?? '')
    .replace(/\{\{CHECKOUT_URL\}\}/g, data.checkoutUrl ?? '#checkout')
    .replace(/\{\{PRODUCT_IMAGE_1\}\}/g, imgs[0] ?? '')
    .replace(/\{\{PRODUCT_IMAGE_2\}\}/g, imgs[1] ?? '')
    .replace(/\{\{PRODUCT_IMAGE_3\}\}/g, imgs[2] ?? '')
}

function copyComponents(targetDir: string, data: StoreData & { _storeId?: string }): void {
  const componentsTarget = path.join(targetDir, 'components')
  ensureDir(componentsTarget)

  // Kopieer de shared/ map (checkout.ts, types.ts, etc.) die door componenten wordt geïmporteerd
  const sharedSrc = path.join(COMPONENTS_DIR, 'shared')
  if (fs.existsSync(sharedSrc)) {
    const sharedDest = path.join(componentsTarget, 'shared')
    ensureDir(sharedDest)
    for (const file of fs.readdirSync(sharedSrc)) {
      const srcFile = path.join(sharedSrc, file)
      if (!fs.statSync(srcFile).isFile()) continue
      fs.copyFileSync(srcFile, path.join(sharedDest, file))
    }
  }

  for (const compName of COMPONENT_NAMES) {
    const src = path.join(COMPONENTS_DIR, compName)
    if (!fs.existsSync(src)) {
      console.warn(`[store-platform] component missing: ${src}`)
      continue
    }
    const dest = path.join(componentsTarget, compName)
    ensureDir(dest)
    for (const file of fs.readdirSync(src)) {
      const srcFile = path.join(src, file)
      if (!fs.statSync(srcFile).isFile()) continue
      const ext = path.extname(file).toLowerCase()
      if (!['.tsx', '.ts', '.jsx', '.js', '.css', '.md'].includes(ext)) continue
      const raw = fs.readFileSync(srcFile, 'utf-8')
      fs.writeFileSync(path.join(dest, file), applyPlaceholders(raw, data), 'utf-8')
    }
  }
}

// ── Layout + Font System ──────────────────────────────────────────────────────
// Each niche deterministically maps to a layout so the same niche always
// produces the same visual identity, but different niches look distinct.

function selectLayout(niche: string): number {
  return niche.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 5
}

const FONT_PAIRINGS = [
  { // 0 Studio — geometric, bold, modern
    url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap',
    heading: "'Space Grotesk', sans-serif", body: "'DM Sans', system-ui, sans-serif",
  },
  { // 1 Maison — editorial, luxury, serif
    url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700&display=swap',
    heading: "'Playfair Display', Georgia, serif", body: "'Lato', system-ui, sans-serif",
  },
  { // 2 Volt — high energy, sport
    url: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Outfit:wght@300;400;500;600&display=swap',
    heading: "'Syne', sans-serif", body: "'Outfit', system-ui, sans-serif",
  },
  { // 3 Pure — minimal, Scandinavian clean
    url: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400&display=swap',
    heading: "'DM Serif Display', Georgia, serif", body: "'DM Sans', system-ui, sans-serif",
  },
  { // 4 Origin — warm, organic, lifestyle
    url: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;1,9..144,400&family=Figtree:wght@300;400;600&display=swap',
    heading: "'Fraunces', Georgia, serif", body: "'Figtree', system-ui, sans-serif",
  },
]

function nicheUsps(niche: string): Array<{title: string; desc: string}> {
  const n = niche.toLowerCase()
  if (/fit|sport|gym|yoga|train|workout|muscle|run/.test(n)) return [
    { title: '30-daagse garantie', desc: 'Geen resultaat? Volledig terugbetaald.' },
    { title: '10.000+ sporters', desc: 'Getest en goedgekeurd door actieve atleten.' },
    { title: 'Morgen in huis', desc: 'Besteld voor 23:00, geleverd in NL & BE.' },
  ]
  if (/blend|juice|food|drink|nutri|coffee|tea|protein/.test(n)) return [
    { title: 'BPA-vrij materiaal', desc: 'Gecertificeerd levensmiddelenveilig.' },
    { title: 'Overal mee naartoe', desc: 'Thuis, kantoor of onderweg.' },
    { title: 'Gratis receptenboek', desc: 'Exclusief bij elke bestelling.' },
  ]
  if (/beauty|skin|hair|face|glow|serum|cosmetic/.test(n)) return [
    { title: 'Dermatologisch getest', desc: 'Veilig voor alle huidtypes.' },
    { title: 'Clean formula', desc: 'Vrij van parabenen en sulfaten.' },
    { title: '60 dagen zichtbaar resultaat', desc: 'Of we betalen je terug.' },
  ]
  if (/tech|gadget|smart|device|cable|charge|phone/.test(n)) return [
    { title: '2 jaar garantie', desc: 'Volledige fabrieksgarantie inbegrepen.' },
    { title: 'Plug & play', desc: 'Direct klaar voor gebruik.' },
    { title: 'Support binnen 24u', desc: 'Ons team staat altijd klaar.' },
  ]
  if (/home|kitchen|house|living|decor|garden/.test(n)) return [
    { title: 'Premium kwaliteit', desc: 'Materialen die jaren meegaan.' },
    { title: 'Tijloos design', desc: 'Past bij elke interieurstijl.' },
    { title: 'Gratis retour', desc: '30 dagen bedenktijd.' },
  ]
  return [
    { title: 'Gratis verzending', desc: 'Op alle bestellingen in NL & BE.' },
    { title: '30 dagen retour', desc: 'Geen gedoe, geld terug.' },
    { title: 'Veilig betalen', desc: 'iDEAL, Visa, Mastercard, PayPal.' },
  ]
}

// SVG icons for inline USP sections (no emoji)
const SVG_TRUCK = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>`
const SVG_RETURN = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>`
const SVG_SHIELD = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>`

function generatePageTsx(layout: number, data: StoreData, usps: Array<{title: string; desc: string}>, primary: string, secondary = '#1e293b', accent = '#f59e0b'): string {
  const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const bn     = JSON.stringify(data.brand_name)
  const sl     = JSON.stringify(data.slogan)
  const prods  = JSON.stringify(data.products, null, 2)
  const nav    = JSON.stringify([{ label: 'Home', href: '/' }, { label: 'Shop', href: '#products' }])
  const footer = JSON.stringify([
    { title: 'Informatie', links: [{ label: 'Over ons', href: '/over' }, { label: 'Contact', href: '/contact' }] },
    { title: 'Service', links: [{ label: 'Retourneren', href: '/retour' }, { label: 'FAQ', href: '/faq' }] },
  ])
  const reviews = JSON.stringify([
    { id: '1', name: 'Sanne V.', stars: 5, rating: 5, date: '2025-04-12', text: 'Geweldig product, exact wat ik zocht. Snelle levering en nette verpakking!', verified: true },
    { id: '2', name: 'Thomas B.', stars: 5, rating: 5, date: '2025-04-08', text: 'Topkwaliteit. Mijn verwachtingen volledig overtroffen — zeker een aanrader.', verified: true },
    { id: '3', name: 'Lena M.', stars: 4, rating: 4, date: '2025-03-28', text: 'Blij mee! Zou graag meer kleuropties zien, maar voor de rest prima.', verified: false },
  ])
  const year = new Date().getFullYear()

  // ─────────────────────────────────────────────────────────────────────────────
  // LAYOUT 0 — NOIR
  // Pure black editorial. Giant vw-based headline. Inline dark product cards.
  // Inspired by Nike SNKRS / Apple dark mode product pages.
  // ─────────────────────────────────────────────────────────────────────────────
  if (layout === 0) return `'use client';
import { initiateCheckout } from '../components/shared/checkout';

interface Product { id: string; title: string; image: string; price: number; compareAtPrice?: number; badge?: string; description?: string }
const products: Product[] = ${prods};

export default function Home() {
  const buy = async (p: Product) => {
    await initiateCheckout([{ id: p.id, title: p.title, price: p.price, quantity: 1, image: p.image }]);
  };
  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', fontFamily: 'inherit' }}>

      {/* ── Nav ── */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-0.03em' }}>${esc(data.brand_name).toUpperCase()}</span>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <a href="#products" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', textDecoration: 'none' }}>Shop</a>
          <a href="/contact" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', textDecoration: 'none' }}>Contact</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ minHeight: '90vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 2.5rem 5rem' }}>
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.65rem', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: '2rem' }}>Nieuw Binnen — ${year}</p>
        <h1 style={{ fontSize: 'clamp(3.5rem,11vw,9rem)', fontWeight: 900, lineHeight: 0.88, letterSpacing: '-0.04em', margin: '0 0 3rem', maxWidth: '14ch' }}>
          ${esc(data.brand_name)}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3rem', flexWrap: 'wrap' }}>
          <a href="#products" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', background: '${primary}', color: '#fff', fontWeight: 700, padding: '1rem 2.5rem', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', textDecoration: 'none' }}>
            Shop Nu <span>→</span>
          </a>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', maxWidth: '28ch', lineHeight: 1.6, margin: 0 }}>${data.slogan}</p>
        </div>
      </section>

      {/* ── USP ticker ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '1rem 2.5rem', display: 'flex', gap: '4rem', overflowX: 'auto' }}>
        ${usps.map(u => `<span style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>${u.title}</span>`).join('')}
      </div>

      {/* ── Products ── */}
      <section id="products" style={{ padding: '5rem 2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 900, margin: 0 }}>Collectie</h2>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem', letterSpacing: '0.15em' }}>{products.length} ITEMS</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '1.5rem' }}>
          {products.map((p, i) => (
            <div key={i} onClick={() => buy(p)} style={{ cursor: 'pointer' }}>
              <div style={{ aspectRatio: '1/1', background: '#111', overflow: 'hidden', position: 'relative', marginBottom: '1rem' }}>
                {p.image && <img src={p.image} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s ease' }}
                  onMouseEnter={e => (e.currentTarget.style.transform='scale(1.06)')}
                  onMouseLeave={e => (e.currentTarget.style.transform='scale(1)')} />}
                {p.badge && <span style={{ position: 'absolute', top: '0.75rem', left: '0.75rem', background: '${primary}', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '0.25rem 0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{p.badge}</span>}
              </div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.05em' }}>{p.title}</p>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>€{p.price.toFixed(2)}</span>
                {p.compareAtPrice && <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem', textDecoration: 'line-through' }}>€{p.compareAtPrice.toFixed(2)}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Reviews ── */}
      <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '5rem 2.5rem', background: '#0a0a0a' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '3rem', letterSpacing: '-0.02em' }}>Wat klanten zeggen</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '2rem' }}>
          {[{n:'Sanne V.',s:5,t:'Geweldig product, exact wat ik zocht.',v:true},{n:'Thomas B.',s:5,t:'Topkwaliteit — zeker een aanrader.',v:true},{n:'Lena M.',s:4,t:'Blij mee! Snelle levering.',v:false}].map((r,i) => (
            <div key={i} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.06)', padding: '1.75rem' }}>
              <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem' }}>
                {Array.from({length: r.s}).map((_,j) => <span key={j} style={{ color: '${accent}', fontSize: '0.8rem' }}>★</span>)}
              </div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1rem' }}>{r.t}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{r.n}</span>
                {r.v && <span style={{ color: '${primary}', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Geverifieerd</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '2rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <span style={{ fontWeight: 900, fontSize: '0.9rem', letterSpacing: '-0.02em' }}>${esc(data.brand_name).toUpperCase()}</span>
        <div style={{ display: 'flex', gap: '2rem' }}>
          {[['Over ons','/over'],['Retour','/retour'],['Contact','/contact'],['FAQ','/faq']].map(([l,h]) => (
            <a key={l} href={h} style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' }}>{l}</a>
          ))}
        </div>
        <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.7rem' }}>© ${year}</span>
      </footer>
    </div>
  );
}
`

  // ─────────────────────────────────────────────────────────────────────────────
  // LAYOUT 1 — BLANC
  // White luxury. Maximum whitespace. Scandinavian/Muji aesthetic.
  // Thin borders, serif display font, editorial product grid.
  // ─────────────────────────────────────────────────────────────────────────────
  if (layout === 1) return `'use client';
interface Product { id: string; title: string; image: string; price: number; compareAtPrice?: number; badge?: string; description?: string }
const products: Product[] = ${prods};

export default function Home() {
  return (
    <div style={{ background: '#fafaf8', color: '#1a1a1a', minHeight: '100vh' }}>

      {/* ── Nav ── */}
      <nav style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '1.25rem 3rem', borderBottom: '1px solid #e8e8e4' }}>
        <div style={{ display: 'flex', gap: '2rem' }}>
          <a href="#products" style={{ color: '#888', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none' }}>Shop</a>
          <a href="/over" style={{ color: '#888', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none' }}>Over ons</a>
        </div>
        <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em', textAlign: 'center' }}>${esc(data.brand_name)}</span>
        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'flex-end' }}>
          <a href="/contact" style={{ color: '#888', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none' }}>Contact</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ padding: '8rem 3rem 6rem', maxWidth: '900px', margin: '0 auto' }}>
        <p style={{ color: '#aaa', fontSize: '0.7rem', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '2rem' }}>Collectie ${year}</p>
        <h1 style={{ fontSize: 'clamp(3rem,7vw,6rem)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 2.5rem', maxWidth: '14ch' }}>
          ${esc(data.brand_name)}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3rem', borderTop: '1px solid #e8e8e4', paddingTop: '2.5rem', flexWrap: 'wrap' }}>
          <p style={{ color: '#666', fontSize: '1.05rem', lineHeight: 1.7, maxWidth: '36ch', margin: 0 }}>${data.slogan}</p>
          <a href="#products" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #1a1a1a', color: '#1a1a1a', fontWeight: 600, padding: '0.875rem 2rem', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Bekijk collectie →
          </a>
        </div>
      </section>

      {/* ── USP row ── */}
      <div style={{ borderTop: '1px solid #e8e8e4', borderBottom: '1px solid #e8e8e4', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
        ${usps.map((u, i) => `
        <div style={{ padding: '2.5rem 3rem', borderRight: i < 2 ? '1px solid #e8e8e4' : 'none' }}>
          <span style={{ display: 'block', color: '#bbb', fontSize: '0.65rem', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>0${i + 1}</span>
          <strong style={{ display: 'block', fontSize: '0.95rem', marginBottom: '0.4rem' }}>${u.title}</strong>
          <span style={{ color: '#888', fontSize: '0.85rem', lineHeight: 1.5 }}>${u.desc}</span>
        </div>`).join('')}
      </div>

      {/* ── Products ── */}
      <section id="products" style={{ padding: '6rem 3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3rem', borderBottom: '1px solid #e8e8e4', paddingBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>De collectie</h2>
          <span style={{ color: '#aaa', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{products.length} producten</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '2rem' }}>
          {products.map((p, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e8e8e4' }}>
              <div style={{ aspectRatio: '1/1', overflow: 'hidden', background: '#f5f5f3' }}>
                {p.image && <img src={p.image} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>{p.title}</h3>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <span style={{ fontWeight: 700 }}>€{p.price.toFixed(2)}</span>
                  {p.compareAtPrice && <span style={{ color: '#aaa', textDecoration: 'line-through', fontSize: '0.85rem' }}>€{p.compareAtPrice.toFixed(2)}</span>}
                </div>
                <button style={{ width: '100%', border: '1px solid #1a1a1a', background: 'transparent', color: '#1a1a1a', fontWeight: 600, padding: '0.875rem', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  In winkelwagen
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Reviews ── */}
      <section style={{ background: '#f2f1ee', padding: '6rem 3rem', borderTop: '1px solid #e8e8e4' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '3rem' }}>Wat onze klanten zeggen</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '2rem' }}>
            {[{n:'Sanne V.',s:5,t:'Geweldig product, exact wat ik zocht.',v:true},{n:'Thomas B.',s:5,t:'Topkwaliteit — zeker een aanrader.',v:true},{n:'Lena M.',s:4,t:'Blij mee! Snelle levering.',v:false}].map((r,i) => (
              <div key={i} style={{ border: '1px solid #e8e8e4', padding: '2rem' }}>
                <div style={{ display: 'flex', gap: '0.2rem', marginBottom: '1rem' }}>
                  {Array.from({length: r.s}).map((_,j) => <span key={j} style={{ color: '#c9a84c', fontSize: '0.9rem' }}>★</span>)}
                </div>
                <p style={{ color: '#555', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1rem' }}>{r.t}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.n}</span>
                  {r.v && <span style={{ color: '#aaa', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Geverifieerd</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid #e8e8e4', padding: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', background: '#fafaf8' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>${esc(data.brand_name)}</span>
        <div style={{ display: 'flex', gap: '2.5rem' }}>
          {[['Over ons','/over'],['Retour','/retour'],['Contact','/contact'],['FAQ','/faq']].map(([l,h]) => (
            <a key={l} href={h} style={{ color: '#999', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none' }}>{l}</a>
          ))}
        </div>
        <span style={{ color: '#ccc', fontSize: '0.75rem' }}>© ${year} ${esc(data.brand_name)}</span>
      </footer>
    </div>
  );
}
`

  // ─────────────────────────────────────────────────────────────────────────────
  // LAYOUT 2 — BOLT
  // Brand-color fills the entire hero. High urgency. Bold Syne typography.
  // Countdown timer + announcement. Streetwear/sport energy.
  // ─────────────────────────────────────────────────────────────────────────────
  if (layout === 2) return `'use client';
import { useState, useEffect } from 'react';

interface Product { id: string; title: string; image: string; price: number; compareAtPrice?: number; badge?: string; description?: string }
const products: Product[] = ${prods};

function Countdown() {
  const end = new Date(Date.now() + 23 * 3600000 + 59 * 60000);
  const [t, setT] = useState(Math.max(0, Math.floor((end.getTime() - Date.now()) / 1000)));
  useEffect(() => { const i = setInterval(() => setT(s => Math.max(0, s - 1)), 1000); return () => clearInterval(i); }, []);
  const h = String(Math.floor(t / 3600)).padStart(2,'0');
  const m = String(Math.floor((t % 3600) / 60)).padStart(2,'0');
  const s = String(t % 60).padStart(2,'0');
  const box = (v: string, l: string) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 'clamp(2rem,5vw,3.5rem)', fontWeight: 900, padding: '1rem 1.5rem', minWidth: '90px', letterSpacing: '-0.03em' }}>{v}</div>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: '0.5rem' }}>{l}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      {box(h,'uur')}<span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '2.5rem', fontWeight: 900, paddingTop: '0.5rem' }}>:</span>
      {box(m,'min')}<span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '2.5rem', fontWeight: 900, paddingTop: '0.5rem' }}>:</span>
      {box(s,'sec')}
    </div>
  );
}

export default function Home() {
  return (
    <div style={{ background: '#fff', color: '#111', minHeight: '100vh' }}>
      <div style={{ background: '#1a1a1a', color: '#fff', textAlign: 'center', padding: '0.6rem', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Tijdelijk: Gratis verzending op alle bestellingen in NL &amp; BE</div>

      {/* ── Hero — full brand color ── */}
      <section style={{ background: '${primary}', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 2.5rem', position: 'relative', overflow: 'hidden' }}>
        {/* Nav inside hero */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2.5rem' }}>
          <span style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>${esc(data.brand_name)}</span>
          <a href="#products" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', textDecoration: 'none' }}>Shop nu</a>
        </div>

        {/* Big headline */}
        <div style={{ maxWidth: '900px', marginTop: '4rem' }}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: '1.5rem' }}>Beperkt aanbod</p>
          <h1 style={{ fontSize: 'clamp(4rem,12vw,10rem)', fontWeight: 900, lineHeight: 0.85, letterSpacing: '-0.05em', color: '#fff', margin: '0 0 2.5rem' }}>
            ${esc(data.brand_name)}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 'clamp(1rem,2vw,1.4rem)', maxWidth: '38ch', lineHeight: 1.5, marginBottom: '3rem' }}>${data.slogan}</p>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <a href="#products" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', background: '#fff', color: '${primary}', fontWeight: 900, padding: '1.1rem 3rem', fontSize: '0.85rem', letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none' }}>
              Shop Nu →
            </a>
            <Countdown />
          </div>
        </div>

        {/* Diagonal accent */}
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '40%', height: '100%', background: 'rgba(0,0,0,0.12)', clipPath: 'polygon(100% 0,100% 100%,0% 100%)', pointerEvents: 'none' }} />
      </section>

      {/* ── USPs ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: '4px solid #111' }}>
        ${usps.map((u, i) => `
        <div style={{ padding: '2.5rem', borderRight: i < 2 ? '1px solid #eee' : 'none', background: i === 1 ? '#f5f5f5' : '#fff' }}>
          <strong style={{ display: 'block', fontSize: '1rem', fontWeight: 900, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>${u.title}</strong>
          <span style={{ color: '#666', fontSize: '0.85rem' }}>${u.desc}</span>
        </div>`).join('')}
      </section>

      {/* ── Products ── */}
      <section id="products" style={{ padding: '5rem 2.5rem' }}>
        <h2 style={{ fontSize: 'clamp(2rem,5vw,3.5rem)', fontWeight: 900, letterSpacing: '-0.04em', textTransform: 'uppercase', marginBottom: '3rem' }}>
          Bestel Nu
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '1.5rem' }}>
          {products.map((p, i) => (
            <div key={i} style={{ border: '2px solid #111', background: '#fff' }}>
              <div style={{ aspectRatio: '1/1', overflow: 'hidden', background: '#f5f5f5', position: 'relative' }}>
                {p.image && <img src={p.image} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                {p.badge && <span style={{ position: 'absolute', top: '0.75rem', left: '0.75rem', background: '${primary}', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '0.25rem 0.6rem', textTransform: 'uppercase' }}>{p.badge}</span>}
              </div>
              <div style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 900, margin: '0 0 0.5rem', textTransform: 'uppercase' }}>{p.title}</h3>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontWeight: 900, fontSize: '1.1rem' }}>€{p.price.toFixed(2)}</span>
                  {p.compareAtPrice && <span style={{ color: '#aaa', textDecoration: 'line-through' }}>€{p.compareAtPrice.toFixed(2)}</span>}
                </div>
                <button style={{ width: '100%', background: '#111', color: '#fff', fontWeight: 900, padding: '0.9rem', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', border: 'none', cursor: 'pointer' }}>
                  Voeg toe
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', padding: '2rem', borderTop: '4px solid #111', flexWrap: 'wrap' }}>
        {[['🔒','Veilig betalen'],['🚚','Gratis verzending'],['↩','30 dagen retour']].map(([icon,text]) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#444', fontSize: '0.85rem', fontWeight: 600 }}>
            <span>{icon}</span><span>{text}</span>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <footer style={{ background: '#111', color: '#fff', padding: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <span style={{ fontWeight: 900, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>${esc(data.brand_name)}</span>
        <div style={{ display: 'flex', gap: '2rem' }}>
          {[['Retour','/retour'],['Contact','/contact'],['FAQ','/faq']].map(([l,h]) => (
            <a key={l} href={h} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none' }}>{l}</a>
          ))}
        </div>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem' }}>© ${year}</span>
      </footer>
    </div>
  );
}
`

  // ─────────────────────────────────────────────────────────────────────────────
  // LAYOUT 3 — DUSK
  // Warm earthy organic. Stone/cream background. Reviews-first layout.
  // Rounded shapes, amber accents, soft shadows. Lifestyle/wellness aesthetic.
  // ─────────────────────────────────────────────────────────────────────────────
  if (layout === 3) return `'use client';
interface Product { id: string; title: string; image: string; price: number; compareAtPrice?: number; badge?: string; description?: string }
const products: Product[] = ${prods};

export default function Home() {
  return (
    <div style={{ background: '#f6f3ee', color: '#2c2416', minHeight: '100vh' }}>

      {/* ── Nav ── */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 2.5rem', background: '#f6f3ee', borderBottom: '1px solid #e5ddd0' }}>
        <div style={{ display: 'flex', gap: '2rem' }}>
          <a href="#products" style={{ color: '#8c7355', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' }}>Shop</a>
          <a href="/over" style={{ color: '#8c7355', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' }}>Over ons</a>
        </div>
        <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>${esc(data.brand_name)}</span>
        <a href="/contact" style={{ color: '#8c7355', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' }}>Contact</a>
      </nav>

      {/* ── Hero ── */}
      <section style={{ padding: '6rem 2.5rem', maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
        <div>
          <span style={{ display: 'inline-block', background: '${accent}', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '0.35rem 1rem', letterSpacing: '0.15em', textTransform: 'uppercase', borderRadius: '100px', marginBottom: '1.5rem' }}>
            Nieuw ${year}
          </span>
          <h1 style={{ fontSize: 'clamp(2.5rem,5vw,4.5rem)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 1.5rem', color: '#1a120a' }}>
            ${esc(data.brand_name)}
          </h1>
          <p style={{ color: '#7a6047', fontSize: '1.1rem', lineHeight: 1.7, maxWidth: '34ch', marginBottom: '2.5rem' }}>${data.slogan}</p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <a href="#products" style={{ background: '#2c2416', color: '#f6f3ee', fontWeight: 600, padding: '0.9rem 2.25rem', fontSize: '0.85rem', letterSpacing: '0.05em', textDecoration: 'none', borderRadius: '100px' }}>
              Shop de collectie
            </a>
            <a href="/over" style={{ border: '1px solid #c8b99a', color: '#7a6047', fontWeight: 500, padding: '0.9rem 2.25rem', fontSize: '0.85rem', textDecoration: 'none', borderRadius: '100px' }}>
              Ons verhaal
            </a>
          </div>
        </div>
        {/* Featured product preview */}
        {products[0] && (
          <div style={{ background: '#ede8df', borderRadius: '24px', aspectRatio: '1/1', overflow: 'hidden', boxShadow: '0 20px 60px rgba(44,36,22,0.12)' }}>
            {products[0].image && <img src={products[0].image} alt={products[0].title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
        )}
      </section>

      {/* ── Reviews first (trust before products) ── */}
      <section style={{ background: '#ede8df', borderTop: '1px solid #e0d5c4', borderBottom: '1px solid #e0d5c4', padding: '4rem 2.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '2rem', color: '#1a120a' }}>Wat klanten zeggen</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '1.5rem' }}>
            {[{n:'Sanne V.',s:5,t:'Geweldig product, exact wat ik zocht.',v:true},{n:'Thomas B.',s:5,t:'Topkwaliteit — zeker een aanrader.',v:true},{n:'Lena M.',s:4,t:'Blij mee! Snelle levering.',v:false}].map((r,i) => (
              <div key={i} style={{ background: '#f6f3ee', borderRadius: '16px', padding: '1.75rem', border: '1px solid #e5ddd0' }}>
                <div style={{ display: 'flex', gap: '0.2rem', marginBottom: '1rem' }}>
                  {Array.from({length: r.s}).map((_,j) => <span key={j} style={{ color: '#d4a853', fontSize: '0.9rem' }}>★</span>)}
                </div>
                <p style={{ color: '#7a6047', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1rem' }}>{r.t}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1a120a' }}>{r.n}</span>
                  {r.v && <span style={{ color: '#8c7355', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Geverifieerd</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── USPs ── */}
      <section style={{ padding: '4rem 2.5rem', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '2rem' }}>
          ${usps.map(u => `
          <div style={{ background: '#ede8df', borderRadius: '16px', padding: '2rem', border: '1px solid #e0d5c4' }}>
            <strong style={{ display: 'block', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1a120a' }}>${u.title}</strong>
            <span style={{ color: '#7a6047', fontSize: '0.875rem', lineHeight: 1.6 }}>${u.desc}</span>
          </div>`).join('')}
        </div>
      </section>

      {/* ── Products ── */}
      <section id="products" style={{ padding: '3rem 2.5rem 6rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#1a120a', margin: 0 }}>Onze producten</h2>
          <span style={{ color: '#8c7355', fontSize: '0.8rem' }}>Zorgvuldig geselecteerd</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '1.5rem' }}>
          {products.map((p, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e5ddd0' }}>
              <div style={{ aspectRatio: '1/1', overflow: 'hidden', background: '#ede8df' }}>
                {p.image && <img src={p.image} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.75rem', color: '#1a120a' }}>{p.title}</h3>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>€{p.price.toFixed(2)}</span>
                  {p.compareAtPrice && <span style={{ color: '#b0977a', textDecoration: 'line-through', fontSize: '0.85rem' }}>€{p.compareAtPrice.toFixed(2)}</span>}
                </div>
                <button style={{ width: '100%', background: '#2c2416', color: '#f6f3ee', fontWeight: 600, padding: '0.875rem', fontSize: '0.85rem', border: 'none', borderRadius: '100px', cursor: 'pointer' }}>
                  Bestellen
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: '#2c2416', color: '#f6f3ee', padding: '3rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>${esc(data.brand_name)}</span>
        <div style={{ display: 'flex', gap: '2rem' }}>
          {[['Over ons','/over'],['Retour','/retour'],['Contact','/contact']].map(([l,h]) => (
            <a key={l} href={h} style={{ color: 'rgba(246,243,238,0.45)', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none' }}>{l}</a>
          ))}
        </div>
        <span style={{ color: 'rgba(246,243,238,0.2)', fontSize: '0.8rem' }}>© ${year}</span>
      </footer>
    </div>
  );
}
`

  // ─────────────────────────────────────────────────────────────────────────────
  // LAYOUT 4 — GRID
  // Dark slate tech. Grid pattern background. Blue accents. Data-driven feel.
  // Inline dark product cards. Clean, minimal, precise.
  // ─────────────────────────────────────────────────────────────────────────────
  return `'use client';
import { initiateCheckout } from '../components/shared/checkout';

interface Product { id: string; title: string; image: string; price: number; compareAtPrice?: number; badge?: string; description?: string }
const products: Product[] = ${prods};

export default function Home() {
  const buy = async (p: Product) => {
    await initiateCheckout([{ id: p.id, title: p.title, price: p.price, quantity: 1, image: p.image }]);
  };
  return (
    <div style={{ background: '#0d1117', color: '#e6edf3', minHeight: '100vh', backgroundImage: 'linear-gradient(rgba(48,54,61,0.4) 1px,transparent 1px),linear-gradient(90deg,rgba(48,54,61,0.4) 1px,transparent 1px)', backgroundSize: '40px 40px' }}>

      {/* ── Nav ── */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 2rem', borderBottom: '1px solid #30363d', background: 'rgba(13,17,23,0.95)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '${primary}', boxShadow: '0 0 8px ${primary}' }} />
          <span style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>${esc(data.brand_name)}</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a href="#products" style={{ color: '#8b949e', fontSize: '0.8rem', textDecoration: 'none' }}>Producten</a>
          <a href="/contact" style={{ color: '#8b949e', fontSize: '0.8rem', textDecoration: 'none' }}>Contact</a>
          <a href="#products" style={{ background: '${primary}', color: '#fff', fontWeight: 600, padding: '0.5rem 1.25rem', fontSize: '0.8rem', textDecoration: 'none', borderRadius: '6px' }}>Shop →</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ padding: '6rem 2rem 4rem', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #30363d', padding: '0.35rem 1rem', borderRadius: '100px', marginBottom: '2rem', background: 'rgba(48,54,61,0.3)' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3fb950', display: 'inline-block' }} />
          <span style={{ color: '#8b949e', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Live collectie ${year}</span>
        </div>
        <h1 style={{ fontSize: 'clamp(2.5rem,8vw,7rem)', fontWeight: 800, lineHeight: 0.9, letterSpacing: '-0.04em', margin: '0 0 1.5rem', background: 'linear-gradient(135deg,#e6edf3 0%,#8b949e 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ${esc(data.brand_name)}
        </h1>
        <p style={{ color: '#8b949e', fontSize: '1.15rem', lineHeight: 1.6, maxWidth: '44ch', marginBottom: '2.5rem' }}>${data.slogan}</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <a href="#products" style={{ background: '${primary}', color: '#fff', fontWeight: 700, padding: '0.9rem 2.5rem', fontSize: '0.85rem', textDecoration: 'none', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            Bekijk collectie <span>→</span>
          </a>
          <a href="/over" style={{ border: '1px solid #30363d', color: '#8b949e', fontWeight: 500, padding: '0.9rem 2rem', fontSize: '0.85rem', textDecoration: 'none', borderRadius: '8px' }}>
            Meer info
          </a>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1px', marginTop: '4rem', background: '#30363d', border: '1px solid #30363d', borderRadius: '12px', overflow: 'hidden' }}>
          ${usps.map(u => `
          <div style={{ background: 'rgba(22,27,34,0.9)', padding: '1.5rem 2rem' }}>
            <strong style={{ display: 'block', color: '#e6edf3', fontSize: '0.95rem', marginBottom: '0.25rem' }}>${u.title}</strong>
            <span style={{ color: '#8b949e', fontSize: '0.8rem' }}>${u.desc}</span>
          </div>`).join('')}
        </div>
      </section>

      {/* ── Products ── */}
      <section id="products" style={{ padding: '3rem 2rem 5rem', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid #30363d' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e6edf3', margin: 0 }}>Alle producten</h2>
          <span style={{ color: '#8b949e', fontSize: '0.8rem', fontFamily: 'monospace' }}>{products.length} items</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '1px', background: '#30363d', border: '1px solid #30363d', borderRadius: '12px', overflow: 'hidden' }}>
          {products.map((p, i) => (
            <div key={i} onClick={() => buy(p)} style={{ background: '#161b22', padding: '1.5rem', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background='#1c2128')}
              onMouseLeave={e => (e.currentTarget.style.background='#161b22')}>
              <div style={{ aspectRatio: '4/3', background: '#0d1117', borderRadius: '8px', overflow: 'hidden', marginBottom: '1.25rem', border: '1px solid #30363d', position: 'relative' }}>
                {p.image && <img src={p.image} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                {p.badge && <span style={{ position: 'absolute', top: '0.6rem', right: '0.6rem', background: '${primary}', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '4px' }}>{p.badge}</span>}
              </div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#c9d1d9', fontWeight: 500 }}>{p.title}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#e6edf3' }}>€{p.price.toFixed(2)}</span>
                  {p.compareAtPrice && <span style={{ color: '#8b949e', fontSize: '0.8rem', textDecoration: 'line-through' }}>€{p.compareAtPrice.toFixed(2)}</span>}
                </div>
                <button style={{ background: '${primary}', color: '#fff', border: 'none', padding: '0.4rem 1rem', fontSize: '0.75rem', fontWeight: 600, borderRadius: '6px', cursor: 'pointer' }}>
                  + Toevoegen
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', padding: '2rem', borderTop: '1px solid #30363d', flexWrap: 'wrap' }}>
        {[['🔒','Veilig betalen'],['🚚','Gratis verzending'],['↩','30 dagen retour']].map(([icon,text]) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#8b949e', fontSize: '0.85rem' }}>
            <span>{icon}</span><span>{text}</span>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid #30363d', padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', background: 'rgba(13,17,23,0.95)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '${primary}' }} />
          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>${esc(data.brand_name)}</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {[['Over ons','/over'],['Retour','/retour'],['Contact','/contact'],['FAQ','/faq']].map(([l,h]) => (
            <a key={l} href={h} style={{ color: '#8b949e', fontSize: '0.75rem', textDecoration: 'none' }}>{l}</a>
          ))}
        </div>
        <span style={{ color: '#484f58', fontSize: '0.75rem' }}>© ${year} ${esc(data.brand_name)}</span>
      </footer>
    </div>
  );
}
`
}

function writeNextScaffold(targetDir: string, data: StoreData): void {
  const subdomain = data.subdomain ?? slugify(data.brand_name)
  ensureDir(path.join(targetDir, 'app'))
  ensureDir(path.join(targetDir, 'public'))

  // Resolve brand colors — brand-agent may pass them as data.colors or data.primary_color
  const d = data as StoreData & { colors?: Record<string, string> }
  const primary   = d.colors?.primary   ?? d.primary_color ?? '#2563eb'
  const secondary = d.colors?.secondary ?? '#1e293b'
  const accent    = d.colors?.accent    ?? '#f59e0b'

  const layoutIdx = selectLayout(data.niche)
  const font      = FONT_PAIRINGS[layoutIdx]
  const usps      = nicheUsps(data.niche)

  // package.json
  fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({
    name: `store-${subdomain}`,
    version: '0.1.0',
    private: true,
    scripts: { build: 'next build', start: 'next start', dev: 'next dev' },
    dependencies: {
      next: '^14.2.0',
      react: '^18.3.0',
      'react-dom': '^18.3.0',
    },
    devDependencies: {
      typescript: '^5.4.0',
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.0',
      '@types/node': '^20.0.0',
      tailwindcss: '^3.4.0',
      autoprefixer: '^10.4.0',
      postcss: '^8.4.0',
    },
  }, null, 2), 'utf-8')

  fs.writeFileSync(path.join(targetDir, 'postcss.config.js'),
    `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`, 'utf-8')

  fs.writeFileSync(path.join(targetDir, 'tailwind.config.js'),
    `/** @type {import('tailwindcss').Config} */\n` +
    `module.exports = {\n` +
    `  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],\n` +
    `  theme: { extend: { colors: {\n` +
    `    primary: '${primary}', secondary: '${secondary}', accent: '${accent}',\n` +
    `  }, fontFamily: {\n` +
    `    heading: [${JSON.stringify(font.heading)}],\n` +
    `    body: [${JSON.stringify(font.body)}],\n` +
    `  } } },\n` +
    `  plugins: [],\n` +
    `};\n`, 'utf-8')

  fs.writeFileSync(path.join(targetDir, 'app/globals.css'),
    `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n` +
    `:root {\n` +
    `  --brand-primary: ${primary};\n` +
    `  --brand-secondary: ${secondary};\n` +
    `  --brand-accent: ${accent};\n` +
    `}\n\n` +
    `*, *::before, *::after { box-sizing: border-box; }\n` +
    `body {\n` +
    `  font-family: ${font.body};\n` +
    `  margin: 0;\n` +
    `  background: #fff;\n` +
    `  color: #111;\n` +
    `  -webkit-font-smoothing: antialiased;\n` +
    `}\n` +
    `h1, h2, h3, h4, h5, h6 { font-family: ${font.heading}; }\n` +
    `@keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }\n` +
    `.animate-fade-up { animation: fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both; }\n` +
    `.delay-100 { animation-delay: 0.1s; } .delay-200 { animation-delay: 0.2s; } .delay-300 { animation-delay: 0.3s; }\n`,
    'utf-8')

  fs.writeFileSync(path.join(targetDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'es2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true,
      skipLibCheck: true, strict: false, noEmit: true, esModuleInterop: true,
      module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true,
      isolatedModules: true, jsx: 'preserve', incremental: true,
      plugins: [{ name: 'next' }], paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2), 'utf-8')

  fs.writeFileSync(path.join(targetDir, 'next.config.js'),
    `module.exports = { output: 'export', images: { unoptimized: true } };\n`, 'utf-8')

  // layout.tsx — Google Fonts injected via <link>
  fs.writeFileSync(path.join(targetDir, 'app/layout.tsx'),
    `import './globals.css';\n` +
    `import type { Metadata } from 'next';\n\n` +
    `export const metadata: Metadata = { title: ${JSON.stringify(data.brand_name)}, description: ${JSON.stringify(data.slogan)} };\n\n` +
    `export default function RootLayout({ children }: { children: React.ReactNode }) {\n` +
    `  return (\n` +
    `    <html lang="nl">\n` +
    `      <head>\n` +
    `        <link rel="preconnect" href="https://fonts.googleapis.com" />\n` +
    `        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />\n` +
    `        <link href="${font.url}" rel="stylesheet" />\n` +
    `      </head>\n` +
    `      <body className="min-h-screen antialiased">{children}</body>\n` +
    `    </html>\n` +
    `  );\n` +
    `}\n`, 'utf-8')

  // page.tsx — layout-specific
  fs.writeFileSync(path.join(targetDir, 'app/page.tsx'),
    generatePageTsx(layoutIdx, data, usps, primary, secondary, accent), 'utf-8')
}

// ── SEO assets ───────────────────────────────────────────────────────────────

function buildSitemapXml(subdomain: string, baseUrl: string): string {
  const now = new Date().toISOString().slice(0, 10)
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${baseUrl}/products</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${baseUrl}/about</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>
</urlset>`
}

function buildRobotsTxt(baseUrl: string): string {
  return `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`
}

function buildJsonLd(data: StoreData, baseUrl: string): string {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: data.brand_name,
    url: baseUrl,
    description: data.slogan,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
  return JSON.stringify(org, null, 2)
}

function writeSeoFiles(targetDir: string, data: StoreData, baseUrl: string): void {
  fs.writeFileSync(path.join(targetDir, 'sitemap.xml'), buildSitemapXml(data.subdomain ?? '', baseUrl), 'utf-8')
  fs.writeFileSync(path.join(targetDir, 'robots.txt'), buildRobotsTxt(baseUrl), 'utf-8')
  fs.writeFileSync(path.join(targetDir, 'schema.json'), buildJsonLd(data, baseUrl), 'utf-8')
}

// ── A/B Nginx config (split_clients 50/50) ────────────────────────────────────

function nginxAbConfig(subdomain: string, variantA: string, variantB: string): string {
  const lines = [
    `# A/B split for ${subdomain} — auto-winner checked after 72h`,
    `split_clients "${subdomain}_ab" $ab_variant {`,
    `  50% "a";`,
    `  *   "b";`,
    `}`,
    ``,
    `server {`,
    `  listen 80;`,
    `  server_name ${subdomain}.${STORE_BASE_DOMAIN};`,
    `  set $root_a /var/www/stores/${variantA}/out;`,
    `  set $root_b /var/www/stores/${variantB}/out;`,
    `  root $root_$ab_variant;`,
    `  index index.html;`,
    `  location / { try_files $uri $uri.html $uri/index.html =404; }`,
    `  gzip on;`,
    `  gzip_types text/css application/javascript image/svg+xml;`,
    `  add_header X-AB-Variant $ab_variant;`,
    `}`,
  ]
  return lines.join('\n')
}

/** Static fallback HTML used by local preview when there is no Next.js build. */
function buildStaticPreviewHtml(data: StoreData): string {
  const color = data.primary_color || '#7c3aed'
  const productsHtml = data.products.map(p => `
    <article class="card">
      ${p.image ? `<img src="${p.image}" alt="${p.title.replace(/"/g, '&quot;')}" />` : ''}
      <div class="card-body">
        <h3>${p.title}</h3>
        <div class="price">€${p.price.toFixed(2)}${p.compareAtPrice ? ` <s>€${p.compareAtPrice.toFixed(2)}</s>` : ''}</div>
        <button>In winkelmand</button>
      </div>
    </article>`).join('\n')

  const canonicalUrl = data.subdomain
    ? `https://${data.subdomain}.${STORE_BASE_DOMAIN}`
    : `http://localhost:${PORT}/preview/${slugify(data.brand_name)}`
  const firstImage = data.imageUrls?.[0] ?? ''
  const clarityId  = process.env.CLARITY_PROJECT_ID ?? ''
  const clarityScript = clarityId
    ? `<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${clarityId}");</script>`
    : ''

  return `<!doctype html>
<html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.brand_name)} — ${data.slogan}</title>
<meta name="description" content="${data.slogan}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(data.brand_name)}">
<meta property="og:description" content="${data.slogan}">
<meta property="og:url" content="${canonicalUrl}">
${firstImage ? `<meta property="og:image" content="${firstImage}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(data.brand_name)}">
<meta name="twitter:description" content="${data.slogan}">
<script type="application/ld+json">
${buildJsonLd(data, canonicalUrl)}
</script>
${clarityScript}
<style>
  :root { --brand: ${color}; }
  * { box-sizing: border-box }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; color: #0f172a; background: #fff }
  header { padding: 1rem 2rem; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center }
  .brand { font-weight: 700; font-size: 1.25rem; color: var(--brand) }
  .hero { padding: 5rem 2rem; text-align: center; background: linear-gradient(135deg, var(--brand), #1e293b); color: white }
  .hero h1 { font-size: clamp(2rem, 5vw, 4rem); margin: 0 0 1rem }
  .hero p { font-size: 1.25rem; opacity: 0.9; margin: 0 0 2rem }
  .cta { background: white; color: var(--brand); padding: 0.75rem 2rem; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block }
  .grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); padding: 4rem 2rem; max-width: 1200px; margin: 0 auto }
  .card { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; transition: box-shadow .2s }
  .card:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.08) }
  .card img { width: 100%; aspect-ratio: 1/1; object-fit: cover; background: #f1f5f9 }
  .card-body { padding: 1rem }
  .card h3 { margin: 0 0 0.5rem; font-size: 1rem }
  .price { font-weight: 700; margin-bottom: 0.75rem }
  .price s { font-weight: 400; color: #94a3b8; margin-left: 0.5rem }
  button { width: 100%; background: var(--brand); color: white; border: 0; padding: 0.6rem; border-radius: 6px; font-weight: 600; cursor: pointer }
  footer { padding: 2rem; border-top: 1px solid #e5e7eb; text-align: center; color: #64748b; font-size: 0.875rem }
</style></head>
<body>
<header><span class="brand">${esc(data.brand_name)}</span><nav>Shop · Over ons · Contact</nav></header>
<section class="hero">
  <h1>${esc(data.brand_name)}</h1>
  <p>${data.slogan}</p>
  <a href="#products" class="cta">Shop nu</a>
</section>
<section id="products"><div class="grid">${productsHtml}</div></section>
<footer>© ${new Date().getFullYear()} ${esc(data.brand_name)} — ${data.niche}</footer>
</body></html>`
}

// ── Sub-process helpers (with timeout) ───────────────────────────────────────

function runCmd(
  cmd: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(cmd, args, { cwd: options.cwd, shell: false })
    let stdout = '', stderr = ''
    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ code: -1, stdout, stderr: stderr + `\n[timeout after ${options.timeoutMs}ms]` })
    }, options.timeoutMs ?? 120_000)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: stderr + `\n[spawn error: ${err.message}]` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 0, stdout, stderr })
    })
  })
}

// ── Remote deploy helpers ─────────────────────────────────────────────────────

async function npmBuild(cwd: string): Promise<{ ok: boolean; log: string }> {
  console.log(`[store-platform] npm install in ${cwd}`)
  const install = await runCmd('npm', ['install', '--no-audit', '--no-fund'], { cwd, timeoutMs: 120_000 })
  if (install.code !== 0) {
    return { ok: false, log: `npm install failed (code ${install.code}):\n${install.stderr}` }
  }
  console.log(`[store-platform] next build in ${cwd}`)
  const build = await runCmd('npm', ['run', 'build'], { cwd, timeoutMs: 120_000 })
  if (build.code !== 0) {
    return { ok: false, log: `next build failed (code ${build.code}):\n${build.stderr}` }
  }
  return { ok: true, log: install.stdout + '\n' + build.stdout }
}

async function scpToRemote(localPath: string, remotePath: string): Promise<boolean> {
  const sshArgs = STORE_SSH_KEY_PATH ? ['-i', STORE_SSH_KEY_PATH] : []
  const target = `${STORE_SERVER_USER}@${STORE_SERVER_HOST}:${remotePath}`
  const result = await runCmd('scp', [...sshArgs, '-r', localPath, target], { timeoutMs: 120_000 })
  if (result.code !== 0) {
    console.error(`[store-platform] scp failed: ${result.stderr}`)
    return false
  }
  return true
}

async function sshExec(command: string): Promise<{ ok: boolean; output: string }> {
  const sshArgs = STORE_SSH_KEY_PATH ? ['-i', STORE_SSH_KEY_PATH] : []
  const result = await runCmd('ssh', [...sshArgs, `${STORE_SERVER_USER}@${STORE_SERVER_HOST}`, command], { timeoutMs: 30_000 })
  return { ok: result.code === 0, output: result.stdout + result.stderr }
}

function nginxConfig(subdomain: string, port?: number): string {
  // Elke store luistert op:
  //   - poort 80 via subdomain:  http://{subdomain}.stores.local
  //   - eigen poort (indien toegewezen): http://192.168.121.8:{port}
  const portBlock = port ? `\nserver {\n  listen ${port};\n  root /var/www/stores/${subdomain}/out;\n  index index.html;\n  location / { try_files $uri $uri.html $uri/index.html =404; }\n  gzip on;\n  gzip_types text/css application/javascript image/svg+xml;\n  add_header X-Store "${subdomain}";\n}\n` : ''
  return `server {
  listen 80;
  server_name ${subdomain}.${STORE_BASE_DOMAIN};
  root /var/www/stores/${subdomain}/out;
  index index.html;
  location / { try_files $uri $uri.html $uri/index.html =404; }
  gzip on;
  gzip_types text/css application/javascript image/svg+xml;
  add_header X-Store "${subdomain}";
}
${portBlock}`
}

// ── WebsiteInspector integration ─────────────────────────────────────────────

interface DesignInspiration {
  niche: string
  color_palette: string[]
  recommended_layout: string
  recommended_tone: string
  headline_formula: string
  section_order: string[]
  source_store_ids: number[]
}

async function fetchInspiration(niche: string): Promise<DesignInspiration | null> {
  const inspectorUrl = process.env.INSPECTOR_URL ?? 'http://localhost:8002'
  try {
    const resp = await fetch(
      `${inspectorUrl}/inspiration?niche=${encodeURIComponent(niche)}`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (!resp.ok) return null
    return await resp.json() as DesignInspiration
  } catch {
    return null
  }
}

// ── Main deploy entrypoint ───────────────────────────────────────────────────

// ── Duplicate product guard ────────────────────────────────────────────────────
// Haal alle CJ product IDs op die al in gebruik zijn door andere stores.
function getDeployedProductIds(): Set<string> {
  try {
    const rows = db.prepare(
      `SELECT DISTINCT json_each.value AS pid
       FROM stores, json_each(stores.products_json)
       WHERE stores.status IN ('local','live')`,
    ).all() as { pid: string }[]
    return new Set(rows.map(r => r.pid))
  } catch {
    return new Set()
  }
}

export async function deployStore(storeData: StoreData): Promise<DeployedStore> {
  const storeId = uuid()
  const createdAt = new Date().toISOString()
  const subdomain = storeData.subdomain ?? slugify(storeData.brand_name)

  // ── Branded subdomain check: mag niet de niche zelf zijn ──────────────────
  // bijv. brand_name "VeloFlex" → subdomain "veloflex" ✓
  //       brand_name "Voetbal"  → subdomain "voetbal"  ✗ te generiek
  if (slugify(storeData.brand_name) === slugify(storeData.niche)) {
    console.warn(`[store-platform] Waarschuwing: brand_name "${storeData.brand_name}" is gelijk aan niche. Brand-agent moet een onderscheidende merknaam genereren.`)
  }

  // ── Max producten per store ────────────────────────────────────────────────
  const limitedProducts = storeData.products.slice(0, MAX_PRODUCTS_PER_STORE)
  if (storeData.products.length > MAX_PRODUCTS_PER_STORE) {
    console.log(`[store-platform] ${storeData.products.length} producten → beperkt tot ${MAX_PRODUCTS_PER_STORE} (branded store focus)`)
  }

  // ── Duplicate product preventie ───────────────────────────────────────────
  const deployedIds = getDeployedProductIds()
  const uniqueProducts = limitedProducts.filter(p => {
    if (deployedIds.has(p.id)) {
      console.log(`[store-platform] Product ${p.id} (${p.title}) al in gebruik door andere store — overgeslagen`)
      return false
    }
    return true
  })
  if (uniqueProducts.length === 0) {
    console.warn('[store-platform] Alle producten zijn al in gebruik — store niet aangemaakt. Pipeline moet nieuwe producten vinden.')
    return {
      storeId,
      subdomain,
      niche: storeData.niche,
      status: 'failed',
      previewUrl: '',
      filesPath: '',
      createdAt,
      errorMessage: 'Alle geselecteerde producten zijn al actief in andere stores',
    }
  }

  // ── Design inspiratie van WebsiteInspector ───────────────────────────────
  let inspiration: DesignInspiration | null = null
  try {
    inspiration = await fetchInspiration(storeData.niche)
    if (inspiration) {
      console.log(`[store-platform] inspiratie geladen voor niche "${storeData.niche}": layout=${inspiration.recommended_layout}, tone=${inspiration.recommended_tone}`)
    }
  } catch {
    // Non-fatal — WebsiteInspector mag offline zijn
  }

  const data = {
    ...storeData,
    products: uniqueProducts,
    subdomain,
    _storeId: storeId,
    // Apply inspiration color only when brand-agent didn't provide one
    primary_color: storeData.primary_color ?? inspiration?.color_palette?.[0],
    // Merge image URLs from previous pipeline step
    imageUrls: storeData.imageUrls,
  }

  const isRemote = !!STORE_SERVER_HOST
  const baseDir = isRemote ? path.join(TMP_BUILD_DIR, subdomain) : path.join(LOCAL_STORES_DIR, subdomain)

  try {
    // STEP 1 — generate files
    rmDirRecursive(baseDir)
    ensureDir(baseDir)
    copyComponents(baseDir, data)
    writeNextScaffold(baseDir, data)
    fs.writeFileSync(path.join(baseDir, 'index.html'), buildStaticPreviewHtml(data), 'utf-8')
    fs.writeFileSync(path.join(baseDir, 'store.json'), JSON.stringify({ storeId, ...data, createdAt }, null, 2), 'utf-8')

    // SEO files
    const storeBaseUrl = isRemote
      ? `https://${subdomain}.${STORE_BASE_DOMAIN}`
      : `http://localhost:${PORT}/preview/${subdomain}`
    writeSeoFiles(baseDir, data, storeBaseUrl)

    if (!isRemote) {
      // LOCAL mode — done. Express serves the static preview.
      const previewUrl = `http://localhost:${PORT}/preview/${subdomain}`
      persistStore({ storeId, subdomain, niche: data.niche, status: 'local', previewUrl, filesPath: baseDir, createdAt }, storeData.runId)
      console.log(`[store-platform] local store ready: ${subdomain} → ${previewUrl}`)
      return { storeId, subdomain, niche: data.niche, status: 'local', previewUrl, filesPath: baseDir, createdAt }
    }

    // STEP 2 — npm install + next build
    const buildResult = await npmBuild(baseDir)
    if (!buildResult.ok) {
      console.error(`[store-platform] build failed for ${subdomain}:\n${buildResult.log.slice(-1000)}`)
      const fallback = { storeId, subdomain, niche: data.niche, status: 'failed' as const,
        previewUrl: '', filesPath: baseDir, createdAt, errorMessage: 'build failed' }
      persistStore(fallback, storeData.runId)
      return fallback
    }

    // STEP 3 — scp + nginx reload
    const remoteRoot = `/var/www/stores/${subdomain}`
    await sshExec(`sudo mkdir -p ${remoteRoot} && sudo chown -R ${STORE_SERVER_USER}:${STORE_SERVER_USER} ${remoteRoot}`)
    const buildOk = await scpToRemote(path.join(baseDir, 'out'), `${remoteRoot}/`)
    if (!buildOk) {
      const fallback = { storeId, subdomain, niche: data.niche, status: 'failed' as const,
        previewUrl: '', filesPath: baseDir, createdAt, errorMessage: 'scp failed' }
      persistStore(fallback, storeData.runId)
      return fallback
    }

    // Vraag de store server naar de hoogste nginx-poort in gebruik
    // Dit voorkomt port-conflicten als de DB leeg/uit-sync is met de store server
    const maxNginxRes = await sshExec(
      `grep -rh "listen" /etc/nginx/sites-available/ 2>/dev/null | grep -v "listen 80" | grep -oE "[0-9]{4,}" | sort -n | tail -1`
    )
    const maxNginxPort = parseInt(maxNginxRes.output.trim(), 10) || 0
    if (maxNginxPort > 0) {
      console.log(`[store-platform] hoogste nginx poort op store server: ${maxNginxPort}`)
    }

    // Write nginx vhost remotely (inclusief poort-block)
    // Geef maxNginxPort mee als vloer zodat de nieuwe store altijd een vrije poort krijgt
    const assignedPort = assignPort(storeId, maxNginxPort)
    const nginxLocal = path.join(baseDir, 'nginx.conf')
    fs.writeFileSync(nginxLocal, nginxConfig(subdomain, assignedPort), 'utf-8')
    await scpToRemote(nginxLocal, `/tmp/${subdomain}.nginx.conf`)
    const nginxRes = await sshExec(
      `sudo mv /tmp/${subdomain}.nginx.conf /etc/nginx/sites-available/${subdomain} && ` +
      `sudo ln -sf /etc/nginx/sites-available/${subdomain} /etc/nginx/sites-enabled/${subdomain} && ` +
      `sudo nginx -t && sudo systemctl reload nginx`,
    )
    if (!nginxRes.ok) {
      console.error(`[store-platform] nginx reload failed: ${nginxRes.output.slice(-500)}`)
      const fallback = { storeId, subdomain, niche: data.niche, status: 'failed' as const,
        previewUrl: '', filesPath: baseDir, createdAt, errorMessage: 'nginx reload failed' }
      persistStore(fallback, storeData.runId)
      return fallback
    }

    const previewUrl = `https://${subdomain}.${STORE_BASE_DOMAIN}`
    const live = { storeId, subdomain, niche: data.niche, status: 'live' as const,
      previewUrl, filesPath: baseDir, createdAt }
    persistStore(live, storeData.runId, data)
    console.log(`[store-platform] live store deployed: ${subdomain} → ${previewUrl}`)
    return live
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[store-platform] deployStore(${subdomain}) crashed:`, msg)
    const failed = { storeId, subdomain, niche: data.niche, status: 'failed' as const,
      previewUrl: '', filesPath: baseDir, createdAt, errorMessage: msg }
    persistStore(failed)
    return failed
  }
}

function persistStore(s: DeployedStore, runId?: string, storeData?: StoreData): void {
  // Only persist when we have a real pipeline run to link to (FK constraint).
  // Standalone deploys (smoke tests, manual triggers) skip DB persistence.
  if (!runId) return
  const exists = db.prepare(`SELECT 1 FROM runs WHERE run_id = ?`).get(runId)
  if (!exists) {
    console.warn(`[store-platform] persistStore skipped — run_id ${runId.slice(0, 8)} not found`)
    return
  }
  try {
    db.prepare(
      `INSERT OR REPLACE INTO stores (store_id, run_id, subdomein, niche, preview_url, created_at, roas, status, store_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(s.storeId, runId, s.subdomain, s.niche, s.previewUrl, s.createdAt, null,
      s.status === 'failed' ? 'killed' : (s.status === 'local' ? 'live' : s.status),
      storeData ? JSON.stringify(storeData) : null)
  } catch (err) {
    console.error('[store-platform] persistStore failed:', err)
  }
}

// ── Store reconciliation ──────────────────────────────────────────────────────
// Reads existing stores from the store server via SSH and populates the DB.
// Safe to call multiple times — uses INSERT OR IGNORE.

export async function reconcileStores(): Promise<{ added: number; updated: number; stores: string[]; error?: string }> {
  if (!STORE_SERVER_HOST) {
    return { added: 0, updated: 0, stores: [], error: 'STORE_SERVER_HOST not configured (local mode)' }
  }

  // 1 — list store directories on the store server
  const listRes = await sshExec(`ls /var/www/stores/`)
  if (!listRes.ok) {
    const isNoRoute = listRes.output.includes('No route to host') || listRes.output.includes('Connection refused') || listRes.output.includes('Connection timed out')
    const hint = isNoRoute
      ? `Store server ${STORE_SERVER_HOST} is niet bereikbaar. Controleer of de server aan staat en SSH open is op poort 22. Of laat STORE_SERVER_HOST leeg in .env voor lokale modus.`
      : `SSH verbinding mislukt: ${listRes.output.trim()}`
    return { added: 0, updated: 0, stores: [], error: hint }
  }

  const dirs = listRes.output
    .split('\n')
    .map(d => d.trim())
    .filter(d => d && d !== 'testshop')

  // 2 — lees de ECHTE poorten uit nginx configs op de store server
  // Commando: voor elke store lezen we de nginx config en extraheren we de listen-poort (niet 80)
  const portsRes = await sshExec(
    `for d in ${dirs.join(' ')}; do ` +
    `p=$(grep -h "listen" /etc/nginx/sites-available/$d 2>/dev/null | grep -v "listen 80" | grep -oE "[0-9]{4,}" | head -1); ` +
    `echo "$d:$p"; ` +
    `done`
  )

  // Parse port map: { "blendjet.dropship.nl": 4001, "floathome.dropship.nl": 4002, ... }
  const nginxPorts: Record<string, number> = {}
  if (portsRes.ok) {
    for (const line of portsRes.output.split('\n')) {
      const [subdomain, portStr] = line.split(':')
      const p = parseInt(portStr?.trim() ?? '', 10)
      if (subdomain?.trim() && p > 0) {
        nginxPorts[subdomain.trim()] = p
      }
    }
  }
  console.log('[reconcile] nginx poorten gevonden:', nginxPorts)

  let added = 0
  let updated = 0
  const storeNames: string[] = []

  for (const dir of dirs) {
    // 3 — try to read store.json for metadata
    const jsonRes = await sshExec(`cat /var/www/stores/${dir}/store.json 2>/dev/null || echo '{}'`)
    let storeJson: Record<string, unknown> = {}
    try { storeJson = JSON.parse(jsonRes.output.trim()) } catch { /* use empty */ }

    const storeId   = (storeJson.storeId   as string) || `${dir.split('.')[0]}-recovered`
    const niche     = (storeJson.niche     as string) || dir.split('.')[0]
    const createdAt = (storeJson.createdAt as string) || new Date().toISOString()

    // 4 — poort: gebruik de echte nginx poort (betrouwbaar), anders fallback naar DB
    const nginxPort = nginxPorts[dir]
    const portRow = db.prepare('SELECT port FROM stores WHERE subdomein = ?').get(dir) as { port: number | null } | undefined
    const port = nginxPort || portRow?.port || null

    // 5 — find best run_id to link to (use most recent completed run)
    const runRow = db.prepare(
      `SELECT run_id FROM runs WHERE status IN ('completed','running') ORDER BY started_at DESC LIMIT 1`,
    ).get() as { run_id: string } | undefined
    const runId = runRow?.run_id

    // 6 — INSERT or UPDATE port if nginx had the real port
    const existing = db.prepare('SELECT store_id, port FROM stores WHERE subdomein = ?').get(dir) as { store_id: string; port: number | null } | undefined

    if (existing) {
      // Store bestaat al — update poort als nginx een andere poort heeft
      if (nginxPort && existing.port !== nginxPort) {
        db.prepare(`UPDATE stores SET port = ? WHERE subdomein = ?`).run(nginxPort, dir)
        console.log(`[reconcile] poort bijgewerkt voor ${dir}: ${existing.port} → ${nginxPort}`)
        updated++
      }
      storeNames.push(dir)
      continue
    }

    // Nieuwe store invoegen
    if (runId) {
      db.prepare(
        `INSERT OR IGNORE INTO stores (store_id, run_id, subdomein, niche, preview_url, created_at, status, port, health_status)
         VALUES (?, ?, ?, ?, ?, ?, 'live', ?, 'unknown')`,
      ).run(storeId, runId, dir, niche, `https://${dir}`, createdAt, port)
    } else {
      db.exec(`PRAGMA foreign_keys = OFF`)
      db.prepare(
        `INSERT OR IGNORE INTO stores (store_id, run_id, subdomein, niche, preview_url, created_at, status, port, health_status)
         VALUES (?, 'recovered', ?, ?, ?, ?, 'live', ?, 'unknown')`,
      ).run(storeId, dir, niche, `https://${dir}`, createdAt, port)
      db.exec(`PRAGMA foreign_keys = ON`)
    }

    added++
    storeNames.push(dir)
  }

  return { added, updated, stores: storeNames }
}

// ── Express service (port 3002) ──────────────────────────────────────────────

import { startStoreMonitor, diagnoseStore, getAllStoreHealth, assignPort } from './store-monitor.js'

const app = express()
app.use(express.json())

app.post('/api/stores/deploy', async (req, res) => {
  try {
    const body = req.body as StoreData & { run_id?: string }
    // Zorg dat run_id als runId wordt doorgegeven aan deployStore
    const data: StoreData = { ...body, runId: body.runId ?? body.run_id }
    if (!data?.brand_name || !data?.niche || !Array.isArray(data?.products)) {
      res.status(400).json({ error: 'brand_name, niche and products[] are required' })
      return
    }
    const result = await deployStore(data)

    // Wijs direct een poort toe aan de nieuwe store
    if (result.storeId && result.status !== 'failed') {
      const port = assignPort(result.storeId)
      ;(result as Record<string, unknown>).port = port
    }

    res.json(result)
  } catch (err) {
    console.error('[store-platform] /deploy failed:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'deploy failed' })
  }
})

// ── Store overzicht met health status ────────────────────────────────────────
app.get('/api/stores', (_req, res) => {
  try {
    res.json(getAllStoreHealth())
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'lookup failed' })
  }
})

app.get('/api/stores/:storeId', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM stores WHERE store_id = ?').get(req.params.storeId) as Record<string, unknown> | undefined
    if (!row) {
      res.status(404).json({ error: 'store not found' })
      return
    }
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'lookup failed' })
  }
})

// ── AI diagnose endpoint ─────────────────────────────────────────────────────
app.post('/api/stores/:storeId/diagnose', async (req, res) => {
  try {
    const result = await diagnoseStore(req.params.storeId)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'diagnose failed' })
  }
})

// ── CMS: lees merged store data (origineel + overrides) ──────────────────────
app.get('/api/stores/:storeId/cms-data', (req, res) => {
  try {
    const row = db.prepare('SELECT store_data, custom_data, subdomein, niche FROM stores WHERE store_id = ?')
      .get(req.params.storeId) as { store_data: string | null; custom_data: string | null; subdomein: string; niche: string } | undefined
    if (!row) { res.status(404).json({ error: 'store not found' }); return }

    const base: Partial<StoreData> = row.store_data ? JSON.parse(row.store_data) : {}
    const overrides: Partial<StoreData> = row.custom_data ? JSON.parse(row.custom_data) : {}

    // Deep merge: overrides win, maar we merge products array item-by-item op id
    const merged: StoreData = {
      brand_name: overrides.brand_name ?? base.brand_name ?? row.subdomein.split('.')[0],
      niche:       overrides.niche      ?? base.niche      ?? row.niche,
      slogan:      overrides.slogan     ?? base.slogan      ?? '',
      primary_color: overrides.primary_color ?? base.primary_color,
      subdomain:   row.subdomein,
      products: (base.products ?? []).map(p => {
        const o = (overrides.products ?? []).find(op => op.id === p.id)
        return o ? { ...p, ...o } : p
      }),
      ...(overrides.products && overrides.products.length > (base.products ?? []).length
        ? { products: overrides.products } : {}),
    }

    res.json({ merged, base, overrides, hasStoreData: !!row.store_data })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'cms-data failed' })
  }
})

// ── CMS: sla overrides op ────────────────────────────────────────────────────
app.put('/api/stores/:storeId/cms-data', (req, res) => {
  try {
    const row = db.prepare('SELECT store_id FROM stores WHERE store_id = ?').get(req.params.storeId)
    if (!row) { res.status(404).json({ error: 'store not found' }); return }

    db.prepare('UPDATE stores SET custom_data = ? WHERE store_id = ?')
      .run(JSON.stringify(req.body), req.params.storeId)

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'cms save failed' })
  }
})

// ── CMS: rebuild + redeploy store met huidige (merged) data ──────────────────
app.post('/api/stores/:storeId/rebuild', async (req, res) => {
  try {
    const row = db.prepare('SELECT store_data, custom_data, subdomein, niche, run_id FROM stores WHERE store_id = ?')
      .get(req.params.storeId) as { store_data: string | null; custom_data: string | null; subdomein: string; niche: string; run_id: string } | undefined
    if (!row) { res.status(404).json({ error: 'store not found' }); return }
    if (!row.store_data) { res.status(400).json({ error: 'Geen originele store data beschikbaar voor rebuild. Start een nieuwe pipeline run.' }); return }

    const base: StoreData = JSON.parse(row.store_data)
    const overrides: Partial<StoreData> = row.custom_data ? JSON.parse(row.custom_data) : {}

    // Merge overrides into base data
    const merged: StoreData = {
      ...base,
      ...overrides,
      subdomain: row.subdomein,
      runId: row.run_id,
      products: (base.products ?? []).map(p => {
        const o = (overrides.products ?? []).find(op => op.id === p.id)
        return o ? { ...p, ...o } : p
      }),
    }

    // Rebuild in background — respond immediately
    res.json({ ok: true, message: 'Rebuild gestart — dit duurt ca. 2-3 minuten' })

    deployStore(merged).then(result => {
      const status = result.status === 'live' ? 'live' : 'killed'
      db.prepare('UPDATE stores SET status = ? WHERE store_id = ?').run(status, req.params.storeId)
      console.log(`[cms-rebuild] ${row.subdomein} → ${status}`)
    }).catch(err => {
      console.error(`[cms-rebuild] ${row.subdomein} failed:`, err)
      db.prepare('UPDATE stores SET status = ? WHERE store_id = ?').run('killed', req.params.storeId)
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'rebuild failed' })
  }
})

// ── Handmatige health check trigger ─────────────────────────────────────────
app.post('/api/stores/:storeId/health-check', async (req, res) => {
  try {
    const store = db.prepare(`
      SELECT store_id, subdomein, niche, preview_url, status, port,
             health_status, health_checked_at, health_response_ms, health_error
      FROM stores WHERE store_id = ?
    `).get(req.params.storeId) as Record<string, unknown> | undefined
    if (!store) { res.status(404).json({ error: 'store not found' }); return }

    // Importeer checkStore via diagnoseStore (die doet een health check intern)
    await diagnoseStore(req.params.storeId)
    const updated = db.prepare('SELECT health_status, health_response_ms, health_error FROM stores WHERE store_id = ?').get(req.params.storeId)
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'health check failed' })
  }
})

app.get('/preview/:subdomain', (req, res) => {
  try {
    const sub = req.params.subdomain.replace(/[^a-z0-9-]/gi, '')
    const file = path.join(LOCAL_STORES_DIR, sub, 'index.html')
    if (!fs.existsSync(file)) {
      res.status(404).send('Store preview not found')
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(fs.readFileSync(file, 'utf-8'))
  } catch (err) {
    res.status(500).send(`preview failed: ${err instanceof Error ? err.message : err}`)
  }
})

app.post('/api/admin/reconcile-stores', async (_req, res) => {
  try {
    const result = await reconcileStores()
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'reconcile failed' })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: STORE_SERVER_HOST ? 'remote' : 'local', baseDir: STORE_SERVER_HOST ? TMP_BUILD_DIR : LOCAL_STORES_DIR })
})

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[store-platform] listening on http://localhost:${PORT} (mode: ${STORE_SERVER_HOST ? 'remote' : 'local'})`)
    startStoreMonitor()
  })
}
