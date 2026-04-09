/**
 * CheckoutCart — Cart summary with line items, quantity controls,
 * promo code, price breakdown, and checkout CTA.
 */
'use client'

import { useState } from 'react'

interface CartItem {
  id: string
  title: string
  image: string
  price: number
  quantity: number
}

interface CheckoutCartProps {
  items: CartItem[]
  shippingCost?: number
  onQuantityChange?: (id: string, qty: number) => void
  onRemove?: (id: string) => void
  onCheckout?: () => void
}

export default function CheckoutCart({
  items,
  shippingCost = 0,
  onQuantityChange,
  onRemove,
  onCheckout,
}: CheckoutCartProps) {
  const [promoCode, setPromoCode] = useState('')

  const subtotal = items.reduce((s, item) => s + item.price * item.quantity, 0)
  const total = subtotal + shippingCost

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Cart</h2>

      {items.length === 0 ? (
        <p className="text-gray-500 text-center py-12">Your cart is empty.</p>
      ) : (
        <>
          {/* Items */}
          <div className="space-y-4 mb-8">
            {items.map((item) => (
              <div key={item.id} className="flex gap-4 bg-white border border-gray-100 rounded-xl p-4">
                <img src={item.image} alt={item.title} className="w-20 h-20 rounded-lg object-cover" />
                <div className="flex-1">
                  <h3 className="text-gray-900 font-medium text-sm">{item.title}</h3>
                  <p className="text-gray-900 font-bold mt-1">€{item.price.toFixed(2)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => onQuantityChange?.(item.id, Math.max(1, item.quantity - 1))}
                      className="w-7 h-7 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 text-sm"
                    >
                      -
                    </button>
                    <span className="text-sm text-gray-900 w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => onQuantityChange?.(item.id, item.quantity + 1)}
                      className="w-7 h-7 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 text-sm"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onRemove?.(item.id)}
                      className="ml-auto text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
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
              placeholder="Promo code"
              className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-violet-500"
            />
            <button className="bg-gray-900 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-gray-800 transition-colors">
              Apply
            </button>
          </div>

          {/* Totals */}
          <div className="border-t border-gray-200 pt-4 space-y-2 mb-6">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>€{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Shipping</span>
              <span>{shippingCost === 0 ? 'Free' : `€${shippingCost.toFixed(2)}`}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span>€{total.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={onCheckout}
            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-lg transition-colors text-base"
          >
            Checkout — €{total.toFixed(2)}
          </button>
        </>
      )}
    </div>
  )
}
