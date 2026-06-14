import { describe, expect, it } from 'vitest'
import { devig, impliedProb, impliedResultProbs } from './odds.js'

describe('impliedProb', () => {
  it('is 1/odds', () => expect(impliedProb(2.5)).toBeCloseTo(0.4))
  it('throws on odds <= 1', () => {
    expect(() => impliedProb(1)).toThrow()
    expect(() => impliedProb(0.9)).toThrow()
  })
})

describe('devig', () => {
  it('removes the overround', () => {
    const d = devig([0.4, 0.35, 0.3]) // raw sum 1.05
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
})

describe('impliedResultProbs', () => {
  it('derives normalized probs from three odds', () => {
    const r = impliedResultProbs(2.5, 3.3, 3.0)
    expect(r.home + r.draw + r.away).toBeCloseTo(1)
  })
})
