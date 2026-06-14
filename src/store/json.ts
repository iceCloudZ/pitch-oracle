import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

/**
 * mkdir -p parents, write to a temp file, then atomic rename. The temp name
 * is unique per call (pid + uuid) so concurrent writers to the same path
 * can't collide; on failure the temp file is removed.
 */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await fs.rename(tmp, filePath)
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw e as Error
  }
}
