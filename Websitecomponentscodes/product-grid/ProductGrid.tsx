/**
 * ProductGrid — Responsive product card grid with sale badges,
 * stagger-in animation, hover zoom, and brand-coloured CTA.
 *
 * Props: products, columns, onAddToCart, ctaLabel
 * Placeholders: {{PRODUCTS_JSON}}, {{PRIMARY_COLOR}} (via CSS var)
 */
'use client'

import { initiateCheckout } from '../shared/checkout'
import type { CartItem } from '../shared/types'

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
  ctaLabel?: string
}

const colsClass: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
}

export default function ProductGrid({
  products,
  columns = 3,
  onAddToCart,
  ctaLabel = 'Voeg toe aan winkelwagen',
}: ProductGridProps) {
  const handleBuy = async (product: Product) => {
    if (onAddToCart) {
      onAddToCart(product.id)
      return
    }
    const item: CartItem = {
      id: product.id,
      title: product.title,
      price: product.price,
      quantity: 1,
      image: product.image,
    }
    await initiateCheckout([item])
  }

  return (
    <>
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .prod-card { animation: cardIn 0.5s ease-out both; }
      `}</style>

      <section className="py-14 px-4 sm:px-6">
        <div className={`grid grid-cols-1 ${colsClass[columns] ?? colsClass[3]} gap-5 max-w-7xl mx-auto`}>
          {products.map((product, i) => {
            const onSale = !!product.compareAtPrice && product.compareAtPrice > product.price
            const discount = onSale
              ? Math.round((1 - product.price / product.compareAtPrice!) * 100)
              : 0

            return (
              <div
                key={product.id}
                className="prod-card group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-shadow duration-300"
                style={{ animationDelay: `${i * 0.07}s` }}
              >
                {/* Image */}
                <div className="relative aspect-square bg-gray-50 overflow-hidden">
                  <img
                    src={product.image}
                    alt={product.title}
                    className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500 ease-out"
                    loading="lazy"
                  />
                  {(product.badge || onSale) && (
                    <span className={`absolute top-3 left-3 text-white text-xs font-bold px-2.5 py-1 rounded-full ${
                      product.badge ? 'bg-red-500' : 'bg-emerald-500'
                    }`}>
                      {product.badge ?? `-${discount}%`}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="text-gray-900 font-semibold text-sm mb-2 line-clamp-2 leading-snug">
                    {product.title}
                  </h3>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-xl font-extrabold text-gray-900">
                      €{product.price.toFixed(2)}
                    </span>
                    {onSale && (
                      <span className="text-sm text-gray-400 line-through">
                        €{product.compareAtPrice!.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => void handleBuy(product)}
                    className="w-full text-white text-sm font-bold py-3 rounded-xl transition-all duration-200 hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
                  >
                    {ctaLabel}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
