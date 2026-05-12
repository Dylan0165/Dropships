import { describe, it, expect } from 'vitest'
import { ALL_AGENT_IDS, AGENT_CONFIGS, PIPELINE_EDGES } from './pipeline.js'

describe('pipeline constants (legacy)', () => {
  it('has agent configs', () => {
    expect(AGENT_CONFIGS.length).toBeGreaterThan(0)
  })

  it('all agent IDs match configs', () => {
    for (const config of AGENT_CONFIGS) {
      expect(ALL_AGENT_IDS).toContain(config.id)
    }
  })

  it('all edge endpoints are valid agent IDs', () => {
    for (const edge of PIPELINE_EDGES) {
      expect(ALL_AGENT_IDS).toContain(edge.source)
      expect(ALL_AGENT_IDS).toContain(edge.target)
    }
  })

  it('has unique positions', () => {
    const positions = AGENT_CONFIGS.map(c => `${c.position.x},${c.position.y}`)
    expect(new Set(positions).size).toBe(positions.length)
  })
})
