/**
 * Cross-provider integration: proves the sporttery matchId flows end-to-end.
 *
 *   sporttery fixtures (matchId 2040171) + odds
 *     -> a manual-style prediction keyed by 2040171
 *     -> football-data result keyed by 537357 (Netherlands vs Japan, 2-1)
 *     -> joinResultsToFixtures rewrites the result to matchId 2040171
 *     -> scorePrediction settles, aggregateAccuracy reports points
 *
 * If the join dropped or mis-keyed the match, the accuracy row would be empty.
 */
import { describe, expect, it } from 'vitest'
import { fetchSportteryFixtures, fetchSportteryOdds } from '../data/sporttery.js'
import { joinResultsToFixtures } from './join.js'
import { computeBets } from './bets.js'
import { resultOf, scorePrediction } from './scoring.js'
import { settleBet } from './settlement.js'
import { aggregateAccuracy, aggregateBetting } from './leaderboard.js'
import type { ResultWithTeams } from '../data/fixtures-results.js'
import type { Fixture } from '../data/types.js'
import type { Prediction, RegularTimeResult } from '../domain/types.js'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Canned sporttery payload: one match, 荷兰 vs 日本, with had odds. */
const sportteryPayload = {
  errorCode: 0,
  errorMessage: '处理成功',
  value: {
    lastUpdateTime: '2026-06-14 22:47:27',
    matchInfoList: [
      {
        businessDate: '2026-06-14',
        matchCount: 1,
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
}

describe('sporttery integration: matchId flows predict -> score', () => {
  it('settles a sporttery-keyed prediction against a football-data result via team join', async () => {
    const fetchImpl = (() =>
      Promise.resolve(jsonResponse(sportteryPayload))) as unknown as typeof fetch

    // 1) sporttery fixtures + odds share matchId 2040171.
    const fixtures: Fixture[] = await fetchSportteryFixtures({ fetchImpl })
    const odds = await fetchSportteryOdds({ fetchImpl })
    expect(fixtures.map((f) => f.id)).toEqual(['2040171'])
    expect(odds.map((o) => o.matchId)).toEqual(['2040171'])
    expect(fixtures[0].matchNum).toBe('周日010')

    // 2) A prediction is keyed by the sporttery matchId.
    const pred: Prediction = {
      agentId: 'me',
      matchId: '2040171',
      resultProbs: { home: 0.55, draw: 0.3, away: 0.15 },
      scoreProbs: [{ score: '2-1', prob: 0.25 }],
      confidence: 0.7,
      reasoning: '荷兰主场',
      createdAt: '2026-06-14T23:00:00Z',
    }

    // 3) football-data returns the same fixture under id 537357 with English
    //    team names; it has settled 2-1.
    const fdRows: ResultWithTeams[] = [
      {
        matchId: '537357',
        homeScore: 2,
        awayScore: 1,
        homeTeam: 'Netherlands',
        awayTeam: 'Japan',
      },
    ]
    const resultTeams: Record<string, [string, string]> = {}
    for (const r of fdRows) resultTeams[r.matchId] = [r.homeTeam, r.awayTeam]

    // 4) Join rewrites the result onto the sporttery matchId.
    const { results, warnings } = joinResultsToFixtures({
      fixtures,
      resultTeams,
      results: fdRows as RegularTimeResult[],
    })
    expect(warnings).toEqual([])
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      matchId: '2040171',
      homeScore: 2,
      awayScore: 1,
    })

    // 5) Settle: the prediction now lines up with the joined result.
    const actual = results[0]
    const bets = computeBets(pred, odds[0])
    expect(bets.length).toBeGreaterThan(0)

    const settlements = bets.map((b) => settleBet(b, resultOf(actual), 1000))
    const betting = aggregateBetting(settlements)
    expect(betting[0].agentId).toBe('me')

    const accuracy = aggregateAccuracy([
      { agentId: 'me', score: scorePrediction(pred, actual) },
    ])
    // Top scoreline 2-1 matches the actual 2-1 -> exactScore -> 3 points.
    expect(accuracy[0].agentId).toBe('me')
    expect(accuracy[0].totalPoints).toBe(3)
    expect(accuracy[0].exactScores).toBe(1)
  })

  it('drops a result whose team cannot be joined (no fixture) without affecting others', async () => {
    const fetchImpl = (() =>
      Promise.resolve(jsonResponse(sportteryPayload))) as unknown as typeof fetch
    const fixtures = await fetchSportteryFixtures({ fetchImpl })

    const fdRows: ResultWithTeams[] = [
      { matchId: '537357', homeScore: 2, awayScore: 1, homeTeam: 'Netherlands', awayTeam: 'Japan' },
      // Unrelated match — no matching fixture.
      { matchId: '999999', homeScore: 0, awayScore: 0, homeTeam: 'Brazil', awayTeam: 'Germany' },
    ]
    const resultTeams: Record<string, [string, string]> = {}
    for (const r of fdRows) resultTeams[r.matchId] = [r.homeTeam, r.awayTeam]

    const { results, warnings } = joinResultsToFixtures({
      fixtures,
      resultTeams,
      results: fdRows as RegularTimeResult[],
    })
    expect(results).toHaveLength(1)
    expect(results[0].matchId).toBe('2040171')
    expect(warnings.some((w) => w.includes('no fixture'))).toBe(true)
  })
})
