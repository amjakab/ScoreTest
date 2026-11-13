import { timingSafeEqual } from 'node:crypto';
import { readCryptoSnapshot } from './market.mjs';

const encoder = new TextEncoder();

function isAuthorized(request: Request): boolean {
  const secret = Deno.env.get('AIRLINE_CRON_TOKEN');
  const token = request.headers.get('x-airline-cron-token');
  if (!secret || !token) return false;
  const expected = encoder.encode(secret);
  const supplied = encoder.encode(token);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

async function fetchBars(start: number, end: number, headers: HeadersInit) {
  const url = new URL('https://data.alpaca.markets/v1beta3/crypto/us/bars');
  url.search = new URLSearchParams({
    symbols: 'BTC/USD,ETH/USD',
    timeframe: '1Min',
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  }).toString();
  const result = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!result.ok) throw new Error(`Alpaca crypto bars returned HTTP ${result.status}.`);
  return result.json();
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!isAuthorized(request)) return new Response(null, { status: 401 });

  const key = Deno.env.get('ALPACA_API_KEY_ID');
  const secret = Deno.env.get('ALPACA_API_SECRET_KEY');
  const project = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || !secret || !project || !service) {
    return Response.json({ error: 'Crypto worker is missing configuration.' }, { status: 500 });
  }

  try {
    const now = Date.now();
    const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
    const lastCompleteMinute = Math.floor(now / 60_000) * 60_000 - 60_000;
    if (lastCompleteMinute < dayStart) return new Response(null, { status: 204 });
    const headers = { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret };
    const [baseline, recent] = await Promise.all([
      fetchBars(dayStart - 10 * 60_000, dayStart - 60_000, headers),
      fetchBars(Math.max(dayStart, lastCompleteMinute - 5 * 60_000), lastCompleteMinute, headers),
    ]);
    const snapshot = readCryptoSnapshot(baseline, recent, dayStart, now);
    if (!snapshot) return new Response(null, { status: 204 });
    const response = await fetch(new URL('/rest/v1/rpc/apply_crypto_market_snapshot', project), {
      method: 'POST',
      headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Crypto score update returned HTTP ${response.status}.`);
    return Response.json({ points: await response.json() });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Crypto score update failed.');
    return Response.json({ error: 'Crypto score update failed.' }, { status: 502 });
  }
});
