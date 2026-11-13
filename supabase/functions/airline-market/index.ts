import { timingSafeEqual } from 'node:crypto';
import { isSessionActive, marketSession, marketTime, readMarketSnapshot, shouldFetchMarket } from './market.mjs';

const encoder = new TextEncoder();

function isAuthorized(request: Request): boolean {
  const secret = Deno.env.get('AIRLINE_CRON_TOKEN');
  const token = request.headers.get('x-airline-cron-token');
  if (!secret || !token) return false;
  const expected = encoder.encode(secret);
  const supplied = encoder.encode(token);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!isAuthorized(request)) return new Response(null, { status: 401 });
  if (!shouldFetchMarket(new Date())) return new Response(null, { status: 204 });

  const alpacaKeyId = Deno.env.get('ALPACA_API_KEY_ID');
  const alpacaSecret = Deno.env.get('ALPACA_API_SECRET_KEY');
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!alpacaKeyId || !alpacaSecret || !projectUrl || !serviceKey) {
    return Response.json({ error: 'Market worker is missing configuration.' }, { status: 500 });
  }

  try {
    const headers = {
      'APCA-API-KEY-ID': alpacaKeyId,
      'APCA-API-SECRET-KEY': alpacaSecret,
    };
    const now = new Date();
    const { date } = marketTime(now);
    const calendar = await fetch(`https://paper-api.alpaca.markets/v2/calendar?start=${date}&end=${date}`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (!calendar.ok) throw new Error(`Alpaca calendar returned HTTP ${calendar.status}.`);
    const session = marketSession(await calendar.json(), now);
    if (!session || !isSessionActive(session, now)) return new Response(null, { status: 204 });

    const quote = await fetch('https://data.alpaca.markets/v2/stocks/JETS/snapshot?feed=iex', {
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (!quote.ok) throw new Error(`Alpaca snapshot returned HTTP ${quote.status}.`);
    const snapshot = readMarketSnapshot(await quote.json(), new Date(), session);
    if (!snapshot) return new Response(null, { status: 204 });

    const result = await fetch(new URL('/rest/v1/rpc/apply_airline_market_snapshot', projectUrl), {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout(8_000),
    });
    if (!result.ok) throw new Error(`Score update returned HTTP ${result.status}.`);
    return Response.json({ points: await result.json() });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Airline score update failed.');
    return Response.json({ error: 'Airline score update failed.' }, { status: 502 });
  }
});
