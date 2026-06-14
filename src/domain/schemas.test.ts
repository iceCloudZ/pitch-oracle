import { describe, expect, it } from 'vitest'
import { matchOddsSchema, predictionSchema, scoreSchema } from './schemas.js'

const validPrediction = {
  agentId: 'claude',
  matchId: 'm1',
  resultProbs: { home: 0.5, draw: 0.3, away: 0.2 },
  scoreProbs: [{ score: '2-1', prob: 0.18 }],
  confidence: 0.6,
  reasoning: 'x',
  createdAt: '2026-06-14T00:00:00Z',
}

describe('scoreSchema', () => {
  it('accepts "2-1"', () => expect(scoreSchema.safeParse('2-1').success).toBe(true))
  it('rejects "2:1"', () => expect(scoreSchema.safeParse('2:1').success).toBe(false))
  it('rejects prose', () => expect(scoreSchema.safeParse('home win').success).toBe(false))
})

describe('predictionSchema', () => {
  it('parses a valid prediction', () => {
    expect(predictionSchema.safeParse(validPrediction).success).toBe(true)
  })
  it('rejects more than 5 scoreProbs', () => {
    const six = {
      ...validPrediction,
      scoreProbs: Array.from({ length: 6 }, (_, i) => ({ score: `${i}-${i}`, prob: 0.1 })),
    }
    expect(predictionSchema.safeParse(six).success).toBe(false)
  })
  it('rejects bad score format', () => {
    const bad = { ...validPrediction, scoreProbs: [{ score: '2:1', prob: 0.2 }] }
    expect(predictionSchema.safeParse(bad).success).toBe(false)
  })
})

describe('matchOddsSchema', () => {
  it('rejects odds <= 1', () => {
    expect(
      matchOddsSchema.safeParse({ matchId: 'm1', home: 0.9, draw: 3, away: 3, timestamp: 't' })
        .success,
    ).toBe(false)
  })
})
