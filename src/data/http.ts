/**
 * Shared HTTP helper: fetch + parse JSON with timeout and exponential-backoff
 * retry. Adapters pass an injectable `fetchImpl` (defaults to `globalThis.fetch`)
 * so tests are fully deterministic and network-free.
 */

export interface FetchJsonOptions {
  headers?: Record<string, string>
  /** Request timeout in ms. Default 10000. */
  timeoutMs?: number
  /** Number of retries after the initial attempt. Default 3. */
  retries?: number
  /** Injectable fetch (defaults to globalThis.fetch). */
  fetchImpl?: typeof fetch
}

/** Resolve after `ms` (cancellable via the supplied AbortSignal). */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Fetch + parse JSON. Throws on non-2xx (or network/timeout) after `retries`
 * retries with exponential backoff: base 500ms * 2^attempt, capped near 8s,
 * with a small per-attempt jitter.
 *
 * Returns the parsed JSON. A `Response` is a success only when `response.ok`
 * is true (2xx). 429 and any other non-2xx are retried.
 */
export async function fetchJson<T>(
  url: string,
  opts: FetchJsonOptions = {},
): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const timeoutMs = opts.timeoutMs ?? 10000
  const retries = opts.retries ?? 3

  let lastError: unknown = new Error(`fetch failed: ${url}`)

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 500 * 2^(attempt-1), capped ~8s, ±25% jitter.
      const base = Math.min(500 * 2 ** (attempt - 1), 8000)
      const jitter = base * (0.75 + Math.random() * 0.5)
      await sleep(jitter)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: opts.headers,
        signal: controller.signal,
      })
      if (!response.ok) {
        lastError = new Error(
          `HTTP ${response.status} ${response.statusText} for ${url}`,
        )
        continue
      }
      return (await response.json()) as T
    } catch (e) {
      lastError = e
      continue
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`fetch failed after ${retries + 1} attempts: ${url}`)
}
