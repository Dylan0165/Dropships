/** Shared TypeScript types used across all store components. */

export interface Product {
  id: string
  title: string
  image: string
  price: number          // euros, e.g. 29.99
  compareAtPrice?: number
  badge?: string
}

export interface Variant {
  label: string
  value: string
  inStock: boolean
  color?: string         // CSS color string, e.g. '#ff0000'
}

export interface Review {
  id: string
  name: string
  avatar?: string
  stars: number          // 1–5
  date: string
  text: string
  verified?: boolean
}

export interface FAQ {
  question: string
  answer: string
}

export interface Bundle {
  products: Product[]
  bundlePrice: number
  originalPrice: number
  savings: number
}

export interface CartItem {
  id: string
  title: string
  price: number
  quantity: number
  image?: string
}

export interface NavLink {
  label: string
  href: string
}

export interface FooterLink {
  label: string
  href: string
}

export interface FooterColumn {
  title: string
  links: FooterLink[]
}
