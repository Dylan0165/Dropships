/**
 * BenefitList — Compact checkmark list of product benefits.
 * Designed to sit beside a product image or below the price.
 *
 * Props: benefits (string[], max 5)
 * Placeholders: {{BENEFITS_JSON}} (parse with parseJson in parent)
 */
interface BenefitListProps {
  benefits: string[]
}

export default function BenefitList({ benefits }: BenefitListProps) {
  const items = benefits.slice(0, 5)

  return (
    <ul className="space-y-2" role="list">
      {items.map((benefit, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span
            className="mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(var(--brand-primary-rgb, 124 58 237) / 0.12)' }}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
              style={{ color: 'var(--brand-primary, #7c3aed)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </span>
          <span className="text-gray-700 text-sm leading-snug">{benefit}</span>
        </li>
      ))}
    </ul>
  )
}
