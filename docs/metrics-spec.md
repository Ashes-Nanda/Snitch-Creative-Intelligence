# Metrics specification

What the system measures, how each figure is computed, and what it does not show.

Code:
- `src/domain/telemetry.ts`: model calls, cost, reliability
- `src/domain/outcomes.ts`: decisions
- `src/domain/timing.ts`: time study
- `src/server/telemetry.ts`: recording

Shown on **System metrics**, a secondary page, not the Overview.

## Rules that apply to every metric

- **Missing data stays missing.** A value that wasn't reported shows as `—` with how many events reported it, never as 0. Totals list their coverage (e.g. "3 of 4 requests reported it").
- **Every rate shows its numerator and denominator.** With a zero denominator the rate is `—`, not 0%.
- **Live and test never mix.** Each event and timed task has `origin`: `live`, or `test` for mocked, scripted or practice runs. Every figure is computed for one origin.
- **Window.** Model-call figures cover all recorded events of the chosen origin. The page shows the first and last call time. Decision figures use the proposal's creation time. All code accepts `from`/`to` (inclusive ISO timestamps) for narrower windows.
- **Deduplication.** Events are keyed `runId:creativeId:attempt` (call and validation), `runId:creativeId:cache` or `runId:creativeId:preflight`. A key recorded twice counts once, keeping the last record.

## Unit of value: the run

A **run** (`runId`) is one user-triggered analysis task: a batch request (`POST /api/analysis/batch`), or one single analysis or re-analysis. It links:

```
runId ─┬─ call events (one per provider attempt, with attempt number)
       ├─ validation events (did the answer pass the schema?)
       ├─ cache-hit events (answered from a stored result, no call)
       ├─ preflight-failure events (failed before any call, e.g. image unavailable)
       └─ timed task (runIds[]) ── proposalId ── decisions ── recorded outcome
```

An **analysis** is one creative within one run, however many retries it took. Run-level figures (requests, tokens, cost, system elapsed time, creatives attempted and succeeded) are in `CallSummary.runs`.

## A. Efficiency: time saved

**Task boundary.** The task starts when the person begins choosing creatives. It ends when one experiment proposal is ready to submit for review (all required fields filled):

`select creatives → inspect assets → analyse attributes → compare evidence → draft experiment proposal`

| Field | Meaning | Source |
|---|---|---|
| `manual_task_duration_seconds` | Hands-on minutes for a manual task, self-reported at the end, × 60 | `TimedTask.activeHumanSeconds` (mode `manual`) |
| `active_human_time_seconds` | Hands-on time on an assisted task, self-reported | `activeHumanSeconds` (mode `assisted`) |
| `review_and_correction_time_seconds` | Time spent checking, correcting and redoing system output, self-reported (0 allowed, never blank) | `reviewSeconds` |
| `assisted_task_duration_seconds` | Active + review | `humanSeconds()` |
| `system_elapsed_time_seconds` | First request start to last request end in a run. Machine time only | `RunSummary.systemElapsedMs` |
| Task elapsed (wall clock) | Start to finish, including waiting. Context only, never human time | `endedAt − startedAt` |
| `task_completion_status` | `completed` or `abandoned` | `TimedTask.status` |

**Time saved** = median manual human time − median assisted human time.
**Time saved %** = time saved ÷ median manual human time × 100.

Computed only when all of these hold:
- both groups have the same deliverable and the same number of creatives;
- each group has at least 3 completed tasks (`MIN_TASKS_PER_MODE`);
- the manual median is greater than 0.

Otherwise it shows **Not yet established** with the reason. Abandoned tasks are counted and shown, but they're left out of the medians. Model latency is never used as time saved.

**Limitations:**
- Human time is self-reported. Nothing infers attention from page activity.
- Medians from small samples are unstable, so report n alongside them.
- The same person doing the same creatives manually and then assisted learns the material, which biases the second task. Use different creative sets of the same size, or alternate the order.

### Protocol for the manual baseline (no baseline exists yet)

1. Fix the scope: 6 creatives from one platform; the deliverable is one complete experiment proposal.
2. Prepare at least 6 disjoint creative sets of that size.
3. For each person, alternate modes and sets: set 1 manual, set 2 assisted, set 3 manual, and so on.
   - **Manual** uses the asset images and the performance table, but not the AI analysis, insights or auto-proposals.
   - **Assisted** uses the full dashboard.
4. On **System metrics**, choose the mode and creative count, then press **Start timed task**. When done, enter hands-on minutes (and review/correction minutes for assisted), plus the proposal ID if one was saved. Mark training rounds as **Practice run**.
5. After at least 3 completed tasks of each mode, the page reports medians, n and time saved. Quote the median and n, never a single best case.

## B. Model and API cost

Recorded for every provider attempt (`CallEvent`):
- provider and requested model; returned model and generation ID when reported;
- input, output and cached-input tokens;
- provider-reported cost in USD;
- latency, status and error kind;
- attempt number, workflow, creative, run, origin and start time.

**Cost per request, in order of preference:**

1. **Reported:** `usage.cost` from OpenRouter (the request asks for it with `usage: { include: true }`).
2. **Estimated:** `(input − cached) × input price + cached × cached price (or input price if none) + output × output price`, per million tokens. Uses the price for the *returned* model in `src/domain/prices.ts`. Each price must name its source and effective date. The table is empty today, because OpenRouter reports cost.
3. **Unavailable:** shown as `—` and counted. While any request is unavailable, totals carry a "lower bound" flag.

| Metric | Numerator | Denominator | Notes |
|---|---|---|---|
| Total recorded cost | Sum of reported + estimated cost | — | Includes failed attempts the provider charged for |
| Cost per successful analysis | Total recorded cost | Analyses with a valid result | Failed attempts' cost is carried by the successes |
| Cost per attempted analysis | Total recorded cost | Analyses attempted | |
| Cost per run | Run's total cost | — (distribution over runs) | Only runs where every request has a cost |
| Tokens per request | input + output | Requests reporting both | Median, mean, n |
| Latency | Successful requests' latency | — | Median, mean, n. Machine time only |
| Cost data coverage | Reported / estimated / unavailable counts | All requests | |

Insights, the attention queue and proposal drafting cost nothing per run: they don't call a model. So "cost per generated insight" and "cost per proposal" are the analysis cost of the creatives involved, not a separate charge. They can be derived once proposals record their source run IDs (audit gap 5).

**Limitations:**
- Cost is provider-reported per request and not yet reconciled with billing.
- Timeouts and 5xx errors return no usage, so their cost is unavailable even if billed.
- Image retrieval and hosting are not model costs, and they aren't measured.

## C. Quality and reliability

| Metric | Numerator | Denominator | Data source | Exclusions | Limitations |
|---|---|---|---|---|---|
| Analysis completion rate | Analyses with a valid validation event | Analyses attempted: with at least one provider call, or failed before one (preflight failure) | Call, validation and preflight-failure events | Stored-result reuses (counted separately) | Preflight failures before 26 Oct 23:40 aren't in the log |
| Request error rate | Failed requests | All requests | Call events | — | Shown as counts, with failures by kind |
| Retry recovery rate | Analyses whose first attempt failed (error or invalid output) and that later produced a valid result | Analyses whose first attempt failed and that were retried | Call + validation events | Analyses never retried | Invalid output is not retried by design, so it only counts if retried by hand in the same run |
| Invalid structured-output rate | Validation events with status `invalid` | All validation events | Validation events | Requests that errored before returning | — |
| Stored-result reuse rate | Cache-hit events | Cache hits + analyses with a call | Cache-hit + call events | — | Reuse requires the same asset URL and model |
| Recommendation acceptance rate | System recommendations whose latest approve/reject decision is approve | Recommendations with an approve or reject decision | Proposal history (`localStorage`) | Undecided recommendations (never counted as rejected) | A workflow signal, not evidence the test improved results. Per browser |
| Human edit rate | Recommendations edited or sent back for edits | Recommendations with any human decision | Proposal history | Untouched recommendations | Doesn't measure edit size |
| Draft submission rate | Hand-started drafts submitted for review | Hand-started drafts | Proposal history | System recommendations | — |
| Outcome-recorded rate | Approved proposals with a recorded outcome | Approved proposals | Proposal history | Unapproved proposals | Generated or approved proposals are never counted as completed experiments |
| Verdict disagreements | Outcomes whose entered values contradict the verdict | Outcomes recorded | `RecordedOutcome.disagrees` | — | — |
| Insufficient-evidence rate | Suppressed patterns | Patterns that cleared the effect threshold | `generateInsights().suppressed` | — | Shown on the Insights page; not repeated on System metrics |
| End-to-end completion | Completed timed tasks | Completed + abandoned timed tasks | Timed tasks | In-progress tasks | Only as good as the study's coverage |

A **system recommendation** is a proposal the system created from an insight (ID `exp:<insightId>`). A hand-started draft has ID `draft:<key>`.

## What this does not show

- Business impact: whether a winning test raised revenue.
- Model accuracy against human-labelled attributes. **[Proposed]:** a labelled sample of 20–30 creatives, scored per attribute, would turn "passes the schema" into "is correct".
- Historical cost or time before 26 Oct 2026: there is none to recover.
