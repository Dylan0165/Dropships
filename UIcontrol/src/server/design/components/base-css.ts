// ═══════ Gedeelde basis-CSS voor geassembleerde stores ═══════
// Kwaliteitsbodem + het bestaande beweging-met-bedoeling-systeem, nu component-
// onafhankelijk en op CSS-variabelen. Elke component voegt hier alleen zijn eigen
// specifieke regels aan toe (via RenderResult.css) — deze basis staat er altijd.

export function baseCss(): string {
  const ease = 'cubic-bezier(.22,1,.36,1)'
  return [
    '*{box-sizing:border-box}',
    'html{scroll-behavior:smooth}',
    'body{margin:0;background:var(--c-bg);color:var(--c-text);font-family:var(--f-body);font-weight:var(--fw-body);line-height:1.6}',
    'a{color:inherit;text-decoration:none}',
    'img{max-width:100%;display:block}',
    'h1,h2,h3{font-family:var(--f-head);font-weight:var(--fw-head);letter-spacing:var(--ls-head)}',
    // Zichtbare focus-ring (toetsenbordnavigatie) — kwaliteitsbodem
    ':focus-visible{outline:2px solid var(--c-accent);outline-offset:3px;border-radius:2px}',

    // Scroll-reveal varianten (richting per component, niet alles fade-up)
    `.rv{opacity:0;transition:opacity .7s ${ease},transform .7s ${ease}}`,
    '.rv-up{transform:translateY(26px)}',
    '.rv-left{transform:translateX(-28px)}',
    '.rv-right{transform:translateX(28px)}',
    '.rv-scale{transform:scale(.96)}',
    '.rv-fade{transform:none}',
    '.rv.in{opacity:1;transform:none}',

    // Hero-orkestratie (gefaseerde opkomst) — één moment bij laden
    `@keyframes heroIn{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}`,
    `@keyframes heroImg{from{opacity:0;transform:scale(1.045)}to{opacity:1;transform:none}}`,
    `.hi{opacity:0;animation:heroIn .85s ${ease} forwards}`,
    '.hi-1{animation-delay:.05s}.hi-2{animation-delay:.16s}.hi-3{animation-delay:.3s}.hi-4{animation-delay:.44s}',
    `.hi-img{opacity:0;animation:heroImg 1.2s ${ease} .25s forwards}`,

    // Micro-interacties (subtiel, geen bounce)
    `.btnp{transition:transform .25s ${ease},box-shadow .25s,background-color .25s,opacity .2s;cursor:pointer}`,
    '.btnp:hover{transform:translateY(-2px);box-shadow:var(--shadow)}',
    '.btnp:active{transform:scale(.98)}',
    `.card{transition:transform .45s ${ease},box-shadow .45s,border-color .45s}`,
    '.card:hover{transform:translateY(-4px);box-shadow:var(--shadow);border-color:var(--c-accent)}',
    `.cimg{transition:transform .7s ${ease}}`,
    '.card:hover .cimg{transform:scale(1.045)}',
    '.navl{transition:opacity .2s,color .2s}.navl:hover{opacity:.55}',
    '.hscroll{-ms-overflow-style:none;scrollbar-width:none}.hscroll::-webkit-scrollbar{display:none}',

    // Herbruikbare primitives op tokens
    '.btn{display:inline-block;background:var(--c-primary);color:var(--c-primary-text);padding:.9rem 2rem;border-radius:var(--r-btn);font-weight:700;font-size:.85rem;letter-spacing:.03em;border:none}',
    '.btn2{display:inline-block;background:transparent;color:var(--c-text);padding:.9rem 2rem;border-radius:var(--r-btn);font-weight:600;font-size:.85rem;border:var(--bw) solid var(--c-border)}',
    '.eyebrow{color:var(--c-accent);font-size:.72rem;letter-spacing:.26em;text-transform:uppercase;font-weight:700;display:block}',
    '.sect{padding:var(--pad-y,clamp(3.5rem,8vw,7rem)) clamp(1.5rem,5vw,4rem)}',
    '.wrap{max-width:1200px;margin:0 auto}',

    // Responsive bodem
    '@media(max-width:820px){.grid2,.grid3,.grid4,.split{grid-template-columns:1fr !important}}',
    // Toegankelijkheid: reduced-motion schakelt alle beweging uit, content blijft
    '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}html{scroll-behavior:auto}.rv,.hi,.hi-img{opacity:1 !important;transform:none !important}}',
  ].join('\n')
}
