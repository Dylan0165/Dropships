# Footer

Multi-column site footer with link groups, newsletter signup, and copyright.
Responsive — stacks on mobile.

## Props
- `brandName`: string
- `columns`: FooterColumn[] — Link groups
- `showNewsletter?`: boolean — Show email signup (default: true)
- `copyrightYear?`: number

## FooterColumn Shape
- `title`: string
- `links`: { label: string; href: string }[]
