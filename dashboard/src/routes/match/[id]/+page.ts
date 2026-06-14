import type { PageLoad } from './$types.js'
import type { Bet, Fixture, Prediction } from '$lib/types'

/**
 * Load: try to gather each agent's prediction + bets for this match.
 *
 * Sources (all under /data/, all optional):
 *   /data/fixtures.json        → Fixture[] (to label the match)
 *   /data/leaderboard.json     → for the list of agent ids
 *   /data/agents/<id>/predictions/<matchId>.json
 *   /data/agents/<id>/bets/<matchId>.json
 *
 * Everything is defensive: any 404 or parse error is swallowed and the page
 * still renders (possibly an empty "no data for this match" state). This
 * matters because in empty-data builds none of these files exist.
 */
export const load: PageLoad = async ({ params, fetch }) => {
  const matchId = params.id

  // Fixture label (best-effort).
  let fixture: Fixture | undefined
  try {
    const fr = await fetch('/data/fixtures.json')
    if (fr.ok) {
      const arr = (await fr.json()) as Fixture[]
      fixture = arr.find((f) => f.id === matchId)
    }
  } catch {
    /* ignore */
  }

  // Resolve agent ids from the leaderboard if present.
  let agentIds: string[] = []
  try {
    const lr = await fetch('/data/leaderboard.json')
    if (lr.ok) {
      const lb = (await lr.json()) as {
        accuracy?: Array<{ agentId: string }>
        betting?: Array<{ agentId: string }>
      }
      const ids = new Set<string>()
      for (const a of lb.accuracy ?? []) ids.add(a.agentId)
      for (const b of lb.betting ?? []) ids.add(b.agentId)
      agentIds = [...ids]
    }
  } catch {
    /* ignore */
  }

  const rows: Array<{ agentId: string; prediction?: Prediction; bets?: Bet[] }> = []

  for (const agentId of agentIds) {
    const row: { agentId: string; prediction?: Prediction; bets?: Bet[] } = { agentId }
    try {
      const pr = await fetch(`/data/agents/${agentId}/predictions/${matchId}.json`)
      if (pr.ok) row.prediction = (await pr.json()) as Prediction
    } catch {
      /* ignore */
    }
    try {
      const br = await fetch(`/data/agents/${agentId}/bets/${matchId}.json`)
      if (br.ok) row.bets = (await br.json()) as Bet[]
    } catch {
      /* ignore */
    }
    rows.push(row)
  }

  return { matchId, fixture, rows }
}
