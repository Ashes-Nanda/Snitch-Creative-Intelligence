# Demo walkthrough script

A 2½–3 minute screen recording of the Creative Intelligence Dashboard, to share with Hardik Parekh at SNITCH.

**Live URL:** https://snitch-creative-intelligence.vercel.app
**Code:** https://github.com/Ashes-Nanda/Snitch-Creative-Intelligence

Every label, number and state below was checked on the live site on 27 Oct 2026. The numbers depend on the default period (the latest 4 reporting weeks, 28 Sept – 25 Oct). If you change the period before recording, they change too.

## The story in one line

A performance team looks at an underperforming ad, sees what is actually in it (real AI image analysis, kept apart from interpretation and from performance numbers), checks the evidence, and turns it into a test proposal that a person approves on the record.

## Click path

**Overview** → **Inspect creative** (Snitch Quick Rapid Delivery – Delhi NCR, `cr-012`) → scroll the creative page → **View evidence** → **Draft experiment** → fill in the form → **Save changes** → **Submit for review** → **Approve proposal** → **Approve** → **Insights**.

## Recording script

| Time | What to click or do | What the viewer sees | What I should say |
|---|---|---|---|
| 0:00 | Start on **Overview** (`#/overview`). Don't click yet. | Amber banner "Synthetic performance data…". Summary cards: Spend ₹3,59,930, Conversions 806, CTR 1.07%, ROAS 3.64×. **Recommended action** card: "Investigate Snitch Quick Rapid Delivery – Delhi NCR". **Needs attention** list beside it. | "This is a prototype of a weekly creative review for a performance team. The creatives are real public SNITCH ads and product images. The campaign numbers are synthetic, and the banner says so on every page, because I don't have access to real spend data." |
| 0:15 | Point at the **Recommended action** card. | "ROAS 2.02× is 43% below the Meta Ads average (3.53×) on above-median spend." | "Instead of a wall of charts, it picks one thing to look at. Here it flags this Delhi delivery ad: it's spending above the median, and its ROAS sits well below the other Meta creatives." |
| 0:25 | Click **Inspect creative** on the Recommended action card. | Creative page for `cr-012`: the ad image, badges **Public asset**, **Public ad (third-party directory)**, **Partially verified**, analysis status **Completed**. | "This is the real ad." |
| 0:30 | Scroll to **Public facts (ad directory)**. | Category, ad copy, Source: zooptrack ad directory, and the notes "Not confirmed in the Meta Ad Library; no ad ID, start date or spend is available." | "Every public fact says where it came from and how far it's verified. This one comes from a third-party ad directory, so it's marked partially verified. I don't claim more than the source shows." |
| 0:45 | Scroll past **Campaign metrics** (labelled **Synthetic**) to **Creative attributes · AI analysis**. | Description of the image; **Observed in the image (AI-observed)**: composition, product prominence "prominent", visual style "street", visible text "NOW LIVE IN DELHI", "60 MINS", CTA wording "None visible"; **Opening hook (classified)**: model-first. | "This part is real AI analysis. A vision model, Claude Sonnet through OpenRouter, looked at the image itself. It records only what's visible: a man on a street holding roses, the Delhi launch text, and no call-to-action button in this frame." |
| 1:05 | Point at **AI interpretation, not a fact**, then **Uncertain or not visible**. | Interpretation: "Announces the launch of SNITCH QUICK… date-night outfits… within 60 minutes", with its "Based on" reasoning. The uncertain list includes fabric, exact colour and call to action. | "Interpretation is kept separate and labelled as not a fact. The model also lists what it can't tell from the image, like the fabric. That separation matters: a description of the ad is not a claim about why it performed the way it did." |
| 1:20 | Point at the line under the analysis. | "Model anthropic/claude-sonnet-5.5 via OpenRouter · analysed 2026-10-26 17:57 UTC · 12.2s · 2423 in / 998 out tokens · $0.0148…" | "Each analysis records its model, time, tokens and cost. This one took about 12 seconds and cost under two cents." |
| 1:28 | Scroll up to **Evidence** and click **View evidence**. | A weekly table (Impressions, Clicks, Spend, Conversions, Revenue, In period), the formulas, and the comparison group: "the 17 other creatives on the same platform…". | "Every number can be traced. These are the weekly records behind the ROAS figure, the formulas, and exactly which creatives it's compared against. Unavailable values are excluded, never counted as zero." |
| 1:45 | Scroll to the top and click **Draft experiment**. | The Experiments page opens a panel with the draft "Test from Snitch Quick Rapid Delivery – Delhi NCR" in edit mode. "Proposal record only: nothing here runs a campaign." | "From here the next step is a test, not a conclusion." |
| 1:50 | Paste into **Hypothesis**, **Control**, **Variant** and **Success criteria** (text below). Leave **Primary metric** as CTR and guardrails as CPA and ROAS. Click **Save changes**. | The saved proposal: hypothesis, source "From creative cr-012", control, variant, primary metric CTR, guardrails CPA and ROAS, and a **Decision history** with "Created" and "Edited". | "The hypothesis: leading with the 60-minute delivery promise will lift click-through compared with the model-first framing. Same image, one change, with CPA and ROAS as guardrails." |
| 2:10 | Click **Submit for review**. | Status changes to **Needs review**. Buttons: **Approve proposal**, **Reject**, **Request edits**. | "A proposal needs a person's decision. It can be approved, rejected or sent back for edits." |
| 2:18 | Click **Approve proposal**, then **Approve** in the confirmation dialog. | Dialog text: "This records the team's acceptance of the proposal. It does not launch an ad, change a budget or modify any Meta or Google campaign." Then the status reads **Approved**, a **Record outcome** button appears, and the decision history lists every step with its time. | "Approval is just a record. The system doesn't touch Meta or Google. Every decision is saved with who made it and when, so the team can later record whether the test won, lost or was inconclusive." |
| 2:35 | Close the panel and click **Insights** in the sidebar. | **Observed in public creatives**, e.g. public ads: product-first 7, model-first 4. Under **Performance patterns** (labelled **Synthetic**): **Patterns (0)** and **Insufficient evidence (2)**. | "Insights first describe what's in the real creatives. The performance patterns stay at zero here, because with these numbers no group has at least three creatives and a 15% difference. It reports 'not enough evidence' instead of inventing a pattern." |
| 2:50 | Stop on the Insights page. | — | Closing line (below). |

**Text to paste in the form** (copy it in advance so you aren't typing on camera):

- Hypothesis: `Leading with the 60-minute delivery promise will lift CTR versus the current model-first framing.`
- Control: `Current cr-012 creative (model-first, street style)`
- Variant: `Same image with "Delivered in 60 mins" as the opening line`
- Success criteria: `Variant CTR above control after 2 weeks, with CPA within 10% of control.`

## Opening line

"Performance teams see which ads underperform, but not what's actually in them or what to test next, so I built a small tool that connects the two."

## Closing line

"I'd love to hear how this compares with how your team reviews creatives today, and where it would or wouldn't fit."

## Pre-recording checklist

- [ ] Open https://snitch-creative-intelligence.vercel.app in a clean browser profile or a private window. No login is needed.
- [ ] Go to **Data quality**, click **Reset demo…**, then **Reset**. This clears saved proposals and dismissals in this browser, so the draft starts fresh. (A private window starts clean anyway.)
- [ ] The Overview loads with "Loaded … · Synthetic" and no error. Recommended action shows "Investigate Snitch Quick Rapid Delivery – Delhi NCR".
- [ ] Open the cr-012 creative page and wait for the image to load. Images come from the third-party ad directory, so check that this one appears before recording.
- [ ] The synthetic labels are visible: the amber banner, **Synthetic** on Campaign metrics.
- [ ] The blue note "Showing recorded AI image analyses…" appears. That's expected on the live site (see below).
- [ ] Do one full dry run of the path, then reset again with **Reset demo…**.
- [ ] Window about 1440×900. Browser zoom 100–110% so table text is readable. Sidebar expanded.
- [ ] Hide notifications, bookmarks bar and unrelated tabs.
- [ ] Keep a screenshot of the cr-012 AI analysis and of the approved proposal as a fallback.

**Run analysis live or use the recorded results?** Use the recorded results. On the live site, **Re-analyse** is switched off on purpose: it would need the API key on a public page. Running it locally works, but each call takes 10–16 seconds and costs about $0.015, and a live call can fail on camera. The recorded analysis is real model output from 26 Oct, and the page says so. If you want to show a live call, record it separately against `npm run dev` on your machine and keep it short.

## What is real and what isn't

| Item | Status |
|---|---|
| Creative images and ad copy | **Public SNITCH assets.** 14 product images verified on snitch.com product pages. 14 ads from a third-party ad directory (zooptrack): 13 partially verified, 1 unavailable (cr-014, image link returns 404). None confirmed in the Meta Ad Library. |
| Spend, impressions, clicks, conversions, revenue, CTR, ROAS | **Synthetic.** Generated for the demo; not SNITCH results. |
| AI image analysis | **Real model output.** `anthropic/claude-sonnet-5.5` via OpenRouter, run locally on 26 Oct: 27 of 28 creatives completed, none needed a retry. The live site shows these recorded results; it can't run new analyses. |
| AI analysis cost and time | **Recorded per call** from provider-reported usage: median $0.0149 and about 10 s per analysis, $0.40 for all 27. Live cost telemetry is only collected when the app runs locally. |
| Insights / performance patterns | **Computed from synthetic metrics.** Currently 0 patterns and 2 insufficient-evidence notes. |
| Experiment proposals and decisions | **Implemented.** Saved in the viewer's browser only (not shared between people). Approving records a decision; it launches nothing. |
| Time saved | **Not measured.** A timer and protocol exist on **System metrics**; no manual baseline has been recorded. |

## Claims to avoid

- That these are SNITCH's real campaign results, or that the ROAS gap is real. The numbers are synthetic.
- That all 28 assets are verified, or that the ads come from the Meta Ad Library. The ads come from a third-party directory and are partially verified.
- That an insight or the AI analysis explains *why* an ad performed as it did. The analysis describes the image; it makes no causal claim.
- That the tool saves X hours. Time saved has not been measured.
- That approving a proposal runs a test or changes a campaign. It's a record only.
- That the live site runs AI analysis. It shows recorded results; live analysis runs locally.
- Any affiliation with SNITCH. This is an independent prototype.

## Likely follow-up questions

**"Why not just use Ads Manager reporting?"**
- Ads Manager tells you *which* ad underperformed. It doesn't describe what's in the creative in a structured way you can compare across ads, or record what the team decided to test and why.
- This tool links the creative's observed attributes, the numbers with their evidence, and a test proposal with its decision history.

**"How does the AI analysis work?"**
- The server sends the image to a vision model through OpenRouter with a strict JSON schema.
- The answer is split into observations, a labelled interpretation, and an "uncertain" list.
- If the answer doesn't match the schema, it's rejected as a whole, never partly kept. Failures are shown as failed, not hidden.

**"What do these metrics actually represent?"**
- They're synthetic, generated to show the workflow. CTR, CPA and ROAS use standard formulas, shown on each page.
- Meta and Google are never compared directly, because they attribute revenue differently.
- Unavailable values show as a dash, never as zero.

**"How do you know it's reliable, and what does it cost?"**
- Each model call records tokens, provider-reported cost, latency, retries and whether the output passed validation (see **System metrics** when running locally).
- So far: 27 analyses, all valid on the first attempt, about $0.015 and 10 seconds each.
- Time saved isn't measured yet. There's a timer for comparing manual and assisted tasks, but no baseline yet.

**"What would you build next with real data?"**
- Connect real Meta and Google exports in place of the synthetic file.
- Measure a manual baseline for the review task.
- Check the AI attributes against a small human-labelled sample.
- Then see whether patterns hold across enough creatives to be worth testing.
