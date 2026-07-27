// ═══════ Topbars / aankondigingsbalken ═══════
// Een eigen categorie boven de nav. Het punt is niet "een balkje met gratis
// verzending", maar dat de TOON van die balk bij de niche past: een
// sportswear-store hoort energiek en kort te klinken, een wellness-store rustig
// en zacht, een huishoudwinkel praktisch en geruststellend.
//
// Daarom draagt elke variant `nicheThemes` in zijn tags; selection.ts koppelt het
// icoonthema van de store (icons.ts) aan de passende topbars in plaats van er
// willekeurig één te trekken. De LLM mag alsnog zelf kiezen — dit is de bodem,
// niet het plafond.

import type { ComponentDef, RenderCtx, ComponentProps, RenderResult } from './types.js'
import { txt, j, am, arr } from './types.js'
import { icon, type IconTheme } from './icons.js'

/** Welke topbar-varianten bij welk icoon-/nichethema passen. */
export const TOPBAR_BY_THEME: Record<IconTheme, string[]> = {
  sport: ['topbar.energy-ticker', 'topbar.countdown-urgency', 'topbar.bold-statement'],
  wellness: ['topbar.calm-line', 'topbar.rotating-soft', 'topbar.editorial-rule'],
  home: ['topbar.practical-columns', 'topbar.trust-mini', 'topbar.free-shipping-progress'],
  tech: ['topbar.status-strip', 'topbar.bold-statement', 'topbar.countdown-urgency'],
  fashion: ['topbar.editorial-rule', 'topbar.rotating-soft', 'topbar.seasonal-accent'],
  outdoor: ['topbar.bold-statement', 'topbar.practical-columns', 'topbar.trust-mini'],
  kids: ['topbar.seasonal-accent', 'topbar.rotating-soft', 'topbar.free-shipping-progress'],
  pets: ['topbar.trust-mini', 'topbar.practical-columns', 'topbar.seasonal-accent'],
  beauty: ['topbar.editorial-rule', 'topbar.calm-line', 'topbar.seasonal-accent'],
  kitchen: ['topbar.practical-columns', 'topbar.free-shipping-progress', 'topbar.trust-mini'],
  universal: ['topbar.simple-line', 'topbar.trust-mini', 'topbar.practical-columns'],
}

const BAR = (extra: string): string =>
  `fontSize:'.76rem', letterSpacing:'.04em', padding:'.5rem clamp(1rem,4vw,2rem)', ${extra}`

const theme = (ctx: RenderCtx, p: ComponentProps): IconTheme =>
  (typeof p.iconTheme === 'string' ? p.iconTheme : 'universal') as IconTheme

const defs: ComponentDef[] = [
  {
    id: 'topbar.simple-line', category: 'topbar',
    label: 'Eén regel, neutraal — universeel inzetbaar',
    styles: ['minimal', 'bold', 'editorial'], anims: ['none', 'subtle'],
    tags: ['universal', 'neutral'],
    props: { message: 'de boodschap (kort, Engels)' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<div style={{ ${BAR("background:'var(--c-primary)', color:'var(--c-primary-text)', textAlign:'center', fontWeight:600")} }}>${txt(p.message, 'Free EU shipping over EUR 50 — 30-day returns')}</div>`,
    }),
  },
  {
    id: 'topbar.energy-ticker', category: 'topbar',
    label: 'Doorlopende ticker — energiek, voor sport/prestatie',
    styles: ['bold', 'playful'], anims: ['subtle', 'expressive'],
    tags: ['sport', 'fitness', 'energetic', 'urban'],
    props: { items: 'lijst korte kreten (3-5)' },
    canBeSignature: true,
    render: (_ctx, p): RenderResult => ({
      jsx: `<div style={{ ${BAR("background:'var(--c-secondary)', color:'#fff', overflow:'hidden', padding:'.55rem 0'")} }}>
        <div className="tb-track" style={{ display:'flex', gap:'2.5rem', whiteSpace:'nowrap', width:'max-content' }}>
          {[0,1].map(dup=>(
            <div key={dup} style={{ display:'flex', gap:'2.5rem' }} aria-hidden={dup===1}>
              {${arr(p.items, ['SHIPPED WITHIN 24H', 'BUILT FOR TRAINING', 'FREE EU DELIVERY', '30-DAY RETURNS'])}.map((t:string,i:number)=>(
                <span key={i} style={{ fontWeight:800, letterSpacing:'.14em', fontSize:'.7rem' }}>{t}</span>
              ))}
            </div>
          ))}
        </div>
      </div>`,
      css: '@keyframes tbScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}\n.tb-track{animation:tbScroll 22s linear infinite}\n@media(prefers-reduced-motion:reduce){.tb-track{animation:none;width:100%;justify-content:center}}',
    }),
  },
  {
    id: 'topbar.calm-line', category: 'topbar',
    label: 'Dunne rustige regel — voor wellness/zorg',
    styles: ['minimal', 'editorial'], anims: ['none', 'subtle'],
    tags: ['wellness', 'calm', 'organic', 'premium'],
    props: { message: '' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<div style={{ ${BAR("background:'var(--c-surface-alt)', color:'var(--c-muted)', textAlign:'center', fontWeight:400, borderBottom:'var(--bw) solid var(--c-border)'")} }}>${txt(p.message, 'Considered products, sent with care — free returns within 30 days')}</div>`,
    }),
  },
  {
    id: 'topbar.practical-columns', category: 'topbar',
    label: 'Drie praktische feiten naast elkaar — huishouden/keuken',
    styles: ['minimal', 'bold'], anims: ['none', 'subtle'],
    tags: ['home', 'household', 'kitchen', 'practical', 'trust'],
    props: { items: 'drie korte feiten' },
    render: (ctx, p): RenderResult => {
      const th = theme(ctx, p)
      return {
        jsx: `<div style={{ ${BAR("background:'var(--c-surface)', color:'var(--c-text)', borderBottom:'var(--bw) solid var(--c-border)'")} }}>
          <div style={{ display:'flex', gap:'clamp(1rem,4vw,3rem)', justifyContent:'center', flexWrap:'wrap' }}>
            {${arr(p.items, ['Ships in 1 working day', 'Free returns for 30 days', 'Support that answers'])}.map((t:string,i:number)=>(
              <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:'.45rem' }}>
                <span style={{ color:'var(--c-accent)', display:'inline-flex' }}>{[${[icon(th, 'shipping', { size: 15 }), icon(th, 'returns', { size: 15 }), icon(th, 'support', { size: 15 })].join(',')}][i]}</span>
                {t}
              </span>
            ))}
          </div>
        </div>`,
      }
    },
  },
  {
    id: 'topbar.status-strip', category: 'topbar',
    label: 'Status-strip met live-stip — technisch/gadgets',
    styles: ['bold', 'minimal'], anims: ['none', 'subtle'],
    tags: ['tech', 'gadget', 'precise', 'modern'],
    props: { message: '', stock: 'voorraadtekst' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<div style={{ ${BAR("background:'var(--c-text)', color:'var(--c-bg)', display:'flex', justifyContent:'center', gap:'1.5rem', flexWrap:'wrap', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace'")} }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:'.45rem' }}>
          <span className="tb-dot" style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--c-accent)', display:'inline-block' }} />
          ${txt(p.stock, 'IN STOCK')}
        </span>
        <span style={{ opacity:.75 }}>${txt(p.message, 'SHIPS TODAY BEFORE 16:00 CET')}</span>
      </div>`,
      css: '@keyframes tbPulse{0%,100%{opacity:1}50%{opacity:.35}}\n.tb-dot{animation:tbPulse 2.4s ease-in-out infinite}\n@media(prefers-reduced-motion:reduce){.tb-dot{animation:none}}',
    }),
  },
  {
    id: 'topbar.editorial-rule', category: 'topbar',
    label: 'Dunne redactionele regel met kapitalen — mode/premium',
    styles: ['editorial', 'minimal'], anims: ['none', 'subtle'],
    tags: ['fashion', 'premium', 'beauty', 'editorial'],
    props: { left: 'links', center: 'midden', right: 'rechts' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<div style={{ ${BAR("background:'var(--c-bg)', color:'var(--c-muted)', borderBottom:'var(--bw) solid var(--c-border)', display:'grid', gridTemplateColumns:'1fr auto 1fr', alignItems:'center', textTransform:'uppercase', letterSpacing:'.22em', fontSize:'.64rem'")} }}>
        <span>${txt(p.left, 'Complimentary EU shipping')}</span>
        <span style={{ textAlign:'center', color:'var(--c-text)' }}>${txt(p.center, 'New season')}</span>
        <span style={{ textAlign:'right' }}>${txt(p.right, '30-day returns')}</span>
      </div>`,
      css: '@media(max-width:720px){.tb-ed{grid-template-columns:1fr !important}}',
    }),
  },
  {
    id: 'topbar.countdown-urgency', category: 'topbar',
    label: 'Aanbieding met aflopende klok — promo/urgentie',
    styles: ['bold', 'playful'], anims: ['subtle'],
    tags: ['promo', 'conversion', 'sport', 'tech', 'urgency'],
    props: { message: '', hours: 'aantal uren op de klok' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<div style={{ ${BAR("background:'var(--c-accent)', color:'var(--c-primary-text)', display:'flex', justifyContent:'center', alignItems:'center', gap:'.8rem', flexWrap:'wrap', fontWeight:700")} }}>
        <span>${txt(p.message, 'Launch offer ends in')}</span>
        <MiniCountdown hours={${Number(p.hours) > 0 ? Number(p.hours) : 24}} />
      </div>`,
    }),
  },
  {
    id: 'topbar.free-shipping-progress', category: 'topbar',
    label: 'Voortgangsbalk naar gratis verzending — conversie',
    styles: ['minimal', 'bold', 'playful'], anims: ['subtle'],
    tags: ['conversion', 'home', 'kitchen', 'kids', 'value'],
    props: { threshold: 'bedrag voor gratis verzending', message: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<div style={{ ${BAR("background:'var(--c-surface-alt)', color:'var(--c-text)', textAlign:'center', borderBottom:'var(--bw) solid var(--c-border)'")} }}>
        <div style={{ maxWidth:'420px', margin:'0 auto' }}>
          <span style={{ display:'block', marginBottom:'.35rem' }}>${txt(p.message, `Free shipping from EUR ${Number(p.threshold) > 0 ? Number(p.threshold) : 50}`)}</span>
          <span style={{ display:'block', height:'3px', background:'var(--c-border)', borderRadius:'999px', overflow:'hidden' }}>
            <span${am(ctx.anim, 'mask')} style={{ display:'block', height:'100%', width:'62%', background:'var(--c-accent)' }} />
          </span>
        </div>
      </div>`,
    }),
  },
  {
    id: 'topbar.rotating-soft', category: 'topbar',
    label: 'Zacht wisselende boodschappen — mode/wellness/kids',
    styles: ['minimal', 'playful', 'editorial'], anims: ['subtle'],
    tags: ['wellness', 'fashion', 'kids', 'beauty', 'soft'],
    props: { items: 'lijst boodschappen (2-4)' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<div style={{ ${BAR("background:'var(--c-surface)', color:'var(--c-text)', textAlign:'center', borderBottom:'var(--bw) solid var(--c-border)', minHeight:'2rem', display:'flex', alignItems:'center', justifyContent:'center'")} }}>
        <RotatingText items={${arr(p.items, ['Free EU shipping over EUR 50', 'Sent within one working day', 'Return anything within 30 days'])}} />
      </div>`,
    }),
  },
  {
    id: 'topbar.trust-mini', category: 'topbar',
    label: 'Compacte icoonrij met vertrouwenspunten',
    styles: ['minimal', 'bold'], anims: ['none', 'subtle'],
    tags: ['trust', 'universal', 'pets', 'home', 'kitchen'],
    props: { items: 'lijst korte punten' },
    render: (ctx, p): RenderResult => {
      const th = theme(ctx, p)
      return {
        jsx: `<div style={{ ${BAR("background:'var(--c-bg)', color:'var(--c-muted)', borderBottom:'var(--bw) solid var(--c-border)', display:'flex', gap:'clamp(.9rem,3vw,2.2rem)', justifyContent:'center', flexWrap:'wrap'")} }}>
          {${arr(p.items, ['Secure payment', 'Tracked delivery', 'Real support'])}.map((t:string,i:number)=>(
            <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:'.4rem', fontSize:'.72rem' }}>
              <span style={{ color:'var(--c-accent)', display:'inline-flex' }}>{[${[icon(th, 'secure', { size: 14 }), icon(th, 'shipping', { size: 14 }), icon(th, 'support', { size: 14 })].join(',')}][i % 3]}</span>{t}
            </span>
          ))}
        </div>`,
      }
    },
  },
  {
    id: 'topbar.seasonal-accent', category: 'topbar',
    label: 'Accentkleur met thema-icoon — seizoen/actie',
    styles: ['playful', 'bold', 'editorial'], anims: ['subtle'],
    tags: ['kids', 'beauty', 'fashion', 'pets', 'seasonal'],
    props: { message: '', cta: 'optionele linktekst' },
    render: (ctx, p): RenderResult => {
      const th = theme(ctx, p)
      return {
        jsx: `<div style={{ ${BAR("background:'var(--c-accent)', color:'var(--c-primary-text)', display:'flex', justifyContent:'center', alignItems:'center', gap:'.6rem', flexWrap:'wrap', fontWeight:600")} }}>
          <span style={{ display:'inline-flex' }}>${icon(th, 'quality', { size: 15, animated: ctx.anim !== 'none' })}</span>
          <span>${txt(p.message, 'New arrivals just landed')}</span>
          <a href="#products" style={{ textDecoration:'underline', textUnderlineOffset:'3px' }}>${txt(p.cta, 'See the collection')}</a>
        </div>`,
      }
    },
  },
  {
    id: 'topbar.bold-statement', category: 'topbar',
    label: 'Grote vette uitspraak over de volle breedte',
    styles: ['bold', 'playful'], anims: ['subtle', 'expressive'],
    tags: ['sport', 'outdoor', 'tech', 'urban', 'statement'],
    props: { message: '' },
    canBeSignature: true,
    render: (ctx, p): RenderResult => ({
      jsx: `<div style={{ background:'var(--c-text)', color:'var(--c-bg)', textAlign:'center', padding:'.7rem 1rem' }}>
        <span${am(ctx.anim, 'chars')} style={{ fontFamily:'var(--f-head)', fontWeight:800, fontSize:'clamp(.8rem,2.2vw,1.05rem)', letterSpacing:'.08em', textTransform:'uppercase', display:'inline-block' }}>${txt(p.message, 'Made for people who actually use it')}</span>
      </div>`,
    }),
  },
]

export default defs
