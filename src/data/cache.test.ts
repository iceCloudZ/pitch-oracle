import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { cached } from './cache.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), `pitch-cache-${randomUUID()}`))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('cached', () => {
  it('calls producer on miss and returns its value', async () => {
    const producer = vi.fn(async () => ({ v: 42 }))
    const out = await cached('k1', 10_000, producer, dir)
    expect(out).toEqual({ v: 42 })
    expect(producer).toHaveBeenCalledTimes(1)
  })

  it('does NOT call producer on a fresh hit (miss → produce → hit)', async () => {
    const producer = vi.fn(async () => ({ v: 'first' }))
    await cached('k2', 60_000, producer, dir) // miss → produce
    await cached('k2', 60_000, producer, dir) // hit
    expect(producer).toHaveBeenCalledTimes(1)
  })

  it('re-runs producer after the TTL expires', async () => {
    const producer = vi.fn(async () => ({ n: Math.random() }))
    await cached('k3', 1, producer, dir) // miss → produce
    // Wait past TTL.
    await new Promise((r) => setTimeout(r, 15))
    await cached('k3', 1, producer, dir) // stale → produce again
    expect(producer).toHaveBeenCalledTimes(2)
  })

  it('treats a corrupt cache file as a miss', async () => {
    const { writeJsonAtomic } = await import('../store/json.js')
    // Hand-write a malformed entry (bad JSON shape, expiresAt not a number).
    await writeJsonAtomic(join(dir, 'k4.json'), { bogus: true })
    const producer = vi.fn(async () => ({ recovered: true }))
    const out = await cached('k4', 60_000, producer, dir)
    expect(out).toEqual({ recovered: true })
    expect(producer).toHaveBeenCalledTimes(1)
  })
})
