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

export function marketTime(date) {
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

export function marketSession(calendar, now) {
  if (!Array.isArray(calendar)) throw new Error('Alpaca returned an invalid market calendar.');
  const { date } = marketTime(now);
  const session = calendar.find(day => day.date === date);
  if (!session) return null;

  const asMinutes = value => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Alpaca returned invalid market hours.');
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  };
  return { date, open: asMinutes(session.open), close: asMinutes(session.close) };
}

export function isSessionActive(session, now) {
  const { date, minuteOfDay } = marketTime(now);
  return session.date === date && minuteOfDay >= session.open && minuteOfDay <= session.close + 2;
}

export function readMarketSnapshot(payload, now, session) {
  const bar = payload?.minuteBar;
  const previousBar = payload?.prevDailyBar;
  const barMs = Date.parse(bar?.t);
  const previousMs = Date.parse(previousBar?.t);
  if (!Number.isFinite(barMs) || !Number.isFinite(previousMs)) return null;

  const time = marketTime(new Date(barMs));
  if (!isSessionActive(session, now) || time.date !== session.date
      || time.minuteOfDay < session.open || time.minuteOfDay >= session.close
      || marketTime(new Date(previousMs)).date >= session.date
      || barMs > now.getTime() || now.getTime() - barMs > 180_000) return null;

  const close = bar.c;
  const previousClose = previousBar.c;
  if (!Number.isFinite(close) || !Number.isFinite(previousClose) || close <= 0 || previousClose <= 0) {
    return null;
  }

  return {
    p_snapshot_at: new Date(barMs).toISOString(),
    p_change_percent: Number(((close / previousClose - 1) * 100).toFixed(8)),
  };
}
