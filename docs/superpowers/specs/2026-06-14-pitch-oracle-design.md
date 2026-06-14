# pitch-oracle — 设计文档

- **日期**: 2026-06-14
- **状态**: 已通过（brainstorming 完成，待用户复核后进入实现计划）
- **参考**: [upstash/agents-worldcup](https://github.com/upstash/agents-worldcup)（多智能体世界杯预测竞技场）

---

## 1. 一句话定位

pitch-oracle 是一个每日定时的**多智能体足球预测竞技场**：N 个 OpenAI 兼容 AI 模型 + 人类选手 + 人机增强 agent 同台预测 2026 世界杯每场比赛的**胜平负（多选）+ 比分（多选）**，并用赔率做**期望值（EV）+ 凯利公式**投注试算，赛后结算出"预测准确度"与"模拟投注盈亏"两张排行榜 + 静态看板。**首发世界杯，架构可扩展到任意赛事。**

与参考项目的关键差异：参考项目**禁止**用赔率；本项目**正面使用赔率**做投注量化分析，并加入**人类 + 人机增强**两类选手。

---

## 2. 核心设计原则

1. **模型只估概率，代码算投注。** LLM 只输出概率与推理；EV、凯利仓位、价值投注筛选全部由确定性 TypeScript 代码计算。好处：投注数学可测、可复现、不依赖模型算术水平。
2. **默认盲猜 + A/B。** 模型默认看不到赔率（纯新闻 + 赛程预测）；每个 agent 可配 `seeOdds`。鼓励同一模型同时跑"盲猜"与"喂赔率"两版同台（A/B = 同一 `model` + `baseURL` 配两个 agent 条目，仅 `seeOdds` 不同），把"看赔率到底有没有用"这一研究问题内嵌进竞技场。
3. **Agent = 产出 `Prediction` 的函数。** 纯 AI / 人类 / 人机增强三类 agent 共享同一接口，同榜排名。
4. **Git 原生。** 状态 = 仓库里的 JSON：$0 成本、完全透明、可复现。
5. **零 key 也能跑。** 新闻源无 key 时自动降级到 DuckDuckGo，clone 下来即可体验。

---

## 3. 系统架构（方案 A：Git 原生定时竞技场）

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions cron (每日) ── 或本地 CLI 手动 ──            │
│         调用 arena CLI: predict → score                      │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────── arena CLI (TypeScript) ─────────────────┐
│  data 层:  fixtures ─ football-data.org                      │
│            odds+results ─ the-odds-api                       │
│            news ─ Brave (→ Tavily → DuckDuckGo 兜底)         │
│                                                              │
│  agents 层: OpenAI 兼容 client (按 config/agents.json)       │
│             type: llm / manual / human-augmented             │
│             → 每个产出 Prediction (胜平负概率 + 比分概率)     │
│                                                              │
│  scoring 层: 计分(比分+3/胜负+1, Brier) + 投注(EV/凯利/结算) │
│                                                              │
│  store 层: 原子读写 JSON                                     │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  data/*.json (提交到独立 `data` 分支)                        │
│        │                                                     │
│        ▼                                                     │
│  dashboard (SvelteKit 静态) → GitHub Pages / Vercel          │
└─────────────────────────────────────────────────────────────┘
```

- **运行**：GitHub Actions 每日 cron（世界杯赛期内每天跑）；也支持本地 `arena predict` 手动触发。
- **模型层**：单个 OpenAI 兼容 client；`config/agents.json` 定义选手。
- **状态**：JSON 文件，CI 把当天产物提交到独立 `data` 分支（避免污染 main）。
- **看板**：SvelteKit 静态站读 JSON 渲染。

---

## 4. Agent 类型

| type | 预测来源 | 说明 |
|---|---|---|
| `llm` | OpenAI 兼容 API（用户自配 baseURL + model） | 主力选手；可盲猜或 `seeOdds: true` |
| `manual` | 人类经本地 CLI 交互输入 | 用户本人，赛前输入；缺则记 DNF |
| `human-augmented` | 人类主观笔记 + LLM 加工成结构化预测 | "我的想法 + AI 增强" |

所有 type 实现同一接口：

```ts
interface Agent {
  id: string
  type: 'llm' | 'manual' | 'human-augmented'
  predict(ctx: MatchContext): Promise<Prediction>
}
```

三类 agent 在**同一张排行榜**上比较：你的直觉能不能打过 GPT/Claude？"人 + AI"又能不能单独碾压？这是核心 README 卖点。

### 4.1 人类 / 人机增强的提交闭环

静态看板无后端，不能直接写仓库，所以人类输入走以下闭环（**MVP 用本地优先方案**，Issue 方案留 v2）：

- **MVP（本地优先）**：用户本地 clone 仓库 → `arena predict --agent human_me`，CLI 交互式填入胜平负/比分/信心/理由 → 直接 commit 到 `data` 分支。MVP 里"人类选手"通常是仓库主人本人，本地流程最稳、零额外工作流。
- **人机增强**：用户在本地写一段主观判断（CLI 内联输入，或编辑 `data/agents/{id}/diary.md`）→ CLI 把"人类笔记 + 新闻 + 赛程"喂给 LLM 加工成结构化 `Prediction`。
- **v2（GitHub Issue 公开提交）**：社区访客用 Issue 模板提交预测 → Actions 扫描特定 Issue 解析入库 → 自动 close。让看板访客也能下场当选手，放大传播。

---

## 5. 预测契约（Zod 校验的结构化输出）

模型 / 人机增强必须返回，人类选手经表单填入同样的结构：

```ts
interface Prediction {
  resultProbs: { home: number; draw: number; away: number } // 和≈1
  likelyResults: ('home' | 'draw' | 'away')[]               // 多选，由阈值派生
  scoreProbs: { score: string; prob: number }[]             // 多选比分，和≈1
  confidence: number                                         // 0–1
  reasoning: string
  // 投注建议 Bet[] 不由模型输出，由代码计算
}
```

**派生规则**（可配）：
- `likelyResults`：概率 ≥ 阈值（默认 **0.20**）的市场，至少入选 1 个。
- `scoreProbs`：取概率最高的前 **K=5** 个比分，归一化后和 ≈ 1。
- **比分格式强约束**：`score` 必须匹配 `^\d+-\d+$`（如 `"2-1"`），Zod 校验拒绝 `"2:1"` / "主队赢 2 球" 等写法。
- **概率归一化**：代码对 `resultProbs` / `scoreProbs` 强制 `p_norm = p / sum(p)`，模型输出和不必精确为 1。

---

## 6. 投注分析（确定性代码，不依赖模型算术）

**MVP 仅做 1x2（胜平负）市场。** the-odds-api 免费版只给 1x2 赔率，比分赔率数据源稀少且深；比分预测只用于**准确度榜**（+3），**不参与 EV/凯利**。比分 EV 留 v2（需搞定可靠的比分赔率 API）。

输入：归一化后的 `Prediction.resultProbs` + 抓来的 1x2 赔率。

- **概率平滑**：算凯利前先把概率 clamp 到 `[eps, 1-eps]`（默认 eps=0.01），防 0/1 极端值导致除零或无限仓位。
- **隐含概率** = `1 / decimalOdds`（可选去 vig 归一化）。
- **EV（期望值）** = `modelProb × decimalOdds − 1`。
- **凯利分数** `f* = (modelProb × odds − 1) / (odds − 1)`；实用采用**分数凯利（默认 1/4 Kelly）**防过度下注。
- **价值投注** = EV > 阈值（默认 > 0）。
- **虚拟本金**（默认 1000 单位），按 `recommendedStakePct = clamp(fractionalKelly, 0, maxPerBet)` 下注，**单注 ≤ 本金 10%**（默认）防单场爆仓。

输出 `Bet[]`：

```ts
interface Bet {
  market: 'home' | 'draw' | 'away'            // MVP 仅 1x2
  modelProb: number
  impliedProb: number
  decimalOdds: number
  oddsTimestamp: string                        // ISO，赔率快照时刻
  ev: number
  kellyFraction: number
  recommendedStakePct: number                  // 占虚拟本金的比例
}
```

看板每张投注卡标注"基于 X 小时前赔率计算"（赔率时效，见 §7.2 与 §10）。

---

## 7. 结算与排行榜

> **结算口径**：预测与结算**只看 90 分钟常规时间（含伤停补时）**的胜平负与比分——博彩与数据统计的标准口径。世界杯淘汰赛的加时赛 / 点球**不计入**结算（晋级与否另行标注）。数据源取常规时间比分字段。

### 7.1 准确度榜
每场每个 agent：
- 比分中：**+3**
- 胜负中：**+1**（比分中不再重复加）

附 **Brier 校准分**（基于 `resultProbs`），**仅作参考、不进核心排名**（Brier 对低概率爆冷极敏感，弱队爆冷会瞬间崩坏）。核心排名看累计 P/L 与命中率。

### 7.2 投注盈亏榜
每笔价值投注按**实际结果（常规时间）× 实际赔率**结算，从虚拟本金扣除/返还，累计 **P/L（单位）**与 ROI。赔率为 `predict` 时刻的快照（见 `Bet.oddsTimestamp`），临场赔率可能漂移——MVP 接受，v2 加赛前高频抓取。

两榜均按 agent 汇总，三类 agent 同榜。看板同时展示：总积分、命中率、Brier（参考）、累计投注 P/L、ROI。

---

## 8. 数据源

| 用途 | 主源 | 备选 / 兜底 |
|---|---|---|
| 赛程 / 积分 | football-data.org（免费） | the-odds-api events |
| 赔率 + 比分 | the-odds-api（免费 500/月） | — |
| 新闻 | Brave Search（免费 2000/月） | Tavily；**无 key → DuckDuckGo** |
| 模型 | OpenAI 兼容（用户自配） | — |

**用量核算**：世界杯赛期 ~39 天，the-odds-api 每日 1 请求拉全轮赔率 + 1 请求 scores ≈ 80 请求，远低于 500/月免费额度。

---

## 9. 数据模型（JSON）

```
config/
  agents.json          # 选手阵容：[{id, name, type, baseURL, apiKeyEnv, model, seeOdds}]
  tournament.json      # 赛事配置：data source keys, sport key, phase 规则
data/
  fixtures.json        # 全部比赛（id, 队伍, 开赛时间, 阶段, 状态, 比分）
  odds/{YYYY-MM-DD}.json    # 当日赔率快照（可复现）
  agents/{agentId}/
    predictions/{matchId}.json   # 该 agent 对该场的预测
    diary.md                      # 连续日记 + 赛事论点
  leaderboard.json     # 汇总：积分、命中率、Brier、投注 P/L
```

---

## 10. 错误处理

- **数据源失败**（限流 / 网络）：重试 + 指数退避 → 用上次缓存 → 软失败（该场标 `unavailable`，不崩整轮）。
- **模型 API 失败**：单 agent `try/catch`，记 DNF，继续其他 agent。
- **非法结构化输出**：Zod 校验 + 1 次"修 JSON"重试 → 仍失败则标 failed。
- **缺赔率**：跳过该场投注分析，仍允许出预测。
- **GitHub Actions**：`concurrency` group 防重跑；写入幂等（同日重跑干净覆盖）。

---

## 11. 测试（Vitest）

- **纯函数单测**：计分、EV、凯利、隐含概率、去 vig、Zod schema、原子写。
- **端到端**：喂 canned `fixtures/odds/results` JSON 跑完整 pipeline，断言预测写出、计分、P/L 结算正确。
- **模型 mock**：用 msw mock OpenAI 兼容 client 测 agent runner。

---

## 12. 技术栈

TypeScript（ESM, Node 20+）· `openai` SDK · Zod · `citty`（CLI）· SvelteKit（静态）· Vitest · ESLint + Prettier · **MIT**。

---

## 13. MVP 范围

- 单赛事（2026 世界杯）。
- 默认阵容：2–3 个 `llm` agent + 1 个 `manual`（用户本人，本地 CLI 输入）+ 1 个 `human-augmented`。
- 每日 `predict` + `score`。
- 投注分析仅 **1x2**（MVP）；双排行榜（准确度 + 投注盈亏）。
- 静态看板：排行榜 + 逐场预测 + 投注建议 + agent 日记。
- 核心数学（计分 / EV / 凯利）有测试覆盖。

**v2 留待**：比分赔率 EV、赛前 1 小时高频赔率抓取、GitHub Issue 公开提交、多赛事并发、大小球/让球等更多市场、看板多语言、模型自校准。

---

## 14. 免责声明

README 与看板页脚明确标注：**教育 / 分析用途，非财务建议；18+；理性博彩；赔率为抓取时刻快照；仅模拟本金，不对接真实博彩账户。**

每张投注建议卡在 EV / 凯利数据**正下方红色高亮**："模拟投注试算，非财务建议"。

---

## 15. 非目标（YAGNI）

实时推送 · 真实下注 / 对接博彩账户 · 用户系统 · 复杂交互动画 · 自动发推/社媒。
