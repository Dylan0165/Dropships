/**
 * SectionDivider — Decorative shape transition between sections.
 * The fill colour matches the NEXT section's background.
 *
 * Props: color, variant
 */
interface SectionDividerProps {
  color?: string
  variant?: 'wave' | 'curve' | 'angle'
  flipX?: boolean
}

export default function SectionDivider({
  color = '#f9fafb',
  variant = 'wave',
  flipX = false,
}: SectionDividerProps) {
  const paths: Record<string, string> = {
    wave:  'M0,32 C240,96 480,-32 720,32 C960,96 1200,-32 1440,32 L1440,80 L0,80 Z',
    curve: 'M0,40 Q720,80 1440,40 L1440,80 L0,80 Z',
    angle: 'M0,0 L1440,60 L1440,80 L0,80 Z',
  }

  return (
    <div
      className="w-full overflow-hidden leading-none"
      style={{ transform: flipX ? 'scaleX(-1)' : undefined }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 80"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="w-full h-10 sm:h-14"
      >
        <path d={paths[variant]} fill={color} />
      </svg>
    </div>
  )
}
