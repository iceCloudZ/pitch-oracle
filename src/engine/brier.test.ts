import { describe, expect, it } from 'vitest'
import { brierScore } from './brier.js'

describe('brierScore', () => {
  it('is 0 for a perfect confident call', () => {
    expect(brierScore({ home: 1, draw: 0, away: 0 }, 'home')).toBeCloseTo(0)
  })
  it('is 2 for a perfectly wrong confident call', () => {
    expect(brierScore({ home: 1, draw: 0, away: 0 }, 'away')).toBeCloseTo(2)
  })
  it('matches the manual sum of squared errors', () => {
    // home .5, draw .3, away .2; actual away -> .5^2 + .3^2 + .8^2 = .98
    expect(brierScore({ home: 0.5, draw: 0.3, away: 0.2 }, 'away')).toBeCloseTo(0.98)
  })
})
