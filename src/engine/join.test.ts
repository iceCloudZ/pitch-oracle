import { describe, expect, it } from 'vitest'
import { joinResultsToFixtures } from './join.js'
import type { Fixture } from '../data/types.js'
import type { RegularTimeResult } from '../domain/types.js'

function fixture(id: string, home: string, away: string): Fixture {
  return {
    id,
    homeTeam: home,
    awayTeam: away,
    commenceTime: '2026-06-15T00:00:00+08:00',
    competition: '世界杯',
    status: 'SCHEDULED',
    matchNum: id,
  }
}

describe('joinResultsToFixtures', () => {
  it('re-maps a football-data result onto a sporttery matchId by team names', () => {
    const fixtures = [fixture('2040171', '荷兰', '日本')]
    const results: RegularTimeResult[] = [
      { matchId: '537357', homeScore: 2, awayScore: 1 },
    ]
    const resultTeams: Record<string, [string, string]> = {
      '537357': ['Netherlands', 'Japan'],
    }
    const out = joinResultsToFixtures({ fixtures, resultTeams, results })
    expect(out.results).toEqual([{ matchId: '2040171', homeScore: 2, awayScore: 1 }])
    expect(out.warnings).toEqual([])
  })

  it('joins via Chinese aliases (科特迪瓦 === Ivory Coast)', () => {
    const fixtures = [fixture('2040172', '科特迪瓦', '厄瓜多尔')]
    const results: RegularTimeResult[] = [
      { matchId: '537352', homeScore: 1, awayScore: 1 },
    ]
    const resultTeams: Record<string, [string, string]> = {
      '537352': ['Ivory Coast', 'Ecuador'],
    }
    const out = joinResultsToFixtures({ fixtures, resultTeams, results })
    expect(out.results).toEqual([{ matchId: '2040172', homeScore: 1, awayScore: 1 }])
    expect(out.warnings).toEqual([])
  })

  it('falls back to unordered orientation when home/away are swapped', () => {
    const fixtures = [fixture('2040171', '荷兰', '日本')]
    const results: RegularTimeResult[] = [
      { matchId: '537357', homeScore: 0, awayScore: 2 },
    ]
    // football-data lists Japan as home for the same fixture.
    const resultTeams: Record<string, [string, string]> = {
      '537357': ['Japan', 'Netherlands'],
    }
    const out = joinResultsToFixtures({ fixtures, resultTeams, results })
    expect(out.results).toHaveLength(1)
    expect(out.results[0].matchId).toBe('2040171')
    expect(out.warnings.some((w) => w.includes('swapped'))).toBe(true)
  })

  it('skips and warns when a team name cannot be mapped', () => {
    const fixtures = [fixture('2040171', '荷兰', '日本')]
    const results: RegularTimeResult[] = [
      { matchId: '999', homeScore: 1, awayScore: 0 },
    ]
    const resultTeams: Record<string, [string, string]> = {
      '999': ['Atlantis', 'Mars'],
    }
    const out = joinResultsToFixtures({ fixtures, resultTeams, results })
    expect(out.results).toEqual([])
    expect(out.warnings.some((w) => w.includes('unmapped'))).toBe(true)
  })

  it('skips and warns when no fixture exists for the matched teams', () => {
    const fixtures = [fixture('2040171', '荷兰', '日本')]
    const results: RegularTimeResult[] = [
      { matchId: '537400', homeScore: 1, awayScore: 0 },
    ]
    const resultTeams: Record<string, [string, string]> = {
      '537400': ['Brazil', 'Germany'],
    }
    const out = joinResultsToFixtures({ fixtures, resultTeams, results })
    expect(out.results).toEqual([])
    expect(out.warnings.some((w) => w.includes('no fixture'))).toBe(true)
  })

  it('skips and warns when resultTeams lacks an entry for a result id', () => {
    const fixtures = [fixture('2040171', '荷兰', '日本')]
    const results: RegularTimeResult[] = [
      { matchId: '537357', homeScore: 2, awayScore: 1 },
    ]
    const out = joinResultsToFixtures({ fixtures, resultTeams: {}, results })
    expect(out.results).toEqual([])
    expect(out.warnings.some((w) => w.includes('no team names'))).toBe(true)
  })

  it('handles multiple results joining independently', () => {
    const fixtures = [
      fixture('2040171', '荷兰', '日本'),
      fixture('2040172', '科特迪瓦', '厄瓜多尔'),
      fixture('2040200', '比利时', '埃及'),
    ]
    const results: RegularTimeResult[] = [
      { matchId: '537357', homeScore: 2, awayScore: 1 },
      { matchId: '537352', homeScore: 0, awayScore: 0 },
      { matchId: '537363', homeScore: 3, awayScore: 2 },
    ]
    const resultTeams: Record<string, [string, string]> = {
      '537357': ['Netherlands', 'Japan'],
      '537352': ['Ivory Coast', 'Ecuador'],
      '537363': ['Belgium', 'Egypt'],
    }
    const out = joinResultsToFixtures({ fixtures, resultTeams, results })
    expect(out.results.map((r) => r.matchId).sort()).toEqual([
      '2040171',
      '2040172',
      '2040200',
    ])
    expect(out.warnings).toEqual([])
  })
})
