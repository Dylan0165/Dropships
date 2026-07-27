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
]

export default productDefs
