/**
 * HeroBanner — Full-width hero section with gradient overlay,
 * headline, subheadline, and call-to-action button.
 */
interface HeroBannerProps {
  headline: string
  subheadline: string
  ctaText: string
  ctaHref: string
  backgroundImage?: string
  theme?: 'dark' | 'light'
}

export default function HeroBanner({
  headline,
  subheadline,
  ctaText,
  ctaHref,
  backgroundImage,
  theme = 'dark',
}: HeroBannerProps) {
  const isDark = theme === 'dark'

  return (
    <section
      className="relative min-h-[70vh] flex items-center justify-center overflow-hidden"
      style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {/* Gradient overlay */}
      <div className={`absolute inset-0 ${isDark ? 'bg-gradient-to-b from-black/70 to-black/90' : 'bg-gradient-to-b from-white/60 to-white/80'}`} />

      <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">
        <h1 className={`text-4xl md:text-6xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {headline}
        </h1>
        <p className={`text-lg md:text-xl mb-8 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
          {subheadline}
        </p>
        <a
          href={ctaHref}
          className="inline-block bg-violet-600 hover:bg-violet-500 text-white font-semibold px-8 py-3 rounded-lg transition-colors text-lg"
        >
          {ctaText}
        </a>
      </div>
    </section>
  )
}
