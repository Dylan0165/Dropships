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
import { motionCss, motionRuntime, type MotionProfile } from '../anime-presets.js'

export interface AssembleInput {
  dna: DesignDNA
  brandName: string
  /** Optionele balk bóven de nav (eigen categorie, zie topbars.ts). */
  topbar?: ComponentSelection
  nav: ComponentSelection
  sections: ComponentSelection[]   // in volgorde, tussen nav en footer
  footer: ComponentSelection
  /**
   * De VOLLEDIGE collectie. Componenten die een deel tonen (spotlight, hero-strip)
   * vullen zelf aan met de rest; er verdwijnt niets stilzwijgend van de pagina.
   * `productType` groepeert de collectie in categorieën (zie ProductTabs).
   */
  products: ReadonlyArray<{ id: string; title: string; image: string; price: number; productType?: string }>
  /** default stijl/animatie als de selectie ze niet specificeert */
  defaultStyle?: StyleVariant
  defaultAnim?: AnimationVariant
  /** Bewegingskarakter voor de Anime.js-laag; weglaten = geen data-am-runtime. */
  motion?: MotionProfile
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
function MiniCountdown({hours}:{hours:number}){
  const[left,setLeft]=useState(hours*3600);
  useEffect(()=>{const t=setInterval(()=>setLeft(s=>s>0?s-1:0),1000);return()=>clearInterval(t);},[]);
  const pad=(n:number)=>String(n).padStart(2,'0');
  return <span style={{fontVariantNumeric:'tabular-nums',fontWeight:800}}>{pad(Math.floor(left/3600))}:{pad(Math.floor((left%3600)/60))}:{pad(left%60)}</span>;
}
function RotatingText({items}:{items:string[]}){
  const list=items&&items.length?items:[''];
  const[i,setI]=useState(0);const[on,setOn]=useState(true);
  useEffect(()=>{
    if(list.length<2)return;
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const t=setInterval(()=>{setOn(false);setTimeout(()=>{setI(v=>(v+1)%list.length);setOn(true);},260);},4200);
    return()=>clearInterval(t);
  },[list.length]);
  return <span aria-live="polite" style={{opacity:on?1:0,transition:'opacity .26s'}}>{list[i]}</span>;
}
function StickyNav(){
  const[solid,setSolid]=useState(false);
  useEffect(()=>{const f=()=>setSolid(window.scrollY>70);f();window.addEventListener('scroll',f,{passive:true});return()=>window.removeEventListener('scroll',f);},[]);
  return(<nav className={'sn'+(solid?' solid':'')}>
    <a href="/" style={{fontFamily:'var(--f-head)',fontWeight:'var(--fw-head)',fontSize:'1.05rem',textTransform:'var(--tt-head)'}}>{BRAND}</a>
    <div style={{display:'flex',gap:'clamp(1.25rem,3vw,2.5rem)'}}>{[['Shop','#products'],['About','/about/'],['FAQ','/faq/'],['Contact','/contact/']].map(([l,h])=><a key={l} href={h} className="navl" style={{fontSize:'.82rem'}}>{l}</a>)}</div>
  </nav>);
}
function DrawerNav(){
  const[open,setOpen]=useState(false);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[]);
  return(<>
    <nav style={{background:'color-mix(in srgb, var(--c-bg) 82%, transparent)',backdropFilter:'blur(12px)',borderBottom:'var(--bw) solid var(--c-border)',position:'sticky',top:0,zIndex:50,padding:'1.1rem clamp(1.5rem,5vw,4rem)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <a href="/" style={{fontFamily:'var(--f-head)',fontWeight:'var(--fw-head)',fontSize:'1.05rem',textTransform:'var(--tt-head)'}}>{BRAND}</a>
      <button type="button" aria-label="Open menu" aria-expanded={open} onClick={()=>setOpen(true)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--c-text)',padding:'.3rem',display:'inline-flex'}}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
    </nav>
    <div className={'dn-scrim'+(open?' open':'')} onClick={()=>setOpen(false)} aria-hidden="true" />
    <div className={'dn-panel'+(open?' open':'')} role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" aria-label="Close menu" onClick={()=>setOpen(false)} style={{position:'absolute',top:'1.4rem',right:'1.6rem',background:'none',border:'none',cursor:'pointer',color:'var(--c-text)',display:'inline-flex'}}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      {[['Shop','#products'],['About','/about/'],['FAQ','/faq/'],['Returns','/returns/'],['Contact','/contact/']].map(([l,h])=>(
        <a key={l} href={h} onClick={()=>setOpen(false)} style={{fontFamily:'var(--f-head)',fontSize:'1.3rem',fontWeight:'var(--fw-head)'}}>{l}</a>
      ))}
    </div>
  </>);
}
function ProductTabs({tabs}:{tabs:string[]}){
  // Echte categorieën als de producten een producttype hebben (assortiment uit
  // suppliers/assortment.ts). Een winkel met twaalf producten is dan te
  // doorlopen per soort in plaats van als één lange lijst. Zonder types valt hij
  // terug op de meegegeven labels met een vaste, herhaalbare verdeling.
  const types:string[]=Array.from(new Set(PRODUCTS.map((p:any)=>p.productType).filter(Boolean)));
  const byType=types.length>=2;
  const list=byType?['All',...types]:(tabs&&tabs.length?tabs:['All']);
  const[t,setT]=useState(0);
  const shown=t===0?PRODUCTS
    :byType?PRODUCTS.filter((p:any)=>p.productType===list[t])
    :PRODUCTS.filter((_:any,i:number)=>i%(list.length-1||1)===(t-1));
  return(<div>
    <div role="tablist" style={{display:'flex',gap:'.5rem',justifyContent:'center',flexWrap:'wrap',marginBottom:'2rem'}}>
      {list.map((label,i)=>(
        <button key={label} type="button" role="tab" aria-selected={t===i} onClick={()=>setT(i)}
          style={{padding:'.5rem 1.1rem',borderRadius:'var(--r-pill)',border:'var(--bw) solid var(--c-border)',cursor:'pointer',fontFamily:'inherit',fontSize:'.82rem',fontWeight:600,
            background:t===i?'var(--c-primary)':'transparent',color:t===i?'var(--c-primary-text)':'var(--c-muted)'}}>{label.charAt(0).toUpperCase()+label.slice(1)}</button>
      ))}
    </div>
    <div className="grid3" style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:'1.5rem'}}>
      {(shown.length?shown:PRODUCTS).map((pr:any,i:number)=><Card key={pr.id} p={pr} i={i} layout="card" />)}
    </div>
  </div>);
}
function InfoTabs({items}:{items:{label:string;body:string}[]}){
  const list=items&&items.length?items:[{label:'Info',body:''}];
  const[t,setT]=useState(0);
  return(<div>
    <div role="tablist" style={{display:'flex',gap:'.4rem',flexWrap:'wrap',marginBottom:'1.2rem'}}>
      {list.map((it,i)=>(
        <button key={it.label} type="button" role="tab" aria-selected={t===i} onClick={()=>setT(i)}
          style={{padding:'.5rem 1rem',border:'none',borderBottom:'2px solid '+(t===i?'var(--c-accent)':'transparent'),background:'none',cursor:'pointer',fontFamily:'inherit',fontSize:'.85rem',fontWeight:600,color:t===i?'var(--c-text)':'var(--c-muted)'}}>{it.label}</button>
      ))}
    </div>
    <p style={{margin:0,lineHeight:1.8,color:'var(--c-muted)'}}>{list[t]?.body}</p>
  </div>);
}
function ProductFinder(){
  const[step,setStep]=useState(0);
  const opts=[['Daily use','Now and then'],['Keep it simple','Give me options']];
  if(step>=opts.length){
    const pick=PRODUCTS[0];
    return(<div style={{background:'var(--c-surface)',border:'var(--bw) solid var(--c-border)',borderRadius:'var(--r-lg)',padding:'1.6rem'}}>
      <p style={{margin:'0 0 1rem',color:'var(--c-muted)'}}>Based on that, start here:</p>
      {pick?<><b style={{display:'block',marginBottom:'.8rem'}}>{pick.title}</b>
      <button type="button" className="btnp btn" onClick={()=>startCheckout(pick)}>Order this one</button></>:null}
      <button type="button" onClick={()=>setStep(0)} style={{display:'block',margin:'1rem auto 0',background:'none',border:'none',color:'var(--c-muted)',fontSize:'.8rem',cursor:'pointer',textDecoration:'underline'}}>Start over</button>
    </div>);
  }
  return(<div style={{background:'var(--c-surface)',border:'var(--bw) solid var(--c-border)',borderRadius:'var(--r-lg)',padding:'1.6rem'}}>
    <p style={{margin:'0 0 1rem',fontWeight:600}}>{step===0?'How often will you use it?':'How much choice do you want?'}</p>
    <div style={{display:'flex',gap:'.7rem',justifyContent:'center',flexWrap:'wrap'}}>
      {opts[step].map(o=><button key={o} type="button" className="btnp btn2" onClick={()=>setStep(step+1)}>{o}</button>)}
    </div>
  </div>);
}
function SimpleForm({submitLabel,placeholder,done,onPanel}:{submitLabel:string;placeholder:string;done:string;onPanel?:boolean}){
  const[sent,setSent]=useState(false);
  if(sent)return <p style={{margin:0,fontWeight:600}} role="status">{done}</p>;
  return(<form onSubmit={(e)=>{e.preventDefault();setSent(true);}} style={{display:'flex',gap:'.6rem',justifyContent:'center',flexWrap:'wrap'}}>
    <input type="email" required placeholder={placeholder} aria-label="Email"
      style={{padding:'.75rem 1rem',borderRadius:'var(--r-btn)',border:onPanel?'none':'var(--bw) solid var(--c-border)',minWidth:'240px',fontFamily:'inherit',background:onPanel?'var(--c-bg)':'var(--c-surface)',color:'var(--c-text)'}} />
    <button type="submit" className="btnp btn" style={onPanel?{background:'var(--c-accent)'}:undefined}>{submitLabel}</button>
  </form>);
}
function QuickFeedback({question}:{question:string}){
  const[v,setV]=useState<string|null>(null);
  if(v)return <p style={{margin:0,color:'var(--c-muted)'}} role="status">Thanks for letting us know.</p>;
  return(<div style={{display:'inline-flex',gap:'.8rem',alignItems:'center',flexWrap:'wrap',justifyContent:'center'}}>
    <span style={{color:'var(--c-muted)',fontSize:'.88rem'}}>{question}</span>
    {['Yes','Not really'].map(o=><button key={o} type="button" className="btnp btn2" style={{padding:'.45rem 1rem',fontSize:'.8rem'}} onClick={()=>setV(o)}>{o}</button>)}
  </div>);
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

  const topR = input.topbar ? renderOne(input.topbar, 0) : null
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

  if (input.motion) cssParts.push(motionCss())

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
const AM_PLAN: any = ${j(input.motion?.plan ?? {})};
${HELPERS}${input.motion ? motionRuntime() : ''}
export default function Home() {
  ${input.motion ? 'useMotion(AM_PLAN);' : ''}
  return (
    <div style={{ minHeight:'100dvh', background:'var(--c-bg)', color:'var(--c-text)', fontFamily:'var(--f-body)' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      ${topR?.jsx ?? ''}
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
