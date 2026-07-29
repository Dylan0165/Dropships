// ═══════ Hero-componenten ═══════
// Structurele varianten × stijl-varianten (minimal/bold/playful/editorial).
// Alle kleuren/fonts via CSS-variabelen. Hero-content komt gefaseerd op (hi-*).

import type { ComponentDef, RenderCtx, ComponentProps, RenderResult } from './types.js'
import { txt, styleTokens, am, arr } from './types.js'

// Het hero-beeld loopt via <HeroImg> (zie assemble.ts). Dat component kent het
// verschil tussen een echt sfeerbeeld (mag bijgesneden worden) en een kale
// productfoto (wordt gepresenteerd op een sfeerlaag i.p.v. uitgesneden).
// Rechtstreeks `PRODUCTS[0].image` in een hero zetten is precies wat er mis was.
const HERO_IMG = '<HeroImg />'

// Gedeelde hero-tekstblokken (gefaseerde opkomst via hi-1..hi-4)
function heroText(ctx: RenderCtx, p: ComponentProps, opts: { center?: boolean; onDark?: boolean; charTitle?: boolean } = {}): string {
  const st = styleTokens(ctx.style)
  const col = opts.onDark ? '#fff' : 'var(--c-text)'
  const subcol = opts.onDark ? 'rgba(255,255,255,.86)' : 'var(--c-muted)'
  const align = opts.center ? 'center' : 'left'
  const h1size = `clamp(2.4rem, ${5 * st.titleScale}vw, ${4.6 * st.titleScale}rem)`
  // Bij 'expressive' neemt Anime.js de kop over (woord-voor-woord); dan géén
  // hi-class erbij, want die zou dezelfde opacity tegelijk animeren.
  const titleAnim = ctx.anim === 'expressive' ? am(ctx.anim, opts.charTitle ? 'chars' : 'words') : ''
  const titleClass = ctx.anim === 'expressive' ? '' : ' className="hi hi-2"'
  return `
    <span className="hi hi-1 eyebrow" style={{ marginBottom:'1.1rem', letterSpacing:${JSON.stringify(st.labelSpacing)}, color:${opts.onDark ? "'var(--c-accent)'" : "'var(--c-accent)'"} }}>${txt(p.eyebrow, 'New')}</span>
    <h1${titleClass}${titleAnim} style={{ fontSize:${JSON.stringify(h1size)}, lineHeight:1.05, margin:'0 0 1.3rem', textTransform:'var(--tt-head)', color:${JSON.stringify(col)}, maxWidth:${opts.center ? "'16ch'" : "'20ch'"}, textAlign:${JSON.stringify(align)} }}>${txt(p.headline, 'A better everyday')}</h1>
    <p className="hi hi-3" style={{ fontSize:'1.08rem', lineHeight:1.7, color:${JSON.stringify(subcol)}, margin:'0 0 2.1rem', maxWidth:'44ch', textAlign:${JSON.stringify(align)} }}>${txt(p.subheadline, 'Thoughtfully sourced products, shipped fast across Europe.')}</p>
    <div className="hi hi-4" style={{ display:'flex', gap:'1rem', flexWrap:'wrap', justifyContent:${opts.center ? "'center'" : "'flex-start'"} }}>
      <a href="#products" className="btnp btn">${'{'}${txtRaw(p.cta, 'Shop now')}${'}'}</a>
      ${p.secondaryCta ? `<a href="/about/" className="btnp btn2">${'{'}${txtRaw(p.secondaryCta, 'Learn more')}${'}'}</a>` : ''}
    </div>`
}
// helper: inner expression without wrapping braces (voor plekken waar we zelf { } zetten)
function txtRaw(v: unknown, fb: string): string { return JSON.stringify(String(v ?? fb)) }

function imgBox(_style: string, extraClass = 'hi-img'): string {
  return `<div className=${JSON.stringify(extraClass)} style={{ width:'100%', height:'100%' }}>${HERO_IMG}</div>`
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
        <div className="hi-img" style={{ marginTop:'3rem', width:'100%', maxWidth:'860px', aspectRatio:'16/8', overflow:'hidden', borderRadius:'var(--r-lg)', boxShadow:'var(--shadow)' }}>${HERO_IMG}</div>
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
          <div className="hi-img" style={{ marginTop:'3rem', width:'100%', aspectRatio:'21/8', overflow:'hidden', background:'var(--c-surface-alt)' }}>${HERO_IMG}</div>
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
        <div style={{ position:'absolute', inset:0 }}>${HERO_IMG}</div>
        <div style={{ position:'absolute', inset:0, background:HERO_VISUAL.scrim }} />
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
  {
    id: 'hero.video-backdrop', category: 'hero', label: 'Video-achtergrond met overlay (valt terug op beeld)',
    styles: ['bold', 'editorial'], anims: ['subtle', 'expressive'],
    tags: ['sport', 'outdoor', 'lifestyle', 'urban', 'cinematic'],
    props: { eyebrow: '', headline: '', subheadline: '', cta: '', videoUrl: 'optionele mp4-url; leeg = productbeeld met langzame zoom' },
    canBeSignature: true,
    render: (ctx, p): RenderResult => {
      // Geen externe video-URL? Dan een Ken Burns-zoom op het productbeeld. Dat
      // geeft hetzelfde filmische gevoel zonder een extra netwerk-afhankelijkheid
      // waar we de betrouwbaarheid niet van kennen.
      const video = typeof p.videoUrl === 'string' && /^https?:\/\/.+\.(mp4|webm)$/i.test(p.videoUrl) ? p.videoUrl : ''
      const bg = video
        ? `<video autoPlay muted loop playsInline aria-hidden="true" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}><source src=${JSON.stringify(video)} /></video>`
        : `<div className="hb-zoom" style={{ position:'absolute', inset:0 }}>${HERO_IMG}</div>`
      return {
        jsx: `<section style={{ position:'relative', minHeight:'92vh', display:'flex', alignItems:'flex-end', overflow:'hidden' }}>
          ${bg}
          <div style={{ position:'absolute', inset:0, background: HERO_VISUAL.fill ? 'linear-gradient(0deg, rgba(0,0,0,.82) 0%, rgba(0,0,0,.35) 45%, rgba(0,0,0,.15) 100%)' : 'linear-gradient(0deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.18) 45%, rgba(0,0,0,0) 100%)' }} />
          <div style={{ position:'relative', padding:'clamp(2.5rem,7vw,6rem)', maxWidth:'760px', width:'100%' }}>${heroText(ctx, p, { onDark: true })}</div>
        </section>`,
        css: '@keyframes hbZoom{from{transform:scale(1)}to{transform:scale(1.12)}}\n.hb-zoom{animation:hbZoom 18s ease-out forwards}\n@media(prefers-reduced-motion:reduce){.hb-zoom{animation:none}}',
      }
    },
  },
  {
    id: 'hero.masonry-grid', category: 'hero', label: 'Tekst naast een masonry-raster van producten',
    styles: ['playful', 'minimal', 'bold'], anims: ['subtle', 'expressive'],
    tags: ['fashion', 'kids', 'beauty', 'catalog', 'many-products'],
    props: { eyebrow: '', headline: '', subheadline: '', cta: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section className="split" style={{ display:'grid', gridTemplateColumns:'1fr 1.15fr', gap:'clamp(1.5rem,4vw,3.5rem)', alignItems:'center', minHeight:'86vh', padding:'clamp(2.5rem,6vw,5rem)', background:'var(--c-bg)' }}>
        <div>${heroText(ctx, p)}</div>
        <div${am(ctx.anim, 'grid')} style={{ columnCount:3, columnGap:'.9rem' }} className="hm-cols">
          {PRODUCTS.slice(0,6).map((pr:any,i:number)=>(
            <div key={pr.id} style={{ breakInside:'avoid', marginBottom:'.9rem', borderRadius:'var(--r-md)', overflow:'hidden', background:'var(--c-surface-alt)', aspectRatio: i%3===0?'3/4':(i%3===1?'1':'4/5') }}>
              {pr.image ? <img src={pr.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
            </div>
          ))}
        </div>
      </section>`,
      css: '@media(max-width:820px){.hm-cols{column-count:2}}',
    }),
  },
  {
    id: 'hero.parallax-layers', category: 'hero', label: 'Parallax-lagen die bij scrollen uit elkaar lopen',
    styles: ['bold', 'editorial', 'playful'], anims: ['subtle', 'expressive'],
    tags: ['outdoor', 'tech', 'premium', 'depth'],
    props: { eyebrow: '', headline: '', subheadline: '', cta: '' },
    canBeSignature: true,
    render: (ctx, p): RenderResult => ({
      jsx: `<section className="hp-wrap" style={{ position:'relative', minHeight:'90vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'clamp(3rem,8vw,6rem) clamp(1.5rem,5vw,3rem)', background:'var(--c-bg)', overflow:'hidden' }}>
        <div className="hp-l1" aria-hidden="true" style={{ position:'absolute', top:'12%', left:'-6%', width:'42vw', maxWidth:'520px', aspectRatio:'1', borderRadius:'50%', background:'var(--c-surface-alt)', filter:'blur(2px)' }} />
        <div className="hp-l2" aria-hidden="true" style={{ position:'absolute', bottom:'-10%', right:'-4%', width:'34vw', maxWidth:'420px', aspectRatio:'1', borderRadius:'50%', background:'color-mix(in srgb, var(--c-accent) 22%, transparent)' }} />
        <div style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center' }}>${heroText(ctx, p, { center: true })}</div>
        {${P0IMG} ? <div className="hp-l3 hi-img" style={{ position:'relative', marginTop:'2.5rem', width:'min(520px,80%)', aspectRatio:'4/3', overflow:'hidden', borderRadius:'var(--r-lg)', boxShadow:'var(--shadow)' }}><img src={PRODUCTS[0].image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /></div> : null}
      </section>`,
      // Parallax via CSS scroll-timeline waar ondersteund; elders staat alles
      // gewoon stil. Bewust geen scroll-listener: dat kost frames op mobiel.
      css: [
        '@supports (animation-timeline: view()){',
        '@keyframes hpUp{from{transform:translateY(60px)}to{transform:translateY(-60px)}}',
        '@keyframes hpDown{from{transform:translateY(-40px)}to{transform:translateY(40px)}}',
        '.hp-l1{animation:hpUp linear both;animation-timeline:view();animation-range:entry 0% exit 100%}',
        '.hp-l2{animation:hpDown linear both;animation-timeline:view();animation-range:entry 0% exit 100%}',
        '.hp-l3{animation:hpUp linear both;animation-timeline:view();animation-range:entry 20% exit 100%}',
        '}',
        '@media(prefers-reduced-motion:reduce){.hp-l1,.hp-l2,.hp-l3{animation:none !important}}',
      ].join('\n'),
    }),
  },
  {
    id: 'hero.animated-gradient', category: 'hero', label: 'Zacht bewegend kleurverloop met gecentreerde kop',
    styles: ['playful', 'bold', 'minimal'], anims: ['subtle', 'expressive'],
    tags: ['tech', 'beauty', 'wellness', 'kids', 'colourful'],
    props: { eyebrow: '', headline: '', subheadline: '', cta: '', badges: 'optionele korte trust-teksten' },
    canBeSignature: true,
    render: (ctx, p): RenderResult => ({
      jsx: `<section className="hg-wrap" style={{ position:'relative', minHeight:'86vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'clamp(3rem,8vw,6rem) clamp(1.5rem,5vw,3rem)', overflow:'hidden' }}>
        <div className="hg-bg" aria-hidden="true" style={{ position:'absolute', inset:'-25%' }} />
        <div style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center' }}>
          ${heroText(ctx, p, { center: true, charTitle: true })}
          <div style={{ display:'flex', gap:'1.4rem', flexWrap:'wrap', justifyContent:'center', marginTop:'2rem' }}>
            {${arr(p.badges, ['Free EU shipping', '30-day returns', 'Secure checkout'])}.map((b:string,i:number)=>(
              <span key={i} style={{ fontSize:'.76rem', color:'var(--c-muted)' }}>{b}</span>
            ))}
          </div>
        </div>
      </section>`,
      css: [
        '@keyframes hgDrift{0%{transform:translate3d(0,0,0) rotate(0deg)}50%{transform:translate3d(4%,-3%,0) rotate(8deg)}100%{transform:translate3d(0,0,0) rotate(0deg)}}',
        '.hg-bg{background:radial-gradient(circle at 25% 30%, color-mix(in srgb, var(--c-accent) 40%, transparent) 0%, transparent 55%),radial-gradient(circle at 78% 65%, color-mix(in srgb, var(--c-primary) 32%, transparent) 0%, transparent 58%),var(--c-bg);animation:hgDrift 24s ease-in-out infinite}',
        '@media(prefers-reduced-motion:reduce){.hg-bg{animation:none}}',
      ].join('\n'),
    }),
  },
]

export default heroDefs
