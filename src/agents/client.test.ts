import { describe, expect, it, vi } from 'vitest'
import { predictViaClient } from './client.js'

// A throwaway client: predictViaClient only uses it when no completer is
// supplied; every test here injects a completer, so the client is unused.
const unusedClient = {} as never

function validPrediction(matchId = 'm1', agentId = 'a') {
  return {
    agentId,
    matchId,
    resultProbs: { home: 0.5, draw: 0.3, away: 0.2 },
    scoreProbs: [{ score: '2-1', prob: 0.25 }],
    confidence: 0.7,
    reasoning: 'form',
    createdAt: '2026-06-14T00:00:00Z',
  }
}

describe('predictViaClient (injected completer)', () => {
  it('returns a validated Prediction when the completer returns valid JSON', async () => {
    const completer = vi.fn(async () => JSON.stringify(validPrediction('m9', 'z')))
    const pred = await predictViaClient(
      unusedClient,
      'm',
      'sys',
      'usr',
      'z',
      'm9',
      completer,
    )
    expect(pred.matchId).toBe('m9')
    expect(pred.agentId).toBe('z')
    expect(pred.resultProbs.home).toBe(0.5)
    // One attempt only.
    expect(completer).toHaveBeenCalledTimes(1)
  })

  it('retries ONCE on invalid JSON, then succeeds', async () => {
    const responses = [
      JSON.stringify({ notValid: true }),
      JSON.stringify(validPrediction()),
    ]
    let i = 0
    const completer = vi.fn(async () => responses[i++])
    const pred = await predictViaClient(
      unusedClient,
      'm',
      'sys',
      'usr',
      'a',
      'm1',
      completer,
    )
    expect(pred.matchId).toBe('m1')
    expect(completer).toHaveBeenCalledTimes(2)
    // Second call must include the corrective nudge + the bad output as assistant message.
    const calls = completer.mock.calls as unknown as Array<
      [{ messages: Array<{ role: string; content: string }> }]
    >
    const second = calls[1][0]
    expect(second.messages.some((m) => /invalid/i.test(m.content))).toBe(true)
    expect(second.messages.some((m) => m.role === 'assistant')).toBe(true)
  })

  it('retries ONCE on malformed JSON text, then succeeds', async () => {
    const responses = ['{ not json', JSON.stringify(validPrediction())]
    let i = 0
    const completer = vi.fn(async () => responses[i++])
    const pred = await predictViaClient(unusedClient, 'm', 'sys', 'usr', 'a', 'm1', completer)
    expect(pred.matchId).toBe('m1')
    expect(completer).toHaveBeenCalledTimes(2)
  })

  it('throws after a second validation failure', async () => {
    const bad = JSON.stringify({ resultProbs: { home: 0.5 } }) // missing required keys
    const completer = vi.fn(async () => bad)
    await expect(
      predictViaClient(unusedClient, 'm', 'sys', 'usr', 'a', 'm1', completer),
    ).rejects.toThrow(/failed validation after retry/)
    expect(completer).toHaveBeenCalledTimes(2)
  })

  it('passes response_format json_object through to the completer', async () => {
    const completer = vi.fn(async () => JSON.stringify(validPrediction()))
    await predictViaClient(unusedClient, 'm', 'sys', 'usr', 'a', 'm1', completer)
    const calls = completer.mock.calls as unknown as Array<
      [{ response_format?: { type: string } }]
    >
    expect(calls[0][0].response_format).toEqual({ type: 'json_object' })
  })
})
