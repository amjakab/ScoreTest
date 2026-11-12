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

## Airline market scoring

Brady's shared score gains or loses five points per percentage point of movement in the [U.S. Global Jets ETF (JETS)](https://usglobaletfs.com/fund/u-s-global-jets-etf/), rounded to the nearest whole point. For example, a 1.2% gain adds six points. The calculation uses the two latest completed daily closing prices from [Alpha Vantage](https://www.alphavantage.co/documentation/#daily).

1. Apply [the airline score migration](supabase/migrations/20261112000000_airline_market_score.sql) to the tracker’s Supabase project, for example using its SQL Editor.
2. In GitHub’s repository settings, add Actions secrets named `ALPHA_VANTAGE_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Use the legacy Supabase `service_role` JWT for the last secret.
3. Once the workflow is on the default branch, use **Run workflow** in GitHub Actions for the first update. The workflow then runs on weekdays at 8:23 p.m. Eastern.

Each run checks the latest completed session. A holiday or repeated run cannot count the same session twice. The first run applies only the latest session, and scheduled runs do not replay older missed sessions. An adjustment that rounds to zero is recorded for deduplication and leaves the score unchanged.
