// ═══════ Supplier registry ═══════
// getSupplier('cj') → SupplierAdapter. Nieuwe suppliers hier registreren.

import { CJAdapter } from './cj-adapter.js'
import type { SupplierAdapter } from './types.js'

export * from './types.js'
export { CJAdapter, CJApiError, getCjStatus } from './cj-adapter.js'

const adapters: Record<string, SupplierAdapter> = {
  cj: new CJAdapter(),
}

export function getSupplier(name = 'cj'): SupplierAdapter {
  const adapter = adapters[name]
  if (!adapter) throw new Error(`Onbekende supplier "${name}" — beschikbaar: ${Object.keys(adapters).join(', ')}`)
  return adapter
}

export function listSuppliers(): Array<{ name: string; isMock: boolean }> {
  return Object.values(adapters).map(a => ({ name: a.name, isMock: a.isMock }))
}
