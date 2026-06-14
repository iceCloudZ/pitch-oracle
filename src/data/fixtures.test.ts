import { describe, expect, it, vi } from 'vitest'
import { fetchFixtures } from './fixtures.js'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchFixtures', () => {
  it('normalizes a football-data.org v4 response into Fixture[]', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      // Assert URL carries the competition path and status filter.
      expect(url).toContain('/competitions/WC/matches')
      expect(url).toContain('status=SCHEDULED%2CIN_PLAY%2CFINISHED')
      expect(init?.headers).toEqual({ 'X-Auth-Token': 'tok' })
      return jsonResponse({
        matches: [
          {
            id: 1,
            utcDate: '2026-06-14T00:00:00Z',
            status: 'SCHEDULED',
            homeTeam: { name: 'Netherlands' },
            awayTeam: { name: 'Japan' },
          },
        ],
      })
    }) as unknown as typeof fetch

    const fixtures = await fetchFixtures({
      apiKey: 'tok',
      competition: 'WC',
      fetchImpl,
    })

    expect(fixtures).toEqual([
      {
        id: '1',
        homeTeam: 'Netherlands',
        awayTeam: 'Japan',
        commenceTime: '2026-06-14T00:00:00Z',
        competition: 'WC',
        status: 'SCHEDULED',
      },
    ])
  })

  it('drops matches missing team objects', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        matches: [
          {
            id: 2,
            utcDate: '2026-06-14T00:00:00Z',
            status: 'SCHEDULED',
            homeTeam: null,
            awayTeam: { name: 'Japan' },
          },
          {
            id: 3,
            utcDate: '2026-06-15T00:00:00Z',
            status: 'FINISHED',
            homeTeam: { name: 'A' },
            awayTeam: { name: 'B' },
          },
        ],
      }),
    ) as unknown as typeof fetch

    const fixtures = await fetchFixtures({
      apiKey: 'tok',
      competition: 'WC',
      fetchImpl,
    })
    expect(fixtures.map((f) => f.id)).toEqual(['3'])
  })

  it('returns [] when matches is empty', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ matches: [] })) as unknown as typeof fetch
    const fixtures = await fetchFixtures({
      apiKey: 'tok',
      competition: 'WC',
      fetchImpl,
    })
    expect(fixtures).toEqual([])
  })
})
