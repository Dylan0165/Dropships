/**
 * CheckoutCart — Cart summary with line items, quantity controls,
 * promo code input, price breakdown, and central checkout CTA.
 * All purchase actions go through shared/checkout.ts (Mollie).
 *
 * Props: items, shippingCost, onQuantityChange, onRemove
 * Placeholders: {{PRIMARY_COLOR}} (via CSS var), {{CHECKOUT_URL}}, {{STORE_ID}}
 */
'use client'

import { useState } from 'react'
import { initiateCheckout } from '../shared/checkout.js'
import type { CartItem } from '../shared/types.js'

interface CheckoutCartProps {
  items: CartItem[]
  shippingCost?: number
  freeShippingThreshold?: number
  onQuantityChange?: (id: string, qty: number) => void
  onRemove?: (id: string) => void
  labels?: {
    title?: string
    empty?: string
    promo?: string
    apply?: string
    subtotal?: string
    shipping?: string
    free?: string
    total?: string
    cta?: string
  }
}

export default function CheckoutCart({
  items,
  shippingCost = 0,
  freeShippingThreshold,
  onQuantityChange,
  onRemove,
  labels = {},
}: CheckoutCartProps) {
  const [promoCode, setPromoCode] = useState('')
  const [loading, setLoading] = useState(false)

  const l = {
    title: labels.title ?? 'Winkelwagen',
    empty: labels.empty ?? 'Je winkelwagen is leeg.',
    promo: labels.promo ?? 'Kortingscode',
    apply: labels.apply ?? 'Toepassen',
    subtotal: labels.subtotal ?? 'Subtotaal',
    shipping: labels.shipping ?? 'Verzending',
    free: labels.free ?? 'Gratis',
    total: labels.total ?? 'Totaal',
    cta: labels.cta ?? 'Afrekenen',
  }

  const subtotal = items.reduce((s, item) => s + item.price * item.quantity, 0)
  const shipping = freeShippingThreshold && subtotal >= freeShippingThreshold ? 0 : shippingCost
  const total = subtotal + shipping
  const freeShippingLeft = freeShippingThreshold ? Math.max(0, freeShippingThreshold - subtotal) : 0

  const handleCheckout = async () => {
    setLoading(true)
    await initiateCheckout(items)
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto p-5 sm:p-6">
      <h2 className="text-2xl font-extrabold text-gray-900 mb-6">{l.title}</h2>

      {items.length === 0 ? (
        <p className="text-gray-500 text-center py-16">{l.empty}</p>
      ) : (
        <>
          {/* Free shipping progress */}
          {freeShippingLeft > 0 && (
            <div className="mb-5 p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800">
              Nog <strong>€{freeShippingLeft.toFixed(2)}</strong> tot gratis verzending
              <div className="mt-1.5 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    backgroundColor: 'var(--brand-primary, #7c3aed)',
                    width: `${Math.min(100, (subtotal / freeShippingThreshold!) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Items */}
          <div className="space-y-3 mb-7">
            {items.map((item) => (
              <div key={item.id} className="flex gap-4 bg-white border border-gray-100 rounded-2xl p-4 hover:border-gray-200 transition-colors">
                {item.image && (
                  <img src={item.image} alt={item.title} className="w-20 h-20 rounded-xl object-cover bg-gray-50 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-gray-900 font-semibold text-sm leading-snug line-clamp-2">{item.title}</h3>
                  <p className="text-gray-900 font-bold mt-1">€{item.price.toFixed(2)}</p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      onClick={() => onQuantityChange?.(item.id, Math.max(1, item.quantity - 1))}
                      className="w-8 h-8 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-base font-bold"
                      aria-label="Minder"
                    >−</button>
                    <span className="text-sm font-semibold text-gray-900 w-8 text-center">{item.quantity}</span>
                    <button
                      onClick={() => onQuantityChange?.(item.id, item.quantity + 1)}
                      className="w-8 h-8 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-base font-bold"
                      aria-label="Meer"
                    >+</button>
                    <button
                      onClick={() => onRemove?.(item.id)}
                      className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Verwijder
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Promo code */}
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder={l.promo}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1 transition-shadow"
              style={{ '--tw-ring-color': 'var(--brand-primary, #7c3aed)' } as React.CSSProperties}
            />
            <button className="bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-800 transition-colors">
              {l.apply}
            </button>
          </div>

          {/* Totals */}
          <div className="border-t border-gray-100 pt-4 space-y-2.5 mb-6">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{l.subtotal}</span>
              <span>€{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>{l.shipping}</span>
              <span className={shipping === 0 ? 'text-emerald-600 font-medium' : ''}>
                {shipping === 0 ? l.free : `€${shipping.toFixed(2)}`}
              </span>
            </div>
            <div className="flex justify-between text-lg font-extrabold text-gray-900 pt-3 border-t border-gray-100">
              <span>{l.total}</span>
              <span>€{total.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={() => void handleCheckout()}
            disabled={loading}
            className="w-full text-white font-bold py-4 rounded-2xl text-base transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
          >
            {loading ? 'Even geduld…' : `${l.cta} — €${total.toFixed(2)}`}
          </button>

          <p className="text-center text-xs text-gray-400 mt-3 flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            Veilig betalen via Mollie
          </p>
        </>
      )}
    </div>
  )
}
