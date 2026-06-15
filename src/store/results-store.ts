/**
 * Persistent results store at `data/results.json`.
 *
 * football-data.org's /matches?status=FINISHED endpoint returns an unstable
 * list — the same fixture sometimes appears and sometimes doesn't (load
 * balancer cache skew). To stop a flaky response from dropping an already-
 * confirmed score, every successfully joined result is persisted here and
 * read back on the next run. football-data then only needs to supply results
 * we don't already have.
 *
 * The store is keyed by the sporttery matchId (the post-join id), matching
 * what predictions are keyed by. Values are {homeScore, awayScore}.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { RegularTimeResult } from '../domain/types.js'

export interface ResultsStore {
  /** sporttery matchId -> score. */
  [matchId: string]: { homeScore: number; awayScore: number; updatedAt: string }
}

export function resultsPath(dataDir: string): string {
  return path.join(dataDir, 'results.json')
}

/** Load the store, returning {} when absent. */
export async function loadResultsStore(dataDir: string): Promise<ResultsStore> {
  try {
    const raw = await fs.readFile(resultsPath(dataDir), 'utf8')
    return JSON.parse(raw) as ResultsStore
  } catch {
    return {}
  }
}

/**
 * Merge freshly-joined results into the store and persist. Overwrites a
 * stored entry only when the new score differs (so a corrected score wins,
 * but identical re-runs don't churn the file). Returns the merged store.
 */
export async function persistResults(
  dataDir: string,
  newResults: RegularTimeResult[],
): Promise<ResultsStore> {
  const store = await loadResultsStore(dataDir)
  let changed = false
  const now = new Date().toISOString()
  for (const r of newResults) {
    const prev = store[r.matchId]
    if (!prev || prev.homeScore !== r.homeScore || prev.awayScore !== r.awayScore) {
      store[r.matchId] = { homeScore: r.homeScore, awayScore: r.awayScore, updatedAt: now }
      changed = true
    }
  }
  if (changed) {
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(resultsPath(dataDir), JSON.stringify(store, null, 2), 'utf8')
  }
  return store
}

/** Convert the store back to RegularTimeResult[] for the runner. */
export function storeToResults(store: ResultsStore): RegularTimeResult[] {
  return Object.entries(store).map(([matchId, v]) => ({
    matchId,
    homeScore: v.homeScore,
    awayScore: v.awayScore,
  }))
}
