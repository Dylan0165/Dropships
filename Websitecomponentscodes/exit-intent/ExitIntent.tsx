/**
 * ExitIntent — Popup that appears when the cursor leaves toward the browser tab.
 * On mobile: fires after 30 seconds. Shown once per session.
 *
 * Props: headline, subtext, discountCode, imageUrl, ctaLabel, ctaHref
 * Placeholders: {{EXIT_HEADLINE}}, {{EXIT_DISCOUNT_CODE}}, {{PRIMARY_COLOR}} (via CSS var)
 */
'use client'

import { useState, useEffect, useCallback } from 'react'

interface ExitIntentProps {
  headline: string
  subtext?: string
  discountCode?: string
  imageUrl?: string
  ctaLabel?: string
  ctaHref?: string
}

const SESSION_KEY = 'exit_intent_shown'

export default function ExitIntent({
  headline,
  subtext,
  discountCode,
  imageUrl,
  ctaLabel = 'Claim korting',
  ctaHref = '#checkout',
}: ExitIntentProps) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  const show = useCallback(() => {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY)) return
    setVisible(true)
    sessionStorage.setItem(SESSION_KEY, '1')
  }, [])

  useEffect(() => {
    // Desktop: detect cursor leaving viewport toward tab bar
    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 5) show()
    }
    document.addEventListener('mouseleave', onMouseLeave)

    // Mobile: show after 30 seconds
    const timer = setTimeout(show, 30_000)

    return () => {
      document.removeEventListener('mouseleave', onMouseLeave)
      clearTimeout(timer)
    }
  }, [show])

  const dismiss = () => setVisible(false)

  const copyCode = () => {
    if (!discountCode) return
    navigator.clipboard.writeText(discountCode).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!visible) return null

  return (
    <>
      <style>{`
        @keyframes eiBackdrop { from { opacity: 0 } to { opacity: 1 } }
        @keyframes eiSlide { from { opacity: 0; transform: scale(0.93) translateY(16px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        .ei-backdrop { animation: eiBackdrop 0.2s ease-out; }
        .ei-modal   { animation: eiSlide 0.3s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      {/* Backdrop */}
      <div
        className="ei-backdrop fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        onClick={dismiss}
        role="dialog"
        aria-modal="true"
        aria-label="Aanbieding"
      >
        <div
          className="ei-modal bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 z-10 bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            aria-label="Sluiten"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>

          {imageUrl && (
            <div className="h-40 overflow-hidden bg-gray-100">
              <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          <div className="p-7 text-center">
            <h3 className="text-2xl font-extrabold text-gray-900 mb-2 leading-tight">{headline}</h3>
            {subtext && <p className="text-gray-600 text-sm mb-5 leading-relaxed">{subtext}</p>}

            {discountCode && (
              <button
                onClick={copyCode}
                className="w-full mb-4 py-3.5 px-5 border-2 border-dashed rounded-xl font-extrabold text-lg tracking-widest transition-all"
                style={{ borderColor: 'var(--brand-primary, #7c3aed)', color: 'var(--brand-primary, #7c3aed)' }}
              >
                {copied ? '✓ Gekopieerd!' : discountCode}
              </button>
            )}

            <a
              href={ctaHref}
              onClick={dismiss}
              className="block w-full text-white font-extrabold py-4 rounded-2xl text-base transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
            >
              {ctaLabel}
            </a>

            <button onClick={dismiss} className="mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              Nee bedankt
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
