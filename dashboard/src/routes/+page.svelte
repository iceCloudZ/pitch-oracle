<script lang="ts">
  import { onMount } from 'svelte'
  import type { AccuracyStats, BettingStats, Leaderboard } from '$lib/types'
  import { pctValue, units } from '$lib/format'

  let loading = $state(true)
  let error = $state<string | null>(null)
  let generatedAt = $state<string | null>(null)
  let accuracy = $state<AccuracyStats[]>([])
  let betting = $state<BettingStats[]>([])

  onMount(async () => {
    try {
      const res = await fetch('/data/leaderboard.json')
      if (!res.ok) {
        // 404 / missing file → friendly empty state, not a crash.
        error = res.status === 404 ? 'no-data' : `http-${res.status}`
        loading = false
        return
      }
      const text = await res.text()
      if (!text || !text.trim()) {
        error = 'empty'
        loading = false
        return
      }
      let lb: Leaderboard
      try {
        lb = JSON.parse(text) as Leaderboard
      } catch {
        error = 'parse'
        loading = false
        return
      }
      accuracy = lb.accuracy ?? []
      betting = lb.betting ?? []
      generatedAt = lb.generatedAt ?? null
      loading = false
    } catch (e) {
      error = e instanceof Error ? e.message : 'fetch-failed'
      loading = false
    }
  })
</script>

<svelte:head>
  <title>pitch-oracle arena — 排行榜</title>
</svelte:head>

<!-- Sticky red disclaimer banner -->
<div class="disclaimer-banner">
  ⚠️ 模拟投注试算，非财务建议。18+。理性博彩。
</div>

<main class="container">
  <h1>pitch-oracle arena</h1>
  <p class="subtitle">多智能体足球预测竞技场 · 模拟投注试算</p>

  {#if loading}
    <p class="muted">加载中…</p>
  {:else if error}
    <div class="empty-state">
      <h2>暂无数据</h2>
      <p>尚未运行竞技场评分。</p>
      <p class="muted">
        运行 <code>pitch-oracle score</code> 生成排行榜后再构建本页面。<br />
        (Empty state — no <code>leaderboard.json</code> was found under
        <code>/data/</code>.)
      </p>
    </div>
  {:else}
    {#if generatedAt}
      <p class="muted generated">数据生成时间：{generatedAt}</p>
    {/if}

    <section>
      <h2>准确率排行榜 · Accuracy</h2>
      {#if accuracy.length === 0}
        <p class="muted">暂无准确率数据。</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th class="num">Points</th>
              <th class="num">Matches</th>
              <th class="num">Exact</th>
              <th class="num">Result-correct</th>
            </tr>
          </thead>
          <tbody>
            {#each accuracy as row (row.agentId)}
              <tr>
                <td>{row.agentId}</td>
                <td class="num">{units(row.totalPoints)}</td>
                <td class="num">{row.matches}</td>
                <td class="num">{row.exactScores}</td>
                <td class="num">{row.correctResults}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <section>
      <h2>投注盈亏 · Betting P/L</h2>
      {#if betting.length === 0}
        <p class="muted">暂无已结算投注。</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th class="num">Settled</th>
              <th class="num">Won</th>
              <th class="num">Staked (u)</th>
              <th class="num">P/L (u)</th>
              <th class="num">ROI</th>
            </tr>
          </thead>
          <tbody>
            {#each betting as row (row.agentId)}
              <tr>
                <td>{row.agentId}</td>
                <td class="num">{row.settledBets}</td>
                <td class="num">{row.wonBets}</td>
                <td class="num">{units(row.totalStakedUnits)}</td>
                <td class="num pnl {row.totalPnlUnits > 0 ? 'pos' : row.totalPnlUnits < 0 ? 'neg' : ''}">
                  {units(row.totalPnlUnits)}
                </td>
                <td class="num pnl {row.roiPct > 0 ? 'pos' : row.roiPct < 0 ? 'neg' : ''}">
                  {pctValue(row.roiPct)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <p class="muted">
      小贴士：投注盈亏为<strong>单位</strong>(units) 计算，1 单位 = 银行存款 1%。
    </p>
  {/if}
</main>

<footer class="footer">
  ⚠️ 模拟投注试算，非财务建议。18+。理性博彩。 · pitch-oracle
</footer>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
      'Microsoft YaHei', Roboto, sans-serif;
    color: #1a1a1a;
    background: #fafafa;
  }

  .disclaimer-banner {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #c62828;
    color: #fff;
    text-align: center;
    padding: 0.5rem 1rem;
    font-weight: 600;
    font-size: 0.9rem;
    letter-spacing: 0.02em;
  }

  .container {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.75rem;
  }

  .subtitle {
    margin: 0 0 1.5rem;
    color: #555;
    font-size: 0.95rem;
  }

  h2 {
    font-size: 1.15rem;
    margin: 1.75rem 0 0.75rem;
    border-bottom: 2px solid #e0e0e0;
    padding-bottom: 0.25rem;
  }

  .muted {
    color: #777;
    font-size: 0.9rem;
  }

  .generated {
    margin: 0 0 0.5rem;
  }

  .empty-state {
    padding: 2rem 1rem;
    border: 1px dashed #ccc;
    border-radius: 8px;
    background: #fff;
    text-align: center;
  }

  .empty-state h2 {
    border: none;
    margin: 0 0 0.5rem;
  }

  code {
    background: #eee;
    padding: 0.05em 0.35em;
    border-radius: 3px;
    font-size: 0.9em;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    border-radius: 6px;
    overflow: hidden;
  }

  th,
  td {
    padding: 0.55rem 0.75rem;
    text-align: left;
    border-bottom: 1px solid #eee;
    font-size: 0.92rem;
  }

  th {
    background: #f0f0f0;
    font-weight: 600;
  }

  td.num,
  th.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .pos {
    color: #1b7f3b;
    font-weight: 600;
  }

  .neg {
    color: #c62828;
    font-weight: 600;
  }

  .footer {
    margin-top: 3rem;
    padding: 1rem;
    text-align: center;
    color: #c62828;
    background: #fff3f3;
    border-top: 1px solid #f0d0d0;
    font-size: 0.85rem;
    font-weight: 600;
  }
</style>
