# pitch-oracle Dashboard + CI Implementation Plan (Plan 4 of 4)

> **Execution note:** Author full code from these specs. The dashboard must build (`npm run build` inside `dashboard/`). CI workflow YAML must be syntactically valid (yaml-lint if available, else careful authoring — can't run Actions locally). Typecheck the TS. Commit logical groups. After this plan, run the repo-wide integrated `npm run typecheck && npm test` + the dashboard build.

**Goal:** A static SvelteKit dashboard rendering the arena (leaderboards, per-match predictions, value bets, diaries, disclaimer) from the generated `data/` JSON, plus GitHub Actions for CI (test/typecheck/build) and a daily cron that runs the arena and archives data.

**Architecture:** Dashboard is a separate SvelteKit app under `dashboard/` (own `package.json`), using `@sveltejs/adapter-static` + prerender. A small `sync-data` script copies repo-root `data/**/*.json` → `dashboard/static/data/**` before build, so the static site reads `/data/...`. The root `package.json` gains a `dashboard` script. CI: `ci.yml` (root: lint/typecheck/test/build) and `daily.yml` (cron: score→predict→commit `data/` to a `data` branch).

**Tech:** SvelteKit, `@sveltejs/adapter-static`, `@sveltejs/kit`, `svelte`, `vite`, TypeScript. GitHub Actions YAML.

---

## File Structure
```
dashboard/
  package.json            # svelte, @sveltejs/kit, adapter-static, vite, ts
  svelte.config.js        # adapter-static, prerender { entries: ['*'] }
  vite.config.ts          # sveltekit(); paths.base from BASE_PATH env (default '')
  tsconfig.json           # extends .svelte-kit/tsconfig
  src/
    app.html
    routes/
      +layout.ts          # export const prerender = true
      +page.svelte        # leaderboard (accuracy + betting) + disclaimer footer
      match/[id]/+page.ts # load prediction/bets JSON for a match
      match/[id]/+page.svelte
    lib/
      types.ts            # dashboard-side view types (mirror engine outputs)
      format.ts           # pct(), units(), oddsStaleness(ts)
  static/
    data/                 # populated by sync-data (gitignored, except a README)
  scripts/
    sync-data.mjs         # copy repo-root data/**/*.json -> dashboard/static/data/**
.github/
  workflows/
    ci.yml                # push/PR: install, typecheck, test, build (root + dashboard)
    daily.yml             # cron during WC: score+predict, commit data/ to 'data' branch
```

## Module specs

### `dashboard/package.json`
- `name: "pitch-oracle-dashboard"`, `private: true`, `type: "module"`.
- scripts: `dev`, `build` (`vite build`), `preview`, `sync` (`node scripts/sync-data.mjs`), `check` (`svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`).
- deps: `@sveltejs/adapter-static`, `@sveltejs/kit`, `svelte`, `vite`. devDeps: `typescript`, `svelte-check`, `@sveltejs/vite-plugin-svelte`.
- Use recent majors (Svelte 5 / Kit 2 / Vite 5). If a version resolves oddly, pick a known-good combo (kit 2 + svelte 5 + vite 5).

### `dashboard/svelte.config.js`
```js
import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter({ fallback: undefined, strict: false }) },
}
```
`src/routes/+layout.ts`: `export const prerender = true; export const ssr = true;`

### `dashboard/vite.config.ts`
```ts
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [sveltekit()],
})
```
(Handle base path later if deploying under a subpath; MVP serves at root.)

### `dashboard/scripts/sync-data.mjs`
- Recursively copy `<repo>/data/**` → `<dashboard>/static/data/**` (mirror structure). Skip if source dir missing (warn, copy nothing — site still builds with empty data + a friendly empty state). Use `node:fs/promises` recursion. Idempotent (clears target `static/data` first).

### `dashboard/src/lib/types.ts` & `format.ts`
- `types.ts`: view interfaces mirroring `AccuracyStats`, `BettingStats`, `Bet`, `Prediction` (re-declare as plain shapes — no import from root src; the dashboard is a separate package).
- `format.ts`: `pct(x) => \`${(x*100).toFixed(1)}%\``, `units(x) => x.toFixed(1)`, `oddsStaleness(iso) => \`${hours}h ago\`` (guard if missing).
- Test (vitest in dashboard): `format.ts` functions.

### `dashboard/src/routes/+page.svelte` (leaderboard)
- On mount/load, `fetch('/data/leaderboard.json')`; if it 404s/empty, render an empty state ("No arena data yet — run `arena score`.").
- Render TWO tables: **Accuracy** (agent, points, matches, exact, result-correct, Brier) and **Betting P/L** (agent, settled, won, staked, P/L, ROI). Color positive P/L green, negative red.
- Sticky **red disclaimer banner**: "模拟投注试算，非财务建议。18+。理性博彩。" + footer with same.
- All copy bilingual-ish is optional; Chinese is fine (owner is CN).

### `dashboard/src/routes/match/[id]/+page.{ts,svelte}`
- `+page.ts` `load`: read params.id; `fetch('/data/agents.json')` is not needed — instead enumerate is tricky from static; SIMPLEST MVP: the match page loads `/data/leaderboard.json` already shown on index, so **defer the per-match page** — make `+page.svelte` a minimal "per-match view coming soon" OR implement it by loading a known fixture list from `/data/fixtures.json` (root data) and listing each agent's `/data/agents/{id}/predictions/{matchId}.json`. 
- **Decision for implementer:** implement the simplest useful version: index lists matches from `/data/fixtures.json`; each links to `/match/[id]` which fetches `/data/agents/<each id>/predictions/<id>.json`. To know agent ids, read `/data/agents.json` IF it exists, else skip. Keep it defensive (many 404s in empty state). If this proves fiddly, ship the leaderboard-only index and a stub match page — correctness of the leaderboard is the priority.

### Root `package.json` additions
- `"dashboard:sync": "node dashboard/scripts/sync-data.mjs"`, `"dashboard:build": "npm run dashboard:sync && cd dashboard && npm install && npm run build"`.

### `.github/workflows/ci.yml`
- Triggers: push (main), pull_request. Job `build`: ubuntu-latest, node 20, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. (Don't build the dashboard in CI to keep it fast — or add a second job; implementer's call, keep MVP.)

### `.github/workflows/daily.yml`
- Trigger: `schedule: cron: '17 6 * * *'` (daily ~06:17 UTC during WC; off-season it no-ops because no fixtures). Manual `workflow_dispatch`.
- Job `arena`: ubuntu-latest, node 20. Steps: checkout, `npm ci`, set env keys from repo SECRETS (`FOOTBALL_DATA_API_KEY`, `THE_ODDS_API_KEY`, `BRAVE_API_KEY`, agent keys). Run `npx tsx src/cli.ts score` then `npx tsx src/cli.ts predict`. Then commit `data/` and push to a `data` branch:
  ```yaml
  - run: |
      git config user.email arena@pitch-oracle
      git config user.name pitch-oracle-arena
      git checkout -B data
      git add data
      git commit -m "data: arena run $(date -u +%FT%TZ)" || echo "no changes"
      git push origin data --force
  ```
- Comment clearly that keys come from Secrets and the `data` branch is an archive (dashboard deploy wiring is env-specific; left as a documented TODO in the workflow comments).

## Honest constraints
- Can't run GitHub Actions locally — author YAML carefully; optionally `npx --yes yaml-lint .github/workflows/*.yml`.
- Empty-data state must not crash the dashboard (sync may copy nothing; leaderboard may 404).
- The dashboard is a separate package (own node_modules) — root `npm ci` won't install it; the `dashboard:build` script handles `cd dashboard && npm install`.

## Self-check before reporting
- `cd dashboard && npm install && npm run sync && npm run build` succeeds (a static bundle is emitted under `dashboard/build`). Empty data → still builds.
- `npm run typecheck` at root still clean (don't break the engine).
- YAML lints clean (or is carefully authored).
- Commit groups: `feat(dashboard): scaffold + leaderboard`, `feat(ci): add ci + daily workflows`, etc. Trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Report
- Status, commit SHAs, output of `cd dashboard && npm run build` (success + build dir), root `npx tsc --noEmit`, any yaml-lint result, concerns/deviations.