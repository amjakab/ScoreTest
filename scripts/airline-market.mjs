export function getLatestSession(payload, today, allowToday) {
  const series = payload?.['Time Series (Daily)'];
  const dates = Object.keys(series ?? {})
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && (date < today || (allowToday && date === today)))
    .sort()
    .reverse();
  const [date, previousDate] = dates;
  const close = Number(series?.[date]?.['4. close']);
  const previousClose = Number(series?.[previousDate]?.['4. close']);
  if (!Number.isFinite(close) || !Number.isFinite(previousClose) || close <= 0 || previousClose <= 0) {
    throw new Error('Alpha Vantage did not return two completed JETS closes.');
  }

  return { date, changePercent: Number(((close / previousClose - 1) * 100).toFixed(8)) };
}

export async function updateAirlineScore(env, fetchData = fetch, now = new Date()) {
  const { ALPHA_VANTAGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;
  if (!ALPHA_VANTAGE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Configure ALPHA_VANTAGE_API_KEY, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.');
  }

  const quote = new URL('https://www.alphavantage.co/query');
  quote.search = new URLSearchParams({
    function: 'TIME_SERIES_DAILY',
    symbol: 'JETS',
    apikey: ALPHA_VANTAGE_API_KEY,
  });
  let response;
  try {
    response = await fetchData(quote, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error('Could not reach Alpha Vantage.');
  }
  if (!response.ok) throw new Error('Alpha Vantage returned HTTP ' + response.status);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const { year, month, day, hour } = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const session = getLatestSession(await response.json(), [year, month, day].join('-'), Number(hour) >= 17);

  const rpc = new URL('/rest/v1/rpc/apply_airline_market_session', SUPABASE_URL);
  const result = await fetchData(rpc, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_session_date: session.date,
      p_change_percent: session.changePercent,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!result.ok) throw new Error('Supabase rejected the market update (HTTP ' + result.status + ').');
  return { ...session, recorded: await result.json() };
}
