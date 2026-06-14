/**
 * Runner — orchestrates predict + score passes over a set of agents.
 *
 * Both passes are fully dependency-injected via `RunnerDeps`: the data-layer
 * adapters are callbacks and `dataDir` is a sandbox path. Tests pass canned
 * fns + a temp dir; the production CLI wires real (cached) adapters.
 *
 * Predict flow:
 *  1. fetch upcoming fixtures
 *  2. fetch all odds, index by matchId
 *  3. per fixture: fetch news, look up odds
 *  4. per agent: build ctx (odds only if agent.seeOdds), call predict;
 *     on throw, mark DNF and continue (never crash the run). Write the
 *     prediction JSON. If odds exist for that match, compute bets and write
 *     them too; otherwise skip the bets file.
 *
 * Score flow:
 *  1. fetch results, index by matchId
 *  2. per result, per agent: read its prediction JSON (skip if missing),
 *     score it; if a bets file exists, settle each bet via resultOf(result)
 *  3. aggregate accuracy + betting across everything, write leaderboard.json
 */
import path from 'node:path'
import type {
  Bet,
  BetSettlement,
  MatchOdds,
  Prediction,
  RegularTimeResult,
} from '../domain/types.js'
import { computeBets } from '../engine/bets.js'
import { aggregateAccuracy, aggregateBetting } from '../engine/leaderboard.js'
import {
  resultOf,
  scorePrediction,
  type AccuracyScore,
} from '../engine/scoring.js'
import { settleBet } from '../engine/settlement.js'
import { readJson, writeJsonAtomic } from '../store/json.js'
import type { Agent, RunnerDeps } from './types.js'

function predictionPath(dataDir: string, agentId: string, matchId: string): string {
  return path.join(dataDir, 'agents', agentId, 'predictions', `${matchId}.json`)
}

function betsPath(dataDir: string, agentId: string, matchId: string): string {
  return path.join(dataDir, 'agents', agentId, 'bets', `${matchId}.json`)
}

function leaderboardPath(dataDir: string): string {
  return path.join(dataDir, 'leaderboard.json')
}

export interface PredictRunSummary {
  /** Per-agent, per-match: true when predict resolved, false when it threw. */
  results: Array<{ agentId: string; matchId: string; ok: boolean; error?: string }>
}

/**
 * Run the predict pass. Writes one prediction JSON per (agent, match) that
 * succeeds, plus a bets JSON per match that has odds. Agent failures are
 * captured in the summary; the run never throws for a single bad agent.
 */
export async function runPredict(deps: RunnerDeps): Promise<PredictRunSummary> {
  const fixtures = await deps.fetchUpcomingFixtures()
  const oddsList = await deps.fetchOdds()
  const oddsIndex = new Map<string, MatchOdds>()
  for (const o of oddsList) oddsIndex.set(o.matchId, o)

  const summary: PredictRunSummary = { results: [] }

  for (const fixture of fixtures) {
    const query = `${fixture.homeTeam} vs ${fixture.awayTeam} preview`
    const news = await deps.fetchNews(query).catch(() => [])
    const odds = oddsIndex.get(fixture.id)

    for (const agent of deps.agents) {
      const ctx = {
        fixture,
        news,
        odds: agent.config.seeOdds ? odds : undefined,
      }
      try {
        const pred = await agent.predict(ctx)
        await writeJsonAtomic(predictionPath(deps.dataDir, agent.config.id, fixture.id), pred)
        if (odds) {
          const bets = computeBets(pred, odds, deps.bettingOpts)
          if (bets.length > 0) {
            await writeJsonAtomic(betsPath(deps.dataDir, agent.config.id, fixture.id), bets)
          }
        }
        summary.results.push({ agentId: agent.config.id, matchId: fixture.id, ok: true })
      } catch (e) {
        summary.results.push({
          agentId: agent.config.id,
          matchId: fixture.id,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  return summary
}

export interface ScoreRunSummary {
  accuracyRows: number
  settlements: number
}

/**
 * Run the score pass. Reads each agent's prediction (and optional bets) JSON
 * for every result, scores/settles, and writes the aggregated leaderboard.
 */
export async function runScore(deps: RunnerDeps): Promise<ScoreRunSummary> {
  const results = await deps.fetchResults()
  const resultIndex = new Map<string, RegularTimeResult>()
  for (const r of results) resultIndex.set(r.matchId, r)

  const accuracyRows: Array<{ agentId: string; score: AccuracyScore }> = []
  const settlements: BetSettlement[] = []

  for (const result of results) {
    const actualOutcome = resultOf(result)
    for (const agent of deps.agents) {
      const pred = await readJson<Prediction>(
        predictionPath(deps.dataDir, agent.config.id, result.matchId),
      )
      if (!pred) continue
      const score = scorePrediction(pred, result)
      accuracyRows.push({ agentId: agent.config.id, score })

      const bets = await readJson<Bet[]>(
        betsPath(deps.dataDir, agent.config.id, result.matchId),
      )
      if (bets && Array.isArray(bets)) {
        for (const bet of bets) {
          settlements.push(settleBet(bet, actualOutcome, deps.bankroll))
        }
      }
    }
  }

  const accuracy = aggregateAccuracy(accuracyRows)
  const betting = aggregateBetting(settlements)
  await writeJsonAtomic(leaderboardPath(deps.dataDir), {
    accuracy,
    betting,
    generatedAt: new Date().toISOString(),
  })

  return { accuracyRows: accuracyRows.length, settlements: settlements.length }
}
