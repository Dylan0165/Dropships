/**
 * QuantitySelector — Accessible quantity stepper with large touch targets.
 *
 * Props: value, min, max, onChange
 */
'use client'

interface QuantitySelectorProps {
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}

export default function QuantitySelector({
  value,
  min = 1,
  max = 99,
  onChange,
}: QuantitySelectorProps) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))

  return (
    <div
      className="inline-flex items-center border-2 border-gray-200 rounded-xl overflow-hidden"
      role="group"
      aria-label="Aantal"
    >
      <button
        onClick={dec}
        disabled={value <= min}
        className="w-12 h-12 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xl font-bold"
        aria-label="Minder"
      >
        −
      </button>

      <span
        className="w-12 h-12 flex items-center justify-center text-gray-900 font-extrabold text-base tabular-nums select-none border-x-2 border-gray-200"
        aria-live="polite"
        aria-atomic="true"
      >
        {value}
      </span>

      <button
        onClick={inc}
        disabled={value >= max}
        className="w-12 h-12 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xl font-bold"
        aria-label="Meer"
      >
        +
      </button>
    </div>
  )
}
