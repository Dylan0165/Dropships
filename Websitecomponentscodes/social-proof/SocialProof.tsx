/**
 * SocialProof — Animated review grid with star ratings, verified badges,
 * "Read more" truncation, and aggregate score summary.
 *
 * Props: reviews, showSummary, title
 * Placeholders: {{REVIEWS_JSON}} (via parseJson in parent)
 */
'use client'

import { useState } from 'react'

interface Review {
  id: string
  name: string
  avatar?: string
  rating: number
  text: string
  date: string
  verified?: boolean
}

interface SocialProofProps {
  reviews: Review[]
  showSummary?: boolean
  title?: string
}

function Stars({ rating, size = 4 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} van 5 sterren`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`w-${size} h-${size} ${i <= rating ? 'text-yellow-400' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

function ReviewCard({ review }: { review: Review }) {
  const [expanded, setExpanded] = useState(false)
  const long = review.text.length > 160

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-200 hover:shadow-md transition-all duration-300">
      <div className="flex items-center gap-3 mb-3">
        {review.avatar ? (
          <img src={review.avatar} alt={review.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
            style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
          >
            {review.name[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-gray-900 font-semibold text-sm">{review.name}</span>
            {review.verified && (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium">
                ✓ Geverifieerd
              </span>
            )}
          </div>
          <span className="text-gray-400 text-xs">{review.date}</span>
        </div>
      </div>

      <Stars rating={review.rating} />

      <p className="text-gray-600 text-sm mt-2.5 leading-relaxed">
        {long && !expanded ? `${review.text.slice(0, 160)}…` : review.text}
      </p>

      {long && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-medium mt-1.5 transition-colors"
          style={{ color: 'var(--brand-primary, #7c3aed)' }}
        >
          {expanded ? 'Minder tonen' : 'Lees meer'}
        </button>
      )}
    </div>
  )
}

export default function SocialProof({ reviews, showSummary = true, title }: SocialProofProps) {
  const avg = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0

  return (
    <section className="py-14 px-5 sm:px-6 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        {(title || (showSummary && reviews.length > 0)) && (
          <div className="text-center mb-10">
            {showSummary && reviews.length > 0 && (
              <div className="flex items-center justify-center gap-2 mb-2">
                <Stars rating={Math.round(avg)} size={5} />
                <span className="text-gray-900 font-extrabold text-xl">{avg.toFixed(1)}</span>
              </div>
            )}
            {title && <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-1">{title}</h2>}
            {showSummary && (
              <p className="text-gray-500 text-sm">Gebaseerd op {reviews.length} beoordelingen</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      </div>
    </section>
  )
}
