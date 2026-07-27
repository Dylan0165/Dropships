import { catalogStats } from './components/registry.js'
const s = catalogStats()
console.log('TOTAAL:', s.total)
for (const [k, v] of Object.entries(s.byCategory).sort()) console.log('  ' + k.padEnd(14) + v)
