# CLAUDE.md — Working guidelines for FlowMetrics

Read `PLAN.md` first for what to build. This file covers how to build it and what
the finished repository must be able to survive.

---

## Context

This is a three-day portfolio project for a supply chain operations role, built
on the Olist Brazilian e-commerce dataset: roughly 100,000 real, anonymised
marketplace orders from 2016 to 2018.

It will be read by an operations hiring manager, skimmed in about ninety seconds,
and then questioned in an interview.

That has one consequence that governs everything below: **the code is not the
deliverable. The defensible finding is.** A beautifully engineered repo that
produces a finding the author cannot explain fails. A plain repo that produces a
clear, honest, well-reasoned finding succeeds.

Optimise for explainability over cleverness, every time.

---

## Non-negotiables

**1. Never fabricate a number.**
Every figure in the README, the dashboard or a resume bullet must be produced by
code in this repository, from the committed dataset, and must be reproducible by
anyone who clones it. If a number cannot be regenerated, it does not get written
down.

**2. Never hardcode a finding.**
The RCA headline is assembled from computed values at runtime. Nobody types a
percentage into a template. If a cleaning rule changes, the headline changes with
it.

**3. Every exclusion is counted and surfaced.**
This is the central discipline of working with real data. Each cleaning rule
records how many rows it removed, the counts land in `/api/meta`, the dashboard
displays them, and the README quotes them. An exclusion nobody can see is a hole
in the analysis, and a reviewer who finds an unexplained row-count drop will
stop trusting everything above it.

**4. Never claim causation.**
This is observational data with confounded predictors. Distance, region and
seller location move together. The vocabulary is "concentrates in", "travels
with", "is associated with". Never "causes", "drives", "because of". The
`causal_caveat` string is rendered in the RCA panel itself, not buried in a
README footnote.

**5. Never claim a capability that is not in the repo.**
Route and hub optimisation are future work. They are described as future work in
the README and appear in no bullet, summary or endpoint as though they exist.

**6. Attribute the data.**
Olist and Kaggle are credited in the README and in the dashboard footer. Raw CSVs
are gitignored, and the download step is documented. Using someone else's data
without attribution is the one mistake here that is not merely sloppy.

---

## Code guidelines

### Structure

Four layers, strictly separated:

- `data/clean.py` joins, derives and cleans. It knows about Olist's table
  structure and nothing about metrics.
- `analysis/` computes. Pure functions, DataFrame in, dict or DataFrame out. No
  printing, no plotting, no HTTP, no file paths.
- `api/` serialises. Thin endpoints that call an analysis function and return its
  result. **No endpoint computes a metric.**
- `frontend/` displays. No arithmetic beyond formatting.

If a metric is calculated in two places it will eventually disagree with itself.
Every number has exactly one definition, in one function, in `analysis/`.

### Configuration

All parameters live in `config.py`: paths, the date window, the state-to-region
map, distance bands, the multi-seller rule. A reviewer must be able to open one
file and see every judgement call that shapes the population.

### Naming

Use the domain's vocabulary, not generic programming words. `seller_leg_hrs`, not
`duration_2`. `sla_adherence_rate`, not `success_pct`. `bottleneck_leg`, not
`max_col`. Keep Olist's original column names in `data/clean.py` so the mapping
back to source is obvious, then rename to domain terms at the boundary.

This matters more than usual. The reader is an operations person. Code using
their words reads as someone who understands the domain.

### Docstrings

Every function in `analysis/` states what it computes and, where there is a
judgement call, why it was made that way. The excess-over-baseline attribution in
`rca.py` gets a full paragraph, and so does the causal-limits note in the driver
analysis. Those docstrings are interview answers written in advance, and writing
them is how you find out whether you actually understand the choice.

### Nulls and missing data

Never `fillna(0)` on a duration. A missing timestamp means the leg is unknown,
not that it took no time, and a zero-filled leg will quietly look like the
best-performing stage in the network. Drop the row, count it, and move on.

Never let a null into a mean without deciding explicitly whether it should be
excluded or whether its absence is itself the finding.

### What not to build

No authentication. No database, ORM or migrations. No Docker. No CI. No caching
layer. No machine learning, including delay prediction. No async anything. No
abstract base classes or plugin systems.

Every one of these is a reasonable engineering instinct and every one will eat a
day you do not have while adding nothing an operations reader can see.
Overengineering is the most likely way this project fails to ship.

---

## Testing

Two files, two purposes.

`tests/test_clean.py` asserts the cleaning invariants:

- No null values in any leg duration column
- No negative leg durations
- Every row has `order_status == 'delivered'`
- Every row falls inside the configured date window
- Every `order_id` appears exactly once
- Every row has exactly one `seller_id`
- The cleaning report's counts sum correctly from raw rows to clean rows

`tests/test_rca.py` asserts the analysis invariants:

- Every late order is attributed to exactly one leg
- No order is attributed to a leg it does not have
- Leg breakdown shares sum to 1
- Baselines are computed from the on-time population only, never the full one
- Adherence rates fall in [0, 1] for every subgroup
- Interstate and intrastate produce separately valid, independently computed
  results

Assert on properties and invariants, not on exact values from today's dataset. A
test that breaks when a cleaning rule is retuned is testing the data, not the
code. The exception is the row-count reconciliation in `test_clean.py`, which
should break loudly if the pipeline silently starts dropping rows.

Do not write tests for API serialisation or the frontend. Not worth the days.

---

## Commit hygiene

The commit history is read. One commit titled "initial commit" containing three
days of work reads as either copied or rushed.

Commit in meaningful increments: config, the table joins, each derived column
group, each cleaning rule, KPI functions, each RCA stage, tests, each endpoint
group, each frontend block, README. Fifteen to thirty commits across three days.

Write messages that say what changed and, when there was a decision, why.
`attribute misses by excess over leg baseline, not raw duration` is a good
message. `restrict to single-seller orders; handover time is unattributable
otherwise` is a better one. `fix stuff` is not.

---

## Documentation

The README is the most-read artefact in the repository. Written last, after the
numbers are final, for someone who will not open the code.

Requirements are in `PLAN.md` section 12. The four most often skipped and most
important:

- **The data source and attribution**, up top, not at the bottom.
- **What was excluded and why**, with counts. This is what makes every other
  number in the document trustworthy.
- **The causal caveat**, in its own paragraph.
- **Why attribution uses excess over baseline.** The one genuine methodological
  decision, and explaining it is what separates a project someone built from a
  project someone understands.

Include a screenshot. A dashboard project with no image of the dashboard makes a
reader assume it does not run.

---

## Definitions that must stay consistent

Use these exact terms everywhere: code, comments, README and conversation. Drift
between synonyms is how a reader loses confidence.

- **Customer SLA** — the promised delivery date shown at purchase. An order is
  **late** when delivery exceeds it. The only definition of customer-facing
  failure.
- **Seller SLA** — the contractual handover deadline. A seller **breaches
  handover** when the carrier receives the parcel after it. Independent of
  whether the customer outcome was late.
- **Legs** — `approval`, `seller`, `carrier`. Always these three names, in this
  order. The carrier leg is **composite** and must be described as such wherever
  it is interpreted.
- **Order type** — `intrastate` or `interstate`. Never "local" or "domestic".
- **TAT** — turnaround time, the duration of a leg or the whole journey.
- **Bottleneck leg** — for a late order, the leg with the greatest excess over
  its own baseline, where the baseline is per (leg, order_type).
- **Adherence** — share delivered on or before the SLA. Always a rate, never a
  count, always reported with its order-type split.
- **Promise slack** — days between promised and actual delivery for on-time
  orders. A planning metric, not an execution one.

---

## The honesty standard

This deserves its own section because it is the thing most likely to be tested
under questioning, and the most costly to get wrong.

An interviewer will find a limitation in this project. There is no version of a
three-day analysis on someone else's 2016 data without them. The only variable is
whether they find it because you named it or because you did not.

Name them first, in the README's limitations section and in conversation:

- The carrier leg is composite, so the largest source of delay is the one this
  data can say least about
- Findings are associations, not causes, and the predictors are confounded
- The data is Brazilian, not Indian: the marketplace structure and regional
  gradient transfer, but RTO from cash on delivery, festive-peak surges and quick
  commerce are entirely absent
- The window is 2016 to 2018, before the pandemic reshaped e-commerce logistics
- A stated share of raw rows was excluded, with per-rule counts
- Multi-seller orders are out of scope, so the seller findings apply to a subset
- No workforce, staffing or facility-capacity dimension exists in the data
- Delivery attempts and returns are invisible; there is one delivery timestamp
  and no attempt count
- Route and hub optimisation are scoped but not built

Every one of these, volunteered, reads as judgement. Every one, extracted, reads
as a gap. The content is identical; only the order changes.

The same standard applies to anything derived from this project. If a resume
bullet, form answer or interview claim cannot be traced to something in this
repository, it does not get said.