// ═══════ Variant-gestuurde store page renderer ═══════
// Vervangt de 5 vaste .tmpl templates in de pipeline. Genereert app/page.tsx
// op basis van design-DNA (tokens.ts) + layout-plan (layout.ts). Elke hero-
// variant, product-weergave en sectie-volgorde produceert LETTERLIJK andere JSX
// in de output — variatie is dus structureel en meetbaar, niet alleen data.
//
// Alle klant-facing tekst is Engelstalig (zie content-en.ts).

import type { DesignDNA } from './tokens.js'
import type { HeroVariant, LayoutPlan, ProductVariant, SectionId } from './layout.js'
import type { SignatureElement } from './design-plan.js'

export interface RenderProduct {
  id: string
  title: string
  image: string
  price: number
  compareAtPrice?: number
  badge?: string
  description?: string
  bullets?: string[]
  supplier?: string
  supplierProductId?: string
  supplierVariantId?: string
}

export interface RenderContent {
  brandName: string
  slogan: string
  heroLabel: string
  heroHeadline: string
  heroSubheadline: string
  heroCta: string
  usps: Array<{ title: string; desc: string }>
  footerTagline: string
  story: { title: string; body: string }
  ctaBand: { title: string; sub: string; button: string }
  reviews: Array<{ name: string; stars: number; text: string }>
  navLinks: Array<{ label: string; href: string }>
  footerLinks: Array<{ label: string; href: string }>
}

const j = (v: unknown): string => JSON.stringify(v)

// Vlakke DNA voor injectie in de gegenereerde file
function flatDNA(dna: DesignDNA) {
  const btnRadius =
    dna.shape.buttonStyle === 'pill' ? dna.shape.radiusPill
    : dna.shape.buttonStyle === 'sharp' ? '0px'
    : dna.shape.radiusMd
  return {
    ...dna.palette,
    heading: dna.typography.heading,
    body: dna.typography.body,
    headingWeight: dna.typography.headingWeight,
    bodyWeight: dna.typography.bodyWeight,
    headingTransform: dna.typography.headingTransform,
    headingLetterSpacing: dna.typography.headingLetterSpacing,
    headingScale: dna.typography.headingScale,
    radiusSm: dna.shape.radiusSm,
    radiusMd: dna.shape.radiusMd,
    radiusLg: dna.shape.radiusLg,
    radiusPill: dna.shape.radiusPill,
    sectionPadY: dna.shape.sectionPadY,
    contentGap: dna.shape.contentGap,
    shadow: dna.shape.shadow,
    borderWidth: dna.shape.borderWidth,
    btnRadius,
    tone: dna.tone,
  }
}

function buildCss(dna: DesignDNA): string {
  const shadow = dna.shape.shadow === 'none' ? '0 6px 24px rgba(0,0,0,0.10)' : dna.shape.shadow
  return [
    '*{box-sizing:border-box}',
    'html{scroll-behavior:smooth}',
    'a{color:inherit;text-decoration:none}',
    'img{max-width:100%;display:block}',
    '.rv{opacity:0;transform:translateY(26px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}',
    '.rv.in{opacity:1;transform:none}',
    '.btnp{transition:transform .25s cubic-bezier(.22,1,.36,1),box-shadow .25s;cursor:pointer}',
    `.btnp:hover{transform:translateY(-2px);box-shadow:${shadow}}`,
    '.btnp:active{transform:scale(.98)}',
    '.pcard{transition:transform .4s cubic-bezier(.22,1,.36,1),box-shadow .4s}',
    `.pcard:hover{transform:translateY(-4px);box-shadow:${shadow}}`,
    '.pimg{transition:transform .6s cubic-bezier(.22,1,.36,1)}',
    '.pcard:hover .pimg{transform:scale(1.06)}',
    '.navl{transition:opacity .2s}.navl:hover{opacity:.55}',
    '.hscroll{-ms-overflow-style:none;scrollbar-width:none}.hscroll::-webkit-scrollbar{display:none}',
    `@media(max-width:820px){.heroSplit{grid-template-columns:1fr !important}.erow{grid-template-columns:1fr !important}}`,
  ].join('\n')
}

// ── Product card (één component, drie layouts) ────────────────────────────────

const PRODUCT_CARD = `
function ProductCard({ p, i, layout, reverse }: { p: Product; i: number; layout: 'card'|'featured'|'row'; reverse?: boolean }) {
  const [loading, setLoading] = useState(false);
  const order = () => { setLoading(true); startCheckout(p); };
  const price = (
    <div style={{ display: 'flex', gap: '.6rem', alignItems: 'baseline', marginBottom: '.9rem' }}>
      <span style={{ fontWeight: 700, fontSize: layout === 'featured' ? '1.4rem' : '1.05rem', color: DNA.text }}>&#8364;{p.price.toFixed(2)}</span>
      {p.compareAtPrice ? <span style={{ color: DNA.textMuted, fontSize: '.9rem', textDecoration: 'line-through' }}>&#8364;{p.compareAtPrice.toFixed(2)}</span> : null}
    </div>
  );
  const cta = (
    <button type="button" className="btnp" disabled={loading} onClick={order}
      style={{ ...S.btn, width: layout === 'row' ? 'auto' : '100%', opacity: loading ? .6 : 1 }}>
      {loading ? 'One moment\\u2026' : 'Order now'}
    </button>
  );
  const badge = p.badge ? (
    <span style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 2, background: DNA.accent, color: DNA.primaryText, fontSize: '.62rem', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', padding: '.28rem .6rem', borderRadius: DNA.radiusSm }}>{p.badge}</span>
  ) : null;

  if (layout === 'row') {
    return (
      <div className="erow" style={{ display: 'grid', gridTemplateColumns: reverse ? '1fr 1.1fr' : '1.1fr 1fr', gap: 'clamp(1.5rem,4vw,3.5rem)', alignItems: 'center', direction: reverse ? 'rtl' : 'ltr' }}>
        <div style={{ direction: 'ltr', position: 'relative', aspectRatio: '4/3', overflow: 'hidden', borderRadius: DNA.radiusLg, background: DNA.surfaceAlt }}>
          {badge}
          {p.image ? <img className="pimg" src={p.image} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        </div>
        <div style={{ direction: 'ltr' }}>
          <h3 style={{ fontFamily: DNA.heading, fontSize: '1.4rem', fontWeight: DNA.headingWeight, margin: '0 0 .6rem', letterSpacing: DNA.headingLetterSpacing }}>{p.title}</h3>
          {p.description ? <p style={{ color: DNA.textMuted, lineHeight: 1.7, margin: '0 0 1rem', maxWidth: '46ch' }}>{p.description}</p> : null}
          {Array.isArray(p.bullets) && p.bullets.length ? (
            <ul style={{ margin: '0 0 1.2rem', padding: 0, listStyle: 'none', display: 'grid', gap: '.4rem' }}>
              {p.bullets.slice(0, 3).map((b, k) => <li key={k} style={{ color: DNA.textMuted, fontSize: '.9rem' }}>&#10003; {b}</li>)}
            </ul>
          ) : null}
          {price}
          {cta}
        </div>
      </div>
    );
  }

  return (
    <div className="pcard" style={{ background: DNA.surface, border: DNA.borderWidth + ' solid ' + DNA.border, borderRadius: DNA.radiusLg, overflow: 'hidden', display: 'flex', flexDirection: 'column', gridColumn: layout === 'featured' ? '1 / -1' : 'auto' }}>
      <div style={{ position: 'relative', aspectRatio: layout === 'featured' ? '16/7' : '1', overflow: 'hidden', background: DNA.surfaceAlt }}>
        {badge}
        {p.image ? <img className="pimg" src={p.image} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
      </div>
      <div style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{ fontFamily: DNA.heading, fontSize: layout === 'featured' ? '1.35rem' : '1rem', fontWeight: DNA.headingWeight, margin: '0 0 .5rem', letterSpacing: DNA.headingLetterSpacing }}>{p.title}</h3>
        {layout === 'featured' && p.description ? <p style={{ color: DNA.textMuted, lineHeight: 1.6, margin: '0 0 1rem', maxWidth: '52ch' }}>{p.description}</p> : null}
        <div style={{ marginTop: 'auto' }}>{price}{cta}</div>
      </div>
    </div>
  );
}
`

// ── Hero-varianten ────────────────────────────────────────────────────────────

function heroJsx(variant: HeroVariant): string {
  const label = `<span className="rv in" style={S.label}>{CONTENT.heroLabel}</span>`
  const h1 = `<h1 style={S.h1}>{CONTENT.heroHeadline}</h1>`
  const sub = `<p style={S.sub}>{CONTENT.heroSubheadline}</p>`
  const cta = `<a href="#products" className="btnp" style={S.btn}>{CONTENT.heroCta}</a>`
  const img0 = `PRODUCTS[0] && PRODUCTS[0].image`

  switch (variant) {
    case 'split':
      return `
      <section className="heroSplit" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '82vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(2.5rem,6vw,5rem)' }}>
          ${label}${h1}${sub}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>${cta}<a href="/about/" className="btnp" style={S.btn2}>Learn more</a></div>
        </div>
        <div style={{ background: DNA.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: '42vh' }}>
          {${img0} ? <img src={PRODUCTS[0].image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '58%', aspectRatio: '1', background: DNA.border, borderRadius: DNA.radiusLg }} />}
        </div>
      </section>`
    case 'centered':
      return `
      <section style={{ minHeight: '78vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'clamp(3rem,8vw,6rem) clamp(1.5rem,5vw,3rem)', background: DNA.bg }}>
        ${label}
        <h1 style={{ ...S.h1, maxWidth: '16ch' }}>{CONTENT.heroHeadline}</h1>
        <p style={{ ...S.sub, textAlign: 'center', margin: '0 auto 2.25rem' }}>{CONTENT.heroSubheadline}</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>${cta}</div>
        {${img0} ? <div style={{ marginTop: '3rem', width: '100%', maxWidth: '820px', aspectRatio: '16/8', overflow: 'hidden', borderRadius: DNA.radiusLg, boxShadow: DNA.shadow }}><img src={PRODUCTS[0].image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div> : null}
      </section>`
    case 'editorial':
      return `
      <section style={{ padding: 'clamp(3rem,7vw,6rem) clamp(1.5rem,5vw,4.5rem) 0', background: DNA.bg }}>
        <div style={{ maxWidth: '1150px', margin: '0 auto' }}>
          ${label}
          <h1 style={{ ...S.h1, fontSize: 'clamp(2.6rem,8vw,6rem)', maxWidth: '18ch' }}>{CONTENT.heroHeadline}</h1>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'end', marginTop: '1.5rem' }}>
            <p style={{ ...S.sub }}>{CONTENT.heroSubheadline}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>${cta}</div>
          </div>
        </div>
        {${img0} ? <div style={{ marginTop: '3rem', width: '100%', aspectRatio: '21/8', overflow: 'hidden', background: DNA.surfaceAlt }}><img src={PRODUCTS[0].image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div> : null}
      </section>`
    case 'fullbleed':
      return `
      <section style={{ position: 'relative', minHeight: '86vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        {${img0} ? <img src={PRODUCTS[0].image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ position: 'absolute', inset: 0, background: DNA.secondary }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,.72), rgba(0,0,0,.28))' }} />
        <div style={{ position: 'relative', padding: 'clamp(2.5rem,6vw,5rem)', maxWidth: '720px', color: '#fff' }}>
          <span className="rv in" style={{ ...S.label, color: DNA.accent }}>{CONTENT.heroLabel}</span>
          <h1 style={{ ...S.h1, color: '#fff' }}>{CONTENT.heroHeadline}</h1>
          <p style={{ ...S.sub, color: 'rgba(255,255,255,.86)' }}>{CONTENT.heroSubheadline}</p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>${cta}</div>
        </div>
      </section>`
    case 'minimal-left':
    default:
      return `
      <section style={{ minHeight: '72vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(3rem,10vw,8rem) clamp(1.5rem,6vw,6rem)', background: DNA.bg, maxWidth: '900px' }}>
        ${label}${h1}
        <p style={{ ...S.sub, maxWidth: '38ch' }}>{CONTENT.heroSubheadline}</p>
        <div>${cta}</div>
      </section>`
  }
}

// ── Product-weergave varianten ────────────────────────────────────────────────

function productsInner(variant: ProductVariant): string {
  switch (variant) {
    case 'featured-grid':
      return `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '1.5rem' }}>{PRODUCTS.map((p, i) => <ProductCard key={p.id} p={p} i={i} layout={i === 0 ? 'featured' : 'card'} />)}</div>`
    case 'carousel':
      return `<div className="hscroll" style={{ display: 'flex', gap: '1.25rem', overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: '1rem' }}>{PRODUCTS.map((p, i) => <div key={p.id} style={{ flex: '0 0 300px', scrollSnapAlign: 'start' }}><ProductCard p={p} i={i} layout="card" /></div>)}</div>`
    case 'editorial-list':
      return `<div style={{ display: 'grid', gap: 'clamp(2.5rem,6vw,5rem)' }}>{PRODUCTS.map((p, i) => <Reveal key={p.id}><ProductCard p={p} i={i} layout="row" reverse={i % 2 === 1} /></Reveal>)}</div>`
    case 'grid':
    default:
      return `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '1.5rem' }}>{PRODUCTS.map((p, i) => <ProductCard key={p.id} p={p} i={i} layout="card" />)}</div>`
  }
}

// ── Secties ───────────────────────────────────────────────────────────────────

function sectionJsx(id: SectionId, layout: LayoutPlan): string {
  switch (id) {
    case 'usps':
      return `
      <section style={{ padding: DNA.sectionPadY + ' clamp(1.5rem,5vw,4rem)', background: DNA.surface, borderTop: DNA.borderWidth + ' solid ' + DNA.border, borderBottom: DNA.borderWidth + ' solid ' + DNA.border }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: DNA.contentGap, maxWidth: '1000px', margin: '0 auto' }}>
          {CONTENT.usps.map((u: any, i: number) => (
            <Reveal key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', marginBottom: '.6rem', color: DNA.accent }}>&#9679;</div>
              <h3 style={{ fontFamily: DNA.heading, fontSize: '1rem', fontWeight: DNA.headingWeight, margin: '0 0 .4rem' }}>{u.title}</h3>
              <p style={{ color: DNA.textMuted, fontSize: '.9rem', lineHeight: 1.6, margin: 0 }}>{u.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>`
    case 'products':
      return `
      <section id="products" style={{ padding: DNA.sectionPadY + ' clamp(1.5rem,5vw,4rem)', background: DNA.bg }}>
        <Reveal><h2 style={S.sectionTitle}>Shop the collection</h2></Reveal>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>${productsInner(layout.product)}</div>
      </section>`
    case 'reviews':
      return `
      <section style={{ padding: DNA.sectionPadY + ' clamp(1.5rem,5vw,4rem)', background: DNA.surface }}>
        <Reveal><h2 style={S.sectionTitle}>What customers say</h2></Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
          {CONTENT.reviews.map((r: any, i: number) => (
            <Reveal key={i} style={{ padding: '1.75rem', border: DNA.borderWidth + ' solid ' + DNA.border, borderRadius: DNA.radiusLg, background: DNA.bg }}>
              <div style={{ color: DNA.accent, marginBottom: '.75rem', letterSpacing: '2px' }}>{Array.from({ length: r.stars }).map((_, k) => <span key={k}>&#9733;</span>)}</div>
              <p style={{ color: DNA.text, lineHeight: 1.7, margin: '0 0 1rem', fontSize: '.95rem' }}>&#8220;{r.text}&#8221;</p>
              <span style={{ fontSize: '.85rem', fontWeight: 700, color: DNA.textMuted }}>{r.name}</span>
            </Reveal>
          ))}
        </div>
      </section>`
    case 'story':
      return `
      <section style={{ padding: DNA.sectionPadY + ' clamp(1.5rem,5vw,4rem)', background: DNA.bg }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
          <Reveal>
            <h2 style={{ ...S.sectionTitle, marginBottom: '1.25rem' }}>{CONTENT.story.title}</h2>
            <p style={{ color: DNA.textMuted, lineHeight: 1.9, fontSize: '1.05rem', margin: 0 }}>{CONTENT.story.body}</p>
          </Reveal>
        </div>
      </section>`
    case 'cta-band':
      return `
      <section style={{ padding: DNA.sectionPadY + ' clamp(1.5rem,5vw,4rem)', background: DNA.primary, color: DNA.primaryText, textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontFamily: DNA.heading, fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: DNA.headingWeight, margin: '0 0 .6rem', textTransform: DNA.headingTransform, color: DNA.primaryText }}>{CONTENT.ctaBand.title}</h2>
          <p style={{ opacity: .85, margin: '0 0 1.75rem', fontSize: '1rem' }}>{CONTENT.ctaBand.sub}</p>
          <a href="#products" className="btnp" style={{ display: 'inline-block', background: DNA.primaryText, color: DNA.primary, padding: '.9rem 2.2rem', borderRadius: DNA.btnRadius, fontWeight: 800, fontSize: '.85rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{CONTENT.ctaBand.button}</a>
        </Reveal>
      </section>`
    default:
      return ''
  }
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function navJsx(style: LayoutPlan['navStyle']): string {
  const brand = `<a href="/" style={{ fontFamily: DNA.heading, fontWeight: DNA.headingWeight, fontSize: '1.05rem', letterSpacing: DNA.headingTransform === 'uppercase' ? '.14em' : '.02em', textTransform: DNA.headingTransform }}>{CONTENT.brandName}</a>`
  const links = `<div style={{ display: 'flex', gap: 'clamp(1.25rem,3vw,2.5rem)' }}>{CONTENT.navLinks.map((l: any) => <a key={l.label} href={l.href} className="navl" style={{ fontSize: '.82rem', color: DNA.textMuted, letterSpacing: '.04em' }}>{l.label}</a>)}</div>`
  const base = `background: DNA.mode === 'dark' ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.82)', backdropFilter: 'blur(12px)', borderBottom: DNA.borderWidth + ' solid ' + DNA.border, position: 'sticky', top: 0, zIndex: 50, padding: '1.25rem clamp(1.5rem,5vw,4rem)'`
  if (style === 'center') {
    return `<nav style={{ ${base}, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.75rem' }}>${brand}${links}</nav>`
  }
  if (style === 'left') {
    return `<nav style={{ ${base}, display: 'flex', alignItems: 'center', gap: '2.5rem' }}>${brand}${links}</nav>`
  }
  return `<nav style={{ ${base}, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>${brand}${links}</nav>`
}

// ── Footer ────────────────────────────────────────────────────────────────────

function footerJsx(style: LayoutPlan['footerStyle']): string {
  const links = `{CONTENT.footerLinks.map((l: any) => <a key={l.label} href={l.href} className="navl" style={{ color: DNA.textMuted, fontSize: '.82rem' }}>{l.label}</a>)}`
  if (style === 'bold') {
    return `
    <footer style={{ background: DNA.secondary, color: '#fff', padding: 'clamp(3rem,6vw,5rem) clamp(1.5rem,5vw,4rem)', textAlign: 'center' }}>
      <p style={{ fontFamily: DNA.heading, fontSize: '2rem', fontWeight: DNA.headingWeight, margin: '0 0 1rem', textTransform: DNA.headingTransform, letterSpacing: DNA.headingLetterSpacing }}>{CONTENT.brandName}</p>
      <p style={{ opacity: .7, margin: '0 0 1.75rem' }}>{CONTENT.footerTagline}</p>
      <div style={{ display: 'flex', gap: '1.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.75rem' }}>${links}</div>
      <p style={{ opacity: .4, fontSize: '.75rem', margin: 0 }}>&#169; {new Date().getFullYear()} {CONTENT.brandName}</p>
    </footer>`
  }
  if (style === 'columns') {
    return `
    <footer style={{ background: DNA.surfaceAlt, color: DNA.text, padding: 'clamp(3rem,6vw,4.5rem) clamp(1.5rem,5vw,4rem)', borderTop: DNA.borderWidth + ' solid ' + DNA.border }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '2rem' }}>
        <div>
          <p style={{ fontFamily: DNA.heading, fontWeight: DNA.headingWeight, fontSize: '1.1rem', margin: '0 0 .5rem', textTransform: DNA.headingTransform }}>{CONTENT.brandName}</p>
          <p style={{ color: DNA.textMuted, fontSize: '.85rem', lineHeight: 1.6, maxWidth: '30ch' }}>{CONTENT.footerTagline}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>${links}</div>
      </div>
      <p style={{ color: DNA.textMuted, fontSize: '.75rem', marginTop: '2.5rem' }}>&#169; {new Date().getFullYear()} {CONTENT.brandName}. All rights reserved.</p>
    </footer>`
  }
  return `
  <footer style={{ background: DNA.bg, color: DNA.textMuted, padding: '2.5rem clamp(1.5rem,5vw,4rem)', borderTop: DNA.borderWidth + ' solid ' + DNA.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
    <span style={{ fontFamily: DNA.heading, fontWeight: DNA.headingWeight, textTransform: DNA.headingTransform }}>{CONTENT.brandName}</span>
    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>${links}</div>
    <span style={{ fontSize: '.75rem' }}>&#169; {new Date().getFullYear()}</span>
  </footer>`
}

// ── Volledige page assembleren ────────────────────────────────────────────────

export function renderStorePage(
  dna: DesignDNA,
  layout: LayoutPlan,
  content: RenderContent,
  products: RenderProduct[],
): string {
  const dnaObj = flatDNA(dna)
  const css = buildCss(dna)
  const sections = layout.sections.map(s => sectionJsx(s, layout)).join('\n')

  return `'use client';
import { useEffect, useRef, useState } from 'react';

interface Product { id: string; title: string; image: string; price: number; compareAtPrice?: number; badge?: string; description?: string; bullets?: string[]; [key: string]: unknown }

const PRODUCTS: Product[] = ${j(products)};
const DNA: any = ${j(dnaObj)};
const CONTENT: any = ${j(content)};
const CSS: string = ${j(css)};

// Design-token style helpers (derived from the per-store design DNA)
const S: any = {
  label: { color: DNA.accent, fontSize: '.72rem', letterSpacing: '.28em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '1.25rem', display: 'block' },
  h1: { fontFamily: DNA.heading, fontWeight: DNA.headingWeight, fontSize: 'clamp(2.4rem, ' + (5 * DNA.headingScale) + 'vw, ' + (4.6 * DNA.headingScale) + 'rem)', lineHeight: 1.06, letterSpacing: DNA.headingLetterSpacing, textTransform: DNA.headingTransform, margin: '0 0 1.5rem' },
  sub: { color: DNA.textMuted, fontSize: '1.08rem', lineHeight: 1.7, maxWidth: '42ch', margin: '0 0 2.25rem' },
  btn: { display: 'inline-block', background: DNA.primary, color: DNA.primaryText, padding: '.9rem 2rem', borderRadius: DNA.btnRadius, fontWeight: 700, fontSize: '.85rem', letterSpacing: '.03em', textTransform: DNA.headingTransform === 'uppercase' ? 'uppercase' : 'none', border: 'none' },
  btn2: { display: 'inline-block', background: 'transparent', color: DNA.text, padding: '.9rem 2rem', borderRadius: DNA.btnRadius, fontWeight: 600, fontSize: '.85rem', border: DNA.borderWidth + ' solid ' + DNA.border },
  sectionTitle: { fontFamily: DNA.heading, fontWeight: DNA.headingWeight, fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', letterSpacing: DNA.headingLetterSpacing, textTransform: DNA.headingTransform, textAlign: 'center', margin: '0 0 2.5rem', color: DNA.text },
};

function startCheckout(p: Product): void {
  window.location.href = '/checkout/?product=' + encodeURIComponent(p.id);
}

function Reveal({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.12 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={visible ? 'rv in' : 'rv'} style={style}>{children}</div>;
}
${PRODUCT_CARD}
export default function Home() {
  return (
    <div style={{ background: DNA.bg, color: DNA.text, minHeight: '100dvh', fontFamily: DNA.body, fontWeight: DNA.bodyWeight }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      ${navJsx(layout.navStyle)}
      ${heroJsx(layout.hero)}
${sections}
      ${footerJsx(layout.footerStyle)}
    </div>
  );
}
`
}
