// ═══════ Component-registry + catalogus ═══════
// Verzamelt alle component-definities en levert (a) de LLM-facing catalogus
// (metadata, GEEN broncode) en (b) lookup per id voor de assembler.

import type { ComponentDef, CatalogEntry, ComponentCategory } from './types.js'
import heroDefs from './heroes.js'
import productDefs from './products.js'
import sectionDefs from './sections.js'
import chromeDefs from './chrome.js'

const ALL: ComponentDef[] = [...heroDefs, ...productDefs, ...sectionDefs, ...chromeDefs]

const BY_ID = new Map(ALL.map(d => [d.id, d]))

export function getComponent(id: string): ComponentDef | undefined {
  return BY_ID.get(id)
}

export function allComponents(): ComponentDef[] {
  return ALL
}

/** LLM-facing catalogus zonder render-broncode. */
export function buildCatalog(): CatalogEntry[] {
  return ALL.map(({ render, ...meta }) => { void render; return meta })
}

/** Compacte, per-categorie gegroepeerde catalogus (voor in de LLM-prompt). */
export function catalogForPrompt(): Record<ComponentCategory, Array<{ id: string; label: string; styles: string[]; tags: string[]; props: string[] }>> {
  const out = {} as Record<ComponentCategory, Array<{ id: string; label: string; styles: string[]; tags: string[]; props: string[] }>>
  for (const d of ALL) {
    ;(out[d.category] ??= []).push({ id: d.id, label: d.label, styles: d.styles, tags: d.tags, props: Object.keys(d.props) })
  }
  return out
}

export function catalogStats(): { total: number; byCategory: Record<string, number> } {
  const byCategory: Record<string, number> = {}
  for (const d of ALL) byCategory[d.category] = (byCategory[d.category] ?? 0) + 1
  return { total: ALL.length, byCategory }
}
