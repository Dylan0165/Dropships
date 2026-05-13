---
name: taste-skill
description: Anti-slop frontend design rules for AI-generated store interfaces. Animate only transform/opacity. Stagger reveals. Spring easing. No neon. No generic layouts.
version: 1.0.0
---

# Taste Skill — Frontend Design Rules

## Motion
- Animate ONLY `transform` and `opacity`. Never animate width/height/top/left.
- Spring easing: `cubic-bezier(.22,1,.36,1)`
- Scroll reveals: IntersectionObserver, threshold 0.12, one-shot (disconnect after fire)
- Stagger: `transition-delay: index * 110ms`
- Hero entrance: label → h1 → CTA, delays 100ms / 200ms / 350ms

## Hover / Tactile
- Cards: `translateY(-4px)` + box-shadow on hover. Image inside: `scale(1.06)`.
- Buttons: `translateY(-2px)` + colored glow on hover; `scale(0.98)` on active.
- Nav links: color transition 0.2s ease.

## Layout
- `minHeight: '100dvh'` (not 100vh — mobile safe)
- Sticky nav: `position: sticky, top: 0`, `backdropFilter: blur(12px)`, semi-transparent bg, `zIndex: 50`
- Max container: `maxWidth: 1400px`

## Typography
- Headlines: tight tracking (`letterSpacing: '-0.04em'`), heavy weight (900)
- Body: `lineHeight: 1.6`, max readable width ~65ch
- Banned: generic Inter as the only font — pair with a display font

## Color
- Max one accent, saturation <80%
- No pure black (#000) → use #0a0a0a or similar
- No neon / AI purple-blue aesthetics

## Anti-patterns
- No generic 3-equal-column card grids
- No emoji as icons
- No outer glows on text
- No excessive gradient text on headlines
