/**
 * HeroBanner — Full-width hero with animated headline, subheadline, and CTA.
 * Uses --brand-primary CSS variable for the CTA button colour.
 *
 * Props: headline, subheadline, ctaText, ctaHref, backgroundImage, theme, eyebrow
 * Placeholders: {{BRAND_NAME}}, {{SLOGAN}}, {{PRIMARY_COLOR}} (via CSS var)
 */
interface HeroBannerProps {
  headline: string
  subheadline: string
  ctaText: string
  ctaHref: string
  backgroundImage?: string
  theme?: 'dark' | 'light'
  eyebrow?: string
}

export default function HeroBanner({
  headline,
  subheadline,
  ctaText,
  ctaHref,
  backgroundImage,
  theme = 'dark',
  eyebrow,
}: HeroBannerProps) {
  const isDark = theme === 'dark'

  return (
    <>
      <style>{`
        @keyframes heroFadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .h-fade { animation: heroFadeUp 0.75s cubic-bezier(0.16,1,0.3,1) forwards; opacity: 0; }
        .h-d1 { animation-delay: 0.05s; }
        .h-d2 { animation-delay: 0.2s; }
        .h-d3 { animation-delay: 0.38s; }
        .hero-cta:hover { filter: brightness(1.12); transform: scale(1.04) translateY(-1px); }
        .hero-cta:active { transform: scale(0.97); }
        .hero-cta { transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      <section
        className="relative min-h-[85vh] flex items-center justify-center overflow-hidden"
        style={backgroundImage ? {
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      >
        {/* Base gradient when no image */}
        {!backgroundImage && (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800" />
        )}

        {/* Overlay */}
        <div className={`absolute inset-0 ${
          isDark
            ? 'bg-gradient-to-b from-black/55 via-black/35 to-black/75'
            : 'bg-gradient-to-b from-white/75 to-white/92'
        }`} />

        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto py-24">
          {eyebrow && (
            <p className={`h-fade h-d1 inline-block text-xs font-bold tracking-[0.2em] uppercase mb-5 px-4 py-1.5 rounded-full border ${
              isDark ? 'text-white/60 border-white/20' : 'text-gray-500 border-gray-300'
            }`}>
              {eyebrow}
            </p>
          )}

          <h1 className={`h-fade h-d1 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold mb-5 leading-[1.08] tracking-tight ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}>
            {headline}
          </h1>

          <p className={`h-fade h-d2 text-lg sm:text-xl md:text-2xl mb-10 max-w-2xl mx-auto leading-relaxed ${
            isDark ? 'text-gray-300' : 'text-gray-600'
          }`}>
            {subheadline}
          </p>

          <div className="h-fade h-d3">
            <a
              href={ctaHref}
              className="hero-cta inline-flex items-center gap-2.5 font-bold px-10 py-4 rounded-2xl text-white text-lg shadow-2xl"
              style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
            >
              {ctaText}
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </a>
          </div>
        </div>

        {/* Scroll hint */}
        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce ${
          isDark ? 'text-white/30' : 'text-gray-400'
        }`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </section>
    </>
  )
}
