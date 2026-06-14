import { describe, expect, it } from 'vitest'
import { expectedValue, fractionalKelly, kellyFraction, recommendedStakePct } from './value.js'

describe('expectedValue', () => {
  it('is modelProb*odds - 1', () => {
    expect(expectedValue(0.5, 2.5)).toBeCloseTo(0.25)
    expect(expectedValue(0.3, 2.0)).toBeCloseTo(-0.4)
  })
})

describe('kellyFraction', () => {
  it('applies the full-kelly formula', () => {
    // (0.5*2.5 - 1)/(2.5 - 1) = 0.25/1.5 = 0.1667
    expect(kellyFraction(0.5, 2.5)).toBeCloseTo(0.1667, 3)
  })
  it('is negative with no edge', () => {
    expect(kellyFraction(0.3, 2.0)).toBeLessThan(0)
  })
})

describe('fractionalKelly', () => {
  it('scales by the fraction', () => {
    expect(fractionalKelly(0.4, 0.25)).toBeCloseTo(0.1)
  })
})

describe('recommendedStakePct', () => {
  it('is zero on negative edge', () => {
    expect(recommendedStakePct(-0.1)).toBe(0)
  })
  it('caps at maxPerBet', () => {
    expect(recommendedStakePct(0.5, 0.1)).toBe(0.1)
  })
  it('passes a small positive through', () => {
    expect(recommendedStakePct(0.04, 0.1)).toBeCloseTo(0.04)
  })
})
