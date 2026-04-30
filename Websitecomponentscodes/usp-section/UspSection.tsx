/**
 * UspSection — Animated grid of unique selling proposition cards.
 * Each card fades in with a stagger on first render.
 *
 * Props: items, columns, title
 * Placeholders: {{PRIMARY_COLOR}} (via CSS var for icon ring)
 */
interface UspItem {
  icon: string
  title: string
  description: string
}

interface UspSectionProps {
  items: UspItem[]
  columns?: 3 | 4
  title?: string
}

export default function UspSection({ items, columns = 3, title }: UspSectionProps) {
  const cols = {
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  }[columns] ?? 'sm:grid-cols-3'

  return (
    <>
      <style>{`
        @keyframes uspIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .usp-item { animation: uspIn 0.55s ease-out both; }
      `}</style>

      <section className="py-14 px-5 sm:px-6 bg-gray-50">
        {title && (
          <h2 className="text-center text-2xl sm:text-3xl font-extrabold text-gray-900 mb-10">{title}</h2>
        )}
        <div className={`grid grid-cols-1 ${cols} gap-6 max-w-5xl mx-auto`}>
          {items.map((item, i) => (
            <div
              key={i}
              className="usp-item text-center group"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-3xl mb-4 group-hover:scale-110 transition-transform duration-300"
                style={{ backgroundColor: 'rgba(var(--brand-primary-rgb, 124 58 237) / 0.1)' }}
              >
                {item.icon}
              </div>
              <h3 className="text-gray-900 font-bold text-base mb-1.5">{item.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">{item.description}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
