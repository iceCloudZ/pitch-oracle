import { describe, expect, it, vi } from 'vitest'
import { fetchFixturesResults } from './fixtures-results.js'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchFixturesResults', () => {
  it('returns FINISHED matches with a fullTime score, keyed by fd matchId', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('/competitions/WC/matches')
      expect(url).toContain('status=FINISHED')
      expect(init?.headers).toEqual({ 'X-Auth-Token': 'tok' })
      return jsonResponse({
        matches: [
          { id: 537357, status: 'FINISHED', score: { fullTime: { home: 2, away: 1 } } },
          { id: 537358, status: 'FINISHED', score: { fullTime: { home: 0, away: 0 } } },
        ],
      })
    }) as unknown as typeof fetch

    const results = await fetchFixturesResults({
      apiKey: 'tok',
      competition: 'WC',
      fetchImpl,
    })
    expect(results).toEqual([
      { matchId: '537357', homeScore: 2, awayScore: 1 },
      { matchId: '537358', homeScore: 0, awayScore: 0 },
    ])
  })

  it('skips matches whose fullTime score is missing or partial', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        matches: [
          // no score object at all
          { id: 1, status: 'FINISHED' },
          // fullTime present but only home set
          { id: 2, status: 'FINISHED', score: { fullTime: { home: 2 } } },
          // fullTime present but away null
          { id: 3, status: 'FINISHED', score: { fullTime: { home: 2, away: null } } },
          // good
          { id: 4, status: 'FINISHED', score: { fullTime: { home: 3, away: 3 } } },
        ],
      }),
    ) as unknown as typeof fetch

    const results = await fetchFixturesResults({
      apiKey: 'tok',
      competition: 'WC',
      fetchImpl,
    })
    expect(results.map((r) => r.matchId)).toEqual(['4'])
  })

  it('returns [] when matches is empty or absent', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ matches: [] })) as unknown as typeof fetch
    expect(
      await fetchFixturesResults({ apiKey: 'tok', competition: 'WC', fetchImpl }),
    ).toEqual([])

    const fetchImpl2 = vi.fn(async () => jsonResponse({})) as unknown as typeof fetch
    expect(
      await fetchFixturesResults({ apiKey: 'tok', competition: 'WC', fetchImpl: fetchImpl2 }),
    ).toEqual([])
  })
})
