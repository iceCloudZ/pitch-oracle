import type { ResultProbs } from '../domain/types.js'

export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x))
}

export function normalizeProbs(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0)
  if (sum <= 0) throw new Error('normalizeProbs: sum must be positive')
  return probs.map((p) => p / sum)
}

export function normalizeResultProbs(rp: ResultProbs): ResultProbs {
  const [home, draw, away] = normalizeProbs([rp.home, rp.draw, rp.away])
  return { home, draw, away }
}

/** Clamp each prob into [eps, 1-eps], then renormalize — prevents Kelly blowups at 0/1. */
export function smoothProbs(probs: number[], eps = 0.01): number[] {
  const clamped = probs.map((p) => clamp(p, eps, 1 - eps))
  return normalizeProbs(clamped)
}
