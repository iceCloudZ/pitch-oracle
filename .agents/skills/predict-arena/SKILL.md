---
name: predict-arena
description: Use when the user says "预测"、"分析比赛"、"预测明天"、"看下明天"、"predict"、"协助投注"、"设计投注方案", or asks to analyze upcoming matches, generate GLM predictions, or design a bet slip. Pulls sporttery fixtures/odds, analyzes each match from a football analyst perspective, writes GLM prediction files, and helps design the bet slip.
---

# predict-arena

Analyzes upcoming sporttery matches, produces GLM-5.2 predictions, and helps the user design bet slips. Designed for the pitch-oracle project (single-branch `main` workflow).

## Prerequisites

All commands run from the project root `D:\github\pitch-oracle`. The following must be true:
- `.env` exists with `FOOTBALL_DATA_API_KEY` (for results reference).
- `npx tsx` available.
- `data/match-index.json` tracks sporttery matchId → team names.
- `data/my-bets.json` tracks real bet slips.
- agents.json includes `glm-blind` and `glm-odds` (type: `manual`).

## Steps

### 1. Pull upcoming matches and odds

Fetch sporttery fixtures + odds (胜平负 had) and 让球 odds (hhad):

```cmd
npx tsx -e "(async()=>{const sp=await import('./src/data/sporttery.js');const f=await sp.fetchSportteryFixtures();const o=await sp.fetchSportteryOdds();const om=new Map(o.map(x=>[x.matchId,x]));f.sort((a,b)=>a.commenceTime.localeCompare(b.commenceTime)).forEach(m=>{const oo=om.get(m.id);console.log(m.id+' '+m.matchNum+' '+m.commenceTime+' '+m.homeTeam+' vs '+m.awayTeam+(oo?' W'+oo.home+' D'+oo.draw+' L'+oo.away:' no-had'))})})().catch(e=>console.error(e.message))"
```

For 让球 odds (hhad), fetch the raw API (the adapter reads `had` field, so use raw fetch for hhad):
```cmd
npx tsx -e "(async()=>{const res=await fetch('https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c_web&poolCode=hhad',{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15','Referer':'https://m.sporttery.cn/mjc/jsq/zqspf/'}});const j=await res.json();for(const day of j.value.matchInfoList){for(const m of day.subMatchList){if(m.matchNumStr&&m.homeTeamAbbName){const h=m.hhad||{};console.log(m.matchNumStr+' '+m.homeTeamAbbName+' vs '+m.awayTeamAbbName+' let'+h.goalLine+' W'+h.h+' D'+h.d+' L'+h.a)}}}})().catch(e=>console.error(e.message))"
```

Wait 3-5 seconds between sporttery API calls to avoid WAF blocking.

### 2. Fetch existing AI predictions for reference

Read DeepSeek/Qwen predictions from `data/agents/*/predictions/` for the target matches. These provide a baseline to compare GLM's judgment against. Summarize each AI's top pick for each match.

### 3. Analyze each match

For each match, produce an independent analysis as a football analyst:
- **Squad assessment**: key players, age/fitness, depth, recent form.
- **Tactical matchup**: style clash, who controls tempo, set-piece strength.
- **Context**: World Cup group stage round (early rounds favor draws — teams are cautious), neutral venue, motivation.
- **Draw calibration**: football draws are systematically underpriced by markets and AI models. In World Cup group stage matchday 1-2, elevate draw probability by +5-10% vs naive estimates. The user has profited specifically from buying draws (Saudi 1-1, Iran 2-2).
- **EV analysis**: compute implied probability from odds vs your estimated probability. Flag positive-EV opportunities.

Present the analysis to the user match-by-match, with a recommendation for each.

### 4. Write GLM prediction files

Write predictions for `glm-blind` (independent, no odds) and `glm-odds` (odds-aware) to:
```
data/agents/glm-blind/predictions/<matchId>.json
data/agents/glm-odds/predictions/<matchId>.json
```

JSON shape:
```json
{
  "agentId": "glm-blind",
  "matchId": "<sporttery matchId>",
  "resultProbs": { "home": 0.60, "draw": 0.25, "away": 0.15 },
  "scoreProbs": [
    { "score": "2-0", "prob": 0.15 },
    { "score": "1-0", "prob": 0.13 },
    { "score": "1-1", "prob": 0.10 },
    { "score": "2-1", "prob": 0.08 },
    { "score": "3-0", "prob": 0.07 }
  ],
  "confidence": 0.62,
  "reasoning": "<Chinese, 2-3 sentences explaining the key factors>",
  "createdAt": "<ISO timestamp>"
}
```

Ensure each matchId is in `data/match-index.json` (add if missing: `{ "<id>": { "homeTeam": "<中文>", "awayTeam": "<中文>" } }`).

### 5. Help design the bet slip

Based on the analysis and EV, help the user design a bet slip. **Follow the conservative strategy** (established after slip-004's -170 loss taught us high-variance bets bleed the bankroll):

**Mandatory rules:**
- **NO score bets (比分)**. Score markets have ~10-15% hit rate and devastated the bankroll in slip-004. Only use 胜负(had) and 让球(hhad).
- **NO 穿盘 (win by 2+ handicap wins)**. Handicap wins requiring the favorite to win by 2+ are too sensitive to "win by exactly 1" outcomes. Prefer handicap bets where "win by 1 is enough" or "underdog holds" (让负).
- **2串1 only**. 3串1+ is forbidden — the all-or-nothing payout structure is a bankroll killer.
- **Max 3 legs (注) per round**.
- **Budget: ¥100 per round, fixed.** Never increase after a loss.

**Typical slip structure (two legs):**
- **Leg 1 (stable)**: two strong favorites in a 2串1, buying either straight win (had) or handicap win where 1 goal suffices. Combined odds ~3-4.
- **Leg 2 (speculative)**: a draw or underdog-holds bet. The user has historically profited from buying draws at 3.0-4.5 odds (Saudi 1-1, Iran 2-2). When you sense draw potential, recommend full-time draw.

Compute the combined odds, stake allocation, and present a payout table. Let the user adjust before confirming.

**Allocation guidance:** Leg 1 gets ~60-70% of budget (higher hit probability), Leg 2 gets ~30-40% (higher odds, lower hit rate but bigger payoff).

### 6. Record to my-bets.json

Once the user confirms the bet slip, append a new slip to `data/my-bets.json`:
```json
{
  "id": "slip-00X",
  "description": "<date> <summary>",
  "boughtAt": "<ISO>",
  "totalStake": <number>,
  "legs": [ ... ],
  "summary": { "totalStake": <number> }
}
```

Set all legs to `status: "pending"`. The settle-arena skill will settle them later.

### 7. Optionally run DeepSeek/Qwen predict for the same matches

If the user wants multi-AI comparison, run:
```cmd
set "DEEPSEEK_API_KEY=<value>" && set "QWEN_API_KEY=<value>" && set "FOOTBALL_DATA_API_KEY=<value>" && npx tsx src/cli.ts predict --agents deepseek,qwen --no-news
```

This generates DeepSeek + Qwen predictions for all upcoming sporttery matches. Note: this only works for matches with `had` odds (not `hhad`-only matches like Iraq).

## Key notes

- GLM predictions are **manually authored** by the AI assistant (you), not auto-generated via API. Write them directly to disk.
- The user's `me-ai` agent will be rewritten later to reflect actual bet-slip picks (done during settle-arena).
- Never commit API keys. `.env` and `config/agents.json`/`config/tournament.json` are gitignored.
- Sporttery's WAF blocks rapid successive requests. Pace API calls with 3-5 second gaps.
- All commits go to `main` only (single-branch workflow).
