/**
 * VariantSelector — Colour and/or size option buttons.
 * Selected variant gets a brand-coloured border. Out-of-stock = strikethrough + disabled.
 *
 * Props: variants, selectedValue, onSelect, label
 * Placeholders: {{VARIANTS_JSON}} (parse with parseJson in parent)
 */
'use client'

interface Variant {
  label: string
  value: string
  inStock: boolean
  color?: string
}

interface VariantSelectorProps {
  variants: Variant[]
  selectedValue?: string
  onSelect?: (value: string) => void
  label?: string
}

export default function VariantSelector({
  variants,
  selectedValue,
  onSelect,
  label,
}: VariantSelectorProps) {
  if (variants.length === 0) return null

  return (
    <div>
      {label && (
        <p className="text-sm font-semibold text-gray-700 mb-2.5">
          {label}
          {selectedValue && (
            <span className="ml-1.5 font-normal text-gray-500">
              — {variants.find(v => v.value === selectedValue)?.label}
            </span>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="listbox" aria-label={label}>
        {variants.map((v) => {
          const isSelected = v.value === selectedValue
          const isColor = !!v.color

          return (
            <button
              key={v.value}
              role="option"
              aria-selected={isSelected}
              aria-disabled={!v.inStock}
              disabled={!v.inStock}
              onClick={() => v.inStock && onSelect?.(v.value)}
              className={`relative rounded-lg transition-all duration-150 ${
                isColor
                  ? 'w-10 h-10 rounded-full'
                  : 'px-4 py-2 text-sm font-medium border-2'
              } ${
                !v.inStock
                  ? 'opacity-40 cursor-not-allowed line-through'
                  : 'cursor-pointer hover:opacity-90'
              }`}
              style={isColor ? {
                backgroundColor: v.color,
                outline: isSelected ? `3px solid var(--brand-primary, #7c3aed)` : '2px solid transparent',
                outlineOffset: '2px',
              } : {
                borderColor: isSelected ? 'var(--brand-primary, #7c3aed)' : '#e5e7eb',
                color: isSelected ? 'var(--brand-primary, #7c3aed)' : '#374151',
                backgroundColor: isSelected ? 'rgba(var(--brand-primary-rgb, 124 58 237) / 0.06)' : 'white',
              }}
              aria-label={v.label}
            >
              {!isColor && v.label}
              {!v.inStock && !isColor && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-full h-px bg-gray-400 absolute rotate-12" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
