import { describe, it, expect } from 'vitest'
import { ALL_AGENT_IDS, AGENT_CONFIGS, PIPELINE_EDGES } from './pipeline.js'

describe('pipeline constants', () => {
  it('should have 11 agent configs', () => {
    expect(AGENT_CONFIGS).toHaveLength(11)
  })

  it('should have all agent IDs match configs', () => {
    expect(ALL_AGENT_IDS).toHaveLength(11)
    for (const config of AGENT_CONFIGS) {
      expect(ALL_AGENT_IDS).toContain(config.id)
    }
  })

  it('should have correct pipeline edges', () => {
    expect(PIPELINE_EDGES.length).toBe(10)
    // All edge sources and targets should reference valid agent IDs
    for (const edge of PIPELINE_EDGES) {
      expect(ALL_AGENT_IDS).toContain(edge.source)
      expect(ALL_AGENT_IDS).toContain(edge.target)
    }
  })

  it('should have 6 agents using deepseek-v4-pro', () => {
    const reasoners = AGENT_CONFIGS.filter(c => c.model === 'deepseek-v4-pro')
    expect(reasoners.length).toBe(6) // niche-reviewer, product-reviewer, store-reviewer, ads-reviewer, growth-agent, security-agent
  })

  it('should have unique positions for all agents', () => {
    const positions = AGENT_CONFIGS.map(c => `${c.position.x},${c.position.y}`)
    const unique = new Set(positions)
    expect(unique.size).toBe(positions.length)
  })
})
