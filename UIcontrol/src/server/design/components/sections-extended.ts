// ═══════ Tweede batch secties — testimonials · cta · content · badges · gallery · forms ═══════
// Los van sections.ts gehouden zodat de eerste, bewezen batch onaangeroerd
// blijft. De registry voegt beide samen; voor de LLM is er één catalogus.
//
// Doel van deze batch: genoeg keuze per categorie dat twee stores met dezelfde
// toon toch structureel verschillende pagina's opleveren. Alles op CSS-variabelen
// uit het design-DNA, met data-am-markering voor de Anime.js-laag.

import type { ComponentDef, RenderCtx, ComponentProps, RenderResult } from './types.js'
import { txt, arr, reveal, am, j } from './types.js'
import { icon, accentIcon, type IconTheme } from './icons.js'

const sect = (inner: string, bg = 'var(--c-bg)') =>
  `<section className="sect" style={{ background:${JSON.stringify(bg)} }}><div className="wrap">${inner}</div></section>`

const title = (ctx: RenderCtx, t: unknown, fb: string, align: 'center' | 'left' = 'center') =>
  reveal(ctx.anim, 'up', `<h2 style={{ fontSize:'clamp(1.6rem,3vw,2.2rem)', textAlign:${j(align)}, margin:'0 0 2.5rem', textTransform:'var(--tt-head)' }}>${txt(t, fb)}</h2>`)

const th = (p: ComponentProps): IconTheme => (typeof p.iconTheme === 'string' ? p.iconTheme : 'universal') as IconTheme

const defs: ComponentDef[] = [
  // ══ TESTIMONIALS ═══════════════════════════════════════════════════════════
  {
    id: 'testimonials.avatar-row', category: 'testimonials', label: 'Rij met initiaal-avatars en korte quotes',
    styles: ['minimal', 'playful', 'bold'], anims: ['subtle', 'expressive'],
    tags: ['trust', 'kids', 'pets', 'friendly'], props: { title: '', items: '[{name,stars,text}]' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'People who bought this')}
        <div${am(ctx.anim, 'grid')} className="grid3" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:'1.4rem' }}>
          {${arr(p.items, [{ name: 'Nora K.', stars: 5, text: 'Arrived in three days and works exactly as shown.' }, { name: 'Bram V.', stars: 5, text: 'Second order already. Good stuff.' }, { name: 'Alice M.', stars: 4, text: 'Solid quality, packaging could be smaller.' }])}.map((r:any,i:number)=>(
            <div key={i} style={{ display:'flex', gap:'.9rem', alignItems:'flex-start' }}>
              <span aria-hidden="true" style={{ flex:'0 0 42px', width:42, height:42, borderRadius:'50%', background:'var(--c-accent)', color:'var(--c-primary-text)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'.9rem' }}>{String(r.name||'?').charAt(0)}</span>
              <div>
                <div style={{ color:'var(--c-accent)', fontSize:'.78rem', letterSpacing:'1px', marginBottom:'.25rem' }}>{Array.from({length:r.stars||5}).map((_,k)=><span key={k}>&#9733;</span>)}</div>
                <p style={{ margin:'0 0 .35rem', lineHeight:1.65, fontSize:'.92rem' }}>{r.text}</p>
                <span style={{ fontSize:'.78rem', color:'var(--c-muted)', fontWeight:600 }}>{r.name}</span>
              </div>
            </div>
          ))}
        </div>`),
    }),
  },
  {
    id: 'testimonials.split-feature', category: 'testimonials', label: 'Eén review groot naast een beeld',
    styles: ['editorial', 'bold'], anims: ['subtle', 'expressive'],
    tags: ['premium', 'fashion', 'story', 'considered'], props: { quote: '', author: '', role: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section className="split" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', alignItems:'stretch', background:'var(--c-surface-alt)' }}>
        <div style={{ minHeight:'46vh', overflow:'hidden', background:'var(--c-border)' }}>
          {PRODUCTS[1] && PRODUCTS[1].image ? <img src={PRODUCTS[1].image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
        </div>
        <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', padding:'clamp(2.5rem,6vw,5rem)' }}>
          <span style={{ color:'var(--c-accent)', fontSize:'2.6rem', lineHeight:1, marginBottom:'.6rem' }}>&#8220;</span>
          <p${am(ctx.anim, 'words')} style={{ fontFamily:'var(--f-head)', fontSize:'clamp(1.25rem,2.4vw,1.75rem)', lineHeight:1.45, margin:'0 0 1.4rem' }}>${txt(p.quote, 'I kept looking for a reason to send it back. There wasn\'t one.')}</p>
          <span style={{ fontWeight:700 }}>${txt(p.author, 'Marte D.')}</span>
          <span style={{ color:'var(--c-muted)', fontSize:'.85rem' }}>${txt(p.role, 'Verified buyer')}</span>
        </div>
      </section>`,
    }),
  },
  {
    id: 'testimonials.before-after', category: 'testimonials', label: 'Voor/na-vergelijking met ervaring',
    styles: ['bold', 'minimal'], anims: ['subtle'],
    tags: ['beauty', 'wellness', 'home', 'transformation'], props: { title: '', before: '', after: '', quote: '', author: '' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'The difference people notice')}
        <div className="grid2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem', marginBottom:'2rem' }}>
          {[['Before', ${j(String(p.before ?? 'Cluttered, awkward, never quite right.'))}], ['After', ${j(String(p.after ?? 'One thing that does the job properly.'))}]].map(([label,body],i)=>(
            <div key={label} style={{ padding:'1.8rem', borderRadius:'var(--r-lg)', border:'var(--bw) solid var(--c-border)', background: i===0?'var(--c-surface-alt)':'var(--c-surface)' }}>
              <span style={{ display:'inline-block', fontSize:'.68rem', letterSpacing:'.18em', textTransform:'uppercase', fontWeight:800, color: i===0?'var(--c-muted)':'var(--c-accent)', marginBottom:'.7rem' }}>{label}</span>
              <p style={{ margin:0, lineHeight:1.7 }}>{body}</p>
            </div>
          ))}
        </div>
        <blockquote style={{ margin:0, textAlign:'center', maxWidth:'46ch', marginInline:'auto' }}>
          <p style={{ fontStyle:'italic', lineHeight:1.7, margin:'0 0 .5rem' }}>&#8220;${txt(p.quote, 'Wish I had swapped sooner.')}&#8221;</p>
          <cite style={{ fontSize:'.82rem', color:'var(--c-muted)', fontStyle:'normal', fontWeight:600 }}>${txt(p.author, 'Ines P.')}</cite>
        </blockquote>`, 'var(--c-bg)'),
    }),
  },
  {
    id: 'testimonials.stat-proof', category: 'testimonials', label: 'Sociale bewijs-cijfers met tellend getal',
    styles: ['bold', 'minimal'], anims: ['subtle', 'expressive'],
    tags: ['trust', 'tech', 'conversion', 'numbers'], props: { title: '', items: '[{value,suffix,label}]' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'Why people stay')}
        <div className="grid3" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'1.5rem', textAlign:'center' }}>
          {${arr(p.items, [{ value: 2400, suffix: '+', label: 'orders shipped' }, { value: 96, suffix: '%', label: 'would order again' }, { value: 4, suffix: '.8', label: 'average rating' }])}.map((s:any,i:number)=>(
            <div key={i}>
              <div style={{ fontFamily:'var(--f-head)', fontSize:'clamp(2rem,5vw,3.2rem)', fontWeight:800, color:'var(--c-accent)', lineHeight:1 }}>
                <span${am(ctx.anim, 'count')} data-am-to={String(s.value)} data-am-suffix={String(s.suffix||'')}>{String(s.value)+String(s.suffix||'')}</span>
              </div>
              <span style={{ display:'block', marginTop:'.5rem', color:'var(--c-muted)', fontSize:'.86rem' }}>{s.label}</span>
            </div>
          ))}
        </div>`, 'var(--c-surface-alt)'),
    }),
  },
  {
    id: 'testimonials.timeline-list', category: 'testimonials', label: 'Reviews als tijdlijn onder elkaar',
    styles: ['minimal', 'editorial'], anims: ['subtle'],
    tags: ['trust', 'considered', 'premium', 'detailed'], props: { title: '', items: '[{name,stars,text,date}]' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'Recent reviews', 'left')}
        <div style={{ display:'grid', gap:'0', maxWidth:'720px' }}>
          {${arr(p.items, [{ name: 'Tom H.', stars: 5, date: 'Last week', text: 'Ordered Tuesday, on my doorstep Thursday. No complaints.' }, { name: 'Lena S.', stars: 5, date: 'Two weeks ago', text: 'Bought one, then a second as a gift. That says enough.' }, { name: 'Ravi N.', stars: 4, date: 'Last month', text: 'Does what it promises. Instructions could be clearer.' }])}.map((r:any,i:number)=>(
            <Reveal key={i} v="left" delay={i*90}>
              <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'1.2rem', paddingBottom:'1.8rem' }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <span style={{ width:10, height:10, borderRadius:'50%', background:'var(--c-accent)', flex:'0 0 10px' }} />
                  <span style={{ flex:1, width:'var(--bw)', background:'var(--c-border)', minHeight:'2rem' }} />
                </div>
                <div>
                  <div style={{ display:'flex', gap:'.7rem', alignItems:'baseline', flexWrap:'wrap', marginBottom:'.35rem' }}>
                    <b style={{ fontSize:'.9rem' }}>{r.name}</b>
                    <span style={{ color:'var(--c-accent)', fontSize:'.75rem', letterSpacing:'1px' }}>{Array.from({length:r.stars||5}).map((_,k)=><span key={k}>&#9733;</span>)}</span>
                    <span style={{ color:'var(--c-muted)', fontSize:'.75rem' }}>{r.date}</span>
                  </div>
                  <p style={{ margin:0, lineHeight:1.7, color:'var(--c-muted)' }}>{r.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>`),
    }),
  },

  // ══ CTA ════════════════════════════════════════════════════════════════════
  {
    id: 'cta.split-image', category: 'cta', label: 'Halve breedte beeld met call-to-action ernaast',
    styles: ['bold', 'editorial', 'minimal'], anims: ['subtle', 'expressive'],
    tags: ['universal', 'conversion', 'fashion', 'premium'], props: { title: '', body: '', cta: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section className="split" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', alignItems:'stretch', background:'var(--c-secondary)', color:'#fff' }}>
        <div style={{ minHeight:'42vh', overflow:'hidden' }}>
          <HeroImg />
        </div>
        <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', padding:'clamp(2.5rem,6vw,5rem)' }}>
          <h2${am(ctx.anim, 'lift')} style={{ fontSize:'clamp(1.7rem,3.4vw,2.6rem)', margin:'0 0 1rem', lineHeight:1.15 }}>${txt(p.title, 'Ready when you are')}</h2>
          <p style={{ opacity:.82, lineHeight:1.75, margin:'0 0 2rem', maxWidth:'42ch' }}>${txt(p.body, 'Free shipping across the EU and 30 days to change your mind.')}</p>
          <a href="#products" className="btnp btn" style={{ alignSelf:'flex-start', background:'var(--c-accent)' }}>${txt(p.cta, 'Shop the collection')}</a>
        </div>
      </section>`,
    }),
  },
  {
    id: 'cta.gradient-banner', category: 'cta', label: 'Brede band met kleurverloop en één knop',
    styles: ['bold', 'playful'], anims: ['subtle', 'expressive'],
    tags: ['conversion', 'tech', 'kids', 'beauty', 'colourful'], props: { title: '', body: '', cta: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section className="cg-band" style={{ padding:'clamp(3rem,7vw,5.5rem) clamp(1.5rem,5vw,4rem)', textAlign:'center', color:'var(--c-primary-text)', position:'relative', overflow:'hidden' }}>
        <div className="wrap" style={{ position:'relative' }}>
          <h2${am(ctx.anim, 'words')} style={{ fontSize:'clamp(1.7rem,4vw,2.8rem)', margin:'0 0 .9rem', textTransform:'var(--tt-head)' }}>${txt(p.title, 'Everything ships from Europe')}</h2>
          <p style={{ opacity:.9, margin:'0 auto 2rem', maxWidth:'52ch', lineHeight:1.7 }}>${txt(p.body, 'No customs surprises, no six-week wait. Just your order, quickly.')}</p>
          <a href="#products" className="btnp btn" style={{ background:'var(--c-bg)', color:'var(--c-text)' }}>${txt(p.cta, 'Browse products')}</a>
        </div>
      </section>`,
      css: '.cg-band{background:linear-gradient(115deg, var(--c-primary) 0%, var(--c-accent) 55%, var(--c-secondary) 100%)}',
    }),
  },
  {
    id: 'cta.guarantee-panel', category: 'cta', label: 'Geruststellend paneel met garantiepunten',
    styles: ['minimal', 'editorial'], anims: ['subtle'],
    tags: ['trust', 'considered', 'home', 'wellness', 'premium'], props: { title: '', points: '[string]', cta: '' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`<div style={{ maxWidth:'720px', margin:'0 auto', textAlign:'center' }}>
        <h2${am(ctx.anim, 'lift')} style={{ fontSize:'clamp(1.5rem,3vw,2.1rem)', margin:'0 0 1.4rem', textTransform:'var(--tt-head)' }}>${txt(p.title, 'Nothing to lose by trying')}</h2>
        <div style={{ display:'grid', gap:'.85rem', textAlign:'left', marginBottom:'2rem' }}>
          {${arr(p.points, ['Free returns within 30 days, no reason needed', 'Tracked shipping from EU warehouses', 'Payment handled by Stripe — we never see your card'])}.map((t:string,i:number)=>(
            <span key={i} style={{ display:'flex', gap:'.7rem', alignItems:'flex-start', lineHeight:1.65 }}>
              <span style={{ color:'var(--c-accent)', fontWeight:800 }}>&#10003;</span>{t}
            </span>
          ))}
        </div>
        <a href="#products" className="btnp btn">${txt(p.cta, 'See what we sell')}</a>
      </div>`, 'var(--c-surface-alt)'),
    }),
  },
  {
    id: 'cta.dual-path', category: 'cta', label: 'Twee routes naast elkaar (kopen of eerst lezen)',
    styles: ['minimal', 'bold'], anims: ['subtle'],
    tags: ['considered', 'tech', 'home', 'choice'], props: { leftTitle: '', leftBody: '', leftCta: '', rightTitle: '', rightBody: '', rightCta: '' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`<div className="grid2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem' }}>
        <Reveal v="left"><div style={{ padding:'2rem', borderRadius:'var(--r-lg)', background:'var(--c-primary)', color:'var(--c-primary-text)', height:'100%', display:'flex', flexDirection:'column' }}>
          <h3 style={{ fontSize:'1.35rem', margin:'0 0 .6rem' }}>${txt(p.leftTitle, 'Know what you want?')}</h3>
          <p style={{ opacity:.85, lineHeight:1.7, margin:'0 0 1.6rem' }}>${txt(p.leftBody, 'Go straight to the collection and order in two minutes.')}</p>
          <a href="#products" className="btnp btn" style={{ marginTop:'auto', alignSelf:'flex-start', background:'var(--c-bg)', color:'var(--c-text)' }}>${txt(p.leftCta, 'Shop now')}</a>
        </div></Reveal>
        <Reveal v="right"><div style={{ padding:'2rem', borderRadius:'var(--r-lg)', border:'var(--bw) solid var(--c-border)', background:'var(--c-surface)', height:'100%', display:'flex', flexDirection:'column' }}>
          <h3 style={{ fontSize:'1.35rem', margin:'0 0 .6rem' }}>${txt(p.rightTitle, 'Still deciding?')}</h3>
          <p style={{ color:'var(--c-muted)', lineHeight:1.7, margin:'0 0 1.6rem' }}>${txt(p.rightBody, 'Read how we pick what we sell and where it ships from.')}</p>
          <a href="/about/" className="btnp btn2" style={{ marginTop:'auto', alignSelf:'flex-start' }}>${txt(p.rightCta, 'Read our story')}</a>
        </div></Reveal>
      </div>`),
    }),
  },
  {
    id: 'cta.inline-strip', category: 'cta', label: 'Smalle inline strip tussen twee secties',
    styles: ['minimal', 'bold', 'playful'], anims: ['none', 'subtle'],
    tags: ['compact', 'universal', 'conversion'], props: { message: '', cta: '' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<section style={{ background:'var(--c-accent)', color:'var(--c-primary-text)', padding:'1.1rem clamp(1.5rem,5vw,4rem)' }}>
        <div className="wrap" style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:'1.2rem', flexWrap:'wrap' }}>
          <span style={{ fontWeight:600 }}>${txt(p.message, 'Orders placed before 16:00 CET ship the same day')}</span>
          <a href="#products" className="btnp" style={{ textDecoration:'underline', textUnderlineOffset:'4px', fontWeight:700 }}>${txt(p.cta, 'Order now')}</a>
        </div>
      </section>`,
    }),
  },

  // ══ CONTENT ════════════════════════════════════════════════════════════════
  {
    id: 'content.timeline-story', category: 'content', label: 'Merkverhaal als tijdlijn met mijlpalen',
    styles: ['editorial', 'minimal'], anims: ['subtle', 'expressive'],
    tags: ['story', 'premium', 'considered', 'brand'], props: { title: '', items: '[{label,title,body}]' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'How we got here')}
        <div style={{ display:'grid', gap:'0', maxWidth:'760px', margin:'0 auto' }}>
          {${arr(p.items, [{ label: 'The problem', title: 'Everything took six weeks', body: 'Ordering online meant waiting, and hoping.' }, { label: 'The change', title: 'We moved to EU warehouses', body: 'Stock sits closer, so orders arrive in days.' }, { label: 'Now', title: 'A tighter selection', body: 'Fewer products, each one actually checked.' }])}.map((s:any,i:number)=>(
            <Reveal key={i} v="left" delay={i*110}>
              <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'1.4rem', paddingBottom:'2.2rem' }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <span style={{ width:34, height:34, borderRadius:'50%', border:'2px solid var(--c-accent)', color:'var(--c-accent)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'.8rem', flex:'0 0 34px' }}>{i+1}</span>
                  <span style={{ flex:1, width:'2px', background:'var(--c-border)', minHeight:'1.5rem' }} />
                </div>
                <div>
                  <span className="eyebrow" style={{ marginBottom:'.35rem' }}>{s.label}</span>
                  <h3 style={{ fontSize:'1.2rem', margin:'0 0 .5rem' }}>{s.title}</h3>
                  <p style={{ color:'var(--c-muted)', lineHeight:1.75, margin:0 }}>{s.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>`),
    }),
  },
  {
    id: 'content.feature-alternating', category: 'content', label: 'Afwisselende beeld/tekst-blokken (zigzag)',
    styles: ['minimal', 'editorial', 'bold'], anims: ['subtle', 'expressive'],
    tags: ['universal', 'tech', 'home', 'explain'], props: { items: '[{title,body}] — max 3' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section className="sect" style={{ background:'var(--c-bg)' }}><div className="wrap" style={{ display:'grid', gap:'clamp(2.5rem,6vw,4.5rem)' }}>
        {${arr(p.items, [{ title: 'Sourced, not scraped', body: 'Every product is ordered and checked before it goes on the site.' }, { title: 'Shipped from Europe', body: 'Stock sits in EU warehouses, so delivery takes days rather than weeks.' }])}.map((f:any,i:number)=>(
          <div key={i} className="fa-row" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'clamp(1.5rem,4vw,3.5rem)', alignItems:'center' }}>
            <div style={{ order: i%2===0?0:1, aspectRatio:'4/3', overflow:'hidden', borderRadius:'var(--r-lg)', background:'var(--c-surface-alt)' }}>
              {PRODUCTS[i] && PRODUCTS[i].image ? <img src={PRODUCTS[i].image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
            </div>
            <div${ctx.anim === 'none' ? '' : ' data-am={i%2===0?"slide":"lift"}'}>
              <span className="eyebrow" style={{ marginBottom:'.6rem' }}>{'0'+(i+1)}</span>
              <h3 style={{ fontSize:'clamp(1.3rem,2.6vw,1.9rem)', margin:'0 0 .8rem' }}>{f.title}</h3>
              <p style={{ color:'var(--c-muted)', lineHeight:1.8, margin:0, maxWidth:'46ch' }}>{f.body}</p>
            </div>
          </div>
        ))}
      </div></section>`,
      css: '@media(max-width:820px){.fa-row{grid-template-columns:1fr !important}.fa-row>div:first-child{order:0 !important}}',
    }),
  },
  {
    id: 'content.big-statement', category: 'content', label: 'Eén grote uitspraak over de volle breedte',
    styles: ['editorial', 'bold'], anims: ['subtle', 'expressive'],
    tags: ['brand', 'premium', 'fashion', 'statement'], props: { statement: '', attribution: '' },
    canBeSignature: true,
    render: (ctx, p): RenderResult => ({
      jsx: `<section style={{ padding:'clamp(4rem,10vw,8rem) clamp(1.5rem,5vw,4rem)', background:'var(--c-surface-alt)' }}>
        <div className="wrap" style={{ maxWidth:'900px' }}>
          <p${am(ctx.anim, 'words')} style={{ fontFamily:'var(--f-head)', fontWeight:'var(--fw-head)', fontSize:'clamp(1.6rem,4.5vw,3.2rem)', lineHeight:1.25, margin:'0 0 1.2rem', textTransform:'var(--tt-head)' }}>${txt(p.statement, 'We would rather sell you one thing that lasts than five that do not.')}</p>
          <span style={{ color:'var(--c-muted)', fontSize:'.85rem', letterSpacing:'.12em', textTransform:'uppercase' }}>${txt(p.attribution, 'Our founding idea')}</span>
        </div>
      </section>`,
    }),
  },
  {
    id: 'content.spec-table', category: 'content', label: 'Specificatietabel (technisch, twee kolommen)',
    styles: ['minimal', 'bold'], anims: ['subtle'],
    tags: ['tech', 'gadget', 'kitchen', 'detailed', 'considered'], props: { title: '', rows: '[{label,value}]' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'The details')}
        <div style={{ maxWidth:'640px', margin:'0 auto', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-lg)', overflow:'hidden', background:'var(--c-surface)' }}>
          {${arr(p.rows, [{ label: 'Ships from', value: 'EU warehouse' }, { label: 'Delivery', value: '3-8 working days' }, { label: 'Returns', value: '30 days, free' }, { label: 'Payment', value: 'Stripe (card, iDEAL)' }])}.map((r:any,i:number)=>(
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', padding:'.9rem 1.2rem', borderTop: i===0?'none':'var(--bw) solid var(--c-border)' }}>
              <span style={{ color:'var(--c-muted)', fontSize:'.88rem' }}>{r.label}</span>
              <span style={{ fontWeight:600, fontSize:'.88rem' }}>{r.value}</span>
            </div>
          ))}
        </div>`),
    }),
  },
  {
    id: 'content.values-grid', category: 'content', label: 'Kernwaarden met thema-iconen',
    styles: ['minimal', 'playful', 'editorial'], anims: ['subtle', 'expressive'],
    tags: ['brand', 'wellness', 'organic', 'trust'], props: { title: '', items: '[{title,desc}]' },
    render: (ctx, p): RenderResult => {
      const t = th(p)
      const icons = ['quality', 'shipping', 'support'] as const
      return {
        jsx: sect(`${title(ctx, p.title, 'What we hold to')}
          <div${am(ctx.anim, 'grid')} className="grid3" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'2rem', textAlign:'center' }}>
            {${arr(p.items, [{ title: 'Chosen carefully', desc: 'We order and test before anything is listed.' }, { title: 'Sent quickly', desc: 'From European stock, tracked all the way.' }, { title: 'Answered honestly', desc: 'A real reply within one working day.' }])}.map((v:any,i:number)=>(
              <div key={i}>
                <span style={{ display:'inline-flex', color:'var(--c-accent)', marginBottom:'1rem' }}>{[${icons.map(r => icon(t, r, { size: 34, strokeWidth: 1.3, animated: ctx.anim === 'expressive' })).join(',')}][i % 3]}</span>
                <h3 style={{ fontSize:'1.05rem', margin:'0 0 .5rem' }}>{v.title}</h3>
                <p style={{ color:'var(--c-muted)', lineHeight:1.7, margin:0, fontSize:'.9rem' }}>{v.desc}</p>
              </div>
            ))}
          </div>`),
      }
    },
  },
  {
    id: 'content.tabs-info', category: 'content', label: 'Tabs met verzend-, retour- en garantie-info',
    styles: ['minimal', 'bold'], anims: ['subtle'],
    tags: ['trust', 'practical', 'home', 'universal'], props: { title: '', tabs: '[{label,body}]' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'Good to know')}
        <div style={{ maxWidth:'680px', margin:'0 auto' }}>
          <InfoTabs items={${arr(p.tabs, [
            { label: 'Shipping', body: 'Orders leave our EU warehouse within one working day. Delivery takes 3-8 working days and you get a tracking link by email.' },
            { label: 'Returns', body: 'Changed your mind? Send it back within 30 days in its original packaging and we refund the full amount.' },
            { label: 'Payment', body: 'Payments run through Stripe. We never see or store your card details.' },
          ])}} />
        </div>`, 'var(--c-surface-alt)'),
    }),
  },

  // ══ BADGES ═════════════════════════════════════════════════════════════════
  {
    id: 'badges.payment-icons', category: 'badges', label: 'Rij met betaalmethode-badges',
    styles: ['minimal', 'bold'], anims: ['none'],
    tags: ['trust', 'conversion', 'universal', 'checkout'], props: { note: '' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<section style={{ padding:'1.6rem clamp(1.5rem,5vw,4rem)', background:'var(--c-bg)', borderTop:'var(--bw) solid var(--c-border)' }}>
        <div className="wrap" style={{ display:'flex', gap:'1rem', justifyContent:'center', alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ color:'var(--c-muted)', fontSize:'.8rem' }}>${txt(p.note, 'Secure payment via')}</span>
          {['VISA','Mastercard','AMEX','iDEAL','Bancontact'].map(m=>(
            <span key={m} style={{ fontSize:'.68rem', fontWeight:700, letterSpacing:'.05em', color:'var(--c-text)', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-sm)', padding:'.3rem .6rem', background:'var(--c-surface)' }}>{m}</span>
          ))}
        </div>
      </section>`,
    }),
  },
  {
    id: 'badges.icon-grid', category: 'badges', label: 'Icoon-raster met zes vertrouwenspunten',
    styles: ['minimal', 'bold', 'playful'], anims: ['subtle', 'expressive'],
    tags: ['trust', 'universal', 'home', 'pets'], props: { items: '[{title,desc}] — max 6' },
    render: (ctx, p): RenderResult => {
      const t = th(p)
      const roles = ['shipping', 'returns', 'secure', 'quality', 'support', 'guarantee'] as const
      return {
        jsx: sect(`<div${am(ctx.anim, 'grid')} className="grid3" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:'1.75rem' }}>
          {${arr(p.items, roles.map(r => ({ title: r, desc: '' })).slice(0, 6))}.map((b:any,i:number)=>(
            <div key={i} style={{ display:'flex', gap:'.8rem', alignItems:'flex-start' }}>
              <span style={{ color:'var(--c-accent)', display:'inline-flex', flex:'0 0 auto' }}>{[${roles.map(r => icon(t, r, { size: 22 })).join(',')}][i % 6]}</span>
              <div>
                <b style={{ display:'block', fontSize:'.9rem', marginBottom:'.2rem' }}>{b.title}</b>
                {b.desc ? <span style={{ color:'var(--c-muted)', fontSize:'.82rem', lineHeight:1.6 }}>{b.desc}</span> : null}
              </div>
            </div>
          ))}
        </div>`, 'var(--c-surface)'),
      }
    },
  },
  {
    id: 'badges.shipping-map', category: 'badges', label: 'Verzendbelofte met levertijd per regio',
    styles: ['minimal', 'editorial'], anims: ['subtle'],
    tags: ['shipping', 'trust', 'eu', 'practical'], props: { title: '', regions: '[{name,days}]' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'Where we ship')}
        <div className="grid4" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'1.25rem' }}>
          {${arr(p.regions, [{ name: 'Netherlands', days: '2-4 days' }, { name: 'Belgium', days: '2-5 days' }, { name: 'Germany', days: '3-6 days' }, { name: 'Rest of EU', days: '4-8 days' }])}.map((r:any,i:number)=>(
            <div key={i} style={{ padding:'1.1rem', borderRadius:'var(--r-md)', border:'var(--bw) solid var(--c-border)', background:'var(--c-surface)', textAlign:'center' }}>
              <b style={{ display:'block', fontSize:'.88rem', marginBottom:'.3rem' }}>{r.name}</b>
              <span style={{ color:'var(--c-accent)', fontSize:'.82rem', fontWeight:700 }}>{r.days}</span>
            </div>
          ))}
        </div>`),
    }),
  },
  {
    id: 'badges.ribbon-highlight', category: 'badges', label: 'Schuine lintband met één belofte',
    styles: ['playful', 'bold'], anims: ['subtle'],
    tags: ['kids', 'sport', 'promo', 'playful'], props: { message: '' },
    canBeSignature: true,
    render: (_ctx, p): RenderResult => ({
      jsx: `<section style={{ padding:'clamp(2rem,4vw,3rem) 0', background:'var(--c-bg)', overflow:'hidden' }}>
        <div className="rb-band" style={{ background:'var(--c-accent)', color:'var(--c-primary-text)', padding:'.9rem 0', textAlign:'center', fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', fontSize:'.85rem' }}>
          ${txt(p.message, 'Free EU shipping on every order this month')}
        </div>
      </section>`,
      css: '.rb-band{transform:rotate(-1.6deg);width:104%;margin-left:-2%}',
    }),
  },
  {
    id: 'badges.press-logos', category: 'badges', label: 'Tekstuele "as seen in"-strip',
    styles: ['minimal', 'editorial'], anims: ['none', 'subtle'],
    tags: ['trust', 'premium', 'beauty', 'authority'], props: { note: '', names: '[string]' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<section style={{ padding:'clamp(1.6rem,3vw,2.4rem) clamp(1.5rem,5vw,4rem)', background:'var(--c-surface-alt)' }}>
        <div className="wrap" style={{ textAlign:'center' }}>
          <span style={{ display:'block', color:'var(--c-muted)', fontSize:'.7rem', letterSpacing:'.2em', textTransform:'uppercase', marginBottom:'1rem' }}>${txt(p.note, 'Recommended by')}</span>
          <div style={{ display:'flex', gap:'clamp(1.2rem,4vw,3rem)', justifyContent:'center', flexWrap:'wrap' }}>
            {${arr(p.names, ['Everyday Review', 'The Practical List', 'Home & Co', 'Weekly Pick'])}.map((n:string,i:number)=>(
              <span key={i} style={{ fontFamily:'var(--f-head)', fontSize:'.95rem', opacity:.55, letterSpacing:'.04em' }}>{n}</span>
            ))}
          </div>
        </div>
      </section>`,
    }),
  },

  // ══ GALLERY ════════════════════════════════════════════════════════════════
  {
    id: 'gallery.masonry-lookbook', category: 'gallery', label: 'Masonry-lookbook met ongelijke hoogtes',
    styles: ['editorial', 'playful', 'minimal'], anims: ['subtle', 'expressive'],
    tags: ['fashion', 'beauty', 'lifestyle', 'visual'], props: { title: '' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'In use')}
        <div${am(ctx.anim, 'grid')} className="gm-cols" style={{ columnCount:3, columnGap:'1rem' }}>
          {PRODUCTS.slice(0,9).map((pr:any,i:number)=>(
            <div key={pr.id} style={{ breakInside:'avoid', marginBottom:'1rem', borderRadius:'var(--r-md)', overflow:'hidden', background:'var(--c-surface-alt)', aspectRatio: i%4===0?'3/4':(i%4===1?'1':(i%4===2?'4/5':'16/11')) }}>
              {pr.image ? <img className="cimg" src={pr.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
            </div>
          ))}
        </div>`),
      css: '@media(max-width:900px){.gm-cols{column-count:2}}',
    }),
  },
  {
    id: 'gallery.mosaic-feature', category: 'gallery', label: 'Mozaïek met één groot en vier kleine beelden',
    styles: ['bold', 'editorial'], anims: ['subtle', 'expressive'],
    tags: ['lifestyle', 'outdoor', 'home', 'visual'], props: { title: '' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'A closer look')}
        <div${am(ctx.anim, 'grid')} className="gmo" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gridAutoRows:'minmax(140px,auto)', gap:'.85rem' }}>
          {PRODUCTS.slice(0,5).map((pr:any,i:number)=>(
            <div key={pr.id} style={{ gridColumn: i===0?'span 2':'span 1', gridRow: i===0?'span 2':'span 1', overflow:'hidden', borderRadius:'var(--r-md)', background:'var(--c-surface-alt)' }}>
              {pr.image ? <img className="cimg" src={pr.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
            </div>
          ))}
        </div>`),
      css: '@media(max-width:720px){.gmo{grid-template-columns:repeat(2,1fr)}}',
    }),
  },
  {
    id: 'gallery.scroll-strip', category: 'gallery', label: 'Horizontale beeldstrip om doorheen te scrollen',
    styles: ['minimal', 'playful', 'bold'], anims: ['subtle'],
    tags: ['mobile', 'lifestyle', 'kids', 'pets'], props: { title: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section className="sect" style={{ background:'var(--c-bg)', paddingInline:0 }}>
        <div className="wrap" style={{ paddingInline:'clamp(1.5rem,5vw,4rem)' }}>${title(ctx, p.title, 'From the collection')}</div>
        <div className="hscroll" style={{ display:'flex', gap:'1rem', overflowX:'auto', scrollSnapType:'x mandatory', paddingInline:'clamp(1.5rem,5vw,4rem)', paddingBottom:'1rem' }}>
          {PRODUCTS.map((pr:any,i:number)=>(
            <div key={pr.id} style={{ flex:'0 0 clamp(220px,32vw,320px)', scrollSnapAlign:'start', aspectRatio:'3/4', overflow:'hidden', borderRadius:'var(--r-md)', background:'var(--c-surface-alt)' }}>
              {pr.image ? <img className="cimg" src={pr.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
            </div>
          ))}
        </div>
      </section>`,
    }),
  },
  {
    id: 'gallery.full-bleed-band', category: 'gallery', label: 'Beeldband over de volle breedte met bijschrift',
    styles: ['editorial', 'bold'], anims: ['subtle', 'expressive'],
    tags: ['premium', 'outdoor', 'fashion', 'cinematic'], props: { caption: '' },
    render: (ctx, p): RenderResult => ({
      jsx: `<section style={{ position:'relative', background:'var(--c-surface-alt)' }}>
        <div${am(ctx.anim, 'mask')} style={{ width:'100%', aspectRatio:'21/8', overflow:'hidden' }}>
          {PRODUCTS[2] && PRODUCTS[2].image ? <img src={PRODUCTS[2].image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
        </div>
        <p style={{ margin:0, padding:'1rem clamp(1.5rem,5vw,4rem)', color:'var(--c-muted)', fontSize:'.85rem', textAlign:'center' }}>${txt(p.caption, 'Photographed as delivered — no styling tricks.')}</p>
      </section>`,
    }),
  },
  {
    id: 'gallery.hover-reveal-grid', category: 'gallery', label: 'Raster waarin de titel bij hover verschijnt',
    styles: ['bold', 'minimal'], anims: ['subtle', 'expressive'],
    tags: ['interactive', 'fashion', 'tech', 'visual'], props: { title: '' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'Browse the range')}
        <div${am(ctx.anim, 'grid')} className="grid3" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))', gap:'1rem' }}>
          {PRODUCTS.map((pr:any,i:number)=>(
            <a key={pr.id} href={"/checkout/?product="+encodeURIComponent(pr.id)} className="gh-tile" style={{ position:'relative', display:'block', aspectRatio:'1', overflow:'hidden', borderRadius:'var(--r-md)', background:'var(--c-surface-alt)' }}>
              {pr.image ? <img className="cimg" src={pr.image} alt={pr.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
              <span className="gh-cap" style={{ position:'absolute', inset:'auto 0 0 0', padding:'1rem', background:'linear-gradient(0deg,rgba(0,0,0,.72),transparent)', color:'#fff', fontSize:'.88rem', fontWeight:600 }}>{pr.title}</span>
            </a>
          ))}
        </div>`),
      css: '.gh-cap{opacity:0;transform:translateY(8px);transition:opacity .28s,transform .28s}\n.gh-tile:hover .gh-cap,.gh-tile:focus-visible .gh-cap{opacity:1;transform:translateY(0)}',
    }),
  },
  {
    id: 'gallery.detail-pair', category: 'gallery', label: 'Twee detailbeelden met korte toelichting',
    styles: ['minimal', 'editorial'], anims: ['subtle'],
    tags: ['premium', 'kitchen', 'tech', 'craft'], props: { title: '', leftCaption: '', rightCaption: '' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'In the details')}
        <div className="grid2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem' }}>
          {[${j(String(p.leftCaption ?? 'Finished properly on the parts you touch.'))}, ${j(String(p.rightCaption ?? 'Packed so it arrives the way it left.'))}].map((cap,i)=>(
            <Reveal key={i} v={i===0?'left':'right'}>
              <div>
                <div style={{ aspectRatio:'4/3', overflow:'hidden', borderRadius:'var(--r-lg)', background:'var(--c-surface-alt)', marginBottom:'.9rem' }}>
                  {PRODUCTS[i] && PRODUCTS[i].image ? <img className="cimg" src={PRODUCTS[i].image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
                </div>
                <p style={{ margin:0, color:'var(--c-muted)', fontSize:'.88rem', lineHeight:1.7 }}>{cap}</p>
              </div>
            </Reveal>
          ))}
        </div>`),
    }),
  },

  // ══ FORMS ══════════════════════════════════════════════════════════════════
  {
    id: 'form.product-finder', category: 'form', label: 'Korte keuzehulp (twee vragen, geen backend)',
    styles: ['playful', 'minimal', 'bold'], anims: ['subtle'],
    tags: ['interactive', 'considered', 'home', 'tech', 'guidance'], props: { title: '', intro: '' },
    canBeSignature: true,
    render: (ctx, p): RenderResult => ({
      jsx: sect(`<div style={{ maxWidth:'620px', margin:'0 auto', textAlign:'center' }}>
        <h2${am(ctx.anim, 'lift')} style={{ fontSize:'clamp(1.5rem,3vw,2.1rem)', margin:'0 0 .7rem', textTransform:'var(--tt-head)' }}>${txt(p.title, 'Not sure which one?')}</h2>
        <p style={{ color:'var(--c-muted)', margin:'0 0 2rem', lineHeight:1.7 }}>${txt(p.intro, 'Two quick questions and we will point you at the right product.')}</p>
        <ProductFinder />
      </div>`, 'var(--c-surface-alt)'),
    }),
  },
  {
    id: 'form.waitlist', category: 'form', label: 'Wachtlijst voor uitverkochte artikelen',
    styles: ['minimal', 'bold'], anims: ['subtle'],
    tags: ['retention', 'scarcity', 'fashion', 'tech'], props: { title: '', body: '' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`<div style={{ maxWidth:'560px', margin:'0 auto', textAlign:'center' }}>
        <h2${am(ctx.anim, 'lift')} style={{ fontSize:'clamp(1.4rem,2.8vw,1.9rem)', margin:'0 0 .6rem', textTransform:'var(--tt-head)' }}>${txt(p.title, 'Sold out? Get in line')}</h2>
        <p style={{ color:'var(--c-muted)', margin:'0 0 1.6rem', lineHeight:1.7 }}>${txt(p.body, 'We will email you the moment new stock lands. No other mail, ever.')}</p>
        <SimpleForm submitLabel="Notify me" placeholder="you@email.com" done="You are on the list." />
      </div>`),
    }),
  },
  {
    id: 'form.question-box', category: 'form', label: 'Vraag-stellen-blok met directe verwachting',
    styles: ['minimal', 'editorial'], anims: ['subtle'],
    tags: ['trust', 'service', 'considered', 'home'], props: { title: '', body: '' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`<div className="grid2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'clamp(1.5rem,4vw,3rem)', alignItems:'center' }}>
        <div>
          <h2${am(ctx.anim, 'lift')} style={{ fontSize:'clamp(1.4rem,2.8vw,2rem)', margin:'0 0 .7rem', textTransform:'var(--tt-head)' }}>${txt(p.title, 'Something unclear?')}</h2>
          <p style={{ color:'var(--c-muted)', lineHeight:1.75, margin:0, maxWidth:'40ch' }}>${txt(p.body, 'Ask before you order. We answer within one working day, from a real address.')}</p>
        </div>
        <form onSubmit={(e)=>e.preventDefault()} style={{ display:'grid', gap:'.7rem' }}>
          <label style={{ display:'grid', gap:'.35rem', fontSize:'.82rem', color:'var(--c-muted)' }}>Your email
            <input type="email" required placeholder="you@email.com" style={{ padding:'.75rem .9rem', borderRadius:'var(--r-md)', border:'var(--bw) solid var(--c-border)', background:'var(--c-surface)', color:'var(--c-text)', fontFamily:'inherit' }} />
          </label>
          <label style={{ display:'grid', gap:'.35rem', fontSize:'.82rem', color:'var(--c-muted)' }}>Your question
            <textarea rows={3} required placeholder="Ask away" style={{ padding:'.75rem .9rem', borderRadius:'var(--r-md)', border:'var(--bw) solid var(--c-border)', background:'var(--c-surface)', color:'var(--c-text)', fontFamily:'inherit', resize:'vertical' }} />
          </label>
          <button type="submit" className="btnp btn" style={{ justifySelf:'start' }}>Send question</button>
        </form>
      </div>`, 'var(--c-surface)'),
    }),
  },
  {
    id: 'form.size-guide', category: 'form', label: 'Maat-/keuzegids in een uitklapbaar blok',
    styles: ['minimal', 'editorial'], anims: ['subtle'],
    tags: ['fashion', 'kids', 'pets', 'practical'], props: { title: '', rows: '[{label,value}]' },
    render: (ctx, p): RenderResult => ({
      jsx: sect(`${title(ctx, p.title, 'Which size fits?')}
        <details style={{ maxWidth:'620px', margin:'0 auto', border:'var(--bw) solid var(--c-border)', borderRadius:'var(--r-lg)', background:'var(--c-surface)', overflow:'hidden' }}>
          <summary style={{ padding:'1rem 1.2rem', cursor:'pointer', fontWeight:600, listStyle:'none' }}>Open the size table</summary>
          <div style={{ borderTop:'var(--bw) solid var(--c-border)' }}>
            {${arr(p.rows, [{ label: 'Small', value: 'Up to 38 cm' }, { label: 'Medium', value: '38-46 cm' }, { label: 'Large', value: '46-54 cm' }])}.map((r:any,i:number)=>(
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', padding:'.8rem 1.2rem', borderTop: i===0?'none':'var(--bw) solid var(--c-border)' }}>
                <b style={{ fontSize:'.88rem' }}>{r.label}</b>
                <span style={{ color:'var(--c-muted)', fontSize:'.88rem' }}>{r.value}</span>
              </div>
            ))}
          </div>
        </details>`),
    }),
  },
  {
    id: 'form.newsletter-panel', category: 'form', label: 'Nieuwsbrief in een gekleurd paneel',
    styles: ['bold', 'playful', 'editorial'], anims: ['subtle', 'expressive'],
    tags: ['retention', 'beauty', 'kids', 'conversion'], props: { title: '', body: '' },
    render: (ctx, p): RenderResult => {
      const t = th(p)
      return {
        jsx: `<section className="sect" style={{ background:'var(--c-bg)' }}><div className="wrap">
          <div style={{ background:'var(--c-primary)', color:'var(--c-primary-text)', borderRadius:'var(--r-lg)', padding:'clamp(2rem,5vw,3.5rem)', textAlign:'center' }}>
            <span style={{ display:'inline-flex', marginBottom:'1rem', opacity:.9 }}>${accentIcon(t, { size: 30, animated: ctx.anim === 'expressive' })}</span>
            <h2${am(ctx.anim, 'lift')} style={{ fontSize:'clamp(1.4rem,3vw,2.1rem)', margin:'0 0 .6rem', textTransform:'var(--tt-head)' }}>${txt(p.title, 'One email when something new lands')}</h2>
            <p style={{ opacity:.85, margin:'0 auto 1.6rem', maxWidth:'46ch', lineHeight:1.7 }}>${txt(p.body, 'No daily blasts. Just the occasional note when we add something worth your time.')}</p>
            <SimpleForm submitLabel="Sign me up" placeholder="you@email.com" done="Thanks — you are on the list." onPanel />
          </div>
        </div></section>`,
      }
    },
  },
  {
    id: 'form.feedback-quick', category: 'form', label: 'Snelle duim-omhoog/omlaag feedback',
    styles: ['minimal', 'playful'], anims: ['none', 'subtle'],
    tags: ['compact', 'universal', 'engagement'], props: { question: '' },
    render: (_ctx, p): RenderResult => ({
      jsx: `<section style={{ padding:'clamp(1.6rem,3vw,2.4rem) clamp(1.5rem,5vw,4rem)', background:'var(--c-surface-alt)', textAlign:'center' }}>
        <QuickFeedback question=${j(String(p.question ?? 'Was this page helpful?'))} />
      </section>`,
    }),
  },
]

export default defs
