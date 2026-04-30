/**
 * ProductImages — Main image + thumbnail row gallery.
 * Supports swipe on mobile (touch events) and zoom on desktop hover.
 *
 * Props: images (string[], max 6), alt
 * Placeholders: {{PRODUCT_IMAGES_JSON}}, {{PRODUCT_IMAGE_1/2/3}}
 */
'use client'

import { useState, useRef } from 'react'

interface ProductImagesProps {
  images: string[]
  alt?: string
}

export default function ProductImages({ images, alt = 'Product' }: ProductImagesProps) {
  const imgs = images.slice(0, 6).filter(Boolean)
  const [selected, setSelected] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 })
  const touchStartX = useRef<number>(0)

  if (imgs.length === 0) return null

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setZoomPos({ x, y })
  }

  const prev = () => setSelected((s) => (s === 0 ? imgs.length - 1 : s - 1))
  const next = () => setSelected((s) => (s === imgs.length - 1 ? 0 : s + 1))

  return (
    <div className="flex flex-col gap-3 select-none">
      {/* Main image */}
      <div
        className="relative aspect-square rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 cursor-zoom-in"
        onMouseEnter={() => setZoomed(true)}
        onMouseLeave={() => setZoomed(false)}
        onMouseMove={handleMouseMove}
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touchStartX.current
          if (dx < -50) next()
          else if (dx > 50) prev()
        }}
      >
        <img
          src={imgs[selected]}
          alt={`${alt} ${selected + 1}`}
          className="w-full h-full object-cover transition-transform duration-300"
          style={zoomed ? {
            transform: 'scale(1.9)',
            transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
            cursor: 'zoom-in',
          } : undefined}
          draggable={false}
        />

        {/* Prev/Next arrows (mobile visible) */}
        {imgs.length > 1 && (
          <>
            <button
              onClick={prev}
              className="md:opacity-0 md:group-hover:opacity-100 absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-9 h-9 flex items-center justify-center shadow transition-all"
              aria-label="Vorige afbeelding"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              onClick={next}
              className="md:opacity-0 md:group-hover:opacity-100 absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-9 h-9 flex items-center justify-center shadow transition-all"
              aria-label="Volgende afbeelding"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </>
        )}

        {/* Dot indicator on mobile */}
        {imgs.length > 1 && (
          <div className="md:hidden absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {imgs.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === selected ? 'scale-125' : 'bg-white/50'
                }`}
                style={i === selected ? { backgroundColor: 'var(--brand-primary, #7c3aed)' } : undefined}
                aria-label={`Afbeelding ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {imgs.length > 1 && (
        <div className="hidden md:grid grid-cols-6 gap-2">
          {imgs.map((src, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`aspect-square rounded-xl overflow-hidden border-2 transition-all duration-150 ${
                i === selected ? 'opacity-100 scale-105' : 'border-transparent opacity-60 hover:opacity-90'
              }`}
              style={i === selected ? { borderColor: 'var(--brand-primary, #7c3aed)' } : undefined}
              aria-label={`Toon afbeelding ${i + 1}`}
            >
              <img src={src} alt={`${alt} thumbnail ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
