// ═══════ Anime.js-bewegingslaag ═══════
// Componenten markeren elementen declaratief met data-am="<familie>"; deze
// module kiest per store een seeded *bewegingsplan* (welke familie welke
// parameters krijgt) en levert de runtime die dat plan uitvoert met Anime.js v4.
//
// Waarom data-attributen en niet per-component JS: de componenten blijven pure
// JSX-generators, en twee stores die dezelfde componenten kiezen krijgen tóch
// ander gedrag omdat alleen het plan verschilt. Beweging is daarmee een eigen
// variatie-as, naast structuur/stijl/palet.
//
// Veiligheid boven effect:
//  • prefers-reduced-motion → de runtime doet helemaal niets, alles staat direct
//    zichtbaar. Geen "kortere animatie", maar géén animatie.
//  • Elementen zijn zichtbaar in de basis-CSS. Pas wanneer Anime.js aantoonbaar
//    geladen is, wordt de verbergende class gezet (`am-armed`) — mislukt de
//    import, dan is er niets verborgen om te onthullen.
//  • Een harde failsafe-timer haalt `am-armed` er sowieso af. Een trage CDN of
//    een JS-fout mag nooit een lege pagina opleveren.
//  • Alles wat beweegt is aria-neutraal: splitText zet `accessible: true`, dus
//    screenreaders lezen de kop als één zin, niet als losse letters.

import type { VisualTone } from './tokens.js'

/** De bewegingsfamilies die componenten via data-am kunnen aanvragen. */
export const MOTION_FAMILIES = [
  'words',   // kop woord-voor-woord
  'chars',   // kop letter-voor-letter
  'lift',    // blok komt omhoog in beeld
  'grid',    // grid-items met stagger vanuit een hoek/midden
  'draw',    // SVG-pad wordt getekend
  'count',   // getal telt op naar de eindwaarde
  'mask',    // clip-path wipe
  'blur',    // scherpstellen vanuit onscherp
  'scale',   // subtiele schaal-in
  'slide',   // richting-slide
  'float',   // doorlopend zweven (signature-elementen)
] as const
export type MotionFamily = typeof MOTION_FAMILIES[number]

export interface MotionSpec {
  /** Anime.js easing-string. */
  ease: string
  duration: number
  /** Stagger tussen kinderen in ms (0 = geen). */
  stagger: number
  /** Vanaf welke positie het stagger-patroon start. */
  from: 'first' | 'last' | 'center'
  /** Beginwaarden per as; leeg = die as niet animeren. */
  y?: number
  x?: number
  scaleFrom?: number
  blurFrom?: number
  rotateFrom?: number
  /** Scroll-drempel: hoeveel van het element in beeld moet zijn. */
  enter?: string
}

export type MotionPlan = Record<string, MotionSpec>

export interface MotionProfile {
  /** Naam van het gekozen bewegingskarakter — gaat mee in de combinatie-hash. */
  id: string
  label: string
  plan: MotionPlan
}

// ── Bewegingskarakters ────────────────────────────────────────────────────────
// Elk karakter is een samenhangende set: hetzelfde ritme door de hele site.
// Losse random parameters per familie gaven incoherente sites — een trage,
// zware hero met snelle, stuiterende kaarten eronder. Karakters lossen dat op.

const EASE_SOFT = 'out(3)'
const EASE_SNAP = 'outExpo'
const EASE_GLIDE = 'outQuint'
const EASE_SPRING = 'outBack(1.4)'

interface Character {
  id: string
  label: string
  tones: VisualTone[]
  base: { ease: string; duration: number; stagger: number; from: MotionSpec['from'] }
  /** Per familie de afwijkingen op de basis. */
  tweaks: Partial<Record<MotionFamily, Partial<MotionSpec>>>
}

const CHARACTERS: Character[] = [
  {
    id: 'calm-glide',
    label: 'Rustig glijdend — lange, zachte bewegingen',
    tones: ['minimal', 'premium', 'organic'],
    base: { ease: EASE_GLIDE, duration: 900, stagger: 90, from: 'first' },
    tweaks: {
      words: { y: 26, duration: 820, stagger: 70 },
      chars: { y: 18, duration: 620, stagger: 22 },
      mask: { duration: 1100 },
      blur: { blurFrom: 8, duration: 1000 },
      float: { y: 10, duration: 4200 },
      count: { duration: 1600 },
    },
  },
  {
    id: 'crisp-snap',
    label: 'Kort en strak — snelle, besliste opkomst',
    tones: ['tech', 'minimal', 'urban'],
    base: { ease: EASE_SNAP, duration: 620, stagger: 55, from: 'first' },
    tweaks: {
      words: { y: 34, duration: 560, stagger: 45 },
      chars: { y: 24, duration: 420, stagger: 16 },
      grid: { y: 30, stagger: 45, from: 'center' },
      slide: { x: 48 },
      float: { y: 6, duration: 3200 },
      count: { duration: 1100 },
    },
  },
  {
    id: 'warm-swell',
    label: 'Warm aanzwellend — schaal en zachte veer',
    tones: ['organic', 'playful', 'premium'],
    base: { ease: EASE_SOFT, duration: 780, stagger: 80, from: 'first' },
    tweaks: {
      words: { y: 20, scaleFrom: 0.96, duration: 760, stagger: 62 },
      chars: { y: 14, scaleFrom: 0.9, duration: 520, stagger: 20 },
      scale: { scaleFrom: 0.9, ease: EASE_SPRING },
      grid: { scaleFrom: 0.94, stagger: 70 },
      float: { y: 12, duration: 4800 },
      count: { duration: 1500 },
    },
  },
  {
    id: 'bold-sweep',
    label: 'Breed vegend — richting en maskers',
    tones: ['urban', 'tech', 'playful'],
    base: { ease: EASE_SNAP, duration: 760, stagger: 70, from: 'first' },
    tweaks: {
      words: { x: 40, y: 0, duration: 640, stagger: 52 },
      chars: { y: 30, duration: 480, stagger: 18, from: 'center' },
      mask: { duration: 900, ease: EASE_GLIDE },
      slide: { x: 64 },
      grid: { x: 36, y: 0, stagger: 60, from: 'last' },
      float: { y: 8, duration: 3600 },
      count: { duration: 1200 },
    },
  },
  {
    id: 'playful-pop',
    label: 'Speels poppend — veer en verspringend ritme',
    tones: ['playful', 'urban', 'tech'],
    base: { ease: EASE_SPRING, duration: 700, stagger: 75, from: 'center' },
    tweaks: {
      words: { y: 30, scaleFrom: 0.88, duration: 680, stagger: 58 },
      chars: { y: 26, rotateFrom: -8, duration: 520, stagger: 24 },
      scale: { scaleFrom: 0.82 },
      grid: { scaleFrom: 0.9, stagger: 65, from: 'center' },
      float: { y: 14, duration: 3000 },
      count: { duration: 1300 },
    },
  },
  {
    id: 'editorial-fade',
    label: 'Redactioneel — terughoudend, vooral opacity',
    tones: ['premium', 'minimal', 'organic'],
    base: { ease: EASE_GLIDE, duration: 1000, stagger: 110, from: 'first' },
    tweaks: {
      words: { y: 14, duration: 900, stagger: 85 },
      chars: { y: 10, duration: 700, stagger: 28 },
      lift: { y: 18 },
      grid: { y: 20, stagger: 100 },
      blur: { blurFrom: 5, duration: 1200 },
      mask: { duration: 1250 },
      float: { y: 7, duration: 5200 },
      count: { duration: 1800 },
    },
  },
]

/** Standaardwaarden per familie vóór karakter-tweaks. */
const FAMILY_DEFAULTS: Record<MotionFamily, Partial<MotionSpec>> = {
  words: { y: 24, enter: 'bottom-=80 top' },
  chars: { y: 18, enter: 'bottom-=80 top' },
  lift: { y: 28, enter: 'bottom-=60 top' },
  grid: { y: 26, enter: 'bottom-=40 top' },
  draw: { duration: 1200, enter: 'bottom-=60 top' },
  count: { enter: 'bottom-=40 top' },
  mask: { enter: 'bottom-=60 top' },
  blur: { blurFrom: 6, y: 12, enter: 'bottom-=60 top' },
  scale: { scaleFrom: 0.92, enter: 'bottom-=60 top' },
  slide: { x: 44, enter: 'bottom-=60 top' },
  float: { y: 10 },
}

/**
 * Kiest een bewegingskarakter op basis van toon + seed en bouwt het volledige
 * plan uit. Deterministisch: zelfde seed en toon → zelfde beweging.
 */
export function selectMotionProfile(tone: VisualTone, seed: number): MotionProfile {
  const fits = CHARACTERS.filter(c => c.tones.includes(tone))
  const pool = fits.length ? fits : CHARACTERS
  const character = pool[seed % pool.length]

  const plan: MotionPlan = {}
  for (const fam of MOTION_FAMILIES) {
    const spec: MotionSpec = {
      ease: character.base.ease,
      duration: character.base.duration,
      stagger: character.base.stagger,
      from: character.base.from,
      ...FAMILY_DEFAULTS[fam],
      ...(character.tweaks[fam] ?? {}),
    }
    plan[fam] = spec
  }
  return { id: character.id, label: character.label, plan }
}

/** Alle karakter-id's — nodig voor de uniciteitscontrole. */
export function motionCharacterIds(): string[] {
  return CHARACTERS.map(c => c.id)
}

/** Versie van animejs die in de gegenereerde store-package.json komt. */
export const ANIME_VERSION = '^4.5.0'

/**
 * CSS die bij de bewegingslaag hoort. `am-armed` staat op <html> en wordt
 * uitsluitend gezet als Anime.js daadwerkelijk geladen is — zonder die class is
 * er niets verborgen, dus een mislukte import geeft gewoon een statische site.
 */
export function motionCss(): string {
  return [
    '.am-armed [data-am]{opacity:0}',
    '.am-armed [data-am="mask"]{opacity:1;clip-path:inset(0 100% 0 0)}',
    '.am-armed [data-am="draw"]{opacity:1}',
    '.am-armed [data-am="float"]{opacity:1}',
    '.am-armed [data-am="count"]{opacity:1}',
    // splitText wikkelt woorden/letters; overflow verbergen geeft de "opkomst
    // van onder de regel"-look zonder dat descenders afgeknipt worden.
    '.am-line{overflow:hidden;display:inline-block;padding-bottom:.08em}',
    '@media(prefers-reduced-motion:reduce){.am-armed [data-am]{opacity:1 !important;clip-path:none !important;filter:none !important;transform:none !important}}',
  ].join('\n')
}

/**
 * De runtime die in elke geassembleerde pagina wordt geïnjecteerd. Leest
 * AM_PLAN, wacht op Anime.js en voert per data-am-familie de animatie uit.
 *
 * Bewust één generieke runtime met een data-gedreven plan: de code is dan overal
 * identiek (en dus één keer te testen), terwijl het gedrag per store verschilt.
 */
export function motionRuntime(): string {
  return `
function useMotion(plan: any) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;                       // geen beweging, content blijft staan
    if (!document.querySelector('[data-am]')) return;

    let cancelled = false;
    let failsafe: any = null;
    const disarm = () => { root.classList.remove('am-armed'); };

    root.classList.add('am-armed');
    failsafe = setTimeout(disarm, 1800);       // JS traag of stuk → toch zichtbaar

    import('animejs').then((A: any) => {
      if (cancelled) return;
      clearTimeout(failsafe);
      const animate = A.animate, stagger = A.stagger, onScroll = A.onScroll;
      const splitText = A.splitText || (A.text && A.text.splitText);
      const createDrawable = A.createDrawable || (A.svg && A.svg.createDrawable);
      if (typeof animate !== 'function') { disarm(); return; }

      const spec = (fam: string) => plan[fam] || plan.lift || {};
      const scrollOpts = (s: any) => {
        try { return typeof onScroll === 'function' ? { autoplay: onScroll({ enter: s.enter || 'bottom-=60 top', once: true }) } : {}; }
        catch { return {}; }
      };
      const from = (s: any) => ({ translateY: s.y ? [s.y, 0] : undefined, translateX: s.x ? [s.x, 0] : undefined,
        scale: s.scaleFrom ? [s.scaleFrom, 1] : undefined, rotate: s.rotateFrom ? [s.rotateFrom, 0] : undefined,
        filter: s.blurFrom ? ['blur(' + s.blurFrom + 'px)', 'blur(0px)'] : undefined, opacity: [0, 1] });

      const run = (el: Element, fam: string) => {
        const s = spec(fam);
        const base: any = { duration: s.duration || 700, ease: s.ease || 'out(3)' };

        if ((fam === 'words' || fam === 'chars') && typeof splitText === 'function') {
          try {
            const split = splitText(el, fam === 'chars'
              ? { chars: { wrap: false }, words: false, accessible: true }
              : { words: { wrap: 'clip' }, accessible: true });
            const targets = fam === 'chars' ? split.chars : split.words;
            if (targets && targets.length) {
              (el as HTMLElement).style.opacity = '1';
              animate(targets, { ...from(s), ...base, delay: stagger(s.stagger || 40, { from: s.from || 'first' }), ...scrollOpts(s) });
              return;
            }
          } catch { /* val terug op het hele blok */ }
        }

        if (fam === 'draw' && typeof createDrawable === 'function') {
          try {
            const paths = createDrawable(el.querySelectorAll('path, line, polyline, circle, rect'));
            (el as HTMLElement).style.opacity = '1';
            animate(paths, { draw: ['0 0', '0 1'], ...base, delay: stagger(s.stagger || 60), ...scrollOpts(s) });
            return;
          } catch { /* val terug */ }
        }

        if (fam === 'count') {
          const target = parseFloat((el.getAttribute('data-am-to') || el.textContent || '0').replace(/[^0-9.]/g, '')) || 0;
          const suffix = el.getAttribute('data-am-suffix') || '';
          const obj = { v: 0 };
          (el as HTMLElement).style.opacity = '1';
          animate(obj, { v: target, ...base, duration: s.duration || 1400,
            onUpdate: () => { el.textContent = String(Math.round(obj.v)) + suffix; }, ...scrollOpts(s) });
          return;
        }

        if (fam === 'mask') {
          animate(el, { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'], opacity: [1, 1], ...base, ...scrollOpts(s) });
          return;
        }

        if (fam === 'float') {
          (el as HTMLElement).style.opacity = '1';
          animate(el, { translateY: [0, -(s.y || 10), 0], duration: s.duration || 4000, ease: 'inOutSine', loop: true });
          return;
        }

        if (fam === 'grid') {
          const kids = el.children.length > 1 ? Array.from(el.children) : [el];
          if (kids.length > 1) (el as HTMLElement).style.opacity = '1';
          animate(kids, { ...from(s), ...base, delay: stagger(s.stagger || 60, { from: s.from || 'first' }), ...scrollOpts(s) });
          return;
        }

        animate(el, { ...from(s), ...base, ...scrollOpts(s) });
      };

      const nodes = Array.from(document.querySelectorAll('[data-am]'));
      nodes.forEach(el => { try { run(el, el.getAttribute('data-am') || 'lift'); } catch { (el as HTMLElement).style.opacity = '1'; } });
    }).catch(() => { clearTimeout(failsafe); disarm(); });

    return () => { cancelled = true; clearTimeout(failsafe); disarm(); };
  }, []);
}
`
}
