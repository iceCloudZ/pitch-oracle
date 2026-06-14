# pitch-oracle Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the deterministic, fully-tested core engine of pitch-oracle — domain types, Zod schemas, and all probability/EV/Kelly/scoring/Brier/settlement/leaderboard math plus an atomic JSON store — as a standalone library with zero external API dependencies.

**Architecture:** Pure TypeScript (ESM, Node 20+) modules under `src/engine/` and `src/domain/`, each with one responsibility, developed test-first (Vitest). No I/O except the JSON store. The engine is the foundation Plans 2–4 build on (data layer → agents+CLI → dashboard+CI).

**Tech Stack:** TypeScript 5 (NodeNext/strict), Vitest 2, Zod 3, Prettier, ESLint (typescript-eslint). Single dep at runtime: `zod`.

---

## Scope & Roadmap

The full MVP (design: `docs/superpowers/specs/2026-06-14-pitch-oracle-design.md`) is decomposed into sequenced plans. **This is Plan 1 of 4.**

| Plan | Scope | Status |
|---|---|---|
| **1 — Core engine (this doc)** | Scaffold + types/schemas + probability/EV/Kelly/scoring/Brier/settlement/leaderboard + JSON store | Active |
| 2 — Data layer | fixtures (football-data.org), odds+results (the-odds-api), news (Brave→DDG), cache/retry | Next |
| 3 — Agents + CLI | OpenAI-compatible client, prompt, runner, `llm`/`manual`/`human-augmented` agents, `citty` commands | Later |
| 4 — Dashboard + CI | SvelteKit static site, GitHub Actions cron + test workflows, README | Later |

**Plan 1 exit criteria:** `npm test` is green, every pure function is unit-tested, `npm run typecheck` passes, and the engine compiles to `dist/`. No network calls exist yet.

---

## File Structure (Plan 1)

```
pitch-oracle/
  package.json                 # deps + scripts (Task 1)
  tsconfig.json                # ESM, NodeNext, strict (Task 1)
  vitest.config.ts             # test runner (Task 1)
  eslint.config.mjs            # lint (Task 1)
  .prettierrc                  # format (Task 1)
  .env.example                 # keys for later plans (Task 1)
  README.md                    # stub (Task 1)
  LICENSE                      # MIT (Task 1)
  src/
    index.ts                   # package barrel (Task 1 → grown in Task 13)
    index.test.ts              # scaffold sanity test (Task 1)
    domain/
      types.ts                 # plain TS types: Prediction, Bet, MatchOdds, etc. (Task 2)
      schemas.ts               # Zod schemas, incl. ^\d+-\d+$ score (Task 3)
    engine/
      prob.ts                  # clamp, normalize, smooth (Task 4)
      odds.ts                  # implied prob, devig (Task 5)
      value.ts                 # EV, Kelly, fractional Kelly, stake (Task 6)
      bets.ts                  # computeBets — composes 4-6 (Task 7)
      scoring.ts               # accuracy scoring (Task 8)
      brier.ts                 # Brier score (Task 9)
      settlement.ts            # settleBet P/L (Task 10)
      leaderboard.ts           # aggregateAccuracy / aggregateBetting (Task 11)
      index.ts                 # engine barrel (Task 13)
    store/
      json.ts                  # atomic read/write JSON (Task 12)
  (tests co-located as *.test.ts next to each module)
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, `.prettierrc`, `.env.example`, `README.md`, `LICENSE`
- Create: `src/index.ts`, `src/index.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pitch-oracle",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Multi-agent football prediction arena with odds-driven EV/Kelly bet sizing.",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "build": "tsc"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@types/node": "^20.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "dashboard"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create `eslint.config.mjs`**

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ['dist/', 'dashboard/', 'coverage/'] },
)
```

- [ ] **Step 5: Create `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 6: Create `.env.example`**

```
# Data source API keys (Plans 2+). Copy to .env, never commit .env.
FOOTBALL_DATA_API_KEY=
THE_ODDS_API_KEY=
BRAVE_API_KEY=
TAVILY_API_KEY=
# Default virtual bankroll for simulated betting (units)
BANKROLL=1000
```

- [ ] **Step 7: Create `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 pitch-oracle contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 8: Create `README.md` (stub)**

````markdown
# pitch-oracle

Multi-agent football prediction arena. N OpenAI-compatible AI models + a human contestant + a human-augmented agent compete to predict World Cup 2026 matches (W/D/L + scorelines), with odds-driven EV + Kelly bet sizing.

> ⚠️ **Educational/analytical tool only. Not financial advice. 18+. Gamble responsibly. Simulated bankroll only — never connects to a real sportsbook.**

Status: **core engine (in development)**. Full design: `docs/superpowers/specs/2026-06-14-pitch-oracle-design.md`.

## Develop

```bash
npm install
npm test          # vitest
npm run typecheck
```

## License

MIT
````

- [ ] **Step 9: Create `src/index.ts` (placeholder barrel)**

```ts
// pitch-oracle package barrel. Populated in Task 13.
export {}
```

- [ ] **Step 10: Create `src/index.test.ts` (sanity)**

```ts
import { describe, expect, it } from 'vitest'

describe('scaffold', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 11: Install dependencies**

Run: `npm install`
Expected: completes without error; `node_modules/` and `package-lock.json` created.

- [ ] **Step 12: Verify typecheck + tests pass**

Run: `npm run typecheck && npm test`
Expected: `tsc --noEmit` exits 0; vitest reports 1 passed test (`scaffold > runs vitest`).

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold pitch-oracle core engine"
```

---

## Task 2: Domain Types

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/types.test.ts`

- [ ] **Step 1: Create `src/domain/types.ts`**

```ts
export type MatchOutcome = 'home' | 'draw' | 'away'

export interface ResultProbs {
  home: number
  draw: number
  away: number
}

export interface ScoreProb {
  score: string // "2-1"
  prob: number
}

export interface Prediction {
  agentId: string
  matchId: string
  resultProbs: ResultProbs
  scoreProbs: ScoreProb[]
  confidence: number
  reasoning: string
  createdAt: string // ISO
}

export interface MatchOdds {
  matchId: string
  home: number
  draw: number
  away: number
  timestamp: string // ISO — snapshot moment
}

export interface Bet {
  matchId: string
  agentId: string
  market: MatchOutcome // MVP: 1x2 only
  modelProb: number
  impliedProb: number
  decimalOdds: number
  oddsTimestamp: string // ISO
  ev: number
  kellyFraction: number
  recommendedStakePct: number
}

export interface RegularTimeResult {
  matchId: string
  homeScore: number
  awayScore: number
}

export interface BetSettlement {
  bet: Bet
  stakeUnits: number
  pnlUnits: number
  won: boolean
}
```

- [ ] **Step 2: Create `src/domain/types.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { Bet, MatchOdds, MatchOutcome, Prediction, RegularTimeResult } from './types.js'

describe('domain types are usable', () => {
  it('constructs a Prediction', () => {
    const p: Prediction = {
      agentId: 'claude',
      matchId: 'm1',
      resultProbs: { home: 0.5, draw: 0.3, away: 0.2 },
      scoreProbs: [{ score: '2-1', prob: 0.18 }],
      confidence: 0.6,
      reasoning: 'home advantage',
      createdAt: '2026-06-14T00:00:00Z',
    }
    expect(p.resultProbs.home).toBe(0.5)
  })

  it('constructs a 1x2 Bet', () => {
    const b: Bet = {
      matchId: 'm1',
      agentId: 'claude',
      market: 'home' satisfies MatchOutcome,
      modelProb: 0.5,
      impliedProb: 0.36,
      decimalOdds: 2.78,
      oddsTimestamp: '2026-06-14T00:00:00Z',
      ev: 0.39,
      kellyFraction: 0.2,
      recommendedStakePct: 0.05,
    }
    expect(b.market).toBe('home')
  })

  it('constructs result + odds', () => {
    const r: RegularTimeResult = { matchId: 'm1', homeScore: 2, awayScore: 1 }
    const o: MatchOdds = { matchId: 'm1', home: 2.78, draw: 3.4, away: 2.5, timestamp: 't' }
    expect(r.homeScore + o.home).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: typecheck exits 0; 4 tests pass (1 scaffold + 3 domain).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(domain): add core types"
```

---

## Task 3: Zod Schemas

**Files:**
- Create: `src/domain/schemas.ts`
- Create: `src/domain/schemas.test.ts`

- [ ] **Step 1: Write the failing test `src/domain/schemas.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { matchOddsSchema, predictionSchema, scoreSchema } from './schemas.js'

const validPrediction = {
  agentId: 'claude',
  matchId: 'm1',
  resultProbs: { home: 0.5, draw: 0.3, away: 0.2 },
  scoreProbs: [{ score: '2-1', prob: 0.18 }],
  confidence: 0.6,
  reasoning: 'x',
  createdAt: '2026-06-14T00:00:00Z',
}

describe('scoreSchema', () => {
  it('accepts "2-1"', () => expect(scoreSchema.safeParse('2-1').success).toBe(true))
  it('rejects "2:1"', () => expect(scoreSchema.safeParse('2:1').success).toBe(false))
  it('rejects prose', () => expect(scoreSchema.safeParse('home win').success).toBe(false))
})

describe('predictionSchema', () => {
  it('parses a valid prediction', () => {
    expect(predictionSchema.safeParse(validPrediction).success).toBe(true)
  })
  it('rejects more than 5 scoreProbs', () => {
    const six = {
      ...validPrediction,
      scoreProbs: Array.from({ length: 6 }, (_, i) => ({ score: `${i}-${i}`, prob: 0.1 })),
    }
    expect(predictionSchema.safeParse(six).success).toBe(false)
  })
  it('rejects bad score format', () => {
    const bad = { ...validPrediction, scoreProbs: [{ score: '2:1', prob: 0.2 }] }
    expect(predictionSchema.safeParse(bad).success).toBe(false)
  })
})

describe('matchOddsSchema', () => {
  it('rejects odds <= 1', () => {
    expect(
      matchOddsSchema.safeParse({ matchId: 'm1', home: 0.9, draw: 3, away: 3, timestamp: 't' })
        .success,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/domain/schemas.test.ts`
Expected: FAIL — `Cannot find module './schemas.js'`.

- [ ] **Step 3: Implement `src/domain/schemas.ts`**

```ts
import { z } from 'zod'

export const scoreSchema = z.string().regex(/^\d+-\d+$/, 'score must look like "2-1"')

export const resultProbsSchema = z.object({
  home: z.number(),
  draw: z.number(),
  away: z.number(),
})

export const scoreProbSchema = z.object({
  score: scoreSchema,
  prob: z.number().nonnegative(),
})

export const predictionSchema = z.object({
  agentId: z.string().min(1),
  matchId: z.string().min(1),
  resultProbs: resultProbsSchema,
  scoreProbs: z.array(scoreProbSchema).max(5),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  createdAt: z.string().min(1),
})

export const matchOddsSchema = z.object({
  matchId: z.string().min(1),
  home: z.number().gt(1),
  draw: z.number().gt(1),
  away: z.number().gt(1),
  timestamp: z.string().min(1),
})

export type PredictionParsed = z.infer<typeof predictionSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/domain/schemas.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): add zod schemas with score format validation"
```

---

## Task 4: Probability Helpers (normalize / smooth)

**Files:**
- Create: `src/engine/prob.ts`
- Create: `src/engine/prob.test.ts`

- [ ] **Step 1: Write the failing test `src/engine/prob.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { clamp, normalizeProbs, normalizeResultProbs, smoothProbs } from './prob.js'

describe('clamp', () => {
  it('clamps to range', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-3, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})

describe('normalizeProbs', () => {
  it('scales to sum 1', () => {
    const n = normalizeProbs([2, 3, 5])
    expect(n[0]).toBeCloseTo(0.2)
    expect(n.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
  it('throws on non-positive sum', () => {
    expect(() => normalizeProbs([0, 0, 0])).toThrow()
  })
})

describe('normalizeResultProbs', () => {
  it('normalizes home/draw/away', () => {
    const r = normalizeResultProbs({ home: 2, draw: 2, away: 1 })
    expect(r.home + r.draw + r.away).toBeCloseTo(1)
    expect(r.away).toBeCloseTo(0.2)
  })
})

describe('smoothProbs', () => {
  it('clamps extremes then renormalizes', () => {
    const s = smoothProbs([0.999, 0.0005, 0.0005], 0.01)
    expect(s[0]).toBeLessThan(0.999)
    expect(s.every((p) => p >= 0 && p <= 1)).toBe(true)
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
  it('pulls a zero off the floor', () => {
    const s = smoothProbs([0, 0.5, 0.5], 0.01)
    expect(s[0]).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/engine/prob.test.ts`
Expected: FAIL — `Cannot find module './prob.js'`.

- [ ] **Step 3: Implement `src/engine/prob.ts`**

```ts
import type { ResultProbs } from '../domain/types.js'

export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x))
}

export function normalizeProbs(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0)
  if (sum <= 0) throw new Error('normalizeProbs: sum must be positive')
  return probs.map((p) => p / sum)
}

export function normalizeResultProbs(rp: ResultProbs): ResultProbs {
  const [home, draw, away] = normalizeProbs([rp.home, rp.draw, rp.away])
  return { home, draw, away }
}

/** Clamp each prob into [eps, 1-eps], then renormalize — prevents Kelly blowups at 0/1. */
export function smoothProbs(probs: number[], eps = 0.01): number[] {
  const clamped = probs.map((p) => clamp(p, eps, 1 - eps))
  return normalizeProbs(clamped)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/engine/prob.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add probability normalize/smooth helpers"
```

---

## Task 5: Odds Helpers (implied probability / devig)

**Files:**
- Create: `src/engine/odds.ts`
- Create: `src/engine/odds.test.ts`

- [ ] **Step 1: Write the failing test `src/engine/odds.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { devig, impliedProb, impliedResultProbs } from './odds.js'

describe('impliedProb', () => {
  it('is 1/odds', () => expect(impliedProb(2.5)).toBeCloseTo(0.4))
  it('throws on odds <= 1', () => {
    expect(() => impliedProb(1)).toThrow()
    expect(() => impliedProb(0.9)).toThrow()
  })
})

describe('devig', () => {
  it('removes the overround', () => {
    const d = devig([0.4, 0.35, 0.3]) // raw sum 1.05
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
})

describe('impliedResultProbs', () => {
  it('derives normalized probs from three odds', () => {
    const r = impliedResultProbs(2.5, 3.3, 3.0)
    expect(r.home + r.draw + r.away).toBeCloseTo(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/engine/odds.test.ts`
Expected: FAIL — `Cannot find module './odds.js'`.

- [ ] **Step 3: Implement `src/engine/odds.ts`**

```ts
import type { ResultProbs } from '../domain/types.js'
import { normalizeResultProbs } from './prob.js'

export function impliedProb(decimalOdds: number): number {
  if (decimalOdds <= 1) throw new Error('impliedProb: decimalOdds must be > 1')
  return 1 / decimalOdds
}

export function devig(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0)
  if (sum <= 0) throw new Error('devig: sum must be positive')
  return probs.map((p) => p / sum)
}

export function impliedResultProbs(
  homeOdds: number,
  drawOdds: number,
  awayOdds: number,
): ResultProbs {
  return normalizeResultProbs({
    home: impliedProb(homeOdds),
    draw: impliedProb(drawOdds),
    away: impliedProb(awayOdds),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/engine/odds.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add odds implied-probability and devig helpers"
```

---

## Task 6: Value Helpers (EV / Kelly / stake)

**Files:**
- Create: `src/engine/value.ts`
- Create: `src/engine/value.test.ts`

- [ ] **Step 1: Write the failing test `src/engine/value.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { expectedValue, fractionalKelly, kellyFraction, recommendedStakePct } from './value.js'

describe('expectedValue', () => {
  it('is modelProb*odds - 1', () => {
    expect(expectedValue(0.5, 2.5)).toBeCloseTo(0.25)
    expect(expectedValue(0.3, 2.0)).toBeCloseTo(-0.4)
  })
})

describe('kellyFraction', () => {
  it('applies the full-kelly formula', () => {
    // (0.5*2.5 - 1)/(2.5 - 1) = 0.25/1.5 = 0.1667
    expect(kellyFraction(0.5, 2.5)).toBeCloseTo(0.1667, 3)
  })
  it('is negative with no edge', () => {
    expect(kellyFraction(0.3, 2.0)).toBeLessThan(0)
  })
})

describe('fractionalKelly', () => {
  it('scales by the fraction', () => {
    expect(fractionalKelly(0.4, 0.25)).toBeCloseTo(0.1)
  })
})

describe('recommendedStakePct', () => {
  it('is zero on negative edge', () => {
    expect(recommendedStakePct(-0.1)).toBe(0)
  })
  it('caps at maxPerBet', () => {
    expect(recommendedStakePct(0.5, 0.1)).toBe(0.1)
  })
  it('passes a small positive through', () => {
    expect(recommendedStakePct(0.04, 0.1)).toBeCloseTo(0.04)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/engine/value.test.ts`
Expected: FAIL — `Cannot find module './value.js'`.

- [ ] **Step 3: Implement `src/engine/value.ts`**

```ts
import { clamp } from './prob.js'

export function expectedValue(modelProb: number, decimalOdds: number): number {
  return modelProb * decimalOdds - 1
}

export function kellyFraction(modelProb: number, decimalOdds: number): number {
  const b = decimalOdds - 1
  if (b <= 0) return 0
  return (modelProb * decimalOdds - 1) / b
}

export function fractionalKelly(kelly: number, fraction = 0.25): number {
  return kelly * fraction
}

/** Negative edge => 0; otherwise clamp into [0, maxPerBet]. */
export function recommendedStakePct(fractionalKellyValue: number, maxPerBet = 0.1): number {
  if (fractionalKellyValue <= 0) return 0
  return clamp(fractionalKellyValue, 0, maxPerBet)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/engine/value.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add EV, Kelly, fractional Kelly, stake sizing"
```

---

## Task 7: Bet Composition (`computeBets`)

**Files:**
- Create: `src/engine/bets.ts`
- Create: `src/engine/bets.test.ts`

- [ ] **Step 1: Write the failing test `src/engine/bets.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { computeBets } from './bets.js'
import type { MatchOdds, Prediction } from '../domain/types.js'

const pred = (resultProbs: Prediction['resultProbs']): Prediction => ({
  agentId: 'claude',
  matchId: 'm1',
  resultProbs,
  scoreProbs: [],
  confidence: 0.6,
  reasoning: 'x',
  createdAt: '2026-06-14T00:00:00Z',
})

const odds: MatchOdds = {
  matchId: 'm1',
  home: 2.0,
  draw: 3.5,
  away: 4.0,
  timestamp: '2026-06-14T00:00:00Z',
}

describe('computeBets', () => {
  it('emits a value bet where the model beats the market', () => {
    const bets = computeBets(pred({ home: 0.6, draw: 0.25, away: 0.15 }), odds)
    const home = bets.find((b) => b.market === 'home')
    expect(home).toBeTruthy()
    expect(home!.ev).toBeGreaterThan(0)
    expect(home!.recommendedStakePct).toBeGreaterThan(0)
    expect(home!.oddsTimestamp).toBe(odds.timestamp)
  })

  it('skips markets with no edge', () => {
    const bets = computeBets(pred({ home: 0.6, draw: 0.2, away: 0.2 }), odds)
    expect(bets.find((b) => b.market === 'away')).toBeUndefined()
  })

  it('caps stake at maxPerBet', () => {
    const bets = computeBets(pred({ home: 0.9, draw: 0.05, away: 0.05 }), odds, { maxPerBet: 0.1 })
    const home = bets.find((b) => b.market === 'home')
    expect(home!.recommendedStakePct).toBeLessThanOrEqual(0.1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/engine/bets.test.ts`
Expected: FAIL — `Cannot find module './bets.js'`.

- [ ] **Step 3: Implement `src/engine/bets.ts`**

```ts
import type { Bet, MatchOdds, MatchOutcome, Prediction } from '../domain/types.js'
import { normalizeResultProbs, smoothProbs } from './prob.js'
import { impliedProb } from './odds.js'
import { expectedValue, fractionalKelly, kellyFraction, recommendedStakePct } from './value.js'

export interface ComputeBetsOptions {
  evThreshold?: number // default 0
  kellyFractionRatio?: number // default 0.25
  maxPerBet?: number // default 0.1
  eps?: number // default 0.01
}

const MARKETS: MatchOutcome[] = ['home', 'draw', 'away']

export function computeBets(pred: Prediction, odds: MatchOdds, opts: ComputeBetsOptions = {}): Bet[] {
  const evThreshold = opts.evThreshold ?? 0
  const ratio = opts.kellyFractionRatio ?? 0.25
  const maxPerBet = opts.maxPerBet ?? 0.1
  const eps = opts.eps ?? 0.01

  const norm = normalizeResultProbs(pred.resultProbs)
  const [home, draw, away] = smoothProbs([norm.home, norm.draw, norm.away], eps)
  const model: Record<MatchOutcome, number> = { home, draw, away }
  const price: Record<MatchOutcome, number> = { home: odds.home, draw: odds.draw, away: odds.away }

  const bets: Bet[] = []
  for (const market of MARKETS) {
    const decimalOdds = price[market]
    const modelProb = model[market]
    const ev = expectedValue(modelProb, decimalOdds)
    if (ev <= evThreshold) continue
    const kelly = kellyFraction(modelProb, decimalOdds)
    const stake = recommendedStakePct(fractionalKelly(kelly, ratio), maxPerBet)
    bets.push({
      matchId: pred.matchId,
      agentId: pred.agentId,
      market,
      modelProb,
      impliedProb: impliedProb(decimalOdds),
      decimalOdds,
      oddsTimestamp: odds.timestamp,
      ev,
      kellyFraction: kelly,
      recommendedStakePct: stake,
    })
  }
  return bets
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/engine/bets.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): compose computeBets over normalize/smooth/EV/Kelly"
```

---

## Task 8: Accuracy Scoring

**Files:**
- Create: `src/engine/scoring.ts`
- Create: `src/engine/scoring.test.ts`

- [ ] **Step 1: Write the failing test `src/engine/scoring.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { argmaxResult, resultOf, scorePrediction, topScore } from './scoring.js'
import type { Prediction, RegularTimeResult } from '../domain/types.js'

const pred = (
  resultProbs: Prediction['resultProbs'],
  scores: Prediction['scoreProbs'],
): Prediction => ({
  agentId: 'claude',
  matchId: 'm1',
  resultProbs,
  scoreProbs: scores,
  confidence: 0.6,
  reasoning: 'x',
  createdAt: 't',
})

describe('resultOf', () => {
  it('home win', () => expect(resultOf({ matchId: 'm1', homeScore: 2, awayScore: 1 })).toBe('home'))
  it('away win', () => expect(resultOf({ matchId: 'm1', homeScore: 0, awayScore: 3 })).toBe('away'))
  it('draw', () => expect(resultOf({ matchId: 'm1', homeScore: 1, awayScore: 1 })).toBe('draw'))
})

describe('argmaxResult', () => {
  it('picks the largest', () => {
    expect(argmaxResult({ home: 0.6, draw: 0.3, away: 0.1 })).toBe('home')
    expect(argmaxResult({ home: 0.1, draw: 0.3, away: 0.6 })).toBe('away')
    expect(argmaxResult({ home: 0.2, draw: 0.5, away: 0.3 })).toBe('draw')
  })
})

describe('topScore', () => {
  it('returns the highest-prob score', () => {
    const p = pred({ home: 0.6, draw: 0.3, away: 0.1 }, [
      { score: '1-0', prob: 0.1 },
      { score: '2-1', prob: 0.25 },
    ])
    expect(topScore(p)).toBe('2-1')
  })
  it('is null when empty', () => {
    expect(topScore(pred({ home: 0.6, draw: 0.3, away: 0.1 }, []))).toBeNull()
  })
})

describe('scorePrediction', () => {
  const actual = (h: number, a: number): RegularTimeResult => ({
    matchId: 'm1',
    homeScore: h,
    awayScore: a,
  })
  it('exact score -> 3', () => {
    const p = pred({ home: 0.6, draw: 0.3, away: 0.1 }, [{ score: '2-1', prob: 0.3 }])
    const s = scorePrediction(p, actual(2, 1))
    expect(s.points).toBe(3)
    expect(s.exactScore).toBe(true)
  })
  it('correct result, wrong score -> 1', () => {
    const p = pred({ home: 0.6, draw: 0.3, away: 0.1 }, [{ score: '3-0', prob: 0.3 }])
    const s = scorePrediction(p, actual(2, 1))
    expect(s.points).toBe(1)
    expect(s.correctResult).toBe(true)
    expect(s.exactScore).toBe(false)
  })
  it('wrong result -> 0', () => {
    const p = pred({ home: 0.6, draw: 0.3, away: 0.1 }, [{ score: '2-1', prob: 0.3 }])
    const s = scorePrediction(p, actual(0, 1))
    expect(s.points).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/engine/scoring.test.ts`
Expected: FAIL — `Cannot find module './scoring.js'`.

- [ ] **Step 3: Implement `src/engine/scoring.ts`**

```ts
import type { MatchOutcome, Prediction, RegularTimeResult, ResultProbs } from '../domain/types.js'

export function resultOf(r: { homeScore: number; awayScore: number }): MatchOutcome {
  if (r.homeScore > r.awayScore) return 'home'
  if (r.homeScore < r.awayScore) return 'away'
  return 'draw'
}

export function argmaxResult(rp: ResultProbs): MatchOutcome {
  if (rp.home >= rp.draw && rp.home >= rp.away) return 'home'
  if (rp.draw >= rp.away) return 'draw'
  return 'away'
}

/** Highest-probability scoreline, or null if none given. */
export function topScore(pred: Prediction): string | null {
  if (pred.scoreProbs.length === 0) return null
  return [...pred.scoreProbs].sort((a, b) => b.prob - a.prob)[0].score
}

export interface AccuracyScore {
  points: number
  exactScore: boolean
  correctResult: boolean
}

/** Exact scoreline = +3 (exclusive); else correct W/D/L = +1; else 0. */
export function scorePrediction(pred: Prediction, actual: RegularTimeResult): AccuracyScore {
  const correctResult = argmaxResult(pred.resultProbs) === resultOf(actual)
  const headline = topScore(pred)
  const exactScore = headline !== null && headline === `${actual.homeScore}-${actual.awayScore}`
  const points = exactScore ? 3 : correctResult ? 1 : 0
  return { points, exactScore, correctResult }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/engine/scoring.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add accuracy scoring (exact +3 / result +1)"
```

---

## Task 9: Brier Score

**Files:**
- Create: `src/engine/brier.ts`
- Create: `src/engine/brier.test.ts`

- [ ] **Step 1: Write the failing test `src/engine/brier.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { brierScore } from './brier.js'

describe('brierScore', () => {
  it('is 0 for a perfect confident call', () => {
    expect(brierScore({ home: 1, draw: 0, away: 0 }, 'home')).toBeCloseTo(0)
  })
  it('is 2 for a perfectly wrong confident call', () => {
    expect(brierScore({ home: 1, draw: 0, away: 0 }, 'away')).toBeCloseTo(2)
  })
  it('matches the manual sum of squared errors', () => {
    // home .5, draw .3, away .2; actual away -> .5^2 + .3^2 + .8^2 = .98
    expect(brierScore({ home: 0.5, draw: 0.3, away: 0.2 }, 'away')).toBeCloseTo(0.98)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/engine/brier.test.ts`
Expected: FAIL — `Cannot find module './brier.js'`.

- [ ] **Step 3: Implement `src/engine/brier.ts`**

```ts
import type { MatchOutcome, ResultProbs } from '../domain/types.js'

export function brierScore(pred: ResultProbs, actual: MatchOutcome): number {
  const indic = (o: MatchOutcome): number => (o === actual ? 1 : 0)
  const dh = pred.home - indic('home')
  const dd = pred.draw - indic('draw')
  const da = pred.away - indic('away')
  return dh * dh + dd * dd + da * da
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/engine/brier.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add brier calibration score"
```

---

## Task 10: Bet Settlement (P/L)

**Files:**
- Create: `src/engine/settlement.ts`
- Create: `src/engine/settlement.test.ts`

- [ ] **Step 1: Write the failing test `src/engine/settlement.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { settleBet } from './settlement.js'
import type { Bet } from '../domain/types.js'

const bet = (market: Bet['market'], odds: number, stakePct: number): Bet => ({
  matchId: 'm1',
  agentId: 'claude',
  market,
  modelProb: 0.5,
  impliedProb: 0.4,
  decimalOdds: odds,
  oddsTimestamp: 't',
  ev: 0.2,
  kellyFraction: 0.2,
  recommendedStakePct: stakePct,
})

describe('settleBet', () => {
  it('wins: profit = stake * (odds - 1)', () => {
    // 10% of 1000 = 100 staked; odds 2.5 -> 100 * 1.5 = 150
    const s = settleBet(bet('home', 2.5, 0.1), 'home', 1000)
    expect(s.won).toBe(true)
    expect(s.stakeUnits).toBeCloseTo(100)
    expect(s.pnlUnits).toBeCloseTo(150)
  })
  it('loses: -stake', () => {
    const s = settleBet(bet('home', 2.5, 0.1), 'away', 1000)
    expect(s.won).toBe(false)
    expect(s.pnlUnits).toBeCloseTo(-100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/engine/settlement.test.ts`
Expected: FAIL — `Cannot find module './settlement.js'`.

- [ ] **Step 3: Implement `src/engine/settlement.ts`**

```ts
import type { Bet, BetSettlement, MatchOutcome } from '../domain/types.js'

export function settleBet(bet: Bet, actual: MatchOutcome, bankroll: number): BetSettlement {
  const stakeUnits = bet.recommendedStakePct * bankroll
  const won = bet.market === actual
  const pnlUnits = won ? stakeUnits * (bet.decimalOdds - 1) : -stakeUnits
  return { bet, stakeUnits, pnlUnits, won }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/engine/settlement.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add bet P/L settlement"
```

---

## Task 11: Leaderboard Aggregation

**Files:**
- Create: `src/engine/leaderboard.ts`
- Create: `src/engine/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test `src/engine/leaderboard.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { aggregateAccuracy, aggregateBetting } from './leaderboard.js'
import type { AccuracyScore } from './scoring.js'
import type { Bet, BetSettlement } from '../domain/types.js'

const sc = (points: number, exactScore = false, correctResult = false): AccuracyScore => ({
  points,
  exactScore,
  correctResult,
})

describe('aggregateAccuracy', () => {
  it('sums per agent and sorts by total desc', () => {
    const out = aggregateAccuracy([
      { agentId: 'a', score: sc(3, true) },
      { agentId: 'b', score: sc(1) },
      { agentId: 'a', score: sc(1) },
    ])
    expect(out[0].agentId).toBe('a')
    expect(out[0].totalPoints).toBe(4)
    expect(out[0].matches).toBe(2)
    expect(out[0].exactScores).toBe(1)
    expect(out[1].totalPoints).toBe(1)
  })
})

describe('aggregateBetting', () => {
  const mkBet = (agentId: string): Bet => ({
    matchId: 'm1',
    agentId,
    market: 'home',
    modelProb: 0.6,
    impliedProb: 0.5,
    decimalOdds: 2.5,
    oddsTimestamp: 't',
    ev: 0.5,
    kellyFraction: 0.3,
    recommendedStakePct: 0.1,
  })
  it('sums P/L and computes ROI', () => {
    const settlements: BetSettlement[] = [
      { bet: mkBet('a'), stakeUnits: 100, pnlUnits: 150, won: true },
      { bet: mkBet('a'), stakeUnits: 100, pnlUnits: -100, won: false },
    ]
    const out = aggregateBetting(settlements)
    expect(out[0].agentId).toBe('a')
    expect(out[0].settledBets).toBe(2)
    expect(out[0].wonBets).toBe(1)
    expect(out[0].totalStakedUnits).toBeCloseTo(200)
    expect(out[0].totalPnlUnits).toBeCloseTo(50)
    expect(out[0].roiPct).toBeCloseTo(25) // 50 / 200
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/engine/leaderboard.test.ts`
Expected: FAIL — `Cannot find module './leaderboard.js'`.

- [ ] **Step 3: Implement `src/engine/leaderboard.ts`**

```ts
import type { BetSettlement } from '../domain/types.js'
import type { AccuracyScore } from './scoring.js'

export interface AccuracyStats {
  agentId: string
  totalPoints: number
  matches: number
  exactScores: number
  correctResults: number
}

export function aggregateAccuracy(rows: { agentId: string; score: AccuracyScore }[]): AccuracyStats[] {
  const map = new Map<string, AccuracyStats>()
  for (const { agentId, score } of rows) {
    const s =
      map.get(agentId) ?? {
        agentId,
        totalPoints: 0,
        matches: 0,
        exactScores: 0,
        correctResults: 0,
      }
    s.totalPoints += score.points
    s.matches += 1
    if (score.exactScore) s.exactScores += 1
    if (score.correctResult) s.correctResults += 1
    map.set(agentId, s)
  }
  return [...map.values()].sort((a, b) => b.totalPoints - a.totalPoints)
}

export interface BettingStats {
  agentId: string
  settledBets: number
  wonBets: number
  totalStakedUnits: number
  totalPnlUnits: number
  roiPct: number
}

export function aggregateBetting(settlements: BetSettlement[]): BettingStats[] {
  const map = new Map<string, BettingStats>()
  for (const s of settlements) {
    const agentId = s.bet.agentId
    const st =
      map.get(agentId) ?? {
        agentId,
        settledBets: 0,
        wonBets: 0,
        totalStakedUnits: 0,
        totalPnlUnits: 0,
        roiPct: 0,
      }
    st.settledBets += 1
    if (s.won) st.wonBets += 1
    st.totalStakedUnits += s.stakeUnits
    st.totalPnlUnits += s.pnlUnits
    map.set(agentId, st)
  }
  const arr = [...map.values()]
  for (const st of arr) {
    st.roiPct = st.totalStakedUnits > 0 ? (st.totalPnlUnits / st.totalStakedUnits) * 100 : 0
  }
  return arr.sort((a, b) => b.totalPnlUnits - a.totalPnlUnits)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/engine/leaderboard.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add accuracy + betting leaderboard aggregation"
```

---

## Task 12: Atomic JSON Store

**Files:**
- Create: `src/store/json.ts`
- Create: `src/store/json.test.ts`

- [ ] **Step 1: Write the failing test `src/store/json.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/store/json.test.ts`
Expected: FAIL — `Cannot find module './json.js'`.

- [ ] **Step 3: Implement `src/store/json.ts`**

```ts
import { promises as fs } from 'node:fs'
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

/** mkdir -p parents, write to a temp file, then atomic rename. */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/store/json.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(store): add atomic JSON read/write"
```

---

## Task 13: Engine Barrel + Integration Test + Build

**Files:**
- Create: `src/engine/index.ts`
- Create: `src/engine/integration.test.ts`
- Modify: `src/index.ts` (replace placeholder with package barrel)

- [ ] **Step 1: Create `src/engine/index.ts`**

```ts
export * from './prob.js'
export * from './odds.js'
export * from './value.js'
export * from './bets.js'
export * from './scoring.js'
export * from './brier.js'
export * from './settlement.js'
export * from './leaderboard.js'
```

- [ ] **Step 2: Replace `src/index.ts` with the package barrel**

```ts
export * from './engine/index.js'
export * from './domain/types.js'
export * from './domain/schemas.js'
```

- [ ] **Step 3: Create `src/engine/integration.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { computeBets } from './bets.js'
import { resultOf, scorePrediction } from './scoring.js'
import { settleBet } from './settlement.js'
import { aggregateAccuracy, aggregateBetting } from './leaderboard.js'
import type { MatchOdds, Prediction, RegularTimeResult } from '../domain/types.js'

describe('engine integration', () => {
  const odds: MatchOdds = { matchId: 'm1', home: 2.0, draw: 3.5, away: 4.0, timestamp: 't' }
  const pred: Prediction = {
    agentId: 'claude',
    matchId: 'm1',
    resultProbs: { home: 0.6, draw: 0.25, away: 0.15 },
    scoreProbs: [{ score: '2-1', prob: 0.25 }],
    confidence: 0.7,
    reasoning: 'x',
    createdAt: 't',
  }
  const actual: RegularTimeResult = { matchId: 'm1', homeScore: 2, awayScore: 1 }

  it('flows prediction -> bets -> settlement -> leaderboard', () => {
    const bets = computeBets(pred, odds)
    expect(bets.length).toBeGreaterThan(0)

    const settlements = bets.map((b) => settleBet(b, resultOf(actual), 1000))
    const betting = aggregateBetting(settlements)
    expect(betting[0].agentId).toBe('claude')

    const accuracy = aggregateAccuracy([
      { agentId: 'claude', score: scorePrediction(pred, actual) },
    ])
    expect(accuracy[0].totalPoints).toBe(3) // exact scoreline 2-1
  })
})
```

- [ ] **Step 4: Run the full suite + typecheck + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck exits 0; all tests pass (scaffold + domain + engine + store + integration); `dist/` is emitted.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add barrel, integration test; wire package entry"
```

---

## Self-Review (planner's check)

- **0. Anti-tampering:** N/A — spec has no "Parameter Trust Analysis" section.
- **1. Spec coverage (core-engine subset):** §5 Prediction contract → Task 2/3. §6 betting (1x2, normalize/smooth, EV, Kelly 1/4, stake clamp, `oddsTimestamp`) → Tasks 4–7. §7 settlement (regular-time, exact +3 / result +1, Brier reference-only, P/L + ROI) → Tasks 8–11. §9 JSON store → Task 12. §11 testing (Vitest, pure functions) → all tasks. Data sources (§8), agents (§4), dashboard (§10), CI — explicitly deferred to Plans 2–4 in the roadmap. No gaps in Plan 1 scope.
- **2. Placeholder scan:** none — every code step contains complete code; no TBD/TODO.
- **3. Type consistency:** `Prediction`, `Bet`, `MatchOdds`, `RegularTimeResult`, `BetSettlement`, `AccuracyScore`, `AccuracyStats`, `BettingStats`, `ComputeBetsOptions` names match across all tasks; `computeBets(pred, odds, opts)`, `settleBet(bet, actual, bankroll)`, `scorePrediction(pred, actual)` signatures consistent; barrel exports have no name collisions.

---

## Plan 1 Exit Criteria

- `npm run typecheck` clean.
- `npm test` green (unit + integration).
- `npm run build` emits `dist/`.
- No network calls anywhere in `src/`.
- Every exported engine function has at least one unit test.

Next: Plan 2 (data layer) consumes this engine to wire real fixtures/odds/results/news sources.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-14-pitch-oracle-core-engine.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. (REQUIRED SUB-SKILL: superpowers:subagent-driven-development)
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. (REQUIRED SUB-SKILL: superpowers:executing-plans)

Which approach?

