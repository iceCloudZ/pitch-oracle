#!/usr/bin/env node
/**
 * pitch-oracle CLI (citty): init / predict / score.
 *
 * The CLI is intentionally thin �?all logic lives in the runner. It loads the
 * tournament + agent configs, wraps the data-layer adapters in a TTL cache,
 * constructs agents from config, and dispatches to runPredict/runScore.
 *
 *   init                          copy example configs if absent
 *   predict [--manual --agent id] run the predict pass (or enter a manual pick)
 *   score                         run the score pass + print the leaderboard
 */
import { defineCommand, runMain } from 'citty'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import readline from 'node:readline/promises'

import { loadAgentConfigs, loadTournamentConfig } from './config.js'
import { fetchFixtures } from './data/fixtures.js'
import { fetchOdds } from './data/odds.js'
import { fetchResults } from './data/results.js'
import { fetchFixturesResultsWithTeams } from './data/fixtures-results.js'
import { fetchSportteryFixtures, fetchSportteryOdds } from './data/sporttery.js'
import { fetchNews } from './data/news.js'
import type { NewsItem } from './data/types.js'
import { cached } from './data/cache.js'
import { joinResultsToFixtures } from './engine/join.js'
import { writeJsonAtomic } from './store/json.js'
import {
  HumanAugmentedAgent,
  LlmAgent,
  ManualAgent,
  runPredict,
  runScore,
  type Agent,
  type RunnerDeps,
  type TournamentConfig,
} from './agents/index.js'

const CONFIG_DIR = 'config'
const DATA_DIR = 'data'
const CACHE_DIR = path.join(DATA_DIR, 'cache')
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function envOrEmpty(name?: string): string {
  if (!name) return ''
  return process.env[name] ?? ''
}

/** Construct the typed Agent objects from validated configs. */
export function buildAgents(
  configs: Awaited<ReturnType<typeof loadAgentConfigs>>,
  dataDir: string = DATA_DIR,
): Agent[] {
  return configs.map((cfg) => {
    if (cfg.type === 'manual') return new ManualAgent(cfg, dataDir)
    if (cfg.type === 'human-augmented') return new HumanAugmentedAgent(cfg, dataDir)
    return new LlmAgent(cfg)
  })
}

/**
 * Wire real (cached) data-layer adapters into RunnerDeps using env-resolved
 * keys from the tournament config. Exported so it can be exercised directly.
 *
 * Two providers are supported:
 *  - 'sporttery' (default): 体彩 fixtures + odds (no key, mainland-friendly);
 *    results come from football-data.org and are joined onto sporttery
 *    matchIds via team names so the runner's `resultIndex` lines up.
 *  - 'odds-api': original the-odds-api fixtures/odds/results path (unchanged).
 */
export function buildRunnerDeps(
  tournament: TournamentConfig,
  agents: Agent[],
  dataDir: string = DATA_DIR,
): RunnerDeps {
  const provider = tournament.provider ?? 'sporttery'

  // News + betting are provider-agnostic.
  const fetchNewsDep = (query: string) =>
    fetchNews({
      query,
      apiKey: envOrEmpty(tournament.braveApiKeyEnv) || undefined,
    })

  if (provider === 'sporttery') {
    return buildSportteryDeps(tournament, agents, dataDir, fetchNewsDep)
  }
  return buildOddsApiDeps(tournament, agents, dataDir, fetchNewsDep)
}

/** 体彩 provider: fixtures + odds from sporttery; results from football-data. */
function buildSportteryDeps(
  tournament: TournamentConfig,
  agents: Agent[],
  dataDir: string,
  fetchNewsDep: (query: string) => Promise<NewsItem[]>,
): RunnerDeps {
  const spFixturesKey = `sporttery-fixtures-had`
  const spOddsKey = `sporttery-odds-had`
  const fdResultsKey = `fd-results-${tournament.competition}`

  // Cached sporttery fixtures; reused by both fetchUpcomingFixtures and the
  // results join (which needs the sporttery matchId �?team-name mapping).
  const loadSportteryFixtures = () =>
    cached(spFixturesKey, CACHE_TTL_MS, () => fetchSportteryFixtures(), CACHE_DIR)

  return {
    agents,
    dataDir,
    bankroll: tournament.bankroll,
    bettingOpts: tournament.betting,
    // Sporttery only exposes in-sale matches, so upcoming == all fixtures.
    fetchUpcomingFixtures: () => loadSportteryFixtures(),
    fetchFinishedFixtures: () => loadSportteryFixtures().then(() => []),
    fetchOdds: () =>
      cached(spOddsKey, CACHE_TTL_MS, () => fetchSportteryOdds(), CACHE_DIR),
    // Results: pull football-data FINISHED matches (with team names), then
    // re-key them onto sporttery matchIds so they line up with predictions.
    fetchResults: async () => {
      const [fixtures, fdRows] = await Promise.all([
        loadSportteryFixtures(),
        cached(
          fdResultsKey,
          CACHE_TTL_MS,
          () =>
            fetchFixturesResultsWithTeams({
              apiKey: envOrEmpty(tournament.footballDataApiKeyEnv),
              competition: tournament.competition,
            }),
          CACHE_DIR,
        ),
      ])
      const resultTeams: Record<string, [string, string]> = {}
      for (const r of fdRows) resultTeams[r.matchId] = [r.homeTeam, r.awayTeam]
      const { results, warnings } = joinResultsToFixtures({
        fixtures,
        resultTeams,
        results: fdRows,
      })
      for (const w of warnings) console.warn(`[join] ${w}`)
      return results
    },
    fetchNews: fetchNewsDep,
  }
}

/** the-odds-api provider: original behaviour, unchanged. */
function buildOddsApiDeps(
  tournament: TournamentConfig,
  agents: Agent[],
  dataDir: string,
  fetchNewsDep: (query: string) => Promise<NewsItem[]>,
): RunnerDeps {
  const fixturesKey = `fixtures-${tournament.competition}`
  const oddsKey = `odds-${tournament.sportKey}-${tournament.region ?? 'eu'}`
  const resultsKey = `results-${tournament.sportKey}`

  return {
    agents,
    dataDir,
    bankroll: tournament.bankroll,
    bettingOpts: tournament.betting,
    fetchUpcomingFixtures: () =>
      cached(
        fixturesKey,
        CACHE_TTL_MS,
        () =>
          fetchFixtures({
            apiKey: envOrEmpty(tournament.footballDataApiKeyEnv),
            competition: tournament.competition,
          }),
        CACHE_DIR,
      ).then((fs_) => fs_.filter((f) => f.status !== 'FINISHED')),
    fetchFinishedFixtures: () =>
      cached(
        fixturesKey,
        CACHE_TTL_MS,
        () =>
          fetchFixtures({
            apiKey: envOrEmpty(tournament.footballDataApiKeyEnv),
            competition: tournament.competition,
          }),
        CACHE_DIR,
      ).then((fs_) => fs_.filter((f) => f.status === 'FINISHED')),
    fetchResults: () =>
      cached(
        resultsKey,
        CACHE_TTL_MS,
        () =>
          fetchResults({
            apiKey: envOrEmpty(tournament.theOddsApiKeyEnv),
            sportKey: tournament.sportKey,
          }),
        CACHE_DIR,
      ),
    fetchOdds: () =>
      cached(
        oddsKey,
        CACHE_TTL_MS,
        () =>
          fetchOdds({
            apiKey: envOrEmpty(tournament.theOddsApiKeyEnv),
            sportKey: tournament.sportKey,
            region: tournament.region,
          }),
        CACHE_DIR,
      ),
    fetchNews: fetchNewsDep,
  }
}

/**
 * Copy the committed example configs to their live paths if they don't already
 * exist. Never overwrites. Returns the list of paths written (empty if all
 * existed). Exported so the test can point it at a temp config dir.
 */
export async function initConfigs(configDir: string = CONFIG_DIR): Promise<string[]> {
  const examples: Array<[string, string]> = [
    ['agents.example.json', 'agents.json'],
    ['tournament.example.json', 'tournament.json'],
  ]
  const written: string[] = []
  for (const [example, target] of examples) {
    const targetPath = path.join(configDir, target)
    const exists = await fs
      .access(targetPath)
      .then(() => true)
      .catch(() => false)
    if (exists) continue
    const exampleContent = await exampleConfigText(example)
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(targetPath, exampleContent, 'utf8')
    written.push(targetPath)
  }
  return written
}

/** Inline copies of the example configs so the CLI is self-contained. */
async function exampleConfigText(name: string): Promise<string> {
  if (name === 'agents.example.json') return AGENTS_EXAMPLE
  if (name === 'tournament.example.json') return TOURNAMENT_EXAMPLE
  throw new Error(`unknown example: ${name}`)
}

const AGENTS_EXAMPLE = `{
  "agents": [
    {
      "id": "claude-blind",
      "name": "Claude (blind)",
      "type": "llm",
      "baseURL": "https://api.anthropic.com/v1/",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "model": "claude-sonnet-4-6",
      "seeOdds": false
    },
    {
      "id": "claude-odds",
      "name": "Claude (sees odds)",
      "type": "llm",
      "baseURL": "https://api.anthropic.com/v1/",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "model": "claude-sonnet-4-6",
      "seeOdds": true
    },
    { "id": "me", "name": "You", "type": "manual" },
    {
      "id": "me-ai",
      "name": "You + AI",
      "type": "human-augmented",
      "baseURL": "https://api.anthropic.com/v1/",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "model": "claude-sonnet-4-6"
    }
  ]
}
`

const TOURNAMENT_EXAMPLE = `{
  "provider": "sporttery",
  "sportKey": "soccer_fifa_world_cup",
  "competition": "WC",
  "region": "eu",
  "bankroll": 1000,
  "footballDataApiKeyEnv": "FOOTBALL_DATA_API_KEY",
  "theOddsApiKeyEnv": "THE_ODDS_API_KEY",
  "braveApiKeyEnv": "BRAVE_API_KEY",
  "betting": { "kellyFractionRatio": 0.25, "maxPerBet": 0.1 }
}
`

/**
 * Interactive prompt for a manual prediction: writes
 * `data/agents/{id}/input/{matchId}.json`. Used by `predict --manual`.
 */
export async function writeManualInput(
  agentId: string,
  matchId: string,
  dataDir: string = DATA_DIR,
  input?: NodeJS.ReadableStream,
  output?: NodeJS.WritableStream,
): Promise<void> {
  const rl = readline.createInterface({
    input: (input ?? process.stdin) as NodeJS.ReadableStream,
    output: (output ?? process.stdout) as NodeJS.WritableStream,
  })
  try {
    const ask = (q: string) => rl.question(q)
    const home = parseFloat((await ask('P(home win) [0..1]: ')).trim())
    const draw = parseFloat((await ask('P(draw) [0..1]: ')).trim())
    const away = parseFloat((await ask('P(away win) [0..1]: ')).trim())
    const score = (await ask('Top scoreline (e.g. 2-1), or blank: ')).trim()
    const confidence = parseFloat((await ask('Confidence [0..1]: ')).trim())
    const reasoning = (await ask('Reasoning: ')).trim()

    const scoreProbs =
      /^\d+-\d+$/.test(score) ? [{ score, prob: 1 }] : []
    const body = {
      agentId,
      matchId,
      resultProbs: { home, draw, away },
      scoreProbs,
      confidence: Number.isFinite(confidence) ? confidence : 0.5,
      reasoning: reasoning || 'manual entry',
      createdAt: new Date().toISOString(),
    }
    const file = path.join(dataDir, 'agents', agentId, 'input', `${matchId}.json`)
    await writeJsonAtomic(file, body)
  } finally {
    rl.close()
  }
}

function printLeaderboard(dataDir: string): Promise<void> {
  return fs
    .readFile(path.join(dataDir, 'leaderboard.json'), 'utf8')
    .then((raw) => {
      const lb = JSON.parse(raw)
      const acc = lb.accuracy ?? []
      const bet = lb.betting ?? []
      // eslint-disable-next-line no-console
      console.log('\n=== Accuracy leaderboard ===')
      // eslint-disable-next-line no-console
      console.log(
        'agent'.padEnd(20),
        'pts'.padStart(6),
        'matches'.padStart(8),
        'exact'.padStart(6),
        'result'.padStart(6),
      )
      for (const r of acc) {
        // eslint-disable-next-line no-console
        console.log(
          r.agentId.padEnd(20),
          String(r.totalPoints).padStart(6),
          String(r.matches).padStart(8),
          String(r.exactScores).padStart(6),
          String(r.correctResults).padStart(6),
        )
      }
      // eslint-disable-next-line no-console
      console.log('\n=== Betting leaderboard ===')
      // eslint-disable-next-line no-console
      console.log(
        'agent'.padEnd(20),
        'settled'.padStart(8),
        'won'.padStart(6),
        'staked'.padStart(10),
        'pnl'.padStart(10),
        'roi%'.padStart(8),
      )
      for (const b of bet) {
        // eslint-disable-next-line no-console
        console.log(
          b.agentId.padEnd(20),
          String(b.settledBets).padStart(8),
          String(b.wonBets).padStart(6),
          b.totalStakedUnits.toFixed(2).padStart(10),
          b.totalPnlUnits.toFixed(2).padStart(10),
          b.roiPct.toFixed(1).padStart(8),
        )
      }
    })
}

const initCommand = defineCommand({
  meta: { name: 'init', description: 'Create config files from examples (no overwrite)' },
  async run() {
    const written = await initConfigs()
    if (written.length === 0) {
      // eslint-disable-next-line no-console
      console.log('Config files already exist; nothing to do.')
    } else {
      // eslint-disable-next-line no-console
      console.log('Wrote:', written.join(', '))
    }
    // eslint-disable-next-line no-console
    console.log('Next: set API keys in env, then `pitch-oracle predict`.')
  },
})

const predictCommand = defineCommand({
  meta: { name: 'predict', description: 'Run the predict pass for all configured agents' },
  args: {
    manual: { type: 'boolean', default: false, description: 'Enter a manual prediction instead of running models' },
    agent: { type: 'string', description: 'Agent id (required with --manual)' },
    match: { type: 'string', description: 'Match id (required with --manual)' },
  },
  async run({ args }) {
    const tournament = await loadTournamentConfig()
    const configs = await loadAgentConfigs()
    if (args.manual) {
      if (!args.agent || !args.match) {
        throw new Error('--manual requires --agent <id> and --match <id>')
      }
      await writeManualInput(args.agent, args.match, DATA_DIR)
      // eslint-disable-next-line no-console
      console.log(`Wrote manual input for agent "${args.agent}" match "${args.match}".`)
      return
    }
    const agents = buildAgents(configs, DATA_DIR)
    const deps = buildRunnerDeps(tournament, agents, DATA_DIR)
    const summary = await runPredict(deps)
    const ok = summary.results.filter((r) => r.ok).length
    const fail = summary.results.filter((r) => !r.ok).length
    // eslint-disable-next-line no-console
    console.log(`Predict done: ${ok} ok, ${fail} DNF.`)
  },
})

const scoreCommand = defineCommand({
  meta: { name: 'score', description: 'Run the score pass and print the leaderboard' },
  async run() {
    const tournament = await loadTournamentConfig()
    const configs = await loadAgentConfigs()
    const agents = buildAgents(configs, DATA_DIR)
    const deps = buildRunnerDeps(tournament, agents, DATA_DIR)
    const summary = await runScore(deps)
    // eslint-disable-next-line no-console
    console.log(
      `Scored ${summary.accuracyRows} predictions, settled ${summary.settlements} bets.`,
    )
    await printLeaderboard(DATA_DIR)
  },
})

const mainCommand = defineCommand({
  meta: {
    name: 'pitch-oracle',
    description: 'Multi-agent football prediction arena with odds-driven EV/Kelly bet sizing.',
  },
  subCommands: {
    init: initCommand,
    predict: predictCommand,
    score: scoreCommand,
  },
})

// Only run when invoked as a script (not when imported in tests).
// pathToFileURL normalizes the platform path so this works on Windows
// (argv[1] uses backslashes; import.meta.url is a file: URL).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMain(mainCommand)
}

export { mainCommand }
