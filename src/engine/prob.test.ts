import { describe, expect, it } from 'vitest'
import { clamp, normalizeProbs, normalizeResultProbs, smoothProbs } from './prob.js'

describe('clamp', () => {
  it('clamps to range', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-3, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})

describe('normalizeProbs', () => {
  it('scales to sum 1', () => {
    const n = normalizeProbs([2, 3, 5])
    expect(n[0]).toBeCloseTo(0.2)
    expect(n.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
  it('throws on non-positive sum', () => {
    expect(() => normalizeProbs([0, 0, 0])).toThrow()
  })
})

describe('normalizeResultProbs', () => {
  it('normalizes home/draw/away', () => {
    const r = normalizeResultProbs({ home: 2, draw: 2, away: 1 })
    expect(r.home + r.draw + r.away).toBeCloseTo(1)
    expect(r.away).toBeCloseTo(0.2)
  })
})

describe('smoothProbs', () => {
  it('clamps extremes then renormalizes', () => {
    const s = smoothProbs([0.999, 0.0005, 0.0005], 0.01)
    expect(s[0]).toBeLessThan(0.999)
    expect(s.every((p) => p >= 0 && p <= 1)).toBe(true)
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
  it('pulls a zero off the floor', () => {
    const s = smoothProbs([0, 0.5, 0.5], 0.01)
    expect(s[0]).toBeGreaterThan(0)
  })
})
