/**
 * Theme injection — sets CSS custom properties on :root from the brand colour.
 * Call in layout.tsx: injectTheme('{{PRIMARY_COLOR}}')
 *
 * Sets:
 *   --brand-primary       hex colour, e.g. #7c3aed
 *   --brand-primary-rgb   space-separated RGB channels for rgba() usage
 */

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '').padEnd(6, '0')
  const r = parseInt(h.slice(0, 2), 16) || 124
  const g = parseInt(h.slice(2, 4), 16) || 58
  const b = parseInt(h.slice(4, 6), 16) || 237
  return `${r} ${g} ${b}`
}

export function injectTheme(primaryColor: string): void {
  if (typeof document === 'undefined') return
  if (!primaryColor || primaryColor.startsWith('{{')) return
  const root = document.documentElement
  root.style.setProperty('--brand-primary', primaryColor)
  root.style.setProperty('--brand-primary-rgb', hexToRgb(primaryColor))
}
