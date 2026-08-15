# FlowMetrics — Build Plan

Logistics operations dashboard. Tracks delivery KPIs and performs root cause
analysis on SLA misses, using real marketplace order data.

Built as a portfolio project for a supply chain operations role. Read this file
before writing any code.

---

## 1. Who reads this project and what they want

The reader is an operations hiring manager, not a senior backend engineer. They
will spend roughly ninety seconds on the README and, if the interview goes well,
five minutes asking about the analysis. They are checking three things:

1. **Do you understand what an operation measures, and why those metrics?**
   Anyone can plot a chart. Choosing SLA adherence, per-leg turnaround time and
   throughput, and being able to say why a manager would act on each of them, is
   the actual signal.
2. **Can you get from a symptom to a cause?** "Deliveries are late" is a
   complaint. "Misses concentrate in the carrier leg, in the northern states,
   and correlate with distance and a handful of slow sellers" is a finding. The
   project exists to demonstrate that narrowing.
3. **Do you know the limits of your own work?** This is real but foreign data,
   observational, and only partially instrumented. Naming what it cannot tell you
   is worth more than overclaiming what it can.

Everything below serves those three points. If a feature does not serve them, it
is out of scope.

---

## 2. Data source

**Brazilian E-Commerce Public Dataset by Olist**, published on Kaggle by Olist
Store. Roughly 100,000 real orders placed between 2016 and 2018 across Brazilian
marketplaces, anonymised and released by the company itself.

https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce

### 2.1 Why this dataset

It is a **marketplace flow**, the same shape as the Flipkart order trace this
project was originally modelled on: stock sits with the seller, the platform
collects after the order is placed, and the parcel then moves through a logistics
partner to the customer. That means the seller handover is a visible, recorded
stage rather than something hidden inside a warehouse process.

Critically, two things exist here as real recorded fields rather than as
assumptions:

- **A promised delivery date** (`order_estimated_delivery_date`), shown to the
  customer at purchase. SLA adherence is therefore a genuine calculation against
  a genuine promise, not a threshold you invented.
- **A seller handover deadline** (`shipping_limit_date`), the contractual date by
  which the seller must hand the parcel to the carrier. This gives a second,
  independent SLA at the seller level.

Two SLAs at two levels in the same dataset is unusually good for this kind of
analysis, and it is the backbone of the RCA.

### 2.2 Why not Indian data

No comparable Indian e-commerce logistics dataset is public at this granularity.
Say this plainly if asked. The structural argument for transfer is sound: a
marketplace model, third-party sellers, a platform-operated logistics layer, and
a large geography with wide regional infrastructure variation. Brazil's
north-south delivery gradient is a reasonable analogue for India's metro versus
tier-2/tier-3 gradient. What does not transfer is India-specific: RTO from cash
on delivery, festive-peak volume spikes, and quick commerce. Those are named in
the limitations, not hidden.

---

## 3. Scope

**In scope**

- Cleaning and joining the Olist tables into one analysis-ready order table
- Derived leg durations and both SLA definitions
- A KPI layer: SLA adherence, per-leg TAT, throughput, seller-SLA adherence
- A root cause analysis layer: attribute misses to a leg, then a geography, then
  a set of candidate drivers
- A read-only JSON API over the analysis
- A single-page dashboard with KPI cards, an order type toggle, an RCA panel, a
  throughput chart and a filterable order table
- A README that states the findings and the limits of the data

**Explicitly out of scope**

- Authentication, user accounts, roles
- A real database (load the cleaned parquet into a DataFrame at startup)
- Machine learning, including delay prediction
- Route or hub optimisation (documented as future work, not built)
- Deployment, Docker, CI

Every item in the second list is a place where a three-day project dies. Leave
them alone.

---

## 4. Domain model

### 4.1 Source tables used

| Table | Columns that matter |
|---|---|
| `olist_orders_dataset` | `order_id`, `customer_id`, `order_status`, `order_purchase_timestamp`, `order_approved_at`, `order_delivered_carrier_date`, `order_delivered_customer_date`, `order_estimated_delivery_date` |
| `olist_order_items_dataset` | `order_id`, `seller_id`, `shipping_limit_date`, `price`, `freight_value` |
| `olist_customers_dataset` | `customer_id`, `customer_city`, `customer_state`, `customer_zip_code_prefix` |
| `olist_sellers_dataset` | `seller_id`, `seller_city`, `seller_state`, `seller_zip_code_prefix` |
| `olist_products_dataset` | `product_id`, `product_category_name`, weight and dimension columns |
| `olist_order_reviews_dataset` | `order_id`, `review_score` |
| `olist_geolocation_dataset` | `zip_code_prefix`, `lat`, `lng` |

Ignore the payments table. Nothing in this analysis needs it.

### 4.2 Legs

Three observable legs. This is fewer than a full network model would have, and
that constraint is itself a finding worth stating.

```
order_purchase ──► order_approved ──► delivered_carrier ──► delivered_customer
               │                   │                     │
               └ approval leg      └ seller leg          └ carrier leg
```

- **Approval leg** (`order_approved_at - order_purchase_timestamp`): payment
  authorisation. Usually minutes to hours. Occasionally very long, and when it is,
  it eats the customer's promised window before the operation has done anything
  at all.
- **Seller leg** (`order_delivered_carrier_date - order_approved_at`): approval
  to the seller handing the parcel to the logistics partner. This measures
  **seller responsiveness**, not the platform's operation. It is the leg a
  warehouse-out model would never see.
- **Carrier leg** (`order_delivered_customer_date - order_delivered_carrier_date`):
  handover to doorstep. This is transit, sortation, hub movement and last mile,
  all combined, because Olist exposes no intermediate scan events.

**State plainly in the README that the carrier leg is composite.** In a real
network it would decompose into line haul, sortation and last mile, and a delay
in each has a different owner. Collapsing them is a limitation of the
instrumentation, not a modelling choice.

### 4.3 The two SLAs

**Customer SLA.** An order is **late** when
`order_delivered_customer_date > order_estimated_delivery_date`. This is the only
definition of customer-facing failure in this project.

**Seller SLA.** A seller has **breached handover** when
`order_delivered_carrier_date > shipping_limit_date`. This is independent of the
customer outcome: a seller can breach handover and the order still arrive on
time, because the estimated delivery date carries slack.

The relationship between the two is one of the better things this dataset can
show. Compute the cross-tab of the four states (seller on time / breached versus
customer on time / late) and report it. The interesting cell is "seller breached,
customer still on time", because it quantifies how much slack the promise is
carrying, which is a planning question rather than an execution one.

### 4.4 Order type

Derived, not given:

- `intrastate` when `seller_state == customer_state`
- `interstate` otherwise

Same-region orders have a materially shorter carrier leg and a different failure
profile. Baselines and adherence must always be reported with this split, because a pooled figure
averages two unlike populations and drifts whenever the order mix drifts, without
anything in the operation changing.

### 4.5 Multi-seller orders

An order can contain items from several sellers, which makes "the seller leg"
ambiguous. **Restrict the analysis population to single-seller orders.** They are
the large majority, and the alternative (attributing one handover time to several
sellers) would silently corrupt the seller-level findings.

Report the number and percentage excluded by this rule in the README. A stated
exclusion with a count is methodology; an unstated one is a hole.

---

## 5. Cleaning

This is where Day 1 goes. Real data, real problems. Every rule below is a
decision you must be able to defend, so record each one and its row count in a
`cleaning_report` dict that the API exposes and the README quotes.

1. **Status filter.** Keep only `order_status == 'delivered'`. Every other status
   lacks a delivery timestamp and cannot be assessed against an SLA.
2. **Null timestamps.** Even among delivered orders, a small number have null
   `order_approved_at`, `order_delivered_carrier_date` or
   `order_delivered_customer_date`. Drop them; you cannot compute a leg you do
   not have. Count them.
3. **Negative durations.** Some rows have a carrier date before the approval
   date, or a delivery before the handover. These are recording errors. Drop
   them and count them. Do not clamp to zero, which would silently invent a
   zero-length leg.
4. **Date window.** 2016 is sparse to the point of being misleading. Restrict to
   `2017-01-01` through `2018-08-31`, and say so.
5. **Single-seller restriction** per section 4.5.
6. **Extreme outliers.** Inspect the top of the total-TAT distribution before
   deciding anything. Do **not** trim outliers by default: in an operations
   context the tail is the subject, not the noise. If you exclude anything,
   exclude only physically impossible values and state the threshold.

Write the cleaned result to `data/orders_clean.parquet` and commit it if size
permits, so the repo runs without a Kaggle download. If it is too large, commit a
sampled extract and keep the full pipeline reproducible from the raw CSVs.

---

## 6. KPI layer

Pure functions in `analysis/kpis.py`. DataFrame in, dict or DataFrame out. No
printing, no plotting, no HTTP.

### 6.1 Customer SLA adherence

```
adherence_rate = count(delivered_customer_date <= estimated_delivery_date)
                 / total orders
```

Compute overall and grouped by `order_type`, `customer_state`, product category,
`seller_id` and month.

**Expect this number to be high**, likely above 90%. Olist's estimated delivery
dates are conservative. That is not a boring result, it is the first finding:
a promise with that much padding is protecting the adherence metric at the cost
of the customer's expectation. Report it as such rather than being disappointed
by it.

### 6.2 Promise slack

`(estimated_delivery_date - delivered_customer_date)` in days, for on-time
orders. Report the median and the distribution.

This is the metric the dataset practically hands you and most analyses miss. If
the median order arrives many days early, the promise is badly calibrated, and
the lever is repricing the estimate rather than speeding up the operation. Being
able to distinguish "we are fast" from "we promised slowly" is exactly the
planning-versus-execution distinction an ops interviewer is listening for.

### 6.3 Seller SLA adherence and concentration

Share of orders where `delivered_carrier_date <= shipping_limit_date`, overall
and by seller. Plus the four-state cross-tab from section 4.3.

Then the part that turns this into an action: a **Pareto over sellers**. Rank
sellers by their contribution to total handover breaches (or to total customer
misses), take the cumulative share, and report how few sellers account for how
much of the failure.

```python
by_seller = (late.groupby("seller_id").size()
                 .sort_values(ascending=False))
cum_share = by_seller.cumsum() / by_seller.sum()
sellers_to_half = int((cum_share <= 0.5).sum()) + 1
```

Report `sellers_to_half`, `sellers_to_eighty`, and the share of misses held by
the top decile of sellers. Guard it: exclude sellers below a minimum order count
(set it in `config.py`, around 20 orders) before ranking, or a seller with three
orders and three breaches will top a 100% breach-rate list and mean nothing.

Why this matters more than a seller table. A ranked list says "here are some slow
sellers". A Pareto says "twelve sellers out of hundreds account for half our
handover breaches", which is a management action with a defined scope. It is also
the single clearest way to show that a problem is upstream of the operation and
cannot be fixed on the floor.

### 6.4 Lane performance

A **lane** is an origin-destination pair: `seller_state` to `customer_state`.
Aggregate every order into its lane and report per lane:

- Order volume
- SLA adherence
- Median carrier-leg TAT
- Median distance
- Median freight value

Then rank lanes two ways and present both: **worst adherence among lanes above a
volume floor**, and **largest absolute number of late orders**. These are
different questions and they usually give different answers. A lane with 40%
adherence and 30 orders is a quality problem; a lane with 88% adherence and 4,000
orders may be losing more customers in total. Set the volume floor in `config.py`
and state it, or the worst-adherence list will fill with two-order lanes.

Why this matters: lanes are the unit a network planner actually manages. Capacity,
carrier contracts and routing decisions are made per lane, not per state. It is
also the honest setup for the optimisation future work: you can point at the
specific lanes where reassignment or a different carrier would pay, rather than
gesturing at the network in general.

### 6.5 Turnaround time per leg

Mean and median hours for the approval, seller and carrier legs, split by
`order_type` and by customer state. Report median alongside mean; the gap between
them is itself informative in a long-tailed distribution.

### 6.6 Throughput

Orders delivered per day, overall and filterable by state. Return a date series.

Volume context matters: a dip in adherence during a volume spike is a capacity
story, the same dip on a normal day is a process story.

### 6.7 Review impact

Mean `review_score` for on-time versus late orders, and the score distribution
for each.

This converts an operational metric into a business consequence. "Late orders
score materially worse on customer satisfaction" is the sentence that makes
adherence worth a manager's attention, and it is the strongest single line the
dataset can give you.

---

## 7. RCA layer

`analysis/rca.py`. The centrepiece. Give it the most care and the best
docstrings.

Three-stage narrowing. Each stage takes the pool of failures and asks "of these,
where is this concentrated?", then passes the answer down.

### Step 0 — Isolate failures

```python
late = df[df["delivered_customer_date"] > df["estimated_delivery_date"]].copy()
```

### Step 1 — Attribute each miss to a leg

Compute a baseline per leg from the **on-time** population, using the median so
outliers do not pollute it. **Baselines are computed per (leg, order_type)**,
because an intrastate carrier leg and an interstate one are different operations
and pooling them makes every intrastate order look fast.

```python
baseline = (
    on_time.groupby("order_type")[[f"{leg}_hrs" for leg in LEGS]].median()
)

for leg in LEGS:
    late[f"{leg}_excess"] = (
        late[f"{leg}_hrs"] - late["order_type"].map(baseline[f"{leg}_hrs"])
    )

late["bottleneck_leg"] = late[[f"{leg}_excess" for leg in LEGS]].idxmax(axis=1)
```

Report the breakdown overall and split by order type.

**Why excess over baseline and not raw duration.** The carrier leg is naturally
the longest by a wide margin, so blaming the longest leg would blame the carrier
on virtually every order regardless of what actually went wrong, and the seller
leg would never surface. Measuring deviation from each leg's own normal separates
"slow by nature" from "slow on this order". This is the one real methodological
decision in the project and the most likely thing to be probed in an interview.

### Step 2 — Narrow to where

Group the dominant-leg misses three ways, from coarse to fine:

1. **By region** (states grouped into North, Northeast, Centre-West, Southeast,
   South). The broad gradient.
2. **By `customer_state`.** Report the smallest set accounting for more than half
   the misses.
3. **By lane** (`seller_state` → `customer_state`), above the volume floor.
   Report both the worst-adherence lanes and the highest-absolute-loss lanes.

The lane view is the one that converts a geographic observation into something
addressable. "Adherence is poor in the North" is a map. "These six lanes into the
North carry 4,000 orders at 71% adherence" is a scope for a carrier conversation.

Also run the **seller Pareto** from section 6.3 against this failure pool, so the
RCA output can state what share of misses a small set of sellers accounts for.
Geography and seller are separate concentration axes and a miss can sit on both;
report them side by side rather than nesting one inside the other.

Expect a strong geographic gradient. Whether it is a distance effect, an
infrastructure effect, or a seller-location effect is the question Step 3 opens,
and the three are confounded.

### Step 3 — Candidate drivers

**This step is different from a synthetic-data project and the difference is the
point.** There is no `delay_reason` column, because real operational data almost
never has one. Instead of reading off a labelled cause, test candidate drivers
and report which ones separate late orders from on-time ones:

- **Distance.** Compute haversine distance from seller zip to customer zip using
  the geolocation table. Band it and report adherence per band.
- **Seller.** Rank sellers by seller-leg TAT and by handover breach rate.
  Identify the small set with materially worse performance and the share of total
  misses they account for.
- **Product category and weight.** Bulky items may route differently.
- **Freight value.** A proxy for route cost and difficulty.
- **Month and day of week.** Seasonality and weekend effects.

For each driver report the effect size in plain terms, for example adherence in
the top distance band versus the bottom, rather than only a p-value.

**Then state the causal limit explicitly**, in the code docstring, the README and
out loud in the interview: this is observational data, so these are associations,
not proven causes. Distance and region are confounded with each other. The
correct framing is "here is where the losses concentrate and which factors travel
with them, and here is what I would instrument next to separate them", not "here
is the cause". Volunteering that distinction is a stronger signal than any chart
in the project.

### Output contract

```python
{
  "late_count": int,
  "late_rate": float,
  "overall": {
      "leg_breakdown": {...},
      "dominant_leg": str,
      "geo_concentration": {...},
      "concentrated_states": [...],
      "worst_lanes_by_adherence": [...],
      "worst_lanes_by_absolute_loss": [...],
      "seller_pareto": {"sellers_to_half": int, "sellers_to_eighty": int,
                        "top_decile_share": float, "top_sellers": [...]},
      "drivers": {"distance": {...}, "seller": {...}, "category": {...}, ...},
  },
  "by_order_type": {"interstate": {...}, "intrastate": {...}},
  "headline": str,
  "segment_note": str,
  "causal_caveat": str,
}
```

`headline`, `segment_note` and every number inside them are generated from
computed values, never hardcoded. If the cleaning rules change, the headline
changes with them.

---

## 8. API

FastAPI, read-only, JSON. Load the cleaned parquet into a DataFrame once at
startup. No database.

| Endpoint | Returns |
|---|---|
| `GET /api/kpis` | Overall KPI summary including promise slack and review impact |
| `GET /api/kpis/by-geo` | KPIs grouped by state |
| `GET /api/throughput` | Daily series, optional `?state=` |
| `GET /api/rca` | The full RCA contract above |
| `GET /api/sellers` | Seller-level TAT, handover breach rate, and the Pareto summary |
| `GET /api/lanes` | Lane table: volume, adherence, carrier TAT, distance, freight; sortable, volume floor applied |
| `GET /api/orders` | Filterable rows: `?state=`, `?late=`, `?category=`, `?order_type=`, paginated |
| `GET /api/meta` | Cleaning report, row counts, date range, data source attribution |

Endpoints are thin. Nothing in `api/` computes a metric.

`/api/meta` is not filler. It is how the dashboard displays what was excluded and
why, which is what makes the numbers above it trustworthy.

---

## 9. Frontend

Single page, React. Eight blocks, in this vertical order:

1. **KPI header row.** SLA adherence, median promise slack, late order count,
   average total TAT. Adherence shows the overall figure with intrastate and
   interstate beneath it.
2. **Order type toggle.** All / Interstate / Intrastate, controlling blocks 3 to
   8. Not decorative: switching it is how a viewer sees the two segments fail
   differently.
3. **RCA panel.** The centrepiece. Print the generated `headline` and
   `segment_note` prominently, then leg attribution as a horizontal bar
   (approval, seller, carrier), then the concentrated states, then the driver
   comparisons. Print the `causal_caveat` in the panel itself, not buried in a
   footnote.
4. **Lane table.** Origin state to destination state, with volume, adherence,
   median carrier TAT and median distance. Sortable, defaulting to worst
   adherence above the volume floor, with a toggle to sort by absolute late-order
   count instead. Show the volume floor on the panel so nobody wonders why small
   lanes are missing.
5. **Seller Pareto.** A cumulative curve or a single stated figure: how few
   sellers account for half the handover breaches. One number, prominently
   placed, beats a long seller table.
6. **Review impact.** Mean review score for on-time versus late orders, and
   score against days-late if the curve is legible. One chart, high value.
7. **Throughput chart.** Daily series with a state filter.
8. **Order table.** Filterable, paginated. Functional, not decorative.

Blocks 4 and 5 sit directly beneath the RCA panel rather than at the bottom of
the page, because they are what turn its findings into something someone can act
on: a set of lanes to renegotiate and a set of sellers to call.

Charts via Recharts. Legibility and consistent spacing only; no design time
beyond that. If time runs short, cut in this order: order table, throughput
chart, lane table. The RCA panel, the toggle, the seller Pareto and the causal
caveat are never cut.

Footer: data source attribution to the Olist Kaggle dataset, plus the date range
and cleaned row count. Attribution is not optional when the data is someone
else's.

---

## 10. Repository layout

```
flowmetrics/
├── README.md
├── CLAUDE.md
├── PLAN.md
├── requirements.txt
├── config.py               # paths, date window, state-to-region map, distance bands,
│                           # lane volume floor, min orders per seller for ranking
├── data/
│   ├── raw/                # Olist CSVs, gitignored
│   ├── clean.py            # join, derive, clean; writes parquet + cleaning report
│   └── orders_clean.parquet
├── analysis/
│   ├── loader.py           # parquet -> DataFrame, derived legs and flags
│   ├── kpis.py             # pure KPI functions
│   ├── rca.py              # the three-stage narrowing
│   ├── lanes.py            # origin-destination aggregation and ranking
│   └── geo.py              # zip -> lat/lng, haversine, distance bands
├── api/
│   └── main.py             # FastAPI app, thin endpoints
├── tests/
│   ├── test_clean.py       # cleaning invariants
│   └── test_rca.py         # analysis invariants
└── frontend/
    └── src/
```

Gitignore the raw CSVs (Kaggle licensing, and they are large). Commit the cleaned
parquet if it fits, so a reviewer can run the app without a Kaggle account.
Document the download step either way.

---

## 11. Three-day schedule

**Day 1 — Acquire, clean, explore.**
Download the dataset. Write `config.py` and `data/clean.py`: join the tables,
derive the three legs, both SLA flags, order type, and the distance column.
Apply every cleaning rule in section 5, recording counts. Then spend real time in
a notebook actually looking at the data: distributions per leg, adherence by
state, the promise slack distribution. Do not write a single line of the API
until you can state, in one sentence, what this data says. Expect surprises;
that is the point of using real data.

**Day 2 — KPI and RCA layers.**
`analysis/kpis.py`, then `analysis/lanes.py`, then `analysis/rca.py`. The
three-stage narrowing, the lane and seller concentration views, the driver
comparisons, the generated headline. Write both test files. Then the FastAPI
endpoints, which are mechanical once the analysis returns clean structures.

**Day 3 — Frontend and packaging.**
Dashboard in priority order (KPI cards, toggle, RCA panel, review impact,
throughput, table). Then the README, screenshots, and a tidy pass over commits.

**If you fall behind**, cut in this order: order table, throughput chart, geo
endpoint, frontend polish. Never cut the RCA, the tests, the cleaning report or
the README.

---

## 12. README requirements

Written last, after the numbers are final, for someone who will not open the
code.

1. **One-paragraph problem statement.** The operational question this answers.
2. **Data source and attribution.** Olist, Kaggle, 100k orders, 2016 to 2018,
   real and anonymised. Link it.
3. **Screenshot** of the dashboard.
4. **Key findings**, quoted from the generated headline. Include the promise
   slack finding, the seller concentration figure and the review impact finding,
   not just the leg breakdown. State the volume floors used for any ranking.
5. **Method**, in five or six sentences: cleaning rules and what they excluded,
   the three-stage narrowing, and why attribution uses excess over baseline.
6. **The causal caveat**, in its own short paragraph, not a footnote.
7. **Stack and run instructions**, verified from a clean clone.
8. **Limitations**, per 12.1.

### 12.1 Limitations to state explicitly

Write these in your own words, before anyone asks.

**The carrier leg is composite.** Olist exposes no intermediate scans, so line
haul, sortation and last mile are collapsed into one measurement. A delay in each
has a different owner, and this data cannot tell them apart.

**Associations, not causes.** Observational data with confounded predictors.
Distance, region and seller location travel together.

**Brazilian, not Indian.** The marketplace structure and the regional delivery
gradient transfer; RTO from cash on delivery, festive-peak surges and quick
commerce do not appear at all.

**2016 to 2018.** Pre-pandemic, and e-commerce logistics changed substantially
after it.

**Excluded rows.** State the counts: non-delivered statuses, null timestamps,
negative durations, multi-seller orders. Roughly what share of the raw data
survived to analysis.

**No workforce or facility dimension.** Nothing about staffing, shift patterns or
facility capacity, which drive real throughput.

**Delivery attempts and returns are invisible.** A single delivery timestamp; no
attempt count, no RTO.

---

## 13. Definition of done

- [ ] `data/clean.py` runs from raw CSVs and produces the parquet reproducibly
- [ ] Cleaning report records a count for every exclusion rule
- [ ] No negative leg duration survives into the analysis table
- [ ] Adherence is reported with its order-type split everywhere it appears
- [ ] `run_rca()` produces a generated headline, not a hardcoded string
- [ ] The causal caveat appears in the RCA panel, not only the README
- [ ] Lane and seller rankings apply their minimum-volume floors, and the floors
      are displayed wherever a ranking is shown
- [ ] Lane table can be sorted by worst adherence and by absolute late count
- [ ] Both test files pass
- [ ] Every endpoint returns valid JSON from a cold start
- [ ] Dashboard renders the headline above the fold
- [ ] Order type toggle switches the RCA panel and shows divergent findings
- [ ] Footer carries data source attribution
- [ ] Clean clone to running app works from the README alone
- [ ] Commit history shows incremental work, not one bulk commit

---

## 14. Interview preparation

Be able to answer all of these without notes.

**Why these KPIs?**
SLA adherence is the promise-keeping number a target is set against. Per-leg TAT
localises slowness to a stage so it has an owner. Promise slack separates being
fast from having promised slowly. Throughput gives volume context. Review score
turns all of it into a business consequence.

**How does the root cause analysis work?**
Three-stage narrowing: attribute each miss to the leg with the largest excess
over its own baseline, find where those misses concentrate geographically, then
test candidate drivers to see which ones separate late orders from on-time ones.

**Why attribute by excess over baseline rather than the longest leg?**
The carrier leg is naturally the longest, so raw duration would blame it on
almost every order and the seller leg would never surface. Deviation from each
leg's own normal distinguishes an anomaly from something simply slow by design.

**Why lanes rather than just states?**
Because a lane is what someone actually manages. Capacity, carrier contracts and
routing are decided per origin-destination pair, not per destination state.
"Adherence is poor in the North" is a map; "these six lanes into the North carry
4,000 orders at 71% adherence" is a scope for a carrier conversation. I rank
lanes two ways, worst adherence and largest absolute late count, because those
are different questions: a small lane at 40% is a quality problem, a large lane
at 88% may be losing more customers in total.

**Why a Pareto on sellers rather than a ranked table?**
A table says some sellers are slow. A Pareto says how few of them account for
half the failures, which turns it into a scoped action. It also demonstrates
something a floor manager cannot fix: if a small set of sellers drives a large
share of handover breaches, the lever is seller management, not process
improvement. I apply a minimum order count before ranking, otherwise a seller
with three orders and three breaches tops the list at 100% and means nothing.

**Why real data instead of generating your own?**
Because generated data only contains the patterns you put in it, so the analysis
can only rediscover your own assumptions. Real data pushes back. The promise
slack finding is one I did not expect going in, and it changed what I thought the
main problem was.

**This is Brazilian data. Does it apply to India?**
The structure transfers: a marketplace model with third-party sellers, a
platform-operated logistics layer, and a large geography with wide regional
infrastructure variation. Brazil's north-south delivery gradient is a reasonable
analogue for the metro versus tier-2 gradient here. What does not transfer is
RTO from cash on delivery, festive-peak volume, and quick commerce, none of which
appear in this data. No Indian dataset is public at this granularity.

**Can you prove distance causes the delays?**
No, and I would not claim it. This is observational data and the predictors are
confounded: distance, region and seller location all move together. What I can
say is where losses concentrate and which factors travel with them. Separating
them would need either instrumentation at the hub level or a comparison holding
route fixed.

**What did you exclude, and why?**
Non-delivered orders, rows with null or negative durations, and multi-seller
orders where handover time cannot be attributed to one seller. Every rule is
recorded with a count and surfaced in the app, because an exclusion nobody can
see is a hole in the analysis.

**What would you do with these findings if you owned the operation?**
Recalibrate the delivery estimate first, since the slack is large and it is a
pricing decision rather than an operational one. In parallel, work the small set
of sellers driving handover breaches, because that is upstream of the operation
entirely and cannot be fixed on the floor. Then instrument the carrier leg with
intermediate scans, because right now the largest leg is a black box and nothing
inside it can be managed.

**Where does this map onto DMAIC?**
Define: orders missing their promised date. Measure: adherence, per-leg TAT,
promise slack, review impact. Analyse: the three-stage narrowing and driver
comparison. Improve: recalibrate the estimate, manage the slow sellers.
Control: the dashboard as the standing metric.

**What is the weakest part of this project?**
The carrier leg is a black box, so the largest source of delay is the one I can
say least about. The analysis is associational. And it is 2016 to 2018 foreign
data, so nothing here is a claim about any operation running today.