<script lang="ts">
  import type { PageData } from './$types.js'
  import { pct, pctValue, units, oddsStaleness } from '$lib/format'

  let { data }: { data: PageData } = $props()

  let title = $derived(
    data.fixture ? `${data.fixture.homeTeam} vs ${data.fixture.awayTeam}` : `Match ${data.matchId}`,
  )
</script>

<svelte:head>
  <title>{title} — pitch-oracle</title>
</svelte:head>

<div class="disclaimer-banner">
  ⚠️ 模拟投注试算，非财务建议。18+。理性博彩。
</div>

<main class="container">
  <p><a href="/">← 返回排行榜</a></p>
  <h1>{title}</h1>
  {#if data.fixture?.date}
    <p class="muted">开赛时间：{data.fixture.date}</p>
  {/if}

  {#if data.rows.length === 0}
    <div class="empty-state">
      <h2>暂无该场比赛数据</h2>
      <p class="muted">
        尚无任何 agent 对本场比赛生成了预测。(No predictions for this match yet.)
      </p>
    </div>
  {:else}
    <section>
      <h2>预测 · Predictions</h2>
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th class="num">P(home)</th>
            <th class="num">P(draw)</th>
            <th class="num">P(away)</th>
            <th>Top score</th>
          </tr>
        </thead>
        <tbody>
          {#each data.rows as row (row.agentId)}
            <tr>
              <td>{row.agentId}</td>
              {#if row.prediction}
                <td class="num">{pct(row.prediction.resultProbs.home)}</td>
                <td class="num">{pct(row.prediction.resultProbs.draw)}</td>
                <td class="num">{pct(row.prediction.resultProbs.away)}</td>
                <td>
                  {row.prediction.scoreProbs[0]?.score ?? '—'}
                </td>
              {:else}
                <td class="num" colspan="4">—</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section>
      <h2>价值投注 · Value bets</h2>
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Market</th>
            <th class="num">Model P</th>
            <th class="num">Odds</th>
            <th class="num">EV</th>
            <th class="num">Stake %</th>
            <th>Odds age</th>
          </tr>
        </thead>
        <tbody>
          {#each data.rows as row (row.agentId)}
            {#each row.bets ?? [] as bet (bet.market)}
              <tr>
                <td>{row.agentId}</td>
                <td>{bet.market}</td>
                <td class="num">{pct(bet.modelProb)}</td>
                <td class="num">{bet.decimalOdds.toFixed(2)}</td>
                <td class="num {bet.ev > 0 ? 'pos' : bet.ev < 0 ? 'neg' : ''}">
                  {bet.ev.toFixed(3)}
                </td>
                <td class="num">{pctValue(bet.recommendedStakePct * 100)}</td>
                <td class="muted">{oddsStaleness(bet.oddsTimestamp)}</td>
              </tr>
            {/each}
          {/each}
        </tbody>
      </table>
      {#if data.rows.every((r) => !r.bets || r.bets.length === 0)}
        <p class="muted">暂无价值投注（赔率缺失或无正 EV）。</p>
      {/if}
    </section>
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
  }

  .container {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }

  h1 {
    margin: 0.25rem 0 0.5rem;
    font-size: 1.5rem;
  }

  h2 {
    font-size: 1.1rem;
    margin: 1.5rem 0 0.6rem;
    border-bottom: 2px solid #e0e0e0;
    padding-bottom: 0.25rem;
  }

  a {
    color: #1565c0;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  .muted {
    color: #777;
    font-size: 0.9rem;
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

  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  th,
  td {
    padding: 0.5rem 0.7rem;
    text-align: left;
    border-bottom: 1px solid #eee;
    font-size: 0.9rem;
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
