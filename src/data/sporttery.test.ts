import { describe, expect, it, vi } from 'vitest'
import {
  fetchSportteryFixtures,
  fetchSportteryMatches,
  fetchSportteryOdds,
} from './sporttery.js'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Build a minimal calculator response with two business-date groups. */
function makeResponse() {
  return {
    errorCode: 0,
    errorMessage: '处理成功',
    value: {
      lastUpdateTime: '2026-06-14 22:47:27',
      matchInfoList: [
        {
          businessDate: '2026-06-14',
          matchCount: 2,
          subMatchList: [
            {
              matchId: 2040171,
              matchNumStr: '周日010',
              matchDate: '2026-06-15',
              matchTime: '01:00:00',
              matchStatus: 'SCHEDULED',
              homeTeamAbbName: '荷兰',
              homeTeamAllName: '荷兰',
              awayTeamAbbName: '日本',
              awayTeamAllName: '日本',
              leagueAbbName: '世界杯',
              had: { h: '1.86', d: '3.33', a: '3.43' },
            },
            {
              matchId: 2040172,
              matchNumStr: '周日011',
              matchDate: '2026-06-15',
              matchTime: '04:00:00',
              matchStatus: 'SCHEDULED',
              homeTeamAbbName: '科特迪瓦',
              homeTeamAllName: '科特迪瓦',
              awayTeamAbbName: '厄瓜多尔',
              awayTeamAllName: '厄瓜多尔',
              leagueAbbName: '世界杯',
              had: {}, // no 胜平负 market on sale for this match
            },
          ],
        },
        {
          businessDate: '2026-06-15',
          matchCount: 1,
          subMatchList: [
            {
              matchId: 2040200,
              matchNumStr: '周一014',
              matchDate: '2026-06-16',
              matchTime: '19:00:00',
              matchStatus: 'SCHEDULED',
              homeTeamAbbName: '比利时',
              homeTeamAllName: '比利时',
              awayTeamAbbName: '埃及',
              awayTeamAllName: '埃及',
              leagueAbbName: '世界杯',
              had: { h: '1.43', d: '3.84', a: '5.90' },
            },
          ],
        },
      ],
    },
  }
}

describe('fetchSportteryMatches', () => {
  it('flattens business-date groups into a single match list', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('getMatchCalculatorV1.qry')
      expect(url).toContain('channel=c_web')
      expect(url).toContain('poolCode=had')
      return jsonResponse(makeResponse())
    }) as unknown as typeof fetch

    const matches = await fetchSportteryMatches({ fetchImpl })
    expect(matches).toHaveLength(3)
    expect(matches.map((m) => m.matchId)).toEqual(['2040171', '2040172', '2040200'])
    // lastUpdateTime from the payload is propagated.
    expect(matches[0].lastUpdateTime).toBe('2026-06-14 22:47:27')
  })

  it('returns [] when errorCode is non-zero', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ errorCode: 1, errorMessage: 'failed', value: {} }),
    ) as unknown as typeof fetch
    const matches = await fetchSportteryMatches({ fetchImpl })
    expect(matches).toEqual([])
  })

  it('accepts errorCode as the live-API string "0" and returns matches', async () => {
    // The real sporttery API returns errorCode as a STRING; guard against
    // regressing to a numeric-only check.
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        errorCode: '0',
        errorMessage: '处理成功',
        success: true,
        value: {
          lastUpdateTime: '2026-06-14 22:47:27',
          matchInfoList: [
            {
              businessDate: '2026-06-14',
              subMatchList: [
                {
                  matchId: 2040171,
                  matchNumStr: '周日010',
                  matchDate: '2026-06-15',
                  matchTime: '01:00:00',
                  matchStatus: 'SCHEDULED',
                  homeTeamAbbName: '荷兰',
                  homeTeamAllName: '荷兰',
                  awayTeamAbbName: '日本',
                  awayTeamAllName: '日本',
                  leagueAbbName: '世界杯',
                  had: { h: '1.86', d: '3.33', a: '3.43' },
                },
              ],
            },
          ],
        },
      }),
    ) as unknown as typeof fetch
    const matches = await fetchSportteryMatches({ fetchImpl })
    expect(matches).toHaveLength(1)
    expect(matches[0].matchId).toBe('2040171')
  })

  it('returns [] when value.matchInfoList is absent', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ errorCode: 0, value: {} }),
    ) as unknown as typeof fetch
    expect(await fetchSportteryMatches({ fetchImpl })).toEqual([])
  })
})

describe('fetchSportteryFixtures', () => {
  it('projects matches into Fixture[] with sporttery matchId and matchNum', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(makeResponse()),
    ) as unknown as typeof fetch
    const fixtures = await fetchSportteryFixtures({ fetchImpl })
    expect(fixtures).toHaveLength(3)
    expect(fixtures[0]).toMatchObject({
      id: '2040171',
      homeTeam: '荷兰',
      awayTeam: '日本',
      matchNum: '周日010',
      competition: '世界杯',
      status: 'SCHEDULED',
    })
    // Beijing-time ISO encoding.
    expect(fixtures[0].commenceTime).toBe('2026-06-15T01:00:00+08:00')
  })
})

describe('fetchSportteryOdds', () => {
  it('projects matches with had prices into MatchOdds[] and skips empty had', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(makeResponse()),
    ) as unknown as typeof fetch
    const odds = await fetchSportteryOdds({ fetchImpl })
    // The match with had={} (科特迪瓦) is skipped; the other two survive.
    expect(odds).toHaveLength(2)
    expect(odds[0]).toEqual({
      matchId: '2040171',
      home: 1.86,
      draw: 3.33,
      away: 3.43,
      timestamp: '2026-06-14 22:47:27',
    })
    expect(odds[1].matchId).toBe('2040200')
  })

  it('guarantees fixtures and odds share identical matchIds for priced matches', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(makeResponse()),
    ) as unknown as typeof fetch
    const fixtures = await fetchSportteryFixtures({ fetchImpl })
    const odds = await fetchSportteryOdds({ fetchImpl })
    // Every odds matchId must appear in fixtures (the reverse is not required:
    // fixtures include matches with no had market).
    for (const o of odds) {
      expect(fixtures.some((f) => f.id === o.matchId)).toBe(true)
    }
  })
})
