import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { readJson, writeJsonAtomic } from './json.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), `pitch-${randomUUID()}`))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('json store', () => {
  it('writeJsonAtomic writes and creates parent dirs', async () => {
    const file = join(dir, 'a', 'b', 'data.json')
    await writeJsonAtomic(file, { x: 1 })
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ x: 1 })
  })
  it('readJson returns null when missing', async () => {
    expect(await readJson(join(dir, 'nope.json'))).toBeNull()
  })
  it('readJson round-trips', async () => {
    const file = join(dir, 'data.json')
    await writeJsonAtomic(file, { hello: 'world' })
    expect(await readJson(file)).toEqual({ hello: 'world' })
  })
})
