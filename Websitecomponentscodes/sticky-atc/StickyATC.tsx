/**
 * StickyATC — Sticky Add-to-Cart bar that appears after the user scrolls
 * past the first product section. Mobile: fixed bottom. Desktop: fixed top.
 *
 * Props: productName, price, compareAtPrice, imageUrl, checkoutUrl
 * Placeholders: {{STICKY_PRODUCT_NAME}}, {{STICKY_PRICE}}, {{PRIMARY_COLOR}} (via CSS var)
 */
'use client'

import { useState, useEffect } from 'react'
import { initiateCheckout } from '../shared/checkout'
import type { CartItem } from '../shared/types'

interface StickyATCProps {
  productId: string
  productName: string
  price: number
  compareAtPrice?: number
  imageUrl?: string
  ctaLabel?: string
}

export default function StickyATC({
  productId,
  productName,
  price,
  compareAtPrice,
  imageUrl,
  ctaLabel = 'Nu bestellen',
}: StickyATCProps) {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 500)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleBuy = async () => {
    setLoading(true)
    const item: CartItem = { id: productId, title: productName, price, quantity: 1 }
    await initiateCheckout([item])
    setLoading(false)
  }

  const onSale = !!compareAtPrice && compareAtPrice > price

  return (
    <>
      <style>{`
        .satc-enter { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease; }
        .satc-hidden-top    { transform: translateY(-110%); opacity: 0; pointer-events: none; }
        .satc-hidden-bottom { transform: translateY(110%);  opacity: 0; pointer-events: none; }
        .satc-shown { transform: translateY(0); opacity: 1; }
      `}</style>

      {/* Desktop — top */}
      <div className={`hidden md:flex satc-enter fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-lg px-6 py-3 items-center gap-5 ${
        visible ? 'satc-shown' : 'satc-hidden-top'
      }`}>
        {imageUrl && (
          <img src={imageUrl} alt={productName} className="w-10 h-10 rounded-lg object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 font-semibold text-sm truncate">{productName}</p>
          <div className="flex items-baseline gap-2">
            <span className="font-extrabold text-gray-900">€{price.toFixed(2)}</span>
            {onSale && <span className="text-xs text-gray-400 line-through">€{compareAtPrice!.toFixed(2)}</span>}
          </div>
        </div>
        <button
          onClick={() => void handleBuy()}
          disabled={loading}
          className="text-white font-bold px-7 py-2.5 rounded-xl text-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 shrink-0"
          style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
        >
          {loading ? '…' : ctaLabel}
        </button>
      </div>

      {/* Mobile — bottom */}
      <div className={`md:hidden satc-enter fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg px-4 py-3 flex items-center gap-3 ${
        visible ? 'satc-shown' : 'satc-hidden-bottom'
      }`}>
        {imageUrl && (
          <img src={imageUrl} alt={productName} className="w-10 h-10 rounded-lg object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 font-semibold text-xs truncate">{productName}</p>
          <span className="font-extrabold text-gray-900 text-sm">€{price.toFixed(2)}</span>
        </div>
        <button
          onClick={() => void handleBuy()}
          disabled={loading}
          className="text-white font-bold px-6 py-3 rounded-xl text-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 shrink-0"
          style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
        >
          {loading ? '…' : ctaLabel}
        </button>
      </div>
    </>
  )
}
