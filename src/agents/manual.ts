/**
 * ManualAgent — hand-authored predictions read from disk.
 *
 * Reads `<dataDir>/agents/{id}/input/{matchId}.json` (a Prediction-shaped file),
 * validates it with `predictionSchema`, and injects agentId/matchId/createdAt if
 * absent (the human author may not bother filling those). A missing file throws
 * a typed `MissingManualInputError`; the runner catches this per-agent and marks
 * the agent DNF for that match instead of crashing the whole run.
 */
import path from 'node:path'
import { predictionSchema } from '../domain/schemas.js'
import type { Prediction } from '../domain/types.js'
import { readJson } from '../store/json.js'
import type { Agent, AgentConfig, MatchContext } from './types.js'

export class MissingManualInputError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly matchId: string,
    message: string,
  ) {
    super(message)
    this.name = 'MissingManualInputError'
  }
}

export class ManualAgent implements Agent {
  constructor(public readonly config: AgentConfig, private readonly dataDir: string) {}

  async predict(ctx: MatchContext): Promise<Prediction> {
    const file = path.join(
      this.dataDir,
      'agents',
      this.config.id,
      'input',
      `${ctx.fixture.id}.json`,
    )
    const raw = await readJson<unknown>(file)
    if (raw === null) {
      throw new MissingManualInputError(
        this.config.id,
        ctx.fixture.id,
        `no manual input for agent "${this.config.id}" match "${ctx.fixture.id}" at ${file}`,
      )
    }
    const enriched = {
      agentId: this.config.id,
      matchId: ctx.fixture.id,
      createdAt: new Date().toISOString(),
      ...(raw as Record<string, unknown>),
    }
    return predictionSchema.parse(enriched) as Prediction
  }
}
