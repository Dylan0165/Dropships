/**
 * Microsoft Clarity + custom event helpers.
 * Call initClarity() once in the root layout.
 * Placeholder: {{CLARITY_PROJECT_ID}}
 */

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void
  }
}

export function initClarity(projectId: string): void {
  if (!projectId || projectId === '{{CLARITY_PROJECT_ID}}' || typeof window === 'undefined') return
  if (window.clarity) return // already loaded

  // Inject Clarity script tag
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.clarity.ms/tag/${projectId}`
  document.head.appendChild(s)

  // Clarity queue shim (identical to official snippet)
  ;(function(c: Window, l: Document, a: string, r: string, i: string) {
    ;(c as unknown as Record<string, unknown>)[a] = (c as unknown as Record<string, unknown>)[a] || function() {
      ((c as unknown as Record<string, unknown[]>)[a + 'q'] = (c as unknown as Record<string, unknown[]>)[a + 'q'] || []).push(arguments)
    }
    const t = l.createElement(r) as HTMLScriptElement
    t.async = true
    t.src = 'https://www.clarity.ms/tag/' + i
    const y = l.getElementsByTagName(r)[0]
    y.parentNode?.insertBefore(t, y)
  })(window, document, 'clarity', 'script', projectId)
}

export function clarityEvent(name: string, data?: Record<string, string>): void {
  if (typeof window === 'undefined' || !window.clarity) return
  if (data) {
    Object.entries(data).forEach(([k, v]) => window.clarity?.('set', k, v))
  }
  window.clarity('event', name)
}

export function clarityTag(key: string, value: string): void {
  if (typeof window === 'undefined' || !window.clarity) return
  window.clarity('set', key, value)
}
