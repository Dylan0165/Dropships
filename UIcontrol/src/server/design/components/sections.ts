// ═══════ Social proof · CTA · content · badges · gallery · forms ═══════
// Bewust no-JS waar mogelijk (details/summary, CSS-animatie) → robuust, geen
// crash-risico. Interactieve helpers (Countdown) worden door de assembler
// geïnjecteerd. Alles op CSS-variabelen.

import type { ComponentDef, RenderCtx, ComponentProps, RenderResult } from './types.js'
import { txt, arr, reveal, j } from './types.js'

const sect = (inner: string, bg = 'var(--c-bg)') => `<section className="sect" style={{ background:${JSON.stringify(bg)} }}><div className="wrap">${inner}</div></section>`
const title = (ctx: RenderCtx, t: unknown, fb: string) => reveal(ctx.anim, 'up', `<h2 style={{ fontSize:'clamp(1.6rem,3vw,2.2rem)', textAlign:'center', margin:'0 0 2.5rem', textTransform:'var(--tt-head)' }}>${txt(t, fb)}</h2>`)

const defs: ComponentDef[] = [
  // ── TESTIMONIALS ────────────────────────────────────────────────────────────
  {
    id: 'testimonials.cards-grid', category: 'testimonials', label: 'Review-kaarten grid', styles: ['minimal', 'bold', 'editorial'], anims: ['subtle', 'expressive'],
    tags: ['universal', 'trust'], props: { title: 'kop', items: '[{name,stars,text}]' },
    render: (ctx, p) => ({
      jsx: sect(`${title(ctx, p.title, 'What customers say')}
        <div className="grid3" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:'1.5rem' }}>
          {${arr(p.items, [{ name: 'Emma R.', stars: 5, text: 'Exactly as described — the quality genuinely surprised me.' }, { name: 'James T.', stars: 5, text: 'Fast delivery and premium packaging.' }, { name: 'Sofia L.', stars: 4, text: 'Better than expected for the price.' }])}.map((r:any,i:number)=>(
            <Reveal key={i} v="fade" delay={i*120}><div style={{ padding:'1.75rem', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-lg)', background:'var(--c-surface)' }}>
              <div style={{ color:'var(--c-accent)', marginBottom:'.75rem', letterSpacing:'2px' }}>{Array.from({length:r.stars||5}).map((_,k)=><span key={k}>&#9733;</span>)}</div>
              <p style={{ lineHeight:1.7, margin:'0 0 1rem', fontSize:'.95rem' }}>&#8220;{r.text}&#8221;</p>
              <span style={{ fontSize:'.85rem', fontWeight:700, color:'var(--c-muted)' }}>{r.name}</span>
            </div></Reveal>
          ))}
        </div>`, 'var(--c-surface-alt)'),
    }),
  },
  {
    id: 'testimonials.marquee', category: 'testimonials', label: 'Doorlopende review-ticker', styles: ['bold', 'playful'], anims: ['expressive'],
    tags: ['playful', 'urban', 'energetic'], props: { items: '[{name,text}]' },
    render: (_ctx, p) => ({
      css: '.tm{overflow:hidden;white-space:nowrap}.tm-t{display:inline-flex;gap:1.5rem;animation:tmscroll 32s linear infinite;will-change:transform}@keyframes tmscroll{to{transform:translateX(-50%)}}',
      jsx: `<section className="tm" style={{ padding:'clamp(2.5rem,5vw,4rem) 0', background:'var(--c-surface-alt)' }}>
        <div className="tm-t">{[...${arr(p.items, [{ name: 'Mia V.', text: 'Obsessed.' }, { name: 'Leo W.', text: 'Five stars, would buy again.' }, { name: 'Ava C.', text: 'Arrived in 3 days.' }, { name: 'Noah P.', text: 'Looks even better in person.' }])}, ...${arr(p.items, [{ name: 'Mia V.', text: 'Obsessed.' }, { name: 'Leo W.', text: 'Five stars, would buy again.' }, { name: 'Ava C.', text: 'Arrived in 3 days.' }, { name: 'Noah P.', text: 'Looks even better in person.' }])}].map((r:any,i:number)=>(
          <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:'.6rem', fontSize:'1.05rem' }}><span style={{ color:'var(--c-accent)' }}>&#9733;</span>&#8220;{r.text}&#8221; <b style={{ color:'var(--c-muted)', fontWeight:600, fontSize:'.85rem' }}>{r.name}</b></span>
        ))}</div>
      </section>`,
    }),
  },
  {
    id: 'testimonials.quote-large', category: 'testimonials', label: 'Eén groot quote-blok', styles: ['editorial', 'minimal'], anims: ['subtle'],
    tags: ['premium', 'editorial', 'brand'], props: { quote: 'de quote', author: 'naam' },
    render: (ctx, p) => ({
      jsx: sect(reveal(ctx.anim, 'fade', `<figure style={{ maxWidth:'820px', margin:'0 auto', textAlign:'center' }}>
        <blockquote style={{ fontFamily:'var(--f-head)', fontSize:'clamp(1.6rem,3.6vw,2.6rem)', lineHeight:1.3, margin:0, textTransform:'var(--tt-head)' }}>&#8220;${txt(p.quote, 'The only one I recommend to friends.')}&#8221;</blockquote>
        <figcaption style={{ marginTop:'1.5rem', color:'var(--c-muted)', fontSize:'.9rem', letterSpacing:'.05em' }}>${txt(p.author, '— A very happy customer')}</figcaption>
      </figure>`)),
    }),
  },
  {
    id: 'testimonials.stars-compact', category: 'testimonials', label: 'Compacte score + aantal reviews', styles: ['minimal', 'bold'], anims: ['subtle'],
    tags: ['trust', 'conversion', 'compact'], props: { score: 'bv 4.8', count: 'aantal reviews' },
    render: (ctx, p) => ({
      jsx: sect(reveal(ctx.anim, 'up', `<div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'1rem', flexWrap:'wrap' }}>
        <span style={{ color:'var(--c-accent)', fontSize:'1.4rem', letterSpacing:'3px' }}>&#9733;&#9733;&#9733;&#9733;&#9733;</span>
        <span style={{ fontWeight:800, fontSize:'1.4rem' }}>${txt(p.score, '4.8')}</span>
        <span style={{ color:'var(--c-muted)' }}>from ${txt(p.count, '2,400+')} verified reviews</span>
      </div>`), 'var(--c-surface-alt)'),
    }),
  },
  // ── CTA / URGENCY ─────────────────────────────────────────────────────────────
  {
    id: 'cta.countdown', category: 'cta', label: 'Aanbieding met live countdown', styles: ['bold', 'playful'], anims: ['subtle'],
    tags: ['urgency', 'impulse', 'sale'], props: { title: 'kop', sub: 'ondertitel', button: 'knop', hours: 'uren tot einde' },
    render: (_ctx, p) => ({
      jsx: `<section className="sect" style={{ background:'var(--c-primary)', color:'var(--c-primary-text)', textAlign:'center' }}>
        <h2 style={{ fontSize:'clamp(1.6rem,3.5vw,2.4rem)', margin:'0 0 .5rem', color:'var(--c-primary-text)', textTransform:'var(--tt-head)' }}>${txt(p.title, 'Launch offer ends soon')}</h2>
        <p style={{ opacity:.85, margin:'0 0 1.5rem' }}>${txt(p.sub, 'Free shipping on every order until the timer runs out.')}</p>
        <Countdown hours={${Number(p.hours) || 24}} />
        <a href="#products" className="btnp" style={{ display:'inline-block', marginTop:'1.75rem', background:'var(--c-primary-text)', color:'var(--c-primary)', padding:'.9rem 2.2rem', borderRadius:'var(--r-btn)', fontWeight:800, textTransform:'uppercase', letterSpacing:'.04em', fontSize:'.85rem' }}>${'{'}${j(String(p.button ?? 'Shop the sale'))}${'}'}</a>
      </section>`,
    }),
  },
  {
    id: 'cta.free-shipping-bar', category: 'cta', label: 'Gratis-verzending balk', styles: ['minimal', 'bold', 'playful'], anims: ['none', 'subtle'],
    tags: ['universal', 'trust'], props: { text: 'de tekst' },
    render: (_ctx, p) => ({
      jsx: `<section style={{ background:'var(--c-accent)', color:'var(--c-primary-text)', textAlign:'center', padding:'.85rem 1rem', fontSize:'.85rem', fontWeight:600, letterSpacing:'.03em' }}>${txt(p.text, 'Free EU shipping on all orders — delivered in 3-8 days')}</section>`,
    }),
  },
  {
    id: 'cta.stock-indicator', category: 'cta', label: 'Voorraad-schaarste indicator', styles: ['bold', 'minimal'], anims: ['subtle'],
    tags: ['urgency', 'impulse'], props: { title: '', sub: '', button: '' },
    render: (ctx, p) => ({
      jsx: sect(reveal(ctx.anim, 'up', `<div style={{ textAlign:'center', maxWidth:'640px', margin:'0 auto' }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:'.5rem', background:'var(--c-surface-alt)', color:'var(--c-text)', padding:'.4rem .9rem', borderRadius:'var(--r-pill)', fontSize:'.78rem', fontWeight:700 }}><span style={{ width:8, height:8, borderRadius:'50%', background:'var(--c-accent)', display:'inline-block' }} />${txt(p.badge, 'Selling fast — low stock')}</span>
        <h2 style={{ fontSize:'clamp(1.5rem,3vw,2rem)', margin:'1rem 0 .6rem', textTransform:'var(--tt-head)' }}>${txt(p.title, "Don't miss out")}</h2>
        <p style={{ color:'var(--c-muted)', margin:'0 0 1.5rem' }}>${txt(p.sub, 'Our most popular pieces sell out regularly. Secure yours today.')}</p>
        <a href="#products" className="btnp btn">${'{'}${j(String(p.button ?? 'Shop now'))}${'}'}</a>
      </div>`)),
    }),
  },
  {
    id: 'cta.sticky-bottom', category: 'cta', label: 'Sticky bottom-bar (blijft in beeld)', styles: ['minimal', 'bold'], anims: ['none'],
    tags: ['conversion', 'mobile'], props: { text: '', button: '' },
    render: (_ctx, p) => ({
      css: '.stickybar{position:sticky;bottom:0;z-index:40}',
      jsx: `<div className="stickybar" style={{ background:'var(--c-surface)', borderTop:'var(--bw) solid var(--c-border)', boxShadow:'0 -6px 24px rgba(0,0,0,.08)', padding:'.8rem clamp(1rem,4vw,2rem)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
        <span style={{ fontWeight:600, fontSize:'.9rem' }}>${txt(p.text, 'Ready when you are.')}</span>
        <a href="#products" className="btnp btn" style={{ padding:'.6rem 1.4rem' }}>${'{'}${j(String(p.button ?? 'Shop now'))}${'}'}</a>
      </div>`,
    }),
  },
  // ── CONTENT BLOCKS ────────────────────────────────────────────────────────────
  {
    id: 'content.faq-accordion', category: 'content', label: 'FAQ accordion (no-JS details/summary)', styles: ['minimal', 'editorial', 'bold'], anims: ['subtle'],
    tags: ['trust', 'considered', 'support'], props: { title: '', items: '[{q,a}]' },
    render: (ctx, p) => ({
      css: '.faq summary{cursor:pointer;list-style:none;padding:1.1rem 0;font-weight:600;display:flex;justify-content:space-between;align-items:center}.faq summary::-webkit-details-marker{display:none}.faq summary::after{content:"+";color:var(--c-accent);font-size:1.3rem}.faq details[open] summary::after{content:"\\2013"}.faq details{border-bottom:var(--bw) solid var(--c-border)}',
      jsx: sect(`${title(ctx, p.title, 'Frequently asked')}
        <div className="faq" style={{ maxWidth:'720px', margin:'0 auto' }}>
          {${arr(p.items, [{ q: 'How long does shipping take?', a: 'EU orders arrive in 3-8 days.' }, { q: 'What is your return policy?', a: '30 days, no questions asked.' }, { q: 'Is payment secure?', a: 'Yes — encrypted checkout via Stripe.' }])}.map((f:any,i:number)=>(
            <details key={i}><summary>{f.q}</summary><p style={{ color:'var(--c-muted)', lineHeight:1.7, padding:'0 0 1.1rem' }}>{f.a}</p></details>
          ))}
        </div>`),
    }),
  },
  {
    id: 'content.comparison-table', category: 'content', label: 'Vergelijkingstabel (wij vs de rest)', styles: ['minimal', 'bold'], anims: ['subtle'],
    tags: ['considered', 'trust', 'premium'], props: { title: '', rows: '[string] voordelen', us: 'merknaam' },
    render: (ctx, p) => ({
      jsx: sect(`${title(ctx, p.title, 'Why choose us')}
        <div style={{ maxWidth:'640px', margin:'0 auto', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-lg)', overflow:'hidden' }}>
          {${arr(p.rows, ['Free EU shipping', '30-day returns', 'Ships in 1-2 days', 'Real human support'])}.map((row:string,i:number)=>(
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:'1rem', alignItems:'center', padding:'.9rem 1.2rem', borderTop: i===0?'none':'var(--bw) solid var(--c-border)', background: i%2?'var(--c-surface-alt)':'var(--c-surface)' }}>
              <span style={{ fontSize:'.9rem' }}>{row}</span>
              <span style={{ color:'var(--c-accent)', fontWeight:800 }}>&#10003;</span>
              <span style={{ color:'var(--c-muted)', opacity:.5 }}>&#10007;</span>
            </div>
          ))}
        </div>`, 'var(--c-surface-alt)'),
    }),
  },
  {
    id: 'content.why-us-grid', category: 'content', label: 'Why-us / USP grid (iconen)', styles: ['minimal', 'bold', 'playful'], anims: ['subtle', 'expressive'],
    tags: ['universal', 'trust'], props: { title: '', items: '[{title,desc}]' },
    render: (ctx, p) => ({
      jsx: sect(`${title(ctx, p.title, 'Built different')}
        <div className="grid3" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'clamp(1.5rem,3vw,2.5rem)', maxWidth:'1000px', margin:'0 auto' }}>
          {${arr(p.items, [{ title: 'Fast EU delivery', desc: 'From our European warehouse in 3-8 days.' }, { title: '30-day guarantee', desc: 'Not for you? Send it back, no questions.' }, { title: 'Secure checkout', desc: 'Encrypted payment, every time.' }])}.map((u:any,i:number)=>(
            <Reveal key={i} v="up" delay={i*90}><div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'1.4rem', marginBottom:'.6rem', color:'var(--c-accent)' }}>&#9679;</div>
              <h3 style={{ fontSize:'1rem', margin:'0 0 .4rem' }}>{u.title}</h3>
              <p style={{ color:'var(--c-muted)', fontSize:'.9rem', lineHeight:1.6, margin:0 }}>{u.desc}</p>
            </div></Reveal>
          ))}
        </div>`),
    }),
  },
  {
    id: 'content.story-split', category: 'content', label: 'Merkverhaal — tekst naast beeld', styles: ['editorial', 'minimal'], anims: ['subtle'],
    tags: ['brand', 'story', 'considered'], props: { title: '', body: '', image: 'optionele beeld-url' },
    render: (ctx, p) => {
      // Zonder expliciete image-prop mag de `"" || …`-vorm er niet in staan: TS
      // ziet dan een altijd-falsy expressie en `next build` weigert (strict).
      // Zonder eigen beeld: via <HeroImg> (assemble.ts), zodat een kale pakshot
      // ook hier op de sfeerlaag komt in plaats van uitgesneden te worden.
      const img = typeof p.image === 'string' && p.image.trim()
        ? `<img src={${j(p.image)}} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />`
        : '<HeroImg />'
      return {
        jsx: sect(`<div className="split" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'clamp(2rem,5vw,4rem)', alignItems:'center' }}>
        ${reveal(ctx.anim, 'left', `<div>
          <span className="eyebrow" style={{ marginBottom:'1rem' }}>Our story</span>
          <h2 style={{ fontSize:'clamp(1.7rem,3.2vw,2.4rem)', margin:'0 0 1.1rem', textTransform:'var(--tt-head)' }}>${txt(p.title, 'Why we started')}</h2>
          <p style={{ color:'var(--c-muted)', lineHeight:1.9, fontSize:'1.05rem', margin:0 }}>${txt(p.body, 'We built this around one frustration, and kept the range focused ever since.')}</p>
        </div>`)}
        <div style={{ aspectRatio:'4/3', overflow:'hidden', borderRadius:'var(--r-lg)', background:'var(--c-surface-alt)' }}>${img}</div>
      </div>`, 'var(--c-surface-alt)'),
      }
    },
  },
  {
    id: 'content.stats-showcase', category: 'content', label: 'Cijfers-showcase (3-4 stats)', styles: ['bold', 'minimal'], anims: ['subtle', 'expressive'],
    tags: ['trust', 'scale', 'brand'], props: { items: '[{value,label}]' },
    render: (ctx, p) => ({
      jsx: sect(`<div className="grid4" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'2rem', textAlign:'center' }}>
        {${arr(p.items, [{ value: '50k+', label: 'Orders shipped' }, { value: '4.8/5', label: 'Average rating' }, { value: '3-8d', label: 'EU delivery' }, { value: '30d', label: 'Free returns' }])}.map((s:any,i:number)=>(
          <Reveal key={i} v="scale" delay={i*90}><div>
            <div style={{ fontFamily:'var(--f-head)', fontSize:'clamp(2rem,4vw,3rem)', fontWeight:800, color:'var(--c-accent)' }}>{s.value}</div>
            <div style={{ color:'var(--c-muted)', fontSize:'.85rem', letterSpacing:'.05em', textTransform:'uppercase' }}>{s.label}</div>
          </div></Reveal>
        ))}
      </div>`),
    }),
  },
  {
    id: 'content.process-steps', category: 'content', label: 'Proces in stappen (1-2-3)', styles: ['minimal', 'playful', 'bold'], anims: ['subtle'],
    tags: ['explainer', 'considered'], props: { title: '', items: '[{title,desc}]' },
    render: (ctx, p) => ({
      jsx: sect(`${title(ctx, p.title, 'How it works')}
        <div className="grid3" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'clamp(1.5rem,3vw,2.5rem)', maxWidth:'1000px', margin:'0 auto' }}>
          {${arr(p.items, [{ title: 'Choose', desc: 'Pick what fits your routine.' }, { title: 'Checkout', desc: 'Fast, secure, encrypted.' }, { title: 'Enjoy', desc: 'Delivered to your door in days.' }])}.map((s:any,i:number)=>(
            <Reveal key={i} v="up" delay={i*100}><div>
              <div style={{ fontFamily:'var(--f-head)', fontSize:'2rem', fontWeight:800, color:'var(--c-accent)', opacity:.5 }}>{String(i+1).padStart(2,'0')}</div>
              <h3 style={{ fontSize:'1.05rem', margin:'.3rem 0 .4rem' }}>{s.title}</h3>
              <p style={{ color:'var(--c-muted)', fontSize:'.9rem', lineHeight:1.6, margin:0 }}>{s.desc}</p>
            </div></Reveal>
          ))}
        </div>`, 'var(--c-surface-alt)'),
    }),
  },
  // ── BADGES / TRUST ────────────────────────────────────────────────────────────
  {
    id: 'badges.trust-row', category: 'badges', label: 'Trust-badge rij (verzending/retour/betaling)', styles: ['minimal', 'bold'], anims: ['none', 'subtle'],
    tags: ['universal', 'trust', 'conversion'], props: { items: '[string]' },
    render: (_ctx, p) => ({
      jsx: `<section style={{ padding:'clamp(1.5rem,3vw,2.5rem) clamp(1.5rem,5vw,4rem)', background:'var(--c-surface)', borderTop:'var(--bw) solid var(--c-border)', borderBottom:'var(--bw) solid var(--c-border)' }}>
        <div className="wrap" style={{ display:'flex', gap:'clamp(1rem,4vw,3rem)', justifyContent:'center', flexWrap:'wrap' }}>
          {${arr(p.items, ['Free EU shipping', '30-day returns', 'Secure Stripe payment', '3-8 day delivery'])}.map((b:string,i:number)=>(
            <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:'.5rem', fontSize:'.82rem', color:'var(--c-muted)', fontWeight:600 }}><span style={{ color:'var(--c-accent)' }}>&#10003;</span>{b}</span>
          ))}
        </div>
      </section>`,
    }),
  },
  {
    id: 'badges.guarantee', category: 'badges', label: 'Garantie-zegel blok', styles: ['bold', 'editorial'], anims: ['subtle'],
    tags: ['trust', 'premium', 'considered'], props: { title: '', sub: '' },
    render: (ctx, p) => ({
      jsx: sect(reveal(ctx.anim, 'scale', `<div style={{ textAlign:'center', maxWidth:'560px', margin:'0 auto' }}>
        <div style={{ width:88, height:88, margin:'0 auto 1.2rem', borderRadius:'50%', border:'2px solid var(--c-accent)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--c-accent)', fontSize:'2rem' }}>&#10003;</div>
        <h2 style={{ fontSize:'clamp(1.4rem,2.6vw,1.9rem)', margin:'0 0 .6rem', textTransform:'var(--tt-head)' }}>${txt(p.title, '30-day money-back guarantee')}</h2>
        <p style={{ color:'var(--c-muted)', margin:0, lineHeight:1.7 }}>${txt(p.sub, "If it's not right for you, send it back within 30 days for a full refund.")}</p>
      </div>`)),
    }),
  },
  {
    id: 'badges.review-score', category: 'badges', label: 'Review-score badge (compact strip)', styles: ['minimal', 'playful'], anims: ['none'],
    tags: ['trust', 'compact'], props: { score: '', count: '' },
    render: (_ctx, p) => ({
      jsx: `<section style={{ padding:'1.2rem', textAlign:'center', background:'var(--c-surface-alt)' }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:'.6rem', fontSize:'.9rem', fontWeight:600 }}>
          <span style={{ color:'var(--c-accent)', letterSpacing:'2px' }}>&#9733;&#9733;&#9733;&#9733;&#9733;</span> ${txt(p.score, '4.8')} <span style={{ color:'var(--c-muted)', fontWeight:400 }}>· ${txt(p.count, '2,400+')} reviews</span>
        </span>
      </section>`,
    }),
  },
  // ── GALLERY ───────────────────────────────────────────────────────────────────
  {
    id: 'gallery.grid-uniform', category: 'gallery', label: 'Uniforme beeld-grid (lookbook)', styles: ['minimal', 'editorial'], anims: ['subtle', 'expressive'],
    tags: ['lifestyle', 'fashion', 'lookbook'], props: { title: '' },
    render: (ctx, p) => ({
      jsx: sect(`${title(ctx, p.title, 'In the wild')}
        <div className="grid4" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'.75rem' }}>
          {PRODUCTS.slice(0,8).map((pr:any,i:number)=>(
            <Reveal key={pr.id} v="scale" delay={(i%4)*70}><div style={{ aspectRatio:'1', overflow:'hidden', borderRadius:'var(--r-md)', background:'var(--c-surface-alt)' }}>{pr.image ? <img className="cimg" src={pr.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}</div></Reveal>
          ))}
        </div>`),
    }),
  },
  {
    id: 'gallery.split-text', category: 'gallery', label: 'Beeld + tekst split (feature)', styles: ['editorial', 'bold'], anims: ['subtle'],
    tags: ['lifestyle', 'feature', 'brand'], props: { title: '', body: '' },
    render: (ctx, p) => ({
      jsx: sect(`<div className="split" style={{ display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:'clamp(2rem,5vw,4rem)', alignItems:'center' }}>
        <div style={{ aspectRatio:'4/3', overflow:'hidden', borderRadius:'var(--r-lg)', background:'var(--c-surface-alt)' }}>{PRODUCTS[1] && PRODUCTS[1].image ? <img src={PRODUCTS[1].image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}</div>
        ${reveal(ctx.anim, 'right', `<div>
          <h2 style={{ fontSize:'clamp(1.6rem,3vw,2.2rem)', margin:'0 0 1rem', textTransform:'var(--tt-head)' }}>${txt(p.title, 'Made for real life')}</h2>
          <p style={{ color:'var(--c-muted)', lineHeight:1.8, margin:0 }}>${txt(p.body, 'Designed to fit the way you actually live — not a studio shoot.')}</p>
        </div>`)}
      </div>`),
    }),
  },
  // ── FORMS ─────────────────────────────────────────────────────────────────────
  {
    id: 'form.newsletter-inline', category: 'form', label: 'Newsletter inline (no-JS, mailto/action)', styles: ['minimal', 'bold', 'playful'], anims: ['subtle'],
    tags: ['universal', 'retention'], props: { title: '', sub: '' },
    render: (ctx, p) => ({
      jsx: sect(reveal(ctx.anim, 'up', `<div style={{ maxWidth:'560px', margin:'0 auto', textAlign:'center' }}>
        <h2 style={{ fontSize:'clamp(1.5rem,3vw,2rem)', margin:'0 0 .5rem', textTransform:'var(--tt-head)' }}>${txt(p.title, 'Get 10% off your first order')}</h2>
        <p style={{ color:'var(--c-muted)', margin:'0 0 1.5rem' }}>${txt(p.sub, 'Join the list for early access and member pricing.')}</p>
        <form onSubmit={(e)=>e.preventDefault()} style={{ display:'flex', gap:'.6rem', flexWrap:'wrap', justifyContent:'center' }}>
          <input type="email" required placeholder="you@email.com" aria-label="Email" style={{ flex:'1 1 240px', padding:'.85rem 1rem', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-btn)', background:'var(--c-surface)', color:'var(--c-text)', fontFamily:'inherit' }} />
          <button type="submit" className="btnp btn">Subscribe</button>
        </form>
      </div>`), 'var(--c-surface-alt)'),
    }),
  },
  {
    id: 'form.contact-simple', category: 'form', label: 'Simpel contactformulier', styles: ['minimal', 'editorial'], anims: ['subtle'],
    tags: ['support', 'considered'], props: { title: '' },
    render: (ctx, p) => ({
      jsx: sect(reveal(ctx.anim, 'up', `<div style={{ maxWidth:'520px', margin:'0 auto' }}>
        <h2 style={{ fontSize:'clamp(1.5rem,3vw,2rem)', margin:'0 0 1.2rem', textAlign:'center', textTransform:'var(--tt-head)' }}>${txt(p.title, 'Get in touch')}</h2>
        <form onSubmit={(e)=>e.preventDefault()} style={{ display:'grid', gap:'.8rem' }}>
          <input required placeholder="Your name" aria-label="Name" style={{ padding:'.8rem 1rem', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-md)', background:'var(--c-surface)', color:'var(--c-text)', fontFamily:'inherit' }} />
          <input type="email" required placeholder="Email" aria-label="Email" style={{ padding:'.8rem 1rem', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-md)', background:'var(--c-surface)', color:'var(--c-text)', fontFamily:'inherit' }} />
          <textarea required placeholder="Message" aria-label="Message" rows={4} style={{ padding:'.8rem 1rem', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-md)', background:'var(--c-surface)', color:'var(--c-text)', fontFamily:'inherit', resize:'vertical' }} />
          <button type="submit" className="btnp btn">Send message</button>
        </form>
      </div>`)),
    }),
  },
]

export default defs
