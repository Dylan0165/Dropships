/** Shared utility functions for store components. */

/** Format a price in euros: 29.99 → "€29,99" */
export function formatPrice(euros: number): string {
  return '€' + euros.toFixed(2).replace('.', ',')
}

/** Merge class names, filtering out falsy values. No external dependency. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Safely parse a JSON string or {{PLACEHOLDER}} value.
 * Returns fallback when the string is empty, invalid, or still a placeholder.
 */
export function parseJson<T>(value: string, fallback: T): T {
  if (!value || value.startsWith('{{')) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
