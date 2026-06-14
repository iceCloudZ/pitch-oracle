# pitch-oracle Agents + CLI Implementation Plan (Plan 3 of 4)

> **Execution note:** Author full code from these specs. Write unit tests (mock model client + mock data adapters). Typecheck your own files. Commit per module. **Do NOT run the integrated full `npm test`** — single end-to-end pass after Plan 4. Add the `openai` and `citty` deps via `npm install`.

**Goal:** The agent runtime + CLI that ties the data layer and engine together. Three agent types (`llm`, `manual`, `human-augmented`) produce `Prediction`s; a runner orchestrates predict + score passes; a `citty` CLI (`predict` / `score` / `init`) drives it. Models estimate probabilities; the engine computes bets.

**Architecture:** All agents implement `Agent { config; predict(ctx): Promise<Prediction> }`. The runner is dependency-injected (adapters + a client factory) so it's fully testable without network or keys. Config lives in `config/*.json`; generated state in `data/`. MVP betting is 1x2 (engine already enforces).

**Tech:** `openai` SDK (OpenAI-compatible, any `baseURL`), `citty` (CLI), Zod (reuse domain schemas). New deps: `openai`, `citty`.

---

## File Structure
```
config/
  agents.example.json         # committed template
  tournament.example.json     # committed template
src/
  config.ts                   # load + validate config (zod), env-var resolution for apiKeys
  agents/
    types.ts                  # AgentConfig, TournamentConfig, MatchContext, Agent interface
    client.ts                 # OpenAI-compatible client factory + chatJSON() (json mode + zod parse)
    prompt.ts                 # buildSystemPrompt(), buildUserPrompt(ctx, seeOdds)
    llm.ts                    # LlmAgent implements Agent
    manual.ts                 # ManualAgent (reads data/agents/{id}/input/{matchId}.json)
    human-augmented.ts        # HumanAugmentedAgent (notes file + LLM)
    runner.ts                 # runPredict(deps, opts), runScore(deps, opts) — injected adapters
    index.ts                  # barrel
  cli.ts                      # citty: init / predict [--manual --agent id] / score
tests co-located
```

## Module specs

### `src/agents/types.ts`
```ts
import type { Fixture, NewsItem } from '../data/types.js'
import type { MatchOdds, Prediction } from '../domain/types.js'

export type AgentType = 'llm' | 'manual' | 'human-augmented'
export interface AgentConfig {
  id: string
  name: string
  type: AgentType
  baseURL: string        // OpenAI-compatible endpoint
  apiKeyEnv: string      // name of env var holding the key
  model: string
  seeOdds?: boolean      // default false (blind)
}
export interface MatchContext {
  fixture: Fixture
  news: NewsItem[]
  odds?: MatchOdds       // present only when the agent has seeOdds
}
export interface Agent {
  config: AgentConfig
  predict(ctx: MatchContext): Promise<Prediction>
}
export interface RunnerDeps {
  agents: Agent[]
  fetchUpcomingFixtures: () => Promise<Fixture[]>
  fetchFinishedFixtures: () => Promise<Fixture[]>
  fetchResults: () => Promise<import('../domain/types.js').RegularTimeResult[]>
  fetchNews: (query: string) => Promise<NewsItem[]>
  fetchOdds: () => Promise<MatchOdds[]>
  dataDir: string
  bankroll: number
  bettingOpts?: import('../engine/bets.js').ComputeBetsOptions
}
```

### `src/config.ts`
- `loadAgentConfigs(path='config/agents.json'): AgentConfig[]` and `loadTournamentConfig(path='config/tournament.json'): TournamentConfig`, each validated with Zod (reuse a schema mirroring the interfaces; reject unknown).
- `TournamentConfig`: `{ sportKey, competition, region?, bankroll, footballDataApiKeyEnv, theOddsApiKeyEnv, braveApiKeyEnv?, tavilyApiKeyEnv?, betting?: ComputeBetsOptions }`.
- Tests: parse valid; reject malformed (missing model, bad type).

### `src/agents/client.ts`
```ts
import OpenAI from 'openai'
import { predictionSchema } from '../domain/schemas.js'
import type { AgentConfig, MatchContext, Prediction } from './types.js'
export function createClient(cfg: AgentConfig): OpenAI {
  return new OpenAI({ baseURL: cfg.baseURL, apiKey: process.env[cfg.apiKeyEnv] ?? '' })
}
/** One chat call requesting JSON; parses + Zod-validates into a Prediction. Throws on invalid JSON after retries. */
export async function predictViaClient(
  client: OpenAI, model: string, system: string, user: string, agentId: string, matchId: string,
): Promise<Prediction>
```
- Use `client.chat.completions.create({ model, messages, response_format: { type: 'json_object' } })`. Parse `JSON.parse(choice.message.content)`, validate with `predictionSchema`. On Zod failure, retry ONCE with a "your JSON was invalid: <error>, return valid JSON only" nudge; then throw.
- Inject the SDK call so it's testable: accept an optional `completer?: (opts)=>Promise<string>` that returns the raw content string (tests inject canned/invalid-then-valid). Default uses the real client.

### `src/agents/prompt.ts`
- `buildSystemPrompt(): string` — instructs the model to act as a football analyst, output ONLY JSON with keys `resultProbs{home,draw,away}` (sum≈1), `scoreProbs[{score:"h-a",prob}]` (≤5, top likely scores), `confidence` 0–1, `reasoning`. Emphasize regular-time (90 min). No odds in system prompt.
- `buildUserPrompt(ctx: MatchContext, seeOdds: boolean): string` — describes the fixture (teams, competition, kickoff), summarizes news (titles + snippets). If `seeOdds`, appends the current 1x2 decimal odds and says "you may reference market consensus."
- Test: both builders return non-empty strings; `buildUserPrompt` includes team names; includes odds text iff `seeOdds`.

### `src/agents/llm.ts`
```ts
export class LlmAgent implements Agent {
  constructor(public config: AgentConfig, private client: OpenAI, private completer?) {}
  async predict(ctx): Promise<Prediction> {
    const sys = buildSystemPrompt()
    const user = buildUserPrompt(ctx, this.config.seeOdds ?? false)
    const p = await predictViaClient(this.client, this.config.model, sys, user, this.config.id, ctx.fixture.id, this.completer)
    return p
  }
}
```
- Test: inject a `completer` returning canned valid JSON → returns a Prediction with the agent's id/matchId and the canned probs; verify `seeOdds=true` flows into the user prompt (spy on buildUserPrompt or check the completer receives a user string containing odds).

### `src/agents/manual.ts`
- Reads `data/agents/{id}/input/{matchId}.json` (a hand-written Prediction-shaped file). `predict()` validates it with `predictionSchema` (after injecting agentId/matchId/createdAt if absent). Throws if the file is missing (the runner treats this as DNF — skip, don't crash the whole run).
- Test: temp-dir fixture file → returns Prediction; missing file → throws a typed `MissingManualInputError`.

### `src/agents/human-augmented.ts`
- Like LLM but `buildUserPrompt` is extended with the human's notes read from `data/agents/{id}/notes/{matchId}.txt` (empty string if absent). Add a `buildHumanAugmentedUserPrompt(ctx, seeOdds, notes)`.
- Test: notes file present → completer-received user string contains the notes text.

### `src/agents/runner.ts`
- `runPredict(deps: RunnerDeps): Promise<void>`:
  1. `const fixtures = await deps.fetchUpcomingFixtures()`
  2. `const allOdds = await deps.fetchOdds()` → index by `matchId`
  3. for each fixture: `const news = await deps.fetchNews(\`${fixture.homeTeam} vs ${fixture.awayTeam} preview\`)`; `const odds = oddsIndex.get(fixture.id)`
  4. for each agent: build `ctx = { fixture, news, odds: agent.config.seeOdds ? odds : undefined }`; `try { pred = await agent.predict(ctx) } catch { mark DNF; continue }`; write `data/agents/{id}/predictions/{matchId}.json` via `writeJsonAtomic`; if `odds`, compute `bets = computeBets(pred, odds, deps.bettingOpts)` and write `data/agents/{id}/bets/{matchId}.json`; else skip bets.
- `runScore(deps: RunnerDeps): Promise<void>`:
  1. `const results = await deps.fetchResults()` → index by matchId
  2. for each result: for each agent: read its prediction JSON (skip if missing); `scorePrediction(pred, result)`; if bets file exists, `settleBet` each via `resultOf(result)`, bankroll.
  3. `aggregateAccuracy` + `aggregateBetting` across all agents/matches; write `data/leaderboard.json`.
- **Injectability:** both take `deps` with adapter callbacks (tests pass canned fns + temp `dataDir`). Use `readJson`/`writeJsonAtomic` from `src/store/json.js` joined under `deps.dataDir`.
- Tests: `runPredict` with 1 fixture + 1 mocked LLM agent (injected predict returning a canned Prediction) + injected odds → writes prediction + bets JSON; missing odds → no bets file. `runScore` with a canned result + an existing prediction/bets → writes leaderboard.json with correct points/P/L.

### `src/agents/index.ts` — barrel.

### `src/cli.ts` (citty)
- `init` — writes `config/agents.example.json` → `config/agents.json` and `config/tournament.example.json` → `config/tournament.json` if missing; prints next steps. (Don't overwrite existing.)
- `predict [--manual --agent <id>]` — loads configs; builds real adapters wrapping the data layer (using env-resolved keys, with the TTL cache from `src/data/cache.ts`); constructs agents from config; `--manual` instead runs an interactive prompt (readline) that writes a `data/agents/{id}/input/{matchId}.json` for the given agent + match (then returns — manual picks are entered, not LLM-generated). Without `--manual`, calls `runPredict`.
- `score` — builds adapters, calls `runScore`, prints the leaderboard table.
- Keep CLI thin (logic lives in runner). CLI itself needs only a smoke test or none — but DO add a test that `init` writes the config files (temp dir).

### Example configs (committed)
`config/agents.example.json`:
```json
{
  "agents": [
    { "id": "claude-blind", "name": "Claude (blind)", "type": "llm", "baseURL": "https://api.anthropic.com/v1/", "apiKeyEnv": "ANTHROPIC_API_KEY", "model": "claude-sonnet-4-6", "seeOdds": false },
    { "id": "claude-odds",  "name": "Claude (sees odds)", "type": "llm", "baseURL": "https://api.anthropic.com/v1/", "apiKeyEnv": "ANTHROPIC_API_KEY", "model": "claude-sonnet-4-6", "seeOdds": true },
    { "id": "me",           "name": "You", "type": "manual" },
    { "id": "me-ai",        "name": "You + AI", "type": "human-augmented", "baseURL": "https://api.anthropic.com/v1/", "apiKeyEnv": "ANTHROPIC_API_KEY", "model": "claude-sonnet-4-6" }
  ]
}
```
`config/tournament.example.json`:
```json
{
  "sportKey": "soccer_fifa_world_cup",
  "competition": "WC",
  "region": "eu",
  "bankroll": 1000,
  "footballDataApiKeyEnv": "FOOTBALL_DATA_API_KEY",
  "theOddsApiKeyEnv": "THE_ODDS_API_KEY",
  "braveApiKeyEnv": "BRAVE_API_KEY",
  "betting": { "kellyFractionRatio": 0.25, "maxPerBet": 0.1 }
}
```
(For manual agents, baseURL/model/apiKeyEnv can be omitted — config zod must allow that for type 'manual'.)

## Honest constraints
- Models can't do reliable arithmetic — they only output probabilities; betting math stays in the engine.
- Knockout extra-time caveat already documented in data layer; runner just uses whatever result the data layer returns.
- Manual agent missing input = DNF (skip), never crash the run.

## Self-check before reporting
- `npm install openai citty` done; `npx tsc --noEmit` clean.
- No real network/model calls in any test (everything injected).
- `config.ts` zod validation tested (valid + reject).
- `init` tested (writes configs, doesn't overwrite).
- Commit per module (`feat(agents): ...` / `feat(cli): ...`), trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Report
- Status, commit SHAs, `npx tsc --noEmit` output, list of test files + one-line each, concerns/deviations.