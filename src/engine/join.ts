/**
 * Cross-source join: re-map football-data.org results onto sporttery matchIds.
 *
 * Predictions are keyed by sporttery matchId (体彩), but results from
 * football-data.org carry football-data ids. To settle a sporttery-keyed
 * prediction against a football-data score, both sides are normalized to a
 * canonical team key via `normalizeTeamKey`, then matched on the ordered
 * `[homeKey, awayKey]` pair. The output rewrites each result's matchId to the
 * sporttery matchId so the runner's `resultIndex.get(matchId)` hits.
 *
 * Matches that fail to join (unknown team name, home/away swapped, or a
 * fixture/result present on only one side) are skipped — never throw. The
 * caller receives a `warnings` list describing what was dropped so it can log.
 *
 * Home/away must agree in order. The sporttery payload puts the listed home
 * side first; football-data does the same, so a direct ordered match is the
 * common case. An unordered fallback (either orientation) is also tried so a
 * neutral-venue listing difference does not silently drop a match.
 */
import type { RegularTimeResult } from '../domain/types.js'
import { normalizeTeamKey } from '../data/team-names.js'

export interface JoinOutcome {
  /** Results whose matchId was rewritten to the sporttery matchId. */
  results: RegularTimeResult[]
  /** Human-readable notes for results that could not be joined. */
  warnings: string[]
}

/** Minimal fixture shape the join needs (id + team names). */
type JoinFixture = { id: string; homeTeam: string; awayTeam: string }

/** A fixture keyed by its normalized [home,away] tuple (ordered + unordered). */
interface FixtureIndex {
  byOrdered: Map<string, JoinFixture[]>
  byUnordered: Map<string, JoinFixture[]>
}

function orderedKey(home: string, away: string): string {
  return `${home}|${away}`
}

/** For unordered matching: the two team keys sorted, joined. */
function unorderedKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

function buildFixtureIndex(
  fixtures: Array<{ id: string; homeTeam: string; awayTeam: string }>,
): FixtureIndex {
  const byOrdered = new Map<string, JoinFixture[]>()
  const byUnordered = new Map<string, JoinFixture[]>()
  for (const f of fixtures) {
    const home = normalizeTeamKey(f.homeTeam)
    const away = normalizeTeamKey(f.awayTeam)
    if (!home || !away) continue
    const ok = orderedKey(home, away)
    const uk = unorderedKey(home, away)
    ;(byOrdered.get(ok) ?? byOrdered.set(ok, []).get(ok)!).push(f)
    ;(byUnordered.get(uk) ?? byUnordered.set(uk, []).get(uk)!).push(f)
  }
  return { byOrdered, byUnordered }
}

/**
 * Rewrite football-data result matchIds onto sporttery fixture matchIds.
 *
 * The `results` array is keyed by football-data ids; we don't have the FD team
 * names here, so the caller must supply `resultTeams: Record<fdMatchId,
 * [homeEn, awayEn]>` (built from the same FD `/matches` fetch that produced the
 * scores). This keeps the adapter pure and testable.
 */
export function joinResultsToFixtures(args: {
  fixtures: Array<{ id: string; homeTeam: string; awayTeam: string }>
  /** football-data matchId → [homeEnglishName, awayEnglishName]. */
  resultTeams: Record<string, [string, string]>
  results: RegularTimeResult[]
}): JoinOutcome {
  const { fixtures, resultTeams, results } = args
  const idx = buildFixtureIndex(fixtures)
  const out: RegularTimeResult[] = []
  const warnings: string[] = []

  for (const r of results) {
    const teams = resultTeams[r.matchId]
    if (!teams) {
      warnings.push(`no team names for result ${r.matchId}; skipped`)
      continue
    }
    const [homeEn, awayEn] = teams
    const home = normalizeTeamKey(homeEn)
    const away = normalizeTeamKey(awayEn)
    if (!home || !away) {
      warnings.push(
        `unmapped team name for result ${r.matchId}: ${homeEn} vs ${awayEn}; skipped`,
      )
      continue
    }

    // Prefer an ordered (home|away) match; fall back to unordered orientation.
    let target = idx.byOrdered.get(orderedKey(home, away))?.[0]
    if (!target) {
      const candidates = idx.byUnordered.get(unorderedKey(home, away))
      if (candidates?.length) {
        target = candidates[0]
        warnings.push(
          `home/away swapped for ${homeEn} vs ${awayEn} (result ${r.matchId}); matched fixture ${target.id}`,
        )
      }
    }

    if (!target) {
      warnings.push(
        `no fixture found for ${homeEn} vs ${awayEn} (result ${r.matchId}); skipped`,
      )
      continue
    }

    out.push({ ...r, matchId: target.id })
  }

  return { results: out, warnings }
}
