import { z } from 'zod'

export const scoreSchema = z.string().regex(/^\d+-\d+$/, 'score must look like "2-1"')

export const resultProbsSchema = z.object({
  home: z.number(),
  draw: z.number(),
  away: z.number(),
})

export const scoreProbSchema = z.object({
  score: scoreSchema,
  prob: z.number().nonnegative(),
})

export const predictionSchema = z.object({
  agentId: z.string().min(1),
  matchId: z.string().min(1),
  resultProbs: resultProbsSchema,
  scoreProbs: z.array(scoreProbSchema).max(5),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  createdAt: z.string().min(1),
})

/**
 * The subset of a `Prediction` the model is actually responsible for. The
 * system prompt asks ONLY for these keys; the engine-managed identity fields
 * (`agentId`, `matchId`, `createdAt`) are stamped on after validation. This
 * schema mirrors the prompt contract so the two never drift.
 */
export const modelPredictionSchema = z.object({
  resultProbs: resultProbsSchema,
  scoreProbs: z.array(scoreProbSchema).max(5),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
})

export type PredictionParsed = z.infer<typeof predictionSchema>
export type ModelPredictionParsed = z.infer<typeof modelPredictionSchema>

export const matchOddsSchema = z.object({
  matchId: z.string().min(1),
  home: z.number().gt(1),
  draw: z.number().gt(1),
  away: z.number().gt(1),
  timestamp: z.string().min(1),
})
