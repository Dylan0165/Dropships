// ═══════ Hero-componenten ═══════
// Structurele varianten × stijl-varianten (minimal/bold/playful/editorial).
// Alle kleuren/fonts via CSS-variabelen. Hero-content komt gefaseerd op (hi-*).

import type { ComponentDef, RenderCtx, ComponentProps, RenderResult } from './types.js'
import { txt, styleTokens, am, arr } from './types.js'

const P0IMG = 'PRODUCTS[0] && PRODUCTS[0].image'

// Gedeelde hero-tekstblokken (gefaseerde opkomst via hi-1..hi-4)
function heroText(ctx: RenderCtx, p: ComponentProps, opts: { center?: boolean; onDark?: boolean } = {}): string {
  const st = styleTokens(ctx.style)
  const col = opts.onDark ? '#fff' : 'var(--c-text)'
  const subcol = opts.onDark ? 'rgba(255,255,255,.86)' : 'var(--c-muted)'
  const align = opts.center ? 'center' : 'left'
  const h1size = `clamp(2.4rem, ${5 * st.titleScale}vw, ${4.6 * st.titleScale}rem)`
  return `
    <span className="hi hi-1 eyebrow" style={{ marginBottom:'1.1rem', letterSpacing:${JSON.stringify(st.labelSpacing)}, color:${opts.onDark ? "'var(--c-accent)'" : "'var(--c-accent)'"} }}>${txt(p.eyebrow, 'New')}</span>
    <h1 className="hi hi-2" style={{ fontSize:${JSON.stringify(h1size)}, lineHeight:1.05, margin:'0 0 1.3rem', textTransform:'var(--tt-head)', color:${JSON.stringify(col)}, maxWidth:${opts.center ? "'16ch'" : "'20ch'"}, textAlign:${JSON.stringify(align)} }}>${txt(p.headline, 'A better everyday')}</h1>
    <p className="hi hi-3" style={{ fontSize:'1.08rem', lineHeight:1.7, color:${JSON.stringify(subcol)}, margin:'0 0 2.1rem', maxWidth:'44ch', textAlign:${JSON.stringify(align)} }}>${txt(p.subheadline, 'Thoughtfully sourced products, shipped fast across Europe.')}</p>
    <div className="hi hi-4" style={{ display:'flex', gap:'1rem', flexWrap:'wrap', justifyContent:${opts.center ? "'center'" : "'flex-start'"} }}>
      <a href="#products" className="btnp btn">${'{'}${txtRaw(p.cta, 'Shop now')}${'}'}</a>
      ${p.secondaryCta ? `<a href="/about/" className="btnp btn2">${'{'}${txtRaw(p.secondaryCta, 'Learn more')}${'}'}</a>` : ''}
    </div>`
}
// helper: inner expression without wrapping braces (voor plekken waar we zelf { } zetten)
function txtRaw(v: unknown, fb: string): string { return JSON.stringify(String(v ?? fb)) }

function imgBox(style: string, extraClass = 'hi-img'): string {
  // `style` bevat al de {{ }} — geen extra braces eromheen (anders {{{ }}} → crash)
  return `{${P0IMG} ? <img className=${JSON.stringify(extraClass)} src={PRODUCTS[0].image} alt="" style=${style} /> : <div style={{ width:'60%', aspectRatio:'1', background:'var(--c-border)', borderRadius:'var(--r-lg)' }} />}`
}

const heroDefs: ComponentDef[] = [
  {
    id: 'hero.split-left', category: 'hero', label: 'Split — tekst links, beeld rechts',
    styles: ['minimal', 'bold', 'editorial'], anims: ['subtle', 'expressive'],
    tags: ['universal', 'product', 'clean'],
    props: { eyebrow: 'kleine bovenlabel', headline: 'hoofdkop', subheadline: 'ondertitel', cta: 'knoptekst', secondaryCta: 'optionele 2e knop' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section className="split" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', minHeight:'82vh', background:'var(--c-bg)' }}>
        <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', padding:'clamp(2.5rem,6vw,5rem)' }}>${heroText(ctx, p)}</div>
        <div style={{ background:'var(--c-surface-alt)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', minHeight:'42vh' }}>${imgBox("{{ width:'100%', height:'100%', objectFit:'cover' }}")}</div>
      </section>`,
    }),
  },
  {
    id: 'hero.split-right', category: 'hero', label: 'Split — beeld links, tekst rechts',
    styles: ['minimal', 'bold', 'editorial'], anims: ['subtle', 'expressive'],
    tags: ['universal', 'product', 'clean'],
    props: { eyebrow: '', headline: '', subheadline: '', cta: '', secondaryCta: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section className="split" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', minHeight:'82vh', background:'var(--c-bg)' }}>
        <div style={{ background:'var(--c-surface-alt)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', minHeight:'42vh', order:0 }}>${imgBox("{{ width:'100%', height:'100%', objectFit:'cover' }}")}</div>
        <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', padding:'clamp(2.5rem,6vw,5rem)' }}>${heroText(ctx, p)}</div>
      </section>`,
    }),
  },
  {
    id: 'hero.centered', category: 'hero', label: 'Gecentreerd met beeld eronder',
    styles: ['minimal', 'bold', 'playful'], anims: ['subtle', 'expressive'],
    tags: ['universal', 'launch', 'bold'],
    props: { eyebrow: '', headline: '', subheadline: '', cta: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section style={{ minHeight:'80vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'clamp(3rem,8vw,6rem) clamp(1.5rem,5vw,3rem)', background:'var(--c-bg)' }}>
        ${heroText(ctx, p, { center: true })}
        {${P0IMG} ? <div className="hi-img" style={{ marginTop:'3rem', width:'100%', maxWidth:'860px', aspectRatio:'16/8', overflow:'hidden', borderRadius:'var(--r-lg)', boxShadow:'var(--shadow)' }}><img src={PRODUCTS[0].image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /></div> : null}
      </section>`,
    }),
  },
  {
    id: 'hero.editorial', category: 'hero', label: 'Editorial — grote kop, breed beeld',
    styles: ['editorial', 'minimal'], anims: ['subtle', 'expressive'],
    tags: ['premium', 'fashion', 'design', 'considered'],
    props: { eyebrow: '', headline: '', subheadline: '', cta: '' },
    render: (ctx, p): RenderResult => {
      const st = styleTokens(ctx.style)
      return {
        jsx: `<section style={{ padding:'clamp(3rem,7vw,6rem) clamp(1.5rem,5vw,4.5rem) 0', background:'var(--c-bg)' }}>
          <div style={{ maxWidth:'1150px', margin:'0 auto' }}>
            <span className="hi hi-1 eyebrow" style={{ letterSpacing:${JSON.stringify(st.labelSpacing)} }}>${txt(p.eyebrow, 'The collection')}</span>
            <h1 className="hi hi-2" style={{ fontSize:'clamp(2.8rem,8.5vw,6.2rem)', lineHeight:1.02, maxWidth:'18ch', margin:'.6rem 0 0', textTransform:'var(--tt-head)' }}>${txt(p.headline, 'Made to be noticed')}</h1>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2rem', alignItems:'end', marginTop:'1.6rem' }} className="grid2">
              <p className="hi hi-3" style={{ color:'var(--c-muted)', fontSize:'1.05rem', lineHeight:1.7, maxWidth:'42ch' }}>${txt(p.subheadline, 'A focused edit, delivered fast across Europe.')}</p>
              <div className="hi hi-4" style={{ display:'flex', justifyContent:'flex-end' }}><a href="#products" className="btnp btn">${'{'}${txtRaw(p.cta, 'Browse')}${'}'}</a></div>
            </div>
          </div>
          {${P0IMG} ? <div className="hi-img" style={{ marginTop:'3rem', width:'100%', aspectRatio:'21/8', overflow:'hidden', background:'var(--c-surface-alt)' }}><img src={PRODUCTS[0].image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /></div> : null}
        </section>`,
      }
    },
  },
  {
    id: 'hero.fullbleed-overlay', category: 'hero', label: 'Volledig beeld met donkere overlay',
    styles: ['bold', 'editorial'], anims: ['subtle', 'expressive'],
    tags: ['urban', 'bold', 'outdoor', 'lifestyle'],
    props: { eyebrow: '', headline: '', subheadline: '', cta: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section style={{ position:'relative', minHeight:'88vh', display:'flex', alignItems:'center', overflow:'hidden' }}>
        {${P0IMG} ? <img src={PRODUCTS[0].image} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} /> : <div style={{ position:'absolute', inset:0, background:'var(--c-secondary)' }} />}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, rgba(0,0,0,.74), rgba(0,0,0,.3))' }} />
        <div style={{ position:'relative', padding:'clamp(2.5rem,6vw,5rem)', maxWidth:'720px' }}>${heroText(ctx, p, { onDark: true })}</div>
      </section>`,
    }),
  },
  {
    id: 'hero.product-showcase', category: 'hero', label: 'Product-showcase — 3 producten naast pitch',
    styles: ['minimal', 'bold'], anims: ['subtle', 'expressive'],
    tags: ['product', 'impulse', 'tech'],
    props: { eyebrow: '', headline: '', subheadline: '', cta: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section className="split" style={{ display:'grid', gridTemplateColumns:'1.05fr 1fr', gap:'clamp(1.5rem,4vw,3rem)', alignItems:'center', minHeight:'80vh', padding:'clamp(2.5rem,6vw,5rem)', background:'var(--c-bg)' }}>
        <div>${heroText(ctx, p)}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          {PRODUCTS.slice(0,3).map((pr:any,i:number)=>(
            <div key={pr.id} className="hi-img" style={{ gridColumn: i===0?'1 / -1':'auto', aspectRatio: i===0?'16/9':'1', overflow:'hidden', borderRadius:'var(--r-lg)', background:'var(--c-surface-alt)', animationDelay:(i*0.12)+'s' }}>
              {pr.image ? <img src={pr.image} alt={pr.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
            </div>
          ))}
        </div>
      </section>`,
    }),
  },
  {
    id: 'hero.minimal-text', category: 'hero', label: 'Minimal — alleen tekst, veel ruimte',
    styles: ['minimal', 'editorial'], anims: ['subtle'],
    tags: ['minimal', 'premium', 'clean'],
    props: { eyebrow: '', headline: '', subheadline: '', cta: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section style={{ minHeight:'74vh', display:'flex', flexDirection:'column', justifyContent:'center', padding:'clamp(3rem,10vw,8rem) clamp(1.5rem,6vw,6rem)', background:'var(--c-bg)', maxWidth:'980px' }}>${heroText(ctx, p)}</section>`,
    }),
  },
  {
    id: 'hero.badge-row', category: 'hero', label: 'Gecentreerd met trust-badge-rij',
    styles: ['bold', 'playful', 'minimal'], anims: ['subtle', 'expressive'],
    tags: ['impulse', 'trust', 'conversion'],
    props: { eyebrow: '', headline: '', subheadline: '', cta: '', badges: 'lijst korte trust-teksten' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section style={{ minHeight:'78vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'clamp(3rem,8vw,6rem) clamp(1.5rem,5vw,3rem)', background:'var(--c-bg)' }}>
        ${heroText(ctx, p, { center: true })}
        <div className="hi hi-4" style={{ display:'flex', gap:'1.5rem', flexWrap:'wrap', justifyContent:'center', marginTop:'2rem' }}>
          {${JSON.stringify(Array.isArray(p.badges) && p.badges.length ? p.badges : ['Free EU shipping', '30-day returns', 'Secure payment'])}.map((b:string,i:number)=>(
            <span key={i} style={{ fontSize:'.78rem', color:'var(--c-muted)', display:'inline-flex', alignItems:'center', gap:'.4rem' }}><span style={{ color:'var(--c-accent)' }}>&#10003;</span>{b}</span>
          ))}
        </div>
      </section>`,
    }),
  },
]

export default heroDefs
