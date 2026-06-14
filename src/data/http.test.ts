import { describe, expect, it, vi } from 'vitest'
import { fetchJson } from './http.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function errorResponse(status: 429 | 500): Response {
  return new Response('err', { status })
}

describe('fetchJson', () => {
  it('succeeds on first try with no retries', async () => {
    const f = vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch
    const data = await fetchJson<{ ok: boolean }>('https://x/y', { fetchImpl: f })
    expect(data).toEqual({ ok: true })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('retries then succeeds: fails twice, succeeds on 3rd attempt (3 attempts total)', async () => {
    let calls = 0
    const f = vi.fn(async () => {
      calls++
      if (calls < 3) return errorResponse(500)
      return jsonResponse({ recovered: true })
    }) as unknown as typeof fetch

    const data = await fetchJson<{ recovered: boolean }>('https://x/y', {
      fetchImpl: f,
      retries: 3,
    })
    expect(data).toEqual({ recovered: true })
    expect(f).toHaveBeenCalledTimes(3) // initial + 2 retries
    expect(calls).toBe(3)
  })

  it('throws after exhausting retries on persistent non-2xx', async () => {
    const f = vi.fn(async () => errorResponse(429)) as unknown as typeof fetch
    await expect(
      fetchJson('https://x/y', { fetchImpl: f, retries: 2 }),
    ).rejects.toThrow(/HTTP 429/)
    // initial + 2 retries = 3 attempts
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('retries on network error then succeeds', async () => {
    let calls = 0
    const f = vi.fn(async () => {
      calls++
      if (calls === 1) throw new TypeError('fetch failed')
      return jsonResponse({ after: 'neterr' })
    }) as unknown as typeof fetch
    const data = await fetchJson<{ after: string }>('https://x/y', {
      fetchImpl: f,
      retries: 3,
    })
    expect(data).toEqual({ after: 'neterr' })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('passes headers through', async () => {
    const f = vi.fn(async () => jsonResponse({})) as unknown as typeof fetch
    await fetchJson('https://x/y', {
      fetchImpl: f,
      headers: { 'X-Auth-Token': 'tok' },
    })
    expect(f).toHaveBeenCalledWith(
      'https://x/y',
      expect.objectContaining({ headers: { 'X-Auth-Token': 'tok' } }),
    )
  })
})
