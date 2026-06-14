/**
 * Config loading + Zod validation.
 *
 * `loadAgentConfigs` and `loadTournamentConfig` read + validate the JSON files
 * under `config/`. Unknown keys are rejected; manual agents may omit
 * `baseURL` / `model` / `apiKeyEnv` (the other agent types require them).
 *
 * API keys themselves are never stored in config — only the *name* of the env
 * var that holds the key. The caller resolves the env var at use time.
 */
import { promises as fs } from 'node:fs'
import { z } from 'zod'
import type { AgentConfig, TournamentConfig } from './agents/types.js'

export const agentConfigSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(['llm', 'manual', 'human-augmented']),
    baseURL: z.string().min(1).optional(),
    apiKeyEnv: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    seeOdds: z.boolean().optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    // `manual` agents never need model/endpoint config; all other types do.
    if (cfg.type === 'manual') return
    const missing: string[] = []
    if (!cfg.baseURL) missing.push('baseURL')
    if (!cfg.apiKeyEnv) missing.push('apiKeyEnv')
    if (!cfg.model) missing.push('model')
    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `agent "${cfg.id}" (type "${cfg.type}") is missing required fields: ${missing.join(', ')}`,
        path: missing,
      })
    }
  })

export const agentConfigsFileSchema = z
  .object({
    agents: z.array(agentConfigSchema),
  })
  .strict()

export const tournamentConfigSchema = z
  .object({
    /**
     * Data provider selection:
     *  - 'sporttery' (default): 体彩 fixtures + odds; football-data results.
     *  - 'odds-api': the-odds-api fixtures/odds/results (original behaviour).
     */
    provider: z.enum(['sporttery', 'odds-api']).optional(),
    sportKey: z.string().min(1),
    competition: z.string().min(1),
    region: z.string().min(1).optional(),
    bankroll: z.number().positive(),
    footballDataApiKeyEnv: z.string().min(1),
    theOddsApiKeyEnv: z.string().min(1),
    braveApiKeyEnv: z.string().min(1).optional(),
    tavilyApiKeyEnv: z.string().min(1).optional(),
    betting: z
      .object({
        evThreshold: z.number().optional(),
        kellyFractionRatio: z.number().positive().optional(),
        maxPerBet: z.number().positive().max(1).optional(),
        eps: z.number().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export interface LoadConfigOptions {
  /** Injectable fetch (defaults to fs.readFile) — used by tests. */
  readFile?: (path: string) => Promise<string>
}

/**
 * Load + validate agent configs from `path` (default `config/agents.json`).
 * Throws a ZodError-shaped message on validation failure.
 */
export async function loadAgentConfigs(
  path = 'config/agents.json',
  opts: LoadConfigOptions = {},
): Promise<AgentConfig[]> {
  const readFile = opts.readFile ?? ((p) => fs.readFile(p, 'utf8'))
  const raw = await readFile(path)
  const parsed = agentConfigsFileSchema.parse(JSON.parse(raw))
  return parsed.agents as AgentConfig[]
}

/**
 * Load + validate the tournament config from `path`
 * (default `config/tournament.json`).
 */
export async function loadTournamentConfig(
  path = 'config/tournament.json',
  opts: LoadConfigOptions = {},
): Promise<TournamentConfig> {
  const readFile = opts.readFile ?? ((p) => fs.readFile(p, 'utf8'))
  const raw = await readFile(path)
  return tournamentConfigSchema.parse(JSON.parse(raw)) as TournamentConfig
}
