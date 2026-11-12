<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/19porhWYM7kZrAgpphOHC86XqsUD4nZGF

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Live airline market scoring

During U.S. trading hours, Supabase polls a real-time [Massive JETS snapshot](https://massive.com/docs/rest/stocks/snapshots/single-ticker-snapshot) about once a minute. The [JETS ETF](https://usglobaletfs.com/fund/u-s-global-jets-etf/) tracks the airline sector. Each session contributes five points per percentage point of movement from the previous close, rounded to the nearest whole point. A rise to +1.2% adds six points. If it slips to +0.8% later that session, two points come back off. The final contribution carries over into the next day. Market changes use the existing Supabase Realtime subscription and appear in the activity log.

1. Apply [the migration](supabase/migrations/20261112000000_airline_market_score.sql) in the tracker’s Supabase SQL Editor.
2. Set the Edge Function secrets `MASSIVE_API_KEY` (with real-time U.S. stocks snapshot access) and `AIRLINE_CRON_TOKEN` (a new random secret, such as 32 random bytes encoded in hex). Deploy from the repo with `supabase functions deploy airline-market --project-ref YOUR_PROJECT_REF --no-verify-jwt`. The function authenticates requests with the cron token.
3. Enable Supabase Cron and the `pg_net` extension. In Supabase Vault, create secrets called `airline_project_url` (your Supabase project URL, without a trailing slash) and `airline_cron_token` (the same token as the function secret). Run this in the SQL Editor:

```sql
select cron.schedule(
  'brady-airline-market',
  '* 13-21 * * 1-5',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'airline_project_url')
        || '/functions/v1/airline-market',
      headers := jsonb_build_object(
        'x-airline-cron-token',
        (select decrypted_secret from vault.decrypted_secrets where name = 'airline_cron_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $job$
);
```

The cron window covers both daylight and standard time. The function checks New York time before contacting Massive. It skips stale and premarket quotes, and duplicate or older snapshots cannot change the score. Keep the market API key and cron token in Supabase.
