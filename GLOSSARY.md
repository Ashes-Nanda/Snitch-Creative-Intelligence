# Creative Intelligence

A weekly review workspace that connects ad creatives to their performance, finds patterns worth testing, and records the team's decisions about those tests.

## Creatives and data

**Creative**:
A single ad asset (image, video or carousel) running on one platform.
_Avoid_: Ad, asset (when meaning the whole record)

**Platform**:
The ad network a creative runs on and reports from: Meta Ads or Google Ads. Each platform has its own metric and attribution definitions.
_Avoid_: Channel, source

**Performance record**:
One platform's reported counts (impressions, clicks, spend, conversions, attributed revenue) for one creative over one reporting week.
_Avoid_: Row, stats

**Reporting period**:
The span of reporting weeks currently under review.
_Avoid_: Date range (in prose), timeframe

**Synthetic performance**:
Performance figures generated for demonstration that describe no real campaign.
_Avoid_: Fake data, mock data, simulated results

**Data-quality report**:
The account of which incoming records were rejected, duplicated or left unmatched, and why.
_Avoid_: Error log, validation output

## Analysis

**Creative attributes**:
Observable properties of a creative (opening hook, visual style, offer, call to action, text density) recorded by analysis.
_Avoid_: Tags, features

**Insight**:
A pattern in one platform's data where creatives sharing an attribute differ from the rest on a metric, stated with its evidence and limitations.
_Avoid_: Finding (for the whole object), recommendation

**Comparison group**:
The analysed creatives on the same platform that do not share the insight's attribute.
_Avoid_: Control group (reserved for experiments), baseline

**Confounded**:
Describes two insights whose creative groups largely coincide, so the data cannot tell which attribute, if either, matters.
_Avoid_: Correlated, duplicate insight

**Evidence level**:
How far an insight's own data supports it: _Supported within dataset_ (clears the evidence bar and is not confounded), _Hypothesis_ (clears the bar but is confounded) or _Insufficient evidence_ (does not clear the bar).
_Avoid_: Confidence, score

**Stale**:
Describes a saved insight snapshot that the current data no longer reproduces: the insight is gone, its creative groups changed, or its difference fell below the evidence bar.
_Avoid_: Outdated, expired

**Dismissal**:
A person's recorded decision, with a reason, to set an insight aside. The insight is kept, not deleted.
_Avoid_: Delete, hide

## Experiments

**Proposal**:
A record describing a test the team might run: hypothesis, control, variant, metrics and success criteria. A proposal is never the test itself.
_Avoid_: Experiment (for an unrun proposal), campaign

**Proposal status**:
Where a proposal stands: Draft, Needs review, Approved, Rejected, Completed or Not run. Approval means the team accepts the proposal; it does not launch anything.
_Avoid_: Running, live, edited

**Outcome**:
A person's verdict on a test run outside the system: won, lost or inconclusive (making the proposal Completed), or not run.
_Avoid_: Result (for the verdict), success

**Decision**:
A person's recorded change to a proposal or insight (approve, reject, request edits, record outcome, dismiss), with its time, actor and reason.
_Avoid_: Action, event, update

## Review

**Review session**:
Everything the current review shows, derived from the loaded data, the filters in the URL and the saved decisions: the library view, insights with their evidence levels and freshness, the attention queue, and the previous reporting period.
_Avoid_: Dashboard state, context

**Unavailable metric**:
A metric that cannot be calculated because an input is missing or a denominator is zero. It is shown as a dash, never as zero.
_Avoid_: N/A, null metric, zero

**Attention item**:
Something in the current review that needs a person's decision or investigation, such as a proposal needing review or a creative needing investigation.
_Avoid_: Alert, notification, task

**Needs investigation**:
Describes a creative with at least its platform's median spend whose ROAS is at least 25% below its platform's pooled ROAS.
_Avoid_: Underperformer, loser

**Recommended next action**:
The single highest-priority attention item that is a proposal to review or a creative to investigate.
_Avoid_: Insight, suggestion
