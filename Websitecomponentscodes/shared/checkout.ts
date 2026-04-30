/**
 * Central checkout — all "buy" actions in every component go through here.
 * POSTs to {{CHECKOUT_URL}} with store ID and cart items,
 * then redirects to the Mollie checkout URL returned.
 *
 * Placeholders: {{CHECKOUT_URL}}, {{STORE_ID}}
 */
'use client'

import type { CartItem } from './types.js'

const CHECKOUT_URL = '{{CHECKOUT_URL}}'
const STORE_ID = '{{STORE_ID}}'

function showToast(message: string): void {
  if (typeof document === 'undefined') return
  const el = document.createElement('div')
  el.textContent = message
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '1.5rem',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#1f2937',
    color: '#fff',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.625rem',
    zIndex: '9999',
    fontSize: '0.875rem',
    fontFamily: 'system-ui, sans-serif',
    boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
    pointerEvents: 'none',
  })
  document.body.appendChild(el)
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s'
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 300)
  }, 2700)
}

export async function initiateCheckout(items: CartItem[]): Promise<void> {
  if (CHECKOUT_URL.startsWith('{{')) {
    showToast('Checkout niet geconfigureerd')
    return
  }
  try {
    const resp = await fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: STORE_ID, items }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json() as { checkoutUrl?: string }
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl
    } else {
      throw new Error('checkoutUrl missing in response')
    }
  } catch {
    showToast('Probeer het opnieuw')
  }
}
