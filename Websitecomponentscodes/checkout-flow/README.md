# Checkout Flow

Cart summary with line items, quantity controls, promo code field,
subtotal/shipping/total breakdown, and checkout button.

## Props
- `items`: CartItem[] — Items in cart
- `shippingCost?`: number — Shipping cost (default: 0 = free)
- `onQuantityChange?`: (id: string, qty: number) => void
- `onRemove?`: (id: string) => void
- `onCheckout?`: () => void

## CartItem Shape
- `id`: string
- `title`: string
- `image`: string
- `price`: number
- `quantity`: number
