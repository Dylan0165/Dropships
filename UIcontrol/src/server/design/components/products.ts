// ═══════ Product-weergave componenten ═══════
// Arrangeren de door de assembler geïnjecteerde <Card> component in verschillende
// grids/lijsten. #products anchor + hasProducts zodat checkout-CTA's kunnen linken.

import type { ComponentDef, RenderCtx, ComponentProps, RenderResult } from './types.js'
import { txt, reveal, am, arr } from './types.js'

function heading(ctx: RenderCtx, p: ComponentProps): string {
  return reveal(ctx.anim, 'up', `<h2 style={{ fontSize:'clamp(1.6rem,3vw,2.2rem)', textAlign:'center', margin:'0 0 2.5rem', textTransform:'var(--tt-head)' }}>${txt(p.title, 'Shop the collection')}</h2>`)
}

function section(inner: string, ctx: RenderCtx, p: ComponentProps): RenderResult {
  return {
    hasProducts: true,
    jsx: `<section id="products" className="sect" style={{ background:'var(--c-bg)' }}>
      ${heading(ctx, p)}
      <div className="wrap">${inner}</div>
    </section>`,
  }
}

const cols = (n: number, min = 260) => `<div className="grid${n}" style={{ display:'grid', gridTemplateColumns:'repeat(${n},1fr)', gap:'1.5rem' }}>{PRODUCTS.map((pr:any,i:number)=><Reveal key={pr.id} v="up" delay={(i%${n})*70}><Card p={pr} i={i} layout="card" /></Reveal>)}</div>`

const productDefs: ComponentDef[] = [
  {
    id: 'products.grid-3', category: 'products', label: 'Grid — 3 kolommen', styles: ['minimal', 'bold', 'editorial'], anims: ['subtle', 'expressive'],
    tags: ['universal', 'clean'], props: { title: 'sectiekop' },
    render: (ctx, p) => section(cols(3), ctx, p),
  },
  {
    id: 'products.grid-4', category: 'products', label: 'Grid — 4 kolommen (dichte collectie)', styles: ['minimal', 'bold'], anims: ['subtle', 'expressive'],
    tags: ['impulse', 'catalog', 'many-products'], props: { title: '' },
    render: (ctx, p) => section(`<div className="grid4" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1.25rem' }}>{PRODUCTS.map((pr:any,i:number)=><Reveal key={pr.id} v="up" delay={(i%4)*60}><Card p={pr} i={i} layout="card" /></Reveal>)}</div>`, ctx, p),
  },
  {
    id: 'products.featured-grid', category: 'products', label: 'Featured — eerste product groot', styles: ['bold', 'editorial'], anims: ['subtle', 'expressive'],
    tags: ['premium', 'considered', 'hero-product'], props: { title: '' },
    render: (ctx, p) => section(`<div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:'1.5rem' }}>{PRODUCTS.map((pr:any,i:number)=><Reveal key={pr.id} v="up" delay={(i%3)*70}><Card p={pr} i={i} layout={i===0?'featured':'card'} /></Reveal>)}</div>`, ctx, p),
  },
  {
    id: 'products.carousel', category: 'products', label: 'Horizontale carousel (swipe)', styles: ['playful', 'minimal', 'bold'], anims: ['subtle'],
    tags: ['playful', 'impulse', 'mobile'], props: { title: '' },
    render: (ctx, p) => section(`<div className="hscroll" style={{ display:'flex', gap:'1.25rem', overflowX:'auto', scrollSnapType:'x mandatory', paddingBottom:'1rem' }}>{PRODUCTS.map((pr:any,i:number)=><div key={pr.id} style={{ flex:'0 0 300px', scrollSnapAlign:'start' }}><Card p={pr} i={i} layout="card" /></div>)}</div>`, ctx, p),
  },
  {
    id: 'products.editorial-list', category: 'products', label: 'Editorial lijst — grote afwisselende rijen', styles: ['editorial', 'minimal'], anims: ['subtle', 'expressive'],
    tags: ['premium', 'editorial', 'story', 'few-products'], props: { title: '' },
    render: (ctx, p) => section(`<div style={{ display:'grid', gap:'clamp(2.5rem,6vw,5rem)' }}>{PRODUCTS.map((pr:any,i:number)=><Reveal key={pr.id} v="fade"><Card p={pr} i={i} layout="row" reverse={i%2===1} /></Reveal>)}</div>`, ctx, p),
  },
  {
    id: 'products.quickview-grid', category: 'products', label: 'Grid met hover "quick view" overlay', styles: ['bold', 'playful'], anims: ['subtle', 'expressive'],
    tags: ['interactive', 'fashion', 'lifestyle'], props: { title: '' },
    render: (ctx, p): RenderResult => ({
      hasProducts: true,
      jsx: `<section id="products" className="sect" style={{ background:'var(--c-bg)' }}>
        ${heading(ctx, p)}
        <div className="wrap"><div className="grid3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'1.5rem' }}>
          {PRODUCTS.map((pr:any,i:number)=>(
            <Reveal key={pr.id} v="up" delay={(i%3)*70}>
              <div className="card qv" style={{ position:'relative', background:'var(--c-surface)', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-lg)', overflow:'hidden' }}>
                <div style={{ position:'relative', aspectRatio:'1', overflow:'hidden', background:'var(--c-surface-alt)' }}>
                  {pr.image ? <img className="cimg" src={pr.image} alt={pr.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
                  <a href={"/checkout/?product="+encodeURIComponent(pr.id)} className="qv-ov" style={{ position:'absolute', inset:0, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'1rem', background:'linear-gradient(0deg,rgba(0,0,0,.5),transparent 55%)', opacity:0, transition:'opacity .3s' }}><span className="btn" style={{ pointerEvents:'none' }}>Quick view</span></a>
                </div>
                <div style={{ padding:'1rem 1.1rem' }}>
                  <h3 style={{ fontSize:'1rem', margin:'0 0 .35rem' }}>{pr.title}</h3>
                  <span style={{ fontWeight:700 }}>&#8364;{Number(pr.price).toFixed(2)}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div></div>
      </section>`,
      css: '.qv:hover .qv-ov{opacity:1}',
    }),
  },
  {
    id: 'products.masonry', category: 'products', label: 'Masonry — ongelijke hoogtes, natuurlijk ritme',
    styles: ['playful', 'editorial', 'minimal'], anims: ['subtle', 'expressive'],
    tags: ['fashion', 'beauty', 'lifestyle', 'many-products', 'visual'],
    props: { title: '' },
    render: (ctx, p): RenderResult => ({
      hasProducts: true,
      jsx: `<section id="products" className="sect" style={{ background:'var(--c-bg)' }}>
        ${heading(ctx, p)}
        <div className="wrap"><div${am(ctx.anim, 'grid')} className="pm-cols" style={{ columnCount:3, columnGap:'1.4rem' }}>
          {PRODUCTS.map((pr:any,i:number)=>(
            <div key={pr.id} className="card" style={{ breakInside:'avoid', marginBottom:'1.4rem', background:'var(--c-surface)', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-lg)', overflow:'hidden' }}>
              <div style={{ aspectRatio: i%3===0?'3/4':(i%3===1?'1':'4/5'), overflow:'hidden', background:'var(--c-surface-alt)' }}>
                {pr.image ? <img className="cimg" src={pr.image} alt={pr.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
              </div>
              <div style={{ padding:'1rem 1.1rem 1.2rem' }}>
                <h3 style={{ fontSize:'1rem', margin:'0 0 .4rem' }}>{pr.title}</h3>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'.6rem' }}>
                  <span style={{ fontWeight:700 }}>&#8364;{Number(pr.price).toFixed(2)}</span>
                  <button type="button" className="btnp btn" style={{ padding:'.5rem 1rem', fontSize:'.72rem' }} onClick={()=>startCheckout(pr)}>Order</button>
                </div>
              </div>
            </div>
          ))}
        </div></div>
      </section>`,
      css: '@media(max-width:1000px){.pm-cols{column-count:2}}\n@media(max-width:620px){.pm-cols{column-count:1}}',
    }),
  },
  {
    id: 'products.category-tabs', category: 'products', label: 'Tabs per categorie — voor grotere collecties',
    styles: ['minimal', 'bold'], anims: ['subtle'],
    tags: ['catalog', 'many-products', 'home', 'tech', 'organized'],
    props: { title: '', tabs: 'lijst tabnamen (2-4); leeg = automatisch verdeeld' },
    render: (ctx, p): RenderResult => ({
      hasProducts: true,
      jsx: `<section id="products" className="sect" style={{ background:'var(--c-bg)' }}>
        ${heading(ctx, p)}
        <div className="wrap"><ProductTabs tabs={${arr(p.tabs, ['All', 'Popular', 'New in'])}} /></div>
      </section>`,
    }),
  },
  {
    id: 'products.list-compact', category: 'products', label: 'Compacte lijst met miniatuur — snel scannen',
    styles: ['minimal', 'editorial'], anims: ['subtle'],
    tags: ['catalog', 'practical', 'home', 'kitchen', 'many-products'],
    props: { title: '' },
    render: (ctx, p): RenderResult => ({
      hasProducts: true,
      jsx: `<section id="products" className="sect" style={{ background:'var(--c-bg)' }}>
        ${heading(ctx, p)}
        <div className="wrap"><div${am(ctx.anim, 'grid')} style={{ display:'grid', gap:'.75rem' }}>
          {PRODUCTS.map((pr:any,i:number)=>(
            <div key={pr.id} className="card pl-row" style={{ display:'grid', gridTemplateColumns:'88px 1fr auto', gap:'1.1rem', alignItems:'center', padding:'.75rem', background:'var(--c-surface)', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-md)' }}>
              <div style={{ aspectRatio:'1', overflow:'hidden', borderRadius:'var(--r-sm)', background:'var(--c-surface-alt)' }}>
                {pr.image ? <img className="cimg" src={pr.image} alt={pr.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
              </div>
              <div style={{ minWidth:0 }}>
                <h3 style={{ fontSize:'.98rem', margin:'0 0 .25rem' }}>{pr.title}</h3>
                {pr.description ? <p style={{ color:'var(--c-muted)', fontSize:'.82rem', margin:0, lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{pr.description}</p> : null}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'.9rem' }}>
                <span style={{ fontWeight:700, whiteSpace:'nowrap' }}>&#8364;{Number(pr.price).toFixed(2)}</span>
                <button type="button" className="btnp btn" style={{ padding:'.55rem 1.1rem', fontSize:'.74rem' }} onClick={()=>startCheckout(pr)}>Order</button>
              </div>
            </div>
          ))}
        </div></div>
      </section>`,
      css: '@media(max-width:640px){.pl-row{grid-template-columns:64px 1fr !important}.pl-row>div:last-child{grid-column:1 / -1;justify-content:space-between}}',
    }),
  },
  {
    id: 'products.spotlight-stack', category: 'products', label: 'Spotlight — één groot product per scherm, gestapeld',
    styles: ['editorial', 'bold'], anims: ['subtle', 'expressive'],
    tags: ['premium', 'few-products', 'story', 'considered'],
    props: { title: '' },
    canBeSignature: true,
    render: (ctx, p): RenderResult => ({
      hasProducts: true,
      jsx: `<section id="products" style={{ background:'var(--c-bg)' }}>
        <div className="sect" style={{ paddingBottom:0 }}>${heading(ctx, p)}</div>
        {PRODUCTS.slice(0,4).map((pr:any,i:number)=>(
          <div key={pr.id} className="ps-row" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', alignItems:'center', minHeight:'70vh', background: i%2===0?'var(--c-bg)':'var(--c-surface-alt)' }}>
            <div style={{ order: i%2===0?0:1, aspectRatio:'4/3', overflow:'hidden', height:'100%' }}>
              {pr.image ? <img className="cimg" src={pr.image} alt={pr.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
            </div>
            <div style={{ padding:'clamp(2rem,6vw,5rem)' }}>
              <span className="eyebrow" style={{ marginBottom:'.8rem' }}>{'0'+(i+1)}</span>
              <h3${am(ctx.anim, 'lift')} style={{ fontSize:'clamp(1.6rem,3.4vw,2.6rem)', margin:'0 0 1rem', lineHeight:1.15 }}>{pr.title}</h3>
              {pr.description ? <p style={{ color:'var(--c-muted)', lineHeight:1.75, margin:'0 0 1.6rem', maxWidth:'46ch' }}>{pr.description}</p> : null}
              <div style={{ display:'flex', gap:'1.2rem', alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:'1.5rem', fontWeight:700 }}>&#8364;{Number(pr.price).toFixed(2)}</span>
                <button type="button" className="btnp btn" onClick={()=>startCheckout(pr)}>Order now</button>
              </div>
            </div>
          </div>
        ))}
        {PRODUCTS.length > 4 ? (
          <div className="sect" style={{ paddingTop:'clamp(2rem,5vw,4rem)' }}>
            <div className="wrap" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:'1.25rem' }}>
              {PRODUCTS.slice(4).map((pr:any,i:number)=><Card key={pr.id} p={pr} i={i} layout="card" />)}
            </div>
          </div>
        ) : null}
      </section>`,
      css: '@media(max-width:860px){.ps-row{grid-template-columns:1fr !important}.ps-row>div:first-child{order:0 !important}}',
    }),
  },
]

export default productDefs
