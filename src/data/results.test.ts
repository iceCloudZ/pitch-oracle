import { describe, expect, it, vi } from 'vitest'
import { fetchResults } from './results.js'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchResults', () => {
  it('maps completed events with numeric scores to RegularTimeResult[]', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/sports/wc/scores/')
      expect(url).toContain('daysFrom=3')
      expect(url).toContain('apiKey=k')
      return jsonResponse([
        {
          id: 7,
          sport_key: 'wc',
          commence_time: '2026-06-14T15:00:00Z',
          completed: true,
          home_team: 'Netherlands',
          away_team: 'Japan',
          scores: [
            { name: 'Netherlands', score: '2' },
            { name: 'Japan', score: '1' },
          ],
        },
      ])
    }) as unknown as typeof fetch

    const results = await fetchResults({ apiKey: 'k', sportKey: 'wc', fetchImpl })
    expect(results).toEqual([{ matchId: '7', homeScore: 2, awayScore: 1 }])
  })

  it('skips events that are not completed', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        {
          id: 8,
          sport_key: 'wc',
          commence_time: '2026-06-14T15:00:00Z',
          completed: false,
          home_team: 'A',
          away_team: 'B',
          scores: [
            { name: 'A', score: 0 },
            { name: 'B', score: 0 },
          ],
        },
      ]),
    ) as unknown as typeof fetch
    const results = await fetchResults({ apiKey: 'k', sportKey: 'wc', fetchImpl })
    expect(results).toEqual([])
  })

  it('handles numeric score values and skips events missing a side', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        {
          id: 9,
          sport_key: 'wc',
          commence_time: '2026-06-14T15:00:00Z',
          completed: true,
          home_team: 'A',
          away_team: 'B',
          scores: [
            { name: 'A', score: 3 }, // numeric
            // away side missing
          ],
        },
      ]),
    ) as unknown as typeof fetch
    const results = await fetchResults({ apiKey: 'k', sportKey: 'wc', fetchImpl })
    expect(results).toEqual([])
  })

  it('respects a custom daysFrom option', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('daysFrom=7')
      return jsonResponse([])
    }) as unknown as typeof fetch
    await fetchResults({ apiKey: 'k', sportKey: 'wc', daysFrom: 7, fetchImpl })
  })
})
