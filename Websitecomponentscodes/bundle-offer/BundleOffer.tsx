/**
 * BundleOffer — "Pakket deal" section showing products side by side
 * with a combined bundle price and savings badge.
 *
 * Props: products, bundlePrice, originalPrice, savings, ctaLabel
 * Placeholders: {{BUNDLE_PRODUCTS_JSON}}, {{BUNDLE_PRICE}}, {{PRIMARY_COLOR}} (via CSS var)
 */
'use client'

import { initiateCheckout } from '../shared/checkout'
import type { CartItem } from '../shared/types'

interface BundleProduct {
  id: string
  title: string
  image: string
  price: number
}

interface BundleOfferProps {
  products: BundleProduct[]
  bundlePrice: number
  originalPrice: number
  savings: number
  ctaLabel?: string
  title?: string
}

export default function BundleOffer({
  products,
  bundlePrice,
  originalPrice,
  savings,
  ctaLabel = 'Pakket kopen',
  title = 'Populaire combinatie',
}: BundleOfferProps) {
  const discountPct = Math.round((savings / originalPrice) * 100)

  const handleBuy = async () => {
    const items: CartItem[] = products.map((p) => ({
      id: p.id,
      title: p.title,
      price: p.price,
      quantity: 1,
      image: p.image,
    }))
    await initiateCheckout(items)
  }

  return (
    <section className="py-12 px-5 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-gray-50 rounded-3xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div
            className="px-6 py-4 flex items-center justify-between"
            style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
          >
            <h3 className="text-white font-extrabold text-lg">{title}</h3>
            <span className="bg-white text-xs font-black px-3 py-1.5 rounded-full"
              style={{ color: 'var(--brand-primary, #7c3aed)' }}>
              -{discountPct}%
            </span>
          </div>

          <div className="p-6">
            {/* Products row */}
            <div className="flex items-center justify-center gap-3 flex-wrap mb-6">
              {products.map((product, i) => (
                <div key={product.id} className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white border border-gray-200 mx-auto mb-2">
                      <img src={product.image} alt={product.title} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-xs text-gray-700 font-medium max-w-[96px] line-clamp-2 text-center">
                      {product.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">€{product.price.toFixed(2)}</p>
                  </div>
                  {i < products.length - 1 && (
                    <span className="text-2xl font-bold text-gray-400 shrink-0">+</span>
                  )}
                </div>
              ))}
            </div>

            {/* Pricing */}
            <div className="flex items-center justify-center gap-4 mb-5">
              <div className="text-center">
                <p className="text-3xl font-extrabold text-gray-900">€{bundlePrice.toFixed(2)}</p>
                <p className="text-sm text-gray-400 line-through">€{originalPrice.toFixed(2)}</p>
              </div>
              <div
                className="text-white text-sm font-extrabold px-3 py-1.5 rounded-full"
                style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
              >
                Bespaar €{savings.toFixed(2)}
              </div>
            </div>

            <button
              onClick={() => void handleBuy()}
              className="w-full text-white font-extrabold py-4 rounded-2xl text-base transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
            >
              {ctaLabel} — €{bundlePrice.toFixed(2)}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
