export function matchingBar(payload) {
  const bitcoin = payload?.bars?.['BTC/USD'];
  const ethereum = payload?.bars?.['ETH/USD'];
  if (!Array.isArray(bitcoin) || !Array.isArray(ethereum)) return null;
  const ethByTime = new Map(ethereum.map(bar => [Date.parse(bar.t), bar.c]));
  let latest = null;
  for (const bar of bitcoin) {
    const time = Date.parse(bar.t);
    const eth = ethByTime.get(time);
    if (Number.isFinite(time) && Number.isFinite(bar.c) && bar.c > 0
        && Number.isFinite(eth) && eth > 0 && (!latest || time > latest.time)) {
      latest = { time, btc: bar.c, eth };
    }
  }
  return latest;
}

export function readCryptoSnapshot(baseline, recent, dayStart, now) {
  const start = matchingBar(baseline);
  const current = matchingBar(recent);
  if (!start || !current || start.time >= dayStart || start.time < dayStart - 10 * 60_000
      || current.time < dayStart || current.time > now - 60_000
      || current.time < now - 8 * 60_000) return null;
  const spread = 100 * (current.btc / start.btc - current.eth / start.eth);
  return {
    p_snapshot_at: new Date(current.time).toISOString(),
    p_spread_percent: Number(spread.toFixed(8)),
  };
}
