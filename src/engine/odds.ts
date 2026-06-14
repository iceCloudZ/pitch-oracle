import type { ResultProbs } from '../domain/types.js'
import { normalizeResultProbs } from './prob.js'

export function impliedProb(decimalOdds: number): number {
  if (decimalOdds <= 1) throw new Error('impliedProb: decimalOdds must be > 1')
  return 1 / decimalOdds
}

export function devig(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0)
  if (sum <= 0) throw new Error('devig: sum must be positive')
  return probs.map((p) => p / sum)
}

export function impliedResultProbs(
  homeOdds: number,
  drawOdds: number,
  awayOdds: number,
): ResultProbs {
  return normalizeResultProbs({
    home: impliedProb(homeOdds),
    draw: impliedProb(drawOdds),
    away: impliedProb(awayOdds),
  })
}
