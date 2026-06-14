import { describe, expect, it } from 'vitest'
import { argmaxResult, resultOf, scorePrediction, topScore } from './scoring.js'
import type { Prediction, RegularTimeResult } from '../domain/types.js'

const pred = (
  resultProbs: Prediction['resultProbs'],
  scores: Prediction['scoreProbs'],
): Prediction => ({
  agentId: 'claude',
  matchId: 'm1',
  resultProbs,
  scoreProbs: scores,
  confidence: 0.6,
  reasoning: 'x',
  createdAt: 't',
})

describe('resultOf', () => {
  it('home win', () => expect(resultOf({ matchId: 'm1', homeScore: 2, awayScore: 1 })).toBe('home'))
  it('away win', () => expect(resultOf({ matchId: 'm1', homeScore: 0, awayScore: 3 })).toBe('away'))
  it('draw', () => expect(resultOf({ matchId: 'm1', homeScore: 1, awayScore: 1 })).toBe('draw'))
})

describe('argmaxResult', () => {
  it('picks the largest', () => {
    expect(argmaxResult({ home: 0.6, draw: 0.3, away: 0.1 })).toBe('home')
    expect(argmaxResult({ home: 0.1, draw: 0.3, away: 0.6 })).toBe('away')
    expect(argmaxResult({ home: 0.2, draw: 0.5, away: 0.3 })).toBe('draw')
  })
})

describe('topScore', () => {
  it('returns the highest-prob score', () => {
    const p = pred({ home: 0.6, draw: 0.3, away: 0.1 }, [
      { score: '1-0', prob: 0.1 },
      { score: '2-1', prob: 0.25 },
    ])
    expect(topScore(p)).toBe('2-1')
  })
  it('is null when empty', () => {
    expect(topScore(pred({ home: 0.6, draw: 0.3, away: 0.1 }, []))).toBeNull()
  })
})

describe('scorePrediction', () => {
  const actual = (h: number, a: number): RegularTimeResult => ({
    matchId: 'm1',
    homeScore: h,
    awayScore: a,
  })
  it('exact score -> 3', () => {
    const p = pred({ home: 0.6, draw: 0.3, away: 0.1 }, [{ score: '2-1', prob: 0.3 }])
    const s = scorePrediction(p, actual(2, 1))
    expect(s.points).toBe(3)
    expect(s.exactScore).toBe(true)
  })
  it('correct result, wrong score -> 1', () => {
    const p = pred({ home: 0.6, draw: 0.3, away: 0.1 }, [{ score: '3-0', prob: 0.3 }])
    const s = scorePrediction(p, actual(2, 1))
    expect(s.points).toBe(1)
    expect(s.correctResult).toBe(true)
    expect(s.exactScore).toBe(false)
  })
  it('wrong result -> 0', () => {
    const p = pred({ home: 0.6, draw: 0.3, away: 0.1 }, [{ score: '2-1', prob: 0.3 }])
    const s = scorePrediction(p, actual(0, 1))
    expect(s.points).toBe(0)
  })
})
