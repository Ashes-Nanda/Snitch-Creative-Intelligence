# Creative Intelligence Dashboard (prototype)

An interactive dashboard for weekly ad-creative review, built from the PRD. It links creative assets, campaign metrics, insights backed by evidence, and experiments that a person approves.

> **All campaign metrics are simulated.** Creative assets are generated SVG placeholders, not real Snitch creatives. This prototype is not affiliated with or endorsed by Snitch.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 41 domain tests (Vitest)
npm run build
npm run fixtures   # regenerate the deterministic demo dataset in public/data
```

## How it is built

- **Stack:** Vite, React, TypeScript, Tailwind v4, shadcn/ui (Radix, zinc tokens), Recharts, and zod for validation. There is no backend. Data is served as static JSON fixtures; decisions are saved in `localStorage` through a storage adapter. Filters, sort, page and selection live in the URL.
- **Vocabulary:** see `GLOSSARY.md`. Two deliberate departures from the PRD and UI spec are recorded in `docs/adr/`: proposals have no "Running" status, and insight status is three separate dimensions.
- **Domain core (`src/domain`)** is deterministic and was built test-first:
  | Module | Covers |
  |---|---|
  | `metrics` | CTR, CPC, CPA, ROAS and conversion rate. Zero denominators and missing revenue are unavailable, never zero. |
  | `ingest` | Schema validation, duplicate creatives and records, unmatched records, stable IDs, data-quality report |
  | `view` | One selector for every page: period, platform, format, product, search (name, ID, product, attributes), analysis status, data availability, deterministic sort. Creatives without data stay visible with unavailable metrics. |
  | `insights` | Comparisons within a single platform, minimum sample and effect size, visible suppression, confounding, recommendable insights |
  | `freshness` | Evidence level (supported or hypothesis), insight snapshots, staleness |
  | `experiments` | Proposal lifecycle (Draft → Needs review → Approved/Rejected → Completed/Not run), required fields, decision history, outcomes with a system check, save-first persistence |
  | `dismissals` | Insight dismissals with a reason and snapshot |
  | `review` | Attention queue, recommended next action, rankings, peer comparison, previous period |
  | `analysis` | AI output either matches the schema or fails as a whole |
  | `session` | The review session: reads filters from the URL (latest four weeks by default, unrecognised values ignored), scopes the library and insight views, previous period, freshness against each snapshot's own period, proposals to sync |
- **UI (`src/pages`, `src/components`)** has no unit tests by agreement. It was checked by hand in the browser, at desktop and mobile widths.

## Demo controls (Data quality page)

- **Export:** "Week ending 1 Nov" adds a week and re-runs two analyses, so saved snapshots it no longer reproduces show as **Stale**. The choice resets on page reload.
- **Simulate a failed refresh:** the dashboard keeps the last good data and shows a warning.
- **Reset demo:** clears saved proposals, decisions and dismissals in this browser.

## Known limits

- Creative analysis uses fixture output (`manual-fixture-v1`), labelled "AI analysis (fixture)". No model is called, so there is no Retry analysis action.
- Insights compare pooled CTR only, with fixed thresholds (≥3 creatives per group, ≥15% difference). There are no significance tests.
- Light mode only. Creative assets are synthetic placeholders. To use public Snitch assets, first confirm the use is permitted (PRD §12), then set `asset_url`, `data_origin: "public"` and `source_note`.

## AI image analysis (OpenRouter)

Real SNITCH creatives are analysed on demand by a vision model through OpenRouter. The browser never sees the key.

**Setup:** copy `.env.example` to `.env.local` (gitignored) and set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`. The model must accept image input; the service checks this against OpenRouter's models list before spending anything. Analysis runs only under `npm run dev` or `npm run preview`, because the `/api/analysis` routes are Vite server middleware (`src/server/`). A static build shows a "not available" notice, and everything else keeps working.

**Flow:** a user clicks Analyse, Retry, or Analyse next 5 → `POST /api/analysis/:id` or `/batch` (max 10, sequential, one run ID) → the server looks the creative up by ID (it never accepts a URL from the browser) → downloads the image (≤5 MB; JPEG, PNG, WebP or GIF), sends it as a data URL with a strict JSON schema → validates the answer (`src/domain/vision.ts`) → persists it to `data/ai-analyses.json` against the creative ID.

**Behaviour:** 60 s timeout per call; up to 3 attempts on rate limits, timeouts and 5xx, honouring `Retry-After`; no retry on auth, credit, invalid-model or malformed-output errors. Concurrent requests for one creative share a single call. Unchanged assets with the same model reuse the stored result unless re-analysis is forced. A failed retry keeps the earlier successful result. Each attempt records model, duration, attempts, tokens and cost. Telemetry: `src/server/telemetry.ts`, `GET /api/telemetry`, the System metrics page.

**Output:** observations (visible only), a separate AI interpretation, and an explicit list of what can't be established. It never infers performance, audience or sales.

**Cost seen so far:** about $0.015 per image with `anthropic/claude-sonnet-5.5`.

**Provenance:** `npm run verify-sources` re-checks every asset against its source. Product name, price and stated attributes come from the product page's structured data. Ads are `third_party_ad_directory` / `partially_verified` (found on zooptrack, not confirmed in the Meta Ad Library) and carry no price or attributes.
