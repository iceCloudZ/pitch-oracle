/**
 * Small pure formatting helpers used by the leaderboard + match pages.
 * Implemented defensively: any non-finite input renders as "—" rather than NaN.
 */

/** Format a 0..1 ratio as e.g. "12.3%". Guarded for NaN/undefined. */
export function pct(x: number | undefined | null): string {
  if (x == null || !Number.isFinite(x)) return '—'
  return `${(x * 100).toFixed(1)}%`
}

/** Format a unit count with one decimal, e.g. "3.5". Guarded. */
export function units(x: number | undefined | null): string {
  if (x == null || !Number.isFinite(x)) return '—'
  return x.toFixed(1)
}

/** Format an already-percent value (e.g. roiPct) with one decimal. */
export function pctValue(x: number | undefined | null): string {
  if (x == null || !Number.isFinite(x)) return '—'
  return `${x.toFixed(1)}%`
}

/**
 * Human-readable staleness of an ISO timestamp vs. now, e.g. "3.2h ago".
 * Returns "—" if the timestamp is missing or unparseable.
 */
export function oddsStaleness(iso: string | undefined | null, now: number = Date.now()): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  const hours = (now - t) / 3_600_000
  if (!Number.isFinite(hours)) return '—'
  if (hours < 1 / 60) return 'just now'
  if (hours < 1) return `${Math.round(hours * 60)}m ago`
  if (hours < 48) return `${hours.toFixed(1)}h ago`
  const days = hours / 24
  return `${days.toFixed(1)}d ago`
}
