import { describe, expect, it, vi } from 'vitest'
import { fetchOdds } from './odds.js'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function makeEvent(overrides: Partial<{
  id: number
  home_team: string
  away_team: string
  bookmakers: Array<{
    key: string
    title: string
    markets: Array<{ key: string; outcomes: Array<{ name: string; price: number }> }>
  }>
}> = {}) {
  return {
    id: overrides.id ?? 100,
    sport_key: 'soccer_uefa_champs_league',
    commence_time: '2026-06-14T15:00:00Z',
    home_team: overrides.home_team ?? 'Netherlands',
    away_team: overrides.away_team ?? 'Japan',
    bookmakers:
      overrides.bookmakers ??
      [
        {
          key: 'draftkings',
          title: 'DraftKings',
          markets: [
            {
              key: 'h2h',
              outcomes: [
                { name: 'Netherlands', price: 2.5 },
                { name: 'Draw', price: 3.3 },
                { name: 'Japan', price: 2.8 },
              ],
            },
          ],
        },
      ],
  }
}

describe('fetchOdds', () => {
  it('prefers Pinnacle over another bookmaker when both present', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/sports/wc/odds/')
      expect(url).toContain('markets=h2h')
      expect(url).toContain('oddsFormat=decimal')
      expect(url).toContain('apiKey=k1')
      return jsonResponse([
        {
          id: 1,
          sport_key: 'wc',
          commence_time: '2026-06-14T15:00:00Z',
          home_team: 'Netherlands',
          away_team: 'Japan',
          bookmakers: [
            {
              key: 'draftkings',
              title: 'DraftKings',
              markets: [
                {
                  key: 'h2h',
                  outcomes: [
                    { name: 'Netherlands', price: 2.0 },
                    { name: 'Draw', price: 3.0 },
                    { name: 'Japan', price: 4.0 },
                  ],
                },
              ],
            },
            {
              key: 'pinnacle',
              title: 'Pinnacle',
              markets: [
                {
                  key: 'h2h',
                  outcomes: [
                    { name: 'Netherlands', price: 2.5 },
                    { name: 'Draw', price: 3.3 },
                    { name: 'Japan', price: 2.8 },
                  ],
                },
              ],
            },
          ],
        },
      ])
    }) as unknown as typeof fetch

    const odds = await fetchOdds({ apiKey: 'k1', sportKey: 'wc', fetchImpl })
    expect(odds).toEqual([
      {
        matchId: '1',
        home: 2.5, // Pinnacle prices
        draw: 3.3,
        away: 2.8,
        timestamp: '2026-06-14T15:00:00Z',
      },
    ])
  })

  it('falls back to bookmakers[0] when Pinnacle absent', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([makeEvent()])) as unknown as typeof fetch
    const odds = await fetchOdds({ apiKey: 'k1', sportKey: 'wc', fetchImpl })
    expect(odds).toHaveLength(1)
    expect(odds[0]).toMatchObject({ home: 2.5, draw: 3.3, away: 2.8 })
  })

  it('skips events that lack a draw outcome instead of crashing', async () => {
    const noDraw = makeEvent({
      id: 5,
      bookmakers: [
        {
          key: 'pinnacle',
          title: 'Pinnacle',
          markets: [
            {
              key: 'h2h',
              outcomes: [
                { name: 'Netherlands', price: 2.5 },
                { name: 'Japan', price: 2.8 },
                // no Draw
              ],
            },
          ],
        },
      ],
    })
    const fetchImpl = vi.fn(async () => jsonResponse([noDraw])) as unknown as typeof fetch
    const odds = await fetchOdds({ apiKey: 'k1', sportKey: 'wc', fetchImpl })
    expect(odds).toEqual([])
  })

  it('skips events whose bookmaker has no h2h market', async () => {
    const ev = makeEvent({
      id: 6,
      bookmakers: [
        {
          key: 'pinnacle',
          title: 'Pinnacle',
          markets: [{ key: 'spreads', outcomes: [] }],
        },
      ],
    })
    const fetchImpl = vi.fn(async () => jsonResponse([ev])) as unknown as typeof fetch
    const odds = await fetchOdds({ apiKey: 'k1', sportKey: 'wc', fetchImpl })
    expect(odds).toEqual([])
  })

  it('defaults region to eu when not provided', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('regions=eu')
      return jsonResponse([])
    }) as unknown as typeof fetch
    await fetchOdds({ apiKey: 'k1', sportKey: 'wc', fetchImpl })
  })
})
