# Product Grid

Responsive product card grid with image, title, price, compare-at price, and add-to-cart button.
Supports 2/3/4 column layouts and optional "sale" badges.

## Props
- `products`: Product[] — Array of product objects
- `columns?`: 2 | 3 | 4 — Grid columns (default: 3)

## Product Shape
- `id`: string
- `title`: string
- `image`: string
- `price`: number
- `compareAtPrice?`: number
- `badge?`: string
