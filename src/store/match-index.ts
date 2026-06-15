/**
 * Persistent matchId → team-name index, stored at `data/match-index.json`.
 *
 * Why this exists: the score pass must join football-data.org results (English
 * team names, fd matchId) onto sporttery-keyed predictions (Chinese names,
 * sporttery matchId). That join needs the sporttery matchId ↔ team-name
 * mapping — but sporttery's live feed only lists in-sale matches, so finished
 * matches vanish and the join loses its key.
 *
 * The predict pass records every fixture it predicts into this index; the
 * score pass reads it back so the join works long after sporttery delists a
 * match. The file is a simple append-merge JSON map, safe to rewrite.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface MatchIndexEntry {
  homeTeam: string
  awayTeam: string
}

export type MatchIndex = Record<string, MatchIndexEntry>

export function matchIndexPath(dataDir: string): string {
  return path.join(dataDir, 'match-index.json')
}

/** Load the index, returning {} when absent or unreadable. */
export async function loadMatchIndex(dataDir: string): Promise<MatchIndex> {
  try {
    const raw = await fs.readFile(matchIndexPath(dataDir), 'utf8')
    return JSON.parse(raw) as MatchIndex
  } catch {
    return {}
  }
}

/**
 * Merge new fixtures into the index and persist. Existing entries are kept
 * (never overwritten) so a re-run over the same matches is idempotent.
 * `fixtures` is an array of { matchId, homeTeam, awayTeam }-shaped objects.
 */
export async function updateMatchIndex(
  dataDir: string,
  fixtures: Array<{ id: string; homeTeam: string; awayTeam: string }>,
): Promise<void> {
  if (fixtures.length === 0) return
  const idx = await loadMatchIndex(dataDir)
  let changed = false
  for (const f of fixtures) {
    if (!idx[f.id]) {
      idx[f.id] = { homeTeam: f.homeTeam, awayTeam: f.awayTeam }
      changed = true
    }
  }
  if (changed) {
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(matchIndexPath(dataDir), JSON.stringify(idx, null, 2), 'utf8')
  }
}

/** Convert a MatchIndex into the Fixture[] shape the join expects. */
export function indexToFixtures(idx: MatchIndex): Array<{
  id: string
  homeTeam: string
  awayTeam: string
}> {
  return Object.entries(idx).map(([id, e]) => ({
    id,
    homeTeam: e.homeTeam,
    awayTeam: e.awayTeam,
  }))
}
