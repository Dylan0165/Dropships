// ═══════ Pagina-assembler ═══════
// Voegt de door de LLM gekozen componenten deterministisch samen tot één
// app/page.tsx. Injecteert gedeelde helpers (Reveal/Card/Countdown), de basis-CSS
// + DNA-CSS-variabelen + per-component CSS (ontdubbeld), en draait een
// CSS-conflict-audit + WCAG-context bovenop de bestaande kwaliteitsbodem.
//
// De CHECKOUT valt hier NIET onder — die is een vast component (zie checkout.ts /
// buildCheckoutAndInfoPages) en wordt door de pipeline altijd los toegevoegd.

import type { DesignDNA } from '../tokens.js'
import type { ComponentSelection, RenderCtx, StyleVariant, AnimationVariant } from './types.js'
import { dnaCssVars, j } from './types.js'
import { baseCss } from './base-css.js'
import { getComponent } from './registry.js'
import { BRAND_TOKEN } from './chrome.js'

export interface AssembleInput {
  dna: DesignDNA
  brandName: string
  nav: ComponentSelection
  sections: ComponentSelection[]   // in volgorde, tussen nav en footer
  footer: ComponentSelection
  products: ReadonlyArray<{ id: string; title: string; image: string; price: number; [k: string]: unknown }>
  /** default stijl/animatie als de selectie ze niet specificeert */
  defaultStyle?: StyleVariant
  defaultAnim?: AnimationVariant
}

export interface AssembleResult {
  page: string
  cssConflicts: string[]
  usedComponents: string[]
  warnings: string[]
}

// ── CSS-conflict-audit: zelfde selector+property met andere waarde (buiten media) ─
export function auditCss(css: string): string[] {
  const conflicts: string[] = []
  const stripped = css.replace(/@media[^{]+\{([\s\S]*?)\}\s*\}/g, '')
  const seen = new Map<string, Map<string, string>>()
  for (const m of stripped.matchAll(/(^|\})?\s*([^{}@]+)\{([^{}]*)\}/g)) {
    const sel = m[2].trim()
    if (!sel || sel.startsWith('@') || sel.includes('keyframes') || /^(from|to|\d+%)$/.test(sel)) continue
    const props = new Map(seen.get(sel) ?? [])
    for (const decl of m[3].split(';')) {
      const idx = decl.indexOf(':')
      if (idx < 0) continue
      const key = decl.slice(0, idx).trim(), val = decl.slice(idx + 1).trim()
      if (!key || !val) continue
      if (props.has(key) && props.get(key) !== val) conflicts.push(`${sel}{${key}: "${props.get(key)}" vs "${val}"}`)
      props.set(key, val)
    }
    seen.set(sel, props)
  }
  return conflicts
}

function ctxFor(sel: ComponentSelection, dna: DesignDNA, index: number, dStyle: StyleVariant, dAnim: AnimationVariant): RenderCtx {
  const def = getComponent(sel.id)!
  const style = sel.style && def.styles.includes(sel.style) ? sel.style : (def.styles.includes(dStyle) ? dStyle : def.styles[0])
  const anim = sel.anim && def.anims.includes(sel.anim) ? sel.anim : (def.anims.includes(dAnim) ? dAnim : def.anims[0])
  return { dna, style, anim, index }
}

// Injectie-helpers die elke geassembleerde pagina meekrijgt
const HELPERS = `
function startCheckout(p:{id:string}){window.location.href='/checkout/?product='+encodeURIComponent(p.id);}
function Reveal({children,style,v='up',delay=0}:{children:React.ReactNode;style?:React.CSSProperties;v?:'up'|'fade'|'left'|'right'|'scale';delay?:number}){
  const ref=useRef<HTMLDivElement>(null);const[vis,setVis]=useState(false);
  useEffect(()=>{const el=ref.current;if(!el)return;const o=new IntersectionObserver(([e])=>{if(e.isIntersecting){setVis(true);o.disconnect();}},{threshold:0.12});o.observe(el);return()=>o.disconnect();},[]);
  return <div ref={ref} className={'rv rv-'+v+(vis?' in':'')} style={{...style,transitionDelay:delay+'ms'}}>{children}</div>;
}
function Countdown({hours}:{hours:number}){
  const[left,setLeft]=useState(hours*3600);
  useEffect(()=>{const t=setInterval(()=>setLeft(s=>s>0?s-1:0),1000);return()=>clearInterval(t);},[]);
  const pad=(n:number)=>String(n).padStart(2,'0');const h=Math.floor(left/3600),m=Math.floor((left%3600)/60),s=left%60;
  const cell=(v:string,l:string)=>(<div style={{textAlign:'center'}}><div style={{fontFamily:'var(--f-head)',fontSize:'2rem',fontWeight:800,minWidth:'2.4ch'}}>{v}</div><div style={{fontSize:'.6rem',letterSpacing:'.15em',textTransform:'uppercase',opacity:.7}}>{l}</div></div>);
  return <div style={{display:'inline-flex',gap:'1.2rem',alignItems:'center'}}>{cell(pad(h),'hrs')}<span>:</span>{cell(pad(m),'min')}<span>:</span>{cell(pad(s),'sec')}</div>;
}
function Card({p,i,layout='card',reverse}:{p:any;i:number;layout?:'card'|'featured'|'row';reverse?:boolean}){
  const price=(<div style={{display:'flex',gap:'.6rem',alignItems:'baseline',marginBottom:'.9rem'}}><span style={{fontWeight:700,fontSize:layout==='featured'?'1.4rem':'1.05rem'}}>&#8364;{Number(p.price).toFixed(2)}</span>{p.compareAtPrice?<span style={{color:'var(--c-muted)',fontSize:'.9rem',textDecoration:'line-through'}}>&#8364;{Number(p.compareAtPrice).toFixed(2)}</span>:null}</div>);
  const cta=(<button type="button" className="btnp btn" style={{width:layout==='row'?'auto':'100%'}} onClick={()=>startCheckout(p)}>Order now</button>);
  const badge=p.badge?(<span style={{position:'absolute',top:'1rem',left:'1rem',zIndex:2,background:'var(--c-accent)',color:'var(--c-primary-text)',fontSize:'.62rem',fontWeight:800,letterSpacing:'.1em',textTransform:'uppercase',padding:'.28rem .6rem',borderRadius:'var(--r-sm)'}}>{p.badge}</span>):null;
  if(layout==='row'){return(<div className="erow" style={{display:'grid',gridTemplateColumns:reverse?'1fr 1.1fr':'1.1fr 1fr',gap:'clamp(1.5rem,4vw,3.5rem)',alignItems:'center',direction:reverse?'rtl':'ltr'}}>
    <div style={{direction:'ltr',position:'relative',aspectRatio:'4/3',overflow:'hidden',borderRadius:'var(--r-lg)',background:'var(--c-surface-alt)'}}>{badge}{p.image?<img className="cimg" src={p.image} alt={p.title} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:null}</div>
    <div style={{direction:'ltr'}}><h3 style={{fontSize:'1.4rem',margin:'0 0 .6rem'}}>{p.title}</h3>{p.description?<p style={{color:'var(--c-muted)',lineHeight:1.7,margin:'0 0 1rem',maxWidth:'46ch'}}>{p.description}</p>:null}{price}{cta}</div>
  </div>);}
  return(<div className="card" style={{background:'var(--c-surface)',border:'var(--bw) solid var(--c-border)',borderRadius:'var(--r-lg)',overflow:'hidden',display:'flex',flexDirection:'column',gridColumn:layout==='featured'?'1 / -1':'auto'}}>
    <div style={{position:'relative',aspectRatio:layout==='featured'?'16/7':'1',overflow:'hidden',background:'var(--c-surface-alt)'}}>{badge}{p.image?<img className="cimg" src={p.image} alt={p.title} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:null}</div>
    <div style={{padding:'1.2rem',display:'flex',flexDirection:'column',flex:1}}><h3 style={{fontSize:layout==='featured'?'1.35rem':'1rem',margin:'0 0 .5rem'}}>{p.title}</h3>{layout==='featured'&&p.description?<p style={{color:'var(--c-muted)',lineHeight:1.6,margin:'0 0 1rem',maxWidth:'52ch'}}>{p.description}</p>:null}<div style={{marginTop:'auto'}}>{price}{cta}</div></div>
  </div>);
}
`

export function assemblePage(input: AssembleInput): AssembleResult {
  const { dna, brandName, products } = input
  const dStyle = input.defaultStyle ?? 'minimal'
  const dAnim = input.defaultAnim ?? 'subtle'
  const warnings: string[] = []
  const used: string[] = []
  const cssParts: string[] = [dnaCssVars(dna), baseCss()]

  const renderOne = (sel: ComponentSelection, index: number): { jsx: string; hasProducts: boolean } => {
    const def = getComponent(sel.id)
    if (!def) { warnings.push(`onbekend component "${sel.id}" overgeslagen`); return { jsx: '', hasProducts: false } }
    const ctx = ctxFor(sel, dna, index, dStyle, dAnim)
    const res = def.render(ctx, sel.props ?? {})
    if (res.css) cssParts.push(res.css)
    used.push(`${def.id}[${ctx.style}]`)
    return { jsx: res.jsx, hasProducts: !!res.hasProducts }
  }

  const navR = renderOne(input.nav, 0)
  const bodyParts: string[] = []
  let hasProducts = false
  input.sections.forEach((sel, i) => {
    const r = renderOne(sel, i + 1)
    if (r.hasProducts) hasProducts = true
    if (r.jsx) bodyParts.push(r.jsx)
  })
  const footR = renderOne(input.footer, input.sections.length + 1)
  if (!hasProducts) warnings.push('geen product-component gekozen — collectie zou onzichtbaar zijn')

  // nav.transparent hoort over de eerste (fullbleed) sectie te liggen
  const transparentNav = input.nav.id === 'nav.transparent'
  const heroWrapOpen = transparentNav ? '<div style={{ position:\'relative\' }}>' : ''
  const heroWrapClose = transparentNav ? '</div>' : ''
  const firstBody = bodyParts.shift() ?? ''

  // CSS ontdubbelen (identieke regels één keer) + audit
  const seenCss = new Set<string>()
  const dedupedCss = cssParts.flatMap(block => block.split('\n')).filter(line => {
    const t = line.trim(); if (!t) return false
    if (seenCss.has(t)) return false; seenCss.add(t); return true
  }).join('\n')
  const cssConflicts = auditCss(dedupedCss)
  if (cssConflicts.length) warnings.push(`${cssConflicts.length} CSS-conflict(en) gedetecteerd`)

  const page = `'use client';
import { useEffect, useRef, useState } from 'react';

const PRODUCTS: any[] = ${j(products)};
const BRAND: string = ${j(brandName)};
const CSS: string = ${j(dedupedCss)};
${HELPERS}
export default function Home() {
  return (
    <div style={{ minHeight:'100dvh', background:'var(--c-bg)', color:'var(--c-text)', fontFamily:'var(--f-body)' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      ${heroWrapOpen}
      ${navR.jsx}
      ${firstBody}
      ${heroWrapClose}
${bodyParts.join('\n')}
      ${footR.jsx}
    </div>
  );
}
`.replace(new RegExp(`\\{${BRAND_TOKEN}\\}`, 'g'), '{BRAND}')

  return { page, cssConflicts, usedComponents: used, warnings }
}
