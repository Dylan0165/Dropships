/**
 * ReviewCard — Grid of customer reviews with stars, verified badge,
 * and "Lees meer" truncation for long texts.
 *
 * Props: reviews, title, showSummary
 * Placeholders: {{REVIEWS_JSON}} (parse with parseJson in parent)
 */
'use client'

import { useState } from 'react'

interface Review {
  id: string
  name: string
  stars: number
  date: string
  text: string
  verified?: boolean
  avatar?: string
}

interface ReviewCardProps {
  reviews: Review[]
  title?: string
  showSummary?: boolean
}

function StarRow({ stars }: { stars: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} className={`w-4 h-4 ${i <= stars ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

function Card({ review }: { review: Review }) {
  const [expanded, setExpanded] = useState(false)
  const long = review.text.length > 160

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md transition-shadow duration-300">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {review.avatar ? (
            <img src={review.avatar} alt={review.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
            >
              {review.name[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-900 font-semibold text-sm">{review.name}</span>
              {review.verified && (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium">
                  ✓ Geverifieerd
                </span>
              )}
            </div>
            <p className="text-gray-400 text-xs">{review.date}</p>
          </div>
        </div>
        <StarRow stars={review.stars} />
      </div>

      <p className="text-gray-600 text-sm leading-relaxed">
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

export default function ReviewCard({ reviews, title, showSummary = true }: ReviewCardProps) {
  const avg = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.stars, 0) / reviews.length
    : 0

  return (
    <section className="py-14 px-5 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {(title || showSummary) && (
          <div className="text-center mb-10">
            {title && <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-2">{title}</h2>}
            {showSummary && reviews.length > 0 && (
              <p className="text-gray-500 text-sm">
                <strong className="text-gray-900">{avg.toFixed(1)}</strong> / 5 — {reviews.length} beoordelingen
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reviews.map((r) => <Card key={r.id} review={r} />)}
        </div>
      </div>
    </section>
  )
}
