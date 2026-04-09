/**
 * UspSection — Row of unique selling proposition cards.
 * Icons, titles, and short descriptions in a clean grid.
 */
interface UspItem {
  icon: string
  title: string
  description: string
}

interface UspSectionProps {
  items: UspItem[]
  columns?: 3 | 4
}

export default function UspSection({ items, columns = 3 }: UspSectionProps) {
  const cols = columns === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'

  return (
    <section className="py-12 px-6 bg-gray-50">
      <div className={`grid grid-cols-1 ${cols} gap-8 max-w-5xl mx-auto`}>
        {items.map((item, i) => (
          <div key={i} className="text-center">
            <div className="text-4xl mb-3">{item.icon}</div>
            <h3 className="text-gray-900 font-semibold text-lg mb-1">{item.title}</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
