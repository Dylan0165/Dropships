/**
 * ProductGrid — Responsive grid of product cards with image,
 * pricing, optional sale badge, and add-to-cart action.
 */
interface Product {
  id: string
  title: string
  image: string
  price: number
  compareAtPrice?: number
  badge?: string
}

interface ProductGridProps {
  products: Product[]
  columns?: 2 | 3 | 4
  onAddToCart?: (productId: string) => void
}

const colsClass = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }

export default function ProductGrid({ products, columns = 3, onAddToCart }: ProductGridProps) {
  return (
    <section className="py-12 px-6">
      <div className={`grid grid-cols-1 ${colsClass[columns]} gap-6 max-w-7xl mx-auto`}>
        {products.map((product) => {
          const onSale = product.compareAtPrice && product.compareAtPrice > product.price
          const discount = onSale
            ? Math.round((1 - product.price / product.compareAtPrice!) * 100)
            : 0

          return (
            <div key={product.id} className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
              {/* Image */}
              <div className="relative aspect-square bg-gray-50">
                <img src={product.image} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                {product.badge && (
                  <span className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                    {product.badge}
                  </span>
                )}
                {onSale && !product.badge && (
                  <span className="absolute top-3 left-3 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">
                    -{discount}%
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="text-gray-900 font-medium text-sm mb-2 line-clamp-2">{product.title}</h3>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg font-bold text-gray-900">€{product.price.toFixed(2)}</span>
                  {onSale && (
                    <span className="text-sm text-gray-400 line-through">€{product.compareAtPrice!.toFixed(2)}</span>
                  )}
                </div>
                <button
                  onClick={() => onAddToCart?.(product.id)}
                  className="w-full bg-black hover:bg-gray-800 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
