/**
 * Agent runtime types.
 *
 * Three agent types produce `Prediction`s over a `MatchContext`:
 *  - `llm`: pure model prediction (blind or odds-aware)
 *  - `manual`: hand-authored predictions read from disk
 *  - `human-augmented`: human notes feed an LLM
 *
 * The runner is dependency-injected via `RunnerDeps` so it has no direct
 * coupling to the data layer or the model client — adapters and clients are
 * supplied by the caller (production CLI or tests).
 */
import type { Fixture, NewsItem } from '../data/types.js'
import type {
  MatchOdds,
  Prediction,
  RegularTimeResult,
} from '../domain/types.js'
import type { ComputeBetsOptions } from '../engine/bets.js'

export type AgentType = 'llm' | 'manual' | 'human-augmented'

export interface AgentConfig {
  id: string
  name: string
  type: AgentType
  /** OpenAI-compatible endpoint. May be omitted for `type: 'manual'`. */
  baseURL?: string
  /** Name of the env var holding the API key. May be omitted for `type: 'manual'`. */
  apiKeyEnv?: string
  /** Model id. May be omitted for `type: 'manual'`. */
  model?: string
  /** Whether the agent sees market odds. Defaults to `false` (blind). */
  seeOdds?: boolean
}

export interface TournamentConfig {
  sportKey: string
  competition: string
  region?: string
  bankroll: number
  footballDataApiKeyEnv: string
  theOddsApiKeyEnv: string
  braveApiKeyEnv?: string
  tavilyApiKeyEnv?: string
  betting?: ComputeBetsOptions
}

export interface MatchContext {
  fixture: Fixture
  news: NewsItem[]
  /** Present only when the agent has `seeOdds: true`. */
  odds?: MatchOdds
}

export interface Agent {
  config: AgentConfig
  predict(ctx: MatchContext): Promise<Prediction>
}

/**
 * Everything the runner needs, injected by the caller. In production the CLI
 * wires real adapters (cached) + the real model client factory; in tests the
 * caller supplies canned callbacks + a temp `dataDir` so nothing touches the
 * network or disk outside the sandbox.
 */
export interface RunnerDeps {
  agents: Agent[]
  fetchUpcomingFixtures: () => Promise<Fixture[]>
  fetchFinishedFixtures: () => Promise<Fixture[]>
  fetchResults: () => Promise<RegularTimeResult[]>
  fetchNews: (query: string) => Promise<NewsItem[]>
  fetchOdds: () => Promise<MatchOdds[]>
  dataDir: string
  bankroll: number
  bettingOpts?: ComputeBetsOptions
}
