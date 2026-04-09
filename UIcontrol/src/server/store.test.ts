import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the db module before importing store
vi.mock('./db.js', () => {
  const rows = new Map()
  const mockDb = {
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn((sql: string) => {
      if (sql.includes('INSERT INTO runs')) {
        return {
          run: vi.fn((...args: string[]) => {
            rows.set(args[0], { run_id: args[0], niche: args[1], status: args[2], data: args[3], started_at: args[4], completed_at: null, updated_at: args[5] })
          }),
        }
      }
      if (sql.includes('SELECT * FROM runs WHERE run_id')) {
        return {
          get: vi.fn((id: string) => rows.get(id)),
        }
      }
      if (sql.includes('SELECT * FROM runs ORDER')) {
        return {
          all: vi.fn(() => [...rows.values()]),
        }
      }
      if (sql.includes('SELECT * FROM stores WHERE run_id')) {
        return {
          all: vi.fn(() => []),
        }
      }
      return {
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => []),
      }
    }),
  }
  return { default: mockDb }
})

const store = await import('./store.js')

describe('store', () => {
  it('should create a run with all 11 agents', () => {
    const run = store.createRun('test-001', 'yoga mats')
    expect(run.runId).toBe('test-001')
    expect(run.niche).toBe('yoga mats')
    expect(run.status).toBe('running')
    expect(Object.keys(run.agents)).toHaveLength(11)
    expect(run.totalTokens).toBe(0)
    expect(run.totalCostEur).toBe(0)
  })

  it('should initialize all agents as idle', () => {
    const run = store.createRun('test-002', 'kitchen gadgets')
    for (const agent of Object.values(run.agents)) {
      expect(agent.status).toBe('idle')
      expect(agent.attempt).toBe(0)
      expect(agent.logs).toEqual([])
      expect(agent.escalation).toBeNull()
    }
  })

  it('createEmptyAgentRuns should cover all agent IDs', () => {
    const agents = store.createEmptyAgentRuns()
    const ids = Object.keys(agents)
    expect(ids).toContain('trend-agent')
    expect(ids).toContain('niche-reviewer')
    expect(ids).toContain('product-agent')
    expect(ids).toContain('product-reviewer')
    expect(ids).toContain('brand-agent')
    expect(ids).toContain('store-builder')
    expect(ids).toContain('store-reviewer')
    expect(ids).toContain('ads-agent')
    expect(ids).toContain('ads-reviewer')
    expect(ids).toContain('growth-agent')
    expect(ids).toContain('security-agent')
  })
})
