/**
 * BeforeAfter — Drag-to-compare slider for transformation products.
 * Supports mouse drag on desktop and touch swipe on mobile.
 *
 * Props: beforeImage, afterImage, beforeLabel, afterLabel
 * Placeholders: {{BEFORE_IMAGE}}, {{AFTER_IMAGE}}
 */
'use client'

import { useState, useRef, useCallback } from 'react'

interface BeforeAfterProps {
  beforeImage: string
  afterImage: string
  beforeLabel?: string
  afterLabel?: string
}

export default function BeforeAfter({
  beforeImage,
  afterImage,
  beforeLabel = 'Voor',
  afterLabel = 'Na',
}: BeforeAfterProps) {
  const [position, setPosition] = useState(50)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    setPosition(pct)
  }, [])

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    updatePosition(e.clientX)
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    updatePosition(e.clientX)
  }

  const onMouseUp = () => { dragging.current = false }

  const onTouchMove = (e: React.TouchEvent) => {
    updatePosition(e.touches[0].clientX)
  }

  return (
    <div className="py-10 px-5 sm:px-6">
      <div
        ref={containerRef}
        className="relative aspect-video max-w-2xl mx-auto rounded-2xl overflow-hidden select-none cursor-col-resize shadow-lg"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchMove={onTouchMove}
        aria-label="Voor/na vergelijking"
      >
        {/* After (full) */}
        <img src={afterImage} alt={afterLabel} className="absolute inset-0 w-full h-full object-cover" draggable={false} />

        {/* Before (clipped) */}
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
          <img src={beforeImage} alt={beforeLabel} className="absolute inset-0 w-full h-full object-cover" draggable={false}
            style={{ minWidth: containerRef.current ? `${containerRef.current.offsetWidth}px` : '100%' }} />
        </div>

        {/* Divider */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
          style={{ left: `${position}%` }}
        >
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-xl flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
            </svg>
          </div>
        </div>

        {/* Labels */}
        <span className="absolute top-3 left-3 bg-black/50 text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
          {beforeLabel}
        </span>
        <span className="absolute top-3 right-3 bg-white/90 text-gray-900 text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
          {afterLabel}
        </span>
      </div>
    </div>
  )
}
