// ═══════ Navigatie + footer ═══════
// Nav/footer zijn "chrome": de assembler zet de gekozen nav bovenaan en de
// gekozen footer onderaan (buiten de vrije component-volgorde).

import type { ComponentDef, ComponentProps, RenderResult } from './types.js'
import { txt, j, am, arr } from './types.js'

const NAV_LINKS = `{[['Shop','#products'],['About','/about/'],['FAQ','/faq/'],['Contact','/contact/']].map(([l,h])=><a key={l} href={h} className="navl" style={{ fontSize:'.82rem', color:'var(--c-muted)', letterSpacing:'.04em' }}>{l}</a>)}`
const BRAND = `<a href="/" style={{ fontFamily:'var(--f-head)', fontWeight:'var(--fw-head)', fontSize:'1.05rem', textTransform:'var(--tt-head)', letterSpacing:'.02em' }}>${'{'}BRAND${'}'}</a>`
const navBase = "background:'color-mix(in srgb, var(--c-bg) 82%, transparent)', backdropFilter:'blur(12px)', borderBottom:'var(--bw) solid var(--c-border)', position:'sticky', top:0, zIndex:50, padding:'1.1rem clamp(1.5rem,5vw,4rem)'"

const defs: ComponentDef[] = [
  {
    id: 'nav.classic', category: 'nav', label: 'Klassiek — logo links, links rechts', styles: ['minimal', 'bold', 'editorial'], anims: ['none'],
    tags: ['universal'], props: {},
    render: (): RenderResult => ({ jsx: `<nav style={{ ${navBase}, display:'flex', justifyContent:'space-between', alignItems:'center' }}>${BRAND}<div style={{ display:'flex', gap:'clamp(1.25rem,3vw,2.5rem)' }}>${NAV_LINKS}</div></nav>` }),
  },
  {
    id: 'nav.centered-logo', category: 'nav', label: 'Gecentreerd logo boven links', styles: ['editorial', 'minimal', 'playful'], anims: ['none'],
    tags: ['premium', 'fashion', 'editorial'], props: {},
    render: (): RenderResult => ({ jsx: `<nav style={{ ${navBase}, display:'flex', flexDirection:'column', alignItems:'center', gap:'.7rem' }}>${BRAND}<div style={{ display:'flex', gap:'clamp(1.25rem,3vw,2.5rem)' }}>${NAV_LINKS}</div></nav>` }),
  },
  {
    id: 'nav.announcement-bar', category: 'nav', label: 'Met aankondigingsbalk erboven', styles: ['bold', 'playful', 'minimal'], anims: ['none'],
    tags: ['promo', 'conversion'], props: { announcement: 'balktekst' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<div style={{ position:'sticky', top:0, zIndex:51 }}>
        <div style={{ background:'var(--c-primary)', color:'var(--c-primary-text)', textAlign:'center', padding:'.5rem 1rem', fontSize:'.78rem', fontWeight:600, letterSpacing:'.03em' }}>${txt(p.announcement, 'Free EU shipping · 30-day returns')}</div>
        <nav style={{ ${navBase.replace("position:'sticky', top:0, ", '')}, display:'flex', justifyContent:'space-between', alignItems:'center' }}>${BRAND}<div style={{ display:'flex', gap:'clamp(1.25rem,3vw,2.5rem)' }}>${NAV_LINKS}</div></nav>
      </div>`,
    }),
  },
  {
    id: 'nav.transparent', category: 'nav', label: 'Transparant over de hero', styles: ['bold', 'editorial'], anims: ['none'],
    tags: ['urban', 'lifestyle', 'fullbleed-hero'], props: {},
    render: (): RenderResult => ({ jsx: `<nav style={{ position:'absolute', top:0, left:0, right:0, zIndex:50, display:'flex', justifyContent:'space-between', alignItems:'center', padding:'1.4rem clamp(1.5rem,5vw,4rem)' }}><a href="/" style={{ fontFamily:'var(--f-head)', fontWeight:'var(--fw-head)', fontSize:'1.05rem', color:'#fff', textTransform:'var(--tt-head)' }}>${'{'}BRAND${'}'}</a><div style={{ display:'flex', gap:'clamp(1.25rem,3vw,2.5rem)' }}>{[['Shop','#products'],['About','/about/'],['Contact','/contact/']].map(([l,h])=><a key={l} href={h} className="navl" style={{ fontSize:'.82rem', color:'rgba(255,255,255,.85)' }}>{l}</a>)}</div></nav>` }),
  },
  // ── FOOTERS ───────────────────────────────────────────────────────────────────
  {
    id: 'footer.simple', category: 'footer', label: 'Simpel — merk + links + copyright', styles: ['minimal', 'editorial'], anims: ['none'],
    tags: ['universal', 'clean'], props: { tagline: '' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<footer style={{ background:'var(--c-bg)', color:'var(--c-muted)', padding:'2.5rem clamp(1.5rem,5vw,4rem)', borderTop:'var(--bw) solid var(--c-border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem' }}>
        <span style={{ fontFamily:'var(--f-head)', fontWeight:'var(--fw-head)', textTransform:'var(--tt-head)' }}>${'{'}BRAND${'}'}</span>
        <div style={{ display:'flex', gap:'1.5rem', flexWrap:'wrap' }}>${NAV_LINKS}</div>
        <span style={{ fontSize:'.75rem' }}>&#169; ${new Date().getFullYear()}</span>
      </footer>`,
    }),
  },
  {
    id: 'footer.multi-column', category: 'footer', label: 'Multi-kolom (shop/help/brand)', styles: ['minimal', 'bold'], anims: ['none'],
    tags: ['universal', 'considered'], props: { tagline: '' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<footer style={{ background:'var(--c-surface-alt)', color:'var(--c-text)', padding:'clamp(3rem,6vw,4.5rem) clamp(1.5rem,5vw,4rem)', borderTop:'var(--bw) solid var(--c-border)' }}>
        <div className="wrap grid3" style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'2rem' }}>
          <div><p style={{ fontFamily:'var(--f-head)', fontWeight:'var(--fw-head)', fontSize:'1.15rem', margin:'0 0 .5rem', textTransform:'var(--tt-head)' }}>${'{'}BRAND${'}'}</p><p style={{ color:'var(--c-muted)', fontSize:'.85rem', lineHeight:1.6, maxWidth:'32ch' }}>${txt(p.tagline, 'A focused collection, delivered fast across Europe.')}</p></div>
          <div style={{ display:'flex', flexDirection:'column', gap:'.6rem' }}><b style={{ fontSize:'.8rem' }}>Shop</b>{[['All products','#products'],['About','/about/']].map(([l,h])=><a key={l} href={h} className="navl" style={{ color:'var(--c-muted)', fontSize:'.82rem' }}>{l}</a>)}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'.6rem' }}><b style={{ fontSize:'.8rem' }}>Help</b>{[['FAQ','/faq/'],['Returns','/returns/'],['Contact','/contact/']].map(([l,h])=><a key={l} href={h} className="navl" style={{ color:'var(--c-muted)', fontSize:'.82rem' }}>{l}</a>)}</div>
        </div>
        <p style={{ color:'var(--c-muted)', fontSize:'.75rem', marginTop:'2.5rem' }}>&#169; ${new Date().getFullYear()} — All rights reserved.</p>
      </footer>`,
    }),
  },
  {
    id: 'footer.newsletter', category: 'footer', label: 'Met newsletter-signup strip', styles: ['bold', 'playful'], anims: ['none'],
    tags: ['retention', 'conversion'], props: { tagline: '' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<footer style={{ background:'var(--c-secondary)', color:'#fff', padding:'clamp(3rem,6vw,5rem) clamp(1.5rem,5vw,4rem)', textAlign:'center' }}>
        <p style={{ fontFamily:'var(--f-head)', fontSize:'1.8rem', fontWeight:'var(--fw-head)', margin:'0 0 .5rem', textTransform:'var(--tt-head)' }}>${'{'}BRAND${'}'}</p>
        <p style={{ opacity:.7, margin:'0 0 1.5rem' }}>${txt(p.tagline, 'Join the list for early access.')}</p>
        <form onSubmit={(e)=>e.preventDefault()} style={{ display:'flex', gap:'.6rem', justifyContent:'center', flexWrap:'wrap', marginBottom:'1.75rem' }}>
          <input type="email" required placeholder="you@email.com" aria-label="Email" style={{ padding:'.75rem 1rem', borderRadius:'var(--r-btn)', border:'none', minWidth:'240px', fontFamily:'inherit' }} />
          <button type="submit" className="btnp" style={{ background:'var(--c-accent)', color:'var(--c-primary-text)', border:'none', borderRadius:'var(--r-btn)', padding:'.75rem 1.5rem', fontWeight:700 }}>Join</button>
        </form>
        <div style={{ display:'flex', gap:'1.5rem', justifyContent:'center', flexWrap:'wrap', opacity:.85 }}>${NAV_LINKS}</div>
      </footer>`,
    }),
  },
  {
    id: 'footer.trust-badges', category: 'footer', label: 'Met trust-badge rij', styles: ['minimal', 'bold'], anims: ['none'],
    tags: ['trust', 'conversion'], props: { tagline: '' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<footer style={{ background:'var(--c-bg)', color:'var(--c-muted)', padding:'clamp(2.5rem,5vw,4rem) clamp(1.5rem,5vw,4rem)', borderTop:'var(--bw) solid var(--c-border)' }}>
        <div className="wrap" style={{ display:'flex', gap:'clamp(1rem,4vw,3rem)', justifyContent:'center', flexWrap:'wrap', marginBottom:'2rem' }}>{['Free EU shipping','30-day returns','Secure Stripe payment','3-8 day delivery'].map((b,i)=><span key={i} style={{ display:'inline-flex', alignItems:'center', gap:'.5rem', fontSize:'.8rem', fontWeight:600 }}><span style={{ color:'var(--c-accent)' }}>&#10003;</span>{b}</span>)}</div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem', borderTop:'var(--bw) solid var(--c-border)', paddingTop:'1.5rem' }}>
          <span style={{ fontFamily:'var(--f-head)', fontWeight:'var(--fw-head)', textTransform:'var(--tt-head)', color:'var(--c-text)' }}>${'{'}BRAND${'}'}</span>
          <div style={{ display:'flex', gap:'1.5rem', flexWrap:'wrap' }}>${NAV_LINKS}</div>
          <span style={{ fontSize:'.75rem' }}>&#169; ${new Date().getFullYear()}</span>
        </div>
      </footer>`,
    }),
  },
]

// De assembler vervangt de letterlijke token BRAND door {${j(brandName)}} zodat
// merknaam JSON-veilig en overal identiek is.
export const BRAND_TOKEN = 'BRAND'
export default defs
