import { describe, expect, it } from 'vitest'
import {
  buildHumanAugmentedUserPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from './prompt.js'
import type { MatchContext } from './types.js'
import type { MatchOdds } from '../domain/types.js'

const odds: MatchOdds = {
  matchId: 'm1',
  home: 2.0,
  draw: 3.5,
  away: 4.0,
  timestamp: 't',
}

function ctx(seeOdds: boolean): MatchContext {
  return {
    fixture: {
      id: 'm1',
      homeTeam: 'Netherlands',
      awayTeam: 'Japan',
      commenceTime: '2026-06-14T18:00:00Z',
      competition: 'WC',
      status: 'SCHEDULED',
    },
    news: [
      { title: 'Dutch form strong', url: 'u', description: 'won 4 in a row' },
    ],
    odds: seeOdds ? odds : undefined,
  }
}

describe('buildSystemPrompt', () => {
  it('is non-empty and pins the JSON shape', () => {
    const s = buildSystemPrompt()
    expect(s.length).toBeGreaterThan(50)
    expect(s).toContain('resultProbs')
    expect(s).toContain('scoreProbs')
    expect(s).toContain('confidence')
    expect(s).toContain('reasoning')
    // No odds in the system prompt.
    expect(/odds/i.test(s)).toBe(false)
  })
})

describe('buildUserPrompt', () => {
  it('includes team names and fixture metadata', () => {
    const u = buildUserPrompt(ctx(false), false)
    expect(u).toContain('Netherlands')
    expect(u).toContain('Japan')
    expect(u).toContain('WC')
  })

  it('excludes market odds when seeOdds=false', () => {
    const u = buildUserPrompt(ctx(false), false)
    expect(/decimal odds/i.test(u)).toBe(false)
    expect(u).not.toContain('market consensus')
  })

  it('includes market odds only when seeOdds=true', () => {
    const u = buildUserPrompt(ctx(true), true)
    expect(/decimal odds/i.test(u)).toBe(true)
    expect(u).toContain('market consensus')
    expect(u).toContain('2') // home price
  })

  it('includes a news title when present', () => {
    const u = buildUserPrompt(ctx(false), false)
    expect(u).toContain('Dutch form strong')
  })
})

describe('buildHumanAugmentedUserPrompt', () => {
  it('prepends analyst notes when present', () => {
    const u = buildHumanAugmentedUserPrompt(ctx(false), false, 'Star striker injured.')
    expect(u).toContain('Analyst notes:')
    expect(u).toContain('Star striker injured.')
    // Still contains the fixture block.
    expect(u).toContain('Netherlands')
  })

  it('degrades to the base prompt when notes are empty', () => {
    const u = buildHumanAugmentedUserPrompt(ctx(false), false, '   ')
    expect(u).not.toContain('Analyst notes:')
    expect(u).toContain('Netherlands')
  })
})
