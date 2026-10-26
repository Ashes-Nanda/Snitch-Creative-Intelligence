# Measurement audit: time, cost and effectiveness

Audited 26 Oct 2026, while live image analysis was being added in parallel. Line numbers are from that day.

Every finding has one label:

- **[Code]** Verified from code
- **[Recorded]** Verified from recorded data (a file the system wrote)
- **[Estimated]**
- **[Proposed]**
- **[Not measurable]** Not currently measurable

## Summary

1. **[Code]** The system calls one model API: OpenRouter's chat completions endpoint, for image analysis of creatives. Nothing else calls an LLM. Insights, the attention queue and experiment proposals are all deterministic code (`src/domain/insights.ts`, `review.ts`, `experiments.ts`), so they cost nothing per run.
2. **[Recorded]** Five live model calls had been made by 23:37 on 26 Oct, all to `anthropic/claude-sonnet-5.5`, all valid on the first attempt, $0.0748 provider-reported in total.
   - The first (cr-015) ran before telemetry was wired in, so it is only in `data/ai-analyses.json`.
   - The other four are one logged batch run (see "Recorded since telemetry was wired in").

   This is too few to quote a typical cost, success rate or run time.
3. **[Code]** Before 26 Oct, every analysis the dashboard showed came from fixture files (`public/data/analyses*.json`, `model_version: manual-fixture-v1`). No model was involved, so no cost, token or reliability history exists before then.
4. **[Code]** The "Retry analysis" button (`src/pages/CreativeDetail.tsx:70-93`, `handleRetryAnalysis`) never called a model.
   - It parsed a hardcoded payload labelled `claude-vision-v2-retry` and showed it as "Verified analysis". Any success-rate figure that included it would be inflated.
   - The session building live analysis has confirmed this and is replacing it with `POST /api/analysis/:id`. Until that lands, treat any analysis with model version `claude-vision-v2-retry` as fabricated.
5. **[Not measurable]** Time saved: no manual baseline has ever been recorded, so it is **not yet established**. A timing protocol and recorder now exist (see below).
6. **[Recorded]** Recommendation acceptance and outcome recording are measurable from existing records. Each proposal stores a full decision history with actor and timestamp in `localStorage` (`ci.proposals.v2`). These records are per browser, and no shared store exists.

### Recorded since telemetry was wired in [Recorded]

From `.telemetry/llm-calls.jsonl`, origin `live`, as of 23:37 on 26 Oct:

| Run | Creative | Attempt | Returned model | Served by | Input tokens | Output tokens | Cost (USD, reported) | Latency | Validation |
|---|---|---|---|---|---|---|---|---|---|
| `498c87e9…` (batch) | cr-001 | 1 | anthropic/claude-sonnet-5.5 | Azure | 2,423 | 983 | 0.014676 | 11.4 s | valid |
| | cr-002 | 1 | same | Azure | 2,423 | 1,054 | 0.015386 | 10.8 s | valid |
| | cr-006 | 1 | same | Azure | 2,423 | 1,001 | 0.014856 | 10.9 s | valid |
| | cr-016 | 1 | same | Azure | 3,141 | 844 | 0.014722 | 10.0 s | valid |

That is one run of 4 creatives: 4 requests, no retries, 4 of 4 valid, $0.0596 reported in total, about $0.0149 per successful analysis. Four calls from one run is still far too few to quote as a typical cost or success rate. Two earlier live events are not in the log: cr-015 (single call, recorded in `data/ai-analyses.json`) and cr-014 (image 404 before any call; reported by the analysis session).

## Model and API call inventory

| Workflow | Call site | Provider | Model | Input | Output | Input tokens | Output tokens | Latency | Cost | Error/retry data | Cache status | User value | Instrumentation gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Image analysis | `src/server/openrouter.ts:110` `complete()` → `POST https://openrouter.ai/api/v1/chat/completions` (line 113). Called from `src/server/analysis-service.ts:122` `callWithRetries()` in `run()` (147), reached from `analyze()` (253) by `src/server/api.ts:39` (batch) and `:59` (single). Browser triggers: `src/app/analysis-client.ts:51, :64`. | OpenRouter. Upstream provider returned per request as `provider` **[Code]** | Configured: `OPENROUTER_MODEL` env (`api.ts:136`). Returned: `body.model`, stored as `returnedModel`. **[Recorded]** for cr-015: requested = returned = `anthropic/claude-sonnet-5.5` | Prompt template (`analysis-service.ts:69` `prompt()`), image as base64 data URL, JSON schema from `src/domain/vision.ts:57`. `max_tokens` 1500, `temperature` 0 (`openrouter.ts:119-120`) | JSON text validated by `parseVisionOutput` (`vision.ts:68`) | Measured: `usage.prompt_tokens` **[Code]** | Measured: `usage.completion_tokens` **[Code]** | Measured per attempt by the telemetry wrapper **[Code]** | Provider-reported: request sends `usage: { include: true }` (`openrouter.ts:121`), stored as `reportedCostUsd` **[Code]** | Measured: error kind, attempt number, one event per attempt **[Code]** | Measured: stored-result reuse via `onCacheHit` (`analysis-service.ts:261`); provider prompt-cache tokens via `cached_tokens` **[Code]** | Attributes that feed insights and proposals | See gaps 1–4 |
| Model capability check | `openrouter.ts:163` `modelInfo()` → `GET /api/v1/models`. Called in `run()` in `analysis-service.ts` before each analysis. Result cached in memory; a failed lookup is not cached. | OpenRouter | n/a | none | Image and structured-output support | n/a | n/a | Not measured | No charge (model list) **[Estimated]** | Failure is recorded as a `preflight_failure` event (`model_unavailable`, `unsupported_model` or `provider`) | In-memory per server process | Stops calls to models that can't read images | Latency not measured |
| Image retrieval | `src/server/api.ts:96` (`fetch` with a 20 s timeout), passed in as `fetchImage` and called in `run()` in `analysis-service.ts` | Public asset hosts (zooptrack.co.in, snitch.com) | n/a | Asset URL | Image bytes (≤ 5 MB, jpeg/png/webp/gif) | n/a | n/a | Not measured separately | No charge to us **[Estimated]** | Failure is recorded as a `preflight_failure` event with kind `image_unavailable` | None | Needed for analysis | Latency of the fetch itself |
| Dataset load | `src/app/data.ts:20` `fetchJson()` | Static files | n/a | — | Dataset JSON | n/a | n/a | No | No | Failed refresh shown in the UI | `no-store` | Dashboard data | Not an AI cost; out of scope |
| Source verification (offline script) | `scripts/verify-snitch-sources.mjs:17-25` | zooptrack.co.in, snitch.com | n/a | Page URLs | Manifest of verified assets | n/a | n/a | No | No | Logs and stops without writing | None | Asset provenance | Run by hand; out of scope |

**Not LLM calls [Code]:** insight generation (`generateInsights`), confounding and evidence levels, attention queue (`buildReview`), proposal drafting (`proposalFor` in `experiments.ts`), staleness (`checkFreshness`). All are deterministic and cost nothing per run.

### Retries, timeouts, batching [Code]

- **Retries:** up to 3 attempts (`analysis-service.ts:90`), only for transient errors (rate limit, timeout, 5xx, network). Exponential backoff of 1 s, 2 s, … capped at 30 s, honouring `Retry-After` (lines 122–145). Invalid output is not retried; it fails the analysis.
- **Timeout:** 60 s per attempt (line 89). The request is aborted, and the telemetry wrapper records it as a `timeout` error.
- **Batching:** the batch route runs creatives one at a time under a single `runId` (`api.ts:39-56`). A single re-analysis gets its own `runId` (line 63).
- **Reuse:** a completed result for the same asset URL and model is returned without a call (`analysis-service.ts:258-262`), unless `force` is set. Concurrent requests for one creative share a single call.

### Persistence and existing records

- **[Code]** `data/ai-analyses.json` (`fileAnalysisStore`, `api.ts:71`): one record per creative, holding only the **latest** attempt. Each new attempt overwrites the last, so it cannot serve as a history.
- **[Code]** `.telemetry/llm-calls.jsonl` (new): an append-only record of every provider attempt, every validation outcome and every stored-result reuse. Holds no prompts, images, model output, reasons text, headers or keys. Ignored by git.
- **[Code]** Browser `localStorage`:
  - `ci.proposals.v2`: proposals with their decision history, including system-created ones;
  - `ci.dismissals.v1`;
  - `ci.timings.v1` (new): timed tasks.

  These are per browser and per origin. Reset demo clears proposals and dismissals, but not timings.
- **[Code]** No database and no migrations. The prototype has no backend beyond the Vite dev/preview middleware.

## Gaps and what was done

| # | Gap | Status |
|---|---|---|
| 1 | Token usage, cost, latency, retries and returned model were not recorded per attempt (only the last attempt per creative, overwritten). | **Fixed [Code]:** `instrumentClient` in `src/server/telemetry.ts` wraps the OpenRouter client and records one event per attempt, keyed `runId:creativeId:attempt`. |
| 2 | Failures before the model call (model check, image fetch, image too large or wrong type) produced no call event, so they were missing from the analysis-completion denominator. | **Fixed [Code]:** `onPreflightFailure` in the analysis service records a `preflight_failure` event (`preflightFailureRecorder`, wired in `api.ts`). These count as attempted, unsuccessful, zero-cost analyses. Failures before this was wired (cr-014's image 404) are not in the log. |
| 3 | A request that times out or errors after reaching the provider may still be billed, but the provider returns no usage for it. | **Partly measurable:** empty or invalid responses now carry billed usage (`ProviderError.usage`). For timeouts and 5xx, cost is recorded as unavailable. **[Proposed]:** reconcile by generation ID with OpenRouter's generation-stats endpoint. |
| 4 | Provider-reported cost is not cross-checked against OpenRouter billing. | **[Proposed]:** a periodic reconciliation against the account's activity export. Until then, cost is "provider-reported per request". |
| 5 | No link from a model run to the decision it fed. | **Partly fixed:** timed tasks record `runIds` and the `proposalId` they produced. Proposals don't store which analysis run produced their attributes. **[Proposed]:** stamp `runIds` on proposals created from insights, once live analysis feeds insights. |
| 6 | No manual baseline and no task timing. | **Recorder added [Code]:** System metrics → Time saved. **No data yet [Not measurable].** Protocol in `docs/metrics-spec.md`. |
| 7 | Decisions live in one browser's storage, so team-wide acceptance rates aren't possible. | **Open.** Figures are per browser and labelled as such. |
| 8 | Test and live usage could mix. | **Fixed [Code]:** every event carries `origin`. The analysis service runs `live` in the app and `test` in tests, and the view switches between them. Timed tasks have a "Practice run" flag. |

## What can be stated today

| Question | Answer | Basis |
|---|---|---|
| Which models and APIs does it call? | OpenRouter chat completions, model from `OPENROUTER_MODEL` (currently `anthropic/claude-sonnet-5.5`), plus the free OpenRouter models list. | [Code], [Recorded] |
| What does a call cost? | $0.0147–$0.0154 per call, provider-reported, for 5 calls ($0.0748 in total including cr-015). | [Recorded], n = 5 |
| Tokens per operation | 2,423–3,141 input, 844–1,054 output per call. | [Recorded], n = 5 |
| How long does a workflow take? | One logged batch run: 4 sequential calls of 10–11 s each, about 43 s of model time. | [Recorded], n = 1 run |
| Human time saved | Not yet established: no manual baseline. | [Not measurable] |
| Success, failure, retry, correction rates | 4 of 4 logged analyses valid, no retries. Too few to state a rate. | [Recorded], n = 4 |
| Acceptance and outcomes | Computable from proposals in this browser; shown on System metrics. | [Code] |
