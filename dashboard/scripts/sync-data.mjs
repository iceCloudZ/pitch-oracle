// @ts-check
/**
 * sync-data.mjs: copy repo-root data/ JSON into the dashboard static/data
 * directory so the prerendered site can read them from /data/...
 *
 * Recursively mirrors every .json file under (repo-root)/data into
 * (dashboard)/static/data, preserving subdirectory structure.
 *
 * Resilient to empty/missing source: if (repo-root)/data does not exist or
 * holds no JSON, we still produce an empty static/data directory so the site
 * builds and renders a friendly empty state.
 *
 * Idempotent and safe for committed files: only .json files under the target
 * are removed before copying (so committed non-JSON siblings such as
 * README.md and .gitkeep are preserved across runs).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dashboardDir = path.resolve(__dirname, '..')
// Dashboard lives at <repo>/dashboard; repo root is one level up.
const repoRoot = path.resolve(dashboardDir, '..')
const sourceDir = path.join(repoRoot, 'data')
const targetDir = path.join(dashboardDir, 'static', 'data')

/** Recursively read every file under `dir` (relative paths returned). */
async function walk(dir) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return []
    throw e
  }
  const out = []
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      const sub = await walk(full)
      for (const s of sub) out.push(path.join(ent.name, s))
    } else if (ent.isFile()) {
      out.push(ent.name)
    }
  }
  return out
}

/** Remove every .json file under `dir` (recursive), then prune empty dirs. */
async function clearJson(dir) {
  const rels = await walk(dir)
  for (const rel of rels) {
    if (!rel.endsWith('.json')) continue
    await fs.unlink(path.join(dir, rel)).catch(() => {})
  }
  // Best-effort prune of now-empty subdirectories (non-recursive up-leaves).
  await pruneEmptyDirs(dir, dir)
}

/** Remove empty subdirectories under root, leaving root itself intact. */
async function pruneEmptyDirs(dir, root) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    const sub = path.join(dir, ent.name)
    await pruneEmptyDirs(sub, root)
    const subEntries = await fs.readdir(sub).catch(() => [])
    if (subEntries.length === 0 && sub !== root) {
      await fs.rmdir(sub).catch(() => {})
    }
  }
}

async function main() {
  console.log(`[sync-data] source: ${sourceDir}`)
  console.log(`[sync-data] target: ${targetDir}`)

  await fs.mkdir(targetDir, { recursive: true })
  await clearJson(targetDir)

  const sourceExists = await fs
    .access(sourceDir)
    .then(() => true)
    .catch(() => false)

  let copied = 0
  if (!sourceExists) {
    console.warn('[sync-data] source data/ missing — emitting empty data dir.')
  } else {
    const files = await walk(sourceDir)
    for (const rel of files) {
      if (!rel.endsWith('.json')) continue
      const from = path.join(sourceDir, rel)
      const to = path.join(targetDir, rel)
      await fs.mkdir(path.dirname(to), { recursive: true })
      await fs.copyFile(from, to)
      copied += 1
    }
    if (copied === 0) {
      console.warn('[sync-data] source data/ has no .json — emitting empty data dir.')
    }
  }

  console.log(`[sync-data] done: copied ${copied} JSON file(s).`)
}

main().catch((e) => {
  console.error('[sync-data] failed:', e)
  // Never fail the build over a missing/empty data dir.
  process.exit(0)
})
