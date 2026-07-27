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
  {
    id: 'nav.mega-menu', category: 'nav', label: 'Mega-menu — brede uitklap met kolommen', styles: ['minimal', 'bold', 'editorial'], anims: ['none'],
    tags: ['catalog', 'many-products', 'home', 'tech', 'organized'],
    props: { columns: 'lijst {title, links:[{label,href}]} — max 3' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<nav className="mm-nav" style={{ ${navBase}, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        ${BRAND}
        <div style={{ display:'flex', gap:'clamp(1.25rem,3vw,2.5rem)', alignItems:'center' }}>
          <div className="mm-wrap" style={{ position:'relative' }}>
            <button type="button" className="navl mm-btn" aria-expanded="false" aria-haspopup="true" style={{ background:'none', border:'none', font:'inherit', fontSize:'.82rem', color:'var(--c-muted)', cursor:'pointer', padding:0 }}>Shop</button>
            <div className="mm-panel" style={{ position:'absolute', top:'calc(100% + 1.1rem)', left:'50%', transform:'translateX(-50%)', minWidth:'min(620px,88vw)', background:'var(--c-surface)', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-lg)', boxShadow:'var(--shadow)', padding:'1.5rem', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'1.5rem', zIndex:60 }}>
              {${arr(p.columns, [
                { title: 'Collection', links: [{ label: 'All products', href: '#products' }, { label: 'New in', href: '#products' }] },
                { title: 'Learn', links: [{ label: 'Our story', href: '/about/' }, { label: 'FAQ', href: '/faq/' }] },
                { title: 'Service', links: [{ label: 'Shipping & returns', href: '/returns/' }, { label: 'Contact', href: '/contact/' }] },
              ])}.map((c:any,i:number)=>(
                <div key={i}>
                  <b style={{ display:'block', fontSize:'.72rem', letterSpacing:'.16em', textTransform:'uppercase', color:'var(--c-accent)', marginBottom:'.7rem' }}>{c.title}</b>
                  <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
                    {(c.links||[]).map((l:any,k:number)=><a key={k} href={l.href||'#products'} className="navl" style={{ fontSize:'.85rem' }}>{l.label}</a>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <a href="/about/" className="navl" style={{ fontSize:'.82rem', color:'var(--c-muted)' }}>About</a>
          <a href="/contact/" className="navl" style={{ fontSize:'.82rem', color:'var(--c-muted)' }}>Contact</a>
        </div>
      </nav>`,
      // Hover én focus-within: het menu moet ook met alleen het toetsenbord open
      // te krijgen zijn, anders is de halve navigatie onbereikbaar.
      css: [
        '.mm-panel{opacity:0;visibility:hidden;transform:translateX(-50%) translateY(-6px);transition:opacity .22s,transform .22s,visibility .22s}',
        '.mm-wrap:hover .mm-panel,.mm-wrap:focus-within .mm-panel{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0)}',
        '@media(max-width:720px){.mm-panel{grid-template-columns:1fr !important;min-width:min(320px,86vw) !important}}',
      ].join('\n'),
    }),
  },
  {
    id: 'nav.sticky-solid-on-scroll', category: 'nav', label: 'Transparant bovenaan, wordt vast bij scrollen', styles: ['bold', 'editorial', 'minimal'], anims: ['none'],
    tags: ['fullbleed-hero', 'urban', 'outdoor', 'lifestyle', 'cinematic'],
    props: {},
    render: (): RenderResult => ({
      jsx: `<StickyNav />`,
      css: [
        '.sn{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;justify-content:space-between;align-items:center;padding:1.3rem clamp(1.5rem,5vw,4rem);transition:background-color .35s,padding .35s,box-shadow .35s,color .35s}',
        '.sn a{color:#fff}',
        '.sn.solid{background:var(--c-bg);padding:.85rem clamp(1.5rem,5vw,4rem);box-shadow:var(--shadow)}',
        '.sn.solid a{color:var(--c-text)}',
      ].join('\n'),
    }),
  },
  {
    id: 'nav.sidebar-drawer', category: 'nav', label: 'Hamburger met uitschuivend zijpaneel', styles: ['minimal', 'bold', 'playful'], anims: ['none'],
    tags: ['minimal', 'fashion', 'premium', 'focus'],
    props: {},
    render: (): RenderResult => ({
      jsx: `<DrawerNav />`,
      css: [
        '.dn-panel{position:fixed;top:0;right:0;bottom:0;width:min(340px,84vw);background:var(--c-surface);border-left:var(--bw) solid var(--c-border);transform:translateX(100%);transition:transform .38s cubic-bezier(.22,1,.36,1);z-index:70;padding:5rem 2rem 2rem;display:flex;flex-direction:column;gap:1.2rem}',
        '.dn-panel.open{transform:translateX(0)}',
        '.dn-scrim{position:fixed;inset:0;background:rgba(0,0,0,.42);opacity:0;visibility:hidden;transition:opacity .3s,visibility .3s;z-index:69}',
        '.dn-scrim.open{opacity:1;visibility:visible}',
      ].join('\n'),
    }),
  },
  {
    id: 'nav.split-links', category: 'nav', label: 'Links | gecentreerd logo | links', styles: ['editorial', 'minimal', 'bold'], anims: ['none'],
    tags: ['fashion', 'premium', 'beauty', 'symmetric'],
    props: {},
    render: (): RenderResult => ({
      jsx: `<nav className="sl-nav" style={{ ${navBase}, display:'grid', gridTemplateColumns:'1fr auto 1fr', alignItems:'center', gap:'1rem' }}>
        <div style={{ display:'flex', gap:'clamp(1rem,2.5vw,2rem)' }}>{[['Shop','#products'],['About','/about/']].map(([l,h])=><a key={l} href={h} className="navl" style={{ fontSize:'.8rem', color:'var(--c-muted)', letterSpacing:'.08em', textTransform:'uppercase' }}>{l}</a>)}</div>
        <div style={{ textAlign:'center' }}>${BRAND}</div>
        <div style={{ display:'flex', gap:'clamp(1rem,2.5vw,2rem)', justifyContent:'flex-end' }}>{[['FAQ','/faq/'],['Contact','/contact/']].map(([l,h])=><a key={l} href={h} className="navl" style={{ fontSize:'.8rem', color:'var(--c-muted)', letterSpacing:'.08em', textTransform:'uppercase' }}>{l}</a>)}</div>
      </nav>`,
      css: '@media(max-width:720px){.sl-nav{grid-template-columns:1fr !important;justify-items:center;gap:.7rem !important}}',
    }),
  },
  {
    id: 'nav.icon-compact', category: 'nav', label: 'Compact — logo met icoonknoppen rechts', styles: ['minimal', 'bold'], anims: ['none'],
    tags: ['tech', 'kids', 'pets', 'compact', 'mobile'],
    props: {},
    render: (): RenderResult => ({
      jsx: `<nav style={{ ${navBase}, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        ${BRAND}
        <div style={{ display:'flex', gap:'1.4rem', alignItems:'center' }}>
          <a href="#products" className="navl" style={{ fontSize:'.82rem', color:'var(--c-muted)' }}>Shop</a>
          <a href="/faq/" className="navl" aria-label="Help" style={{ display:'inline-flex', color:'var(--c-muted)' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.6.2-.7.6-.7 1.1v.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>
          </a>
          <a href="/checkout/" className="navl" aria-label="Checkout" style={{ display:'inline-flex', color:'var(--c-text)' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7h14l-1.2 11H6.2z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>
          </a>
        </div>
      </nav>`,
    }),
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
  {
    id: 'footer.big-wordmark', category: 'footer', label: 'Enorm merkwoord over de volle breedte', styles: ['bold', 'editorial'], anims: ['none', 'subtle'],
    tags: ['statement', 'fashion', 'urban', 'premium'], props: { tagline: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<footer style={{ background:'var(--c-text)', color:'var(--c-bg)', padding:'clamp(3rem,6vw,5rem) clamp(1.5rem,5vw,4rem) 0', overflow:'hidden' }}>
        <div className="wrap" style={{ display:'flex', justifyContent:'space-between', gap:'2rem', flexWrap:'wrap', marginBottom:'2.5rem' }}>
          <p style={{ maxWidth:'34ch', opacity:.72, lineHeight:1.7, margin:0 }}>${txt(p.tagline, 'A focused collection, delivered fast across Europe.')}</p>
          <div style={{ display:'flex', gap:'1.5rem', flexWrap:'wrap', alignItems:'flex-start' }}>{[['Shop','#products'],['About','/about/'],['FAQ','/faq/'],['Returns','/returns/'],['Contact','/contact/']].map(([l,h])=><a key={l} href={h} className="navl" style={{ fontSize:'.82rem', opacity:.8 }}>{l}</a>)}</div>
        </div>
        <div${am(ctx.anim, 'mask')} style={{ fontFamily:'var(--f-head)', fontWeight:'var(--fw-head)', fontSize:'clamp(3rem,15vw,11rem)', lineHeight:.9, letterSpacing:'-.02em', textTransform:'var(--tt-head)', whiteSpace:'nowrap', overflow:'hidden' }}>${'{'}BRAND${'}'}</div>
        <p style={{ opacity:.5, fontSize:'.72rem', padding:'1.2rem 0 1.5rem', margin:0 }}>&#169; ${new Date().getFullYear()} — All rights reserved.</p>
      </footer>`,
    }),
  },
  {
    id: 'footer.contact-block', category: 'footer', label: 'Met contactgegevens en openingstijden', styles: ['minimal', 'editorial'], anims: ['none'],
    tags: ['trust', 'home', 'kitchen', 'pets', 'service'], props: { tagline: '', email: '', hours: '' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<footer style={{ background:'var(--c-surface)', color:'var(--c-text)', padding:'clamp(3rem,6vw,4.5rem) clamp(1.5rem,5vw,4rem)', borderTop:'var(--bw) solid var(--c-border)' }}>
        <div className="wrap grid3" style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr', gap:'2rem' }}>
          <div>
            <p style={{ fontFamily:'var(--f-head)', fontWeight:'var(--fw-head)', fontSize:'1.15rem', margin:'0 0 .5rem', textTransform:'var(--tt-head)' }}>${'{'}BRAND${'}'}</p>
            <p style={{ color:'var(--c-muted)', fontSize:'.86rem', lineHeight:1.7, maxWidth:'34ch', margin:0 }}>${txt(p.tagline, 'Questions before you order? We answer within one working day.')}</p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
            <b style={{ fontSize:'.75rem', letterSpacing:'.14em', textTransform:'uppercase', color:'var(--c-accent)' }}>Reach us</b>
            <span style={{ color:'var(--c-muted)', fontSize:'.86rem' }}>${txt(p.email, 'hello@example.com')}</span>
            <span style={{ color:'var(--c-muted)', fontSize:'.86rem' }}>${txt(p.hours, 'Mon-Fri, 09:00-17:00 CET')}</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'.55rem' }}>
            <b style={{ fontSize:'.75rem', letterSpacing:'.14em', textTransform:'uppercase', color:'var(--c-accent)' }}>Info</b>
            {[['FAQ','/faq/'],['Returns','/returns/'],['Contact','/contact/'],['About','/about/']].map(([l,h])=><a key={l} href={h} className="navl" style={{ color:'var(--c-muted)', fontSize:'.86rem' }}>{l}</a>)}
          </div>
        </div>
        <p style={{ color:'var(--c-muted)', fontSize:'.74rem', marginTop:'2.5rem' }}>&#169; ${new Date().getFullYear()}</p>
      </footer>`,
    }),
  },
  {
    id: 'footer.social-strip', category: 'footer', label: 'Sociale iconen boven een smalle linkbalk', styles: ['playful', 'bold', 'minimal'], anims: ['none'],
    tags: ['kids', 'beauty', 'fashion', 'community'], props: { tagline: '' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<footer style={{ background:'var(--c-surface-alt)', color:'var(--c-text)', padding:'clamp(2.5rem,5vw,4rem) clamp(1.5rem,5vw,4rem)', borderTop:'var(--bw) solid var(--c-border)', textAlign:'center' }}>
        <p style={{ fontFamily:'var(--f-head)', fontWeight:'var(--fw-head)', fontSize:'1.3rem', margin:'0 0 .4rem', textTransform:'var(--tt-head)' }}>${'{'}BRAND${'}'}</p>
        <p style={{ color:'var(--c-muted)', fontSize:'.88rem', margin:'0 0 1.6rem' }}>${txt(p.tagline, 'Follow along for new arrivals.')}</p>
        <div style={{ display:'flex', gap:'1.1rem', justifyContent:'center', marginBottom:'1.8rem' }}>
          {[
            ['Instagram','M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M17.5 6.6v.01'],
            ['Pinterest','M12 3a9 9 0 0 0-3.3 17.4c-.1-.8-.2-2 0-2.9l1.2-5s-.3-.6-.3-1.5c0-1.4.8-2.4 1.8-2.4.9 0 1.3.6 1.3 1.4 0 .9-.5 2.2-.8 3.4-.2 1 .5 1.8 1.5 1.8 1.8 0 3-2.3 3-5 0-2-1.4-3.6-3.9-3.6-2.9 0-4.6 2.1-4.6 4.4 0 .8.2 1.4.6 1.8.2.2.2.3.1.5l-.2.7c0 .2-.2.3-.4.2-1.2-.5-1.8-1.9-1.8-3.4 0-2.5 2.1-5.5 6.3-5.5 3.4 0 5.6 2.4 5.6 5 0 3.4-1.9 6-4.7 6-1 0-1.9-.5-2.2-1.1l-.6 2.4c-.2.7-.6 1.6-1 2.2A9 9 0 1 0 12 3z'],
            ['TikTok','M14 3v10.5a3.5 3.5 0 1 1-3-3.46 M14 3c.6 2.2 2.2 3.6 4.5 3.8'],
          ].map(([label,d])=>(
            <a key={label} href="#" aria-label={label} className="navl" style={{ display:'inline-flex', color:'var(--c-text)' }} onClick={(e)=>e.preventDefault()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
            </a>
          ))}
        </div>
        <div style={{ display:'flex', gap:'1.4rem', justifyContent:'center', flexWrap:'wrap', borderTop:'var(--bw) solid var(--c-border)', paddingTop:'1.4rem' }}>${NAV_LINKS}</div>
        <p style={{ color:'var(--c-muted)', fontSize:'.72rem', marginTop:'1.2rem' }}>&#169; ${new Date().getFullYear()}</p>
      </footer>`,
    }),
  },
  {
    id: 'footer.dark-compact', category: 'footer', label: 'Donker en compact — één regel met scheiding', styles: ['minimal', 'bold', 'editorial'], anims: ['none'],
    tags: ['tech', 'minimal', 'premium', 'compact'], props: { tagline: '' },
    render: (): RenderResult => ({
      jsx: `<footer style={{ background:'var(--c-text)', color:'var(--c-bg)', padding:'1.6rem clamp(1.5rem,5vw,4rem)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem' }}>
        <span style={{ fontFamily:'var(--f-head)', fontWeight:'var(--fw-head)', textTransform:'var(--tt-head)', fontSize:'.95rem' }}>${'{'}BRAND${'}'}</span>
        <div style={{ display:'flex', gap:'1.4rem', flexWrap:'wrap' }}>{[['Shop','#products'],['FAQ','/faq/'],['Returns','/returns/'],['Contact','/contact/']].map(([l,h])=><a key={l} href={h} className="navl" style={{ fontSize:'.78rem', opacity:.75 }}>{l}</a>)}</div>
        <span style={{ fontSize:'.72rem', opacity:.5 }}>&#169; ${new Date().getFullYear()}</span>
      </footer>`,
    }),
  },
  {
    id: 'footer.sitemap-columns', category: 'footer', label: 'Vier kolommen sitemap met betaalbadges', styles: ['minimal', 'bold'], anims: ['none'],
    tags: ['catalog', 'trust', 'considered', 'home', 'tech'], props: { tagline: '' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<footer style={{ background:'var(--c-surface-alt)', color:'var(--c-text)', padding:'clamp(3rem,6vw,4.5rem) clamp(1.5rem,5vw,4rem) 2rem', borderTop:'var(--bw) solid var(--c-border)' }}>
        <div className="wrap grid4" style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr 1fr 1fr', gap:'2rem' }}>
          <div>
            <p style={{ fontFamily:'var(--f-head)', fontWeight:'var(--fw-head)', fontSize:'1.15rem', margin:'0 0 .5rem', textTransform:'var(--tt-head)' }}>${'{'}BRAND${'}'}</p>
            <p style={{ color:'var(--c-muted)', fontSize:'.85rem', lineHeight:1.7, maxWidth:'30ch', margin:0 }}>${txt(p.tagline, 'Shipped from European warehouses, returnable for 30 days.')}</p>
          </div>
          {[
            ['Shop', [['All products','#products'],['New in','#products']]],
            ['Help', [['FAQ','/faq/'],['Returns','/returns/'],['Contact','/contact/']]],
            ['Brand', [['About','/about/'],['Our promise','/about/']]],
          ].map(([title, links]:any)=>(
            <div key={title} style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
              <b style={{ fontSize:'.72rem', letterSpacing:'.14em', textTransform:'uppercase', color:'var(--c-accent)' }}>{title}</b>
              {links.map(([l,h]:any)=><a key={l} href={h} className="navl" style={{ color:'var(--c-muted)', fontSize:'.84rem' }}>{l}</a>)}
            </div>
          ))}
        </div>
        <div className="wrap" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem', marginTop:'2.5rem', paddingTop:'1.5rem', borderTop:'var(--bw) solid var(--c-border)' }}>
          <span style={{ color:'var(--c-muted)', fontSize:'.73rem' }}>&#169; ${new Date().getFullYear()} — All rights reserved.</span>
          <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
            {['VISA','MC','AMEX','iDEAL'].map(b=>(
              <span key={b} style={{ fontSize:'.6rem', fontWeight:700, letterSpacing:'.06em', color:'var(--c-muted)', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-sm)', padding:'.25rem .5rem', background:'var(--c-surface)' }}>{b}</span>
            ))}
          </div>
        </div>
      </footer>`,
      css: '@media(max-width:900px){.grid4{grid-template-columns:1fr 1fr !important}}',
    }),
  },
]

// De assembler vervangt de letterlijke token BRAND door {${j(brandName)}} zodat
// merknaam JSON-veilig en overal identiek is.
export const BRAND_TOKEN = 'BRAND'
export default defs
