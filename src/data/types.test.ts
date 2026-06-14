import { describe, expect, it } from 'vitest'
import type { AdapterOptions, Fixture, NewsItem } from './types.js'

describe('data types', () => {
  it('Fixture shape is assignable and round-trips', () => {
    const f: Fixture = {
      id: '1',
      homeTeam: 'Netherlands',
      awayTeam: 'Japan',
      commenceTime: '2026-06-14T00:00:00Z',
      competition: 'WC',
      status: 'SCHEDULED',
    }
    expect(f.id).toBe('1')
    expect(f.status).toBe('SCHEDULED')
  })

  it('NewsItem shape is assignable', () => {
    const n: NewsItem = {
      title: 't',
      url: 'https://example.com',
      description: 'd',
    }
    expect(n.url).toMatch(/^https:/)
  })

  it('AdapterOptions accepts an optional fetchImpl', () => {
    const opts: AdapterOptions = { apiKey: 'k' }
    expect(opts.fetchImpl).toBeUndefined()
  })
})
