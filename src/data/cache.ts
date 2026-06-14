/**
 * Tiny TTL file cache for adapter responses, built on `src/store/json.ts`.
 * Wraps a producer: on a cache miss it calls the producer, persists the value
 * with an `expiresAt` stamp, and returns it. On a hit (now < expiresAt) the
 * producer is never called.
 */
import path from 'node:path'
import { readJson, writeJsonAtomic } from '../store/json.js'

export interface CacheEntry<T> {
  expiresAt: number
  data: T
}

/**
 * Return the cached value for `key` if fresh, else invoke `producer()` and
 * store its result with a TTL. Entries live at `<cacheDir>/<key>.json`.
 *
 * Stale, corrupt, or missing entries are treated as a miss (the producer runs).
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
  cacheDir = 'data/cache',
): Promise<T> {
  const file = path.join(cacheDir, `${key}.json`)
  const now = Date.now()

  const existing = await readJson<CacheEntry<T>>(file).catch(() => null)
  if (existing && typeof existing.expiresAt === 'number' && existing.expiresAt > now) {
    return existing.data
  }

  const data = await producer()
  const entry: CacheEntry<T> = { expiresAt: now + ttlMs, data }
  await writeJsonAtomic(file, entry).catch(() => {
    // A failed cache write should not surface to callers; treat as a soft miss.
  })
  return data
}
