/**
 * CountdownTimer — Evergreen urgency timer with digit-flip animation.
 * Resets to the initial value when it reaches zero.
 *
 * Props: hours, minutes, label
 * Placeholders: {{TIMER_HOURS}}, {{TIMER_LABEL}}
 */
'use client'

import { useState, useEffect, useRef } from 'react'

interface CountdownTimerProps {
  hours?: number
  minutes?: number
  label?: string
}

interface TimeState {
  h: number
  m: number
  s: number
}

function Digit({ value, label }: { value: number; label: string }) {
  const display = String(value).padStart(2, '0')
  const prevRef = useRef(display)
  const [flip, setFlip] = useState(false)

  useEffect(() => {
    if (prevRef.current !== display) {
      setFlip(true)
      const t = setTimeout(() => setFlip(false), 300)
      prevRef.current = display
      return () => clearTimeout(t)
    }
  }, [display])

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative w-14 h-16 flex items-center justify-center rounded-xl text-white font-extrabold text-3xl tabular-nums overflow-hidden ${
          flip ? 'scale-y-95 opacity-80' : ''
        } transition-all duration-150`}
        style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
      >
        {display}
      </div>
      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
    </div>
  )
}

export default function CountdownTimer({
  hours = 4,
  minutes = 0,
  label = 'Aanbieding verloopt over:',
}: CountdownTimerProps) {
  const initialSeconds = hours * 3600 + minutes * 60

  const [remaining, setRemaining] = useState<TimeState>(() => ({
    h: hours,
    m: minutes,
    s: 0,
  }))

  useEffect(() => {
    let secs = initialSeconds
    const id = setInterval(() => {
      secs = secs <= 0 ? initialSeconds : secs - 1
      setRemaining({
        h: Math.floor(secs / 3600),
        m: Math.floor((secs % 3600) / 60),
        s: secs % 60,
      })
    }, 1000)
    return () => clearInterval(id)
  }, [initialSeconds])

  return (
    <div className="py-5 px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 bg-gray-50 rounded-2xl border border-gray-100">
      <span className="text-gray-700 font-semibold text-sm text-center sm:text-left">{label}</span>
      <div className="flex items-center gap-2">
        <Digit value={remaining.h} label="uur" />
        <span className="text-gray-400 font-bold text-2xl mb-4">:</span>
        <Digit value={remaining.m} label="min" />
        <span className="text-gray-400 font-bold text-2xl mb-4">:</span>
        <Digit value={remaining.s} label="sec" />
      </div>
    </div>
  )
}
