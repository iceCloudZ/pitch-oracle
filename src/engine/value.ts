import { clamp } from './prob.js'

export function expectedValue(modelProb: number, decimalOdds: number): number {
  return modelProb * decimalOdds - 1
}

export function kellyFraction(modelProb: number, decimalOdds: number): number {
  const b = decimalOdds - 1
  if (b <= 0) return 0
  return (modelProb * decimalOdds - 1) / b
}

export function fractionalKelly(kelly: number, fraction = 0.25): number {
  return kelly * fraction
}

/** Negative edge => 0; otherwise clamp into [0, maxPerBet]. */
export function recommendedStakePct(fractionalKellyValue: number, maxPerBet = 0.1): number {
  if (fractionalKellyValue <= 0) return 0
  return clamp(fractionalKellyValue, 0, maxPerBet)
}
