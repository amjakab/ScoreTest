const marketClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function marketTime(date) {
  const fields = Object.fromEntries(marketClock.formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    date: [fields.year, fields.month, fields.day].join('-'),
    weekday: fields.weekday,
    minuteOfDay: Number(fields.hour) * 60 + Number(fields.minute),
  };
}

export function shouldFetchMarket(now) {
  const { weekday, minuteOfDay } = marketTime(now);
  // Give the closing print two minutes to reach the feed.
  return weekday !== 'Sat' && weekday !== 'Sun' && minuteOfDay >= 570 && minuteOfDay <= 962;
}

export function readMarketSnapshot(payload, now) {
  const ticker = payload?.ticker;
  if (payload?.status !== 'OK' || ticker?.ticker !== 'JETS') {
    throw new Error('Market feed did not return JETS.');
  }

  // Snapshot updated is in nanoseconds. The minute bar timestamp is in milliseconds.
  const updatedMs = Math.floor(ticker.updated / 1_000_000);
  const minuteMs = ticker.min?.t;
  if (!Number.isSafeInteger(updatedMs) || !Number.isSafeInteger(minuteMs)) return null;

  const minute = marketTime(new Date(minuteMs));
  const updated = marketTime(new Date(updatedMs));
  if (minute.date !== marketTime(now).date || updated.date !== minute.date
      || minute.minuteOfDay < 570 || now.getTime() - minuteMs > 180_000
      || updatedMs > now.getTime() + 10_000) return null;

  // The provider's day bar covers regular trading, including on early-close days.
  const close = ticker.day?.c;
  const previousClose = ticker.prevDay?.c;
  if (!Number.isFinite(close) || !Number.isFinite(previousClose) || close <= 0 || previousClose <= 0) {
    return null;
  }

  return {
    p_snapshot_at: new Date(updatedMs).toISOString(),
    p_change_percent: Number(((close / previousClose - 1) * 100).toFixed(8)),
  };
}
