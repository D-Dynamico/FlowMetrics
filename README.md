# FlowMetrics

**Which stage of a delivery loses the promised date, where those losses
concentrate, and what travels with them.**

An operations dashboard over 93,585 real Brazilian marketplace orders. It splits
each delivery into its three recorded stages, attributes every late order to the
stage that ran furthest over its own normal time, then narrows from stage to
geography to candidate drivers. The question it answers is the one a delivery
manager actually has: *deliveries are missing their dates — which part of the
journey do I fix, and is it even mine to fix?*

---

## Data

**[Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)**,
published on Kaggle by Olist Store under CC BY-NC-SA 4.0. Roughly 100,000 real,
anonymised orders placed between 2016 and 2018 across Brazilian marketplaces.

It was chosen because it records two things most datasets only imply:

- **A promised delivery date** shown to the customer at purchase, so on-time
  performance is measured against a real promise rather than an invented
  threshold.
- **A seller handover deadline**, the contractual date by which the seller must
  hand the parcel to the carrier. That gives a second, independent deadline at a
  different level of the operation.

The raw CSVs are not committed — 121 MB, and CC BY-NC-SA is incompatible with
this repository's Apache licence. The cleaned table is committed, so the app runs
without a Kaggle account. See [Running it](#running-it).

---

## Key findings

Every figure below is produced by code in this repository and regenerated on
every run. Nothing is typed into a template.

### 1. The promise is padded by nearly two weeks

**91.7% of orders arrive on time — and the median on-time order arrives 12.3 days
early.** The tenth percentile still arrives 4.9 days early.

That reframes the headline number entirely. This is not a fast operation; it is a
slow promise. The 91.7% is being bought with an estimate so conservative that a
customer told "eighteen days" routinely receives the parcel in six. The first
lever here is repricing the estimate, which is a planning decision, not an
operational one — and it costs nothing on the floor.

### 2. Padding absorbs three quarters of seller failure

**9.1% of sellers miss their handover deadline. 75.2% of those orders still reach
the customer on time.**

The two deadlines are independent, and the gap between them is where the slack
lives. A seller can be late and the customer never know. That is a finding about
how much failure the promise is currently hiding, and it is invisible if you only
track the customer-facing number.

### 3. The stage that fails is not the same for every order

**82% of late orders attribute to the carrier stage overall — but that splits
hard by order type:**

| | On time | Carrier stage | Seller stage | Approval |
|---|---|---|---|---|
| Between states | 90.5% | 89% | 10% | 0.4% |
| Within one state | 93.8% | 61% | **33%** | 6% |

When transit is long, a slow handover disappears into it. When the order stays
inside one state, there is no long transit to absorb anything, so the seller
surfaces as a third of all failures. Same operation, structurally different
failure mode — which is why every number in this project is reported with its
order-type split, and why the dashboard's toggle is not decorative.

### 4. Failure concentrates where volume does not

Raw concentration is close to meaningless here: São Paulo holds 42% of all
orders, so "most late orders are in São Paulo" is true however well it performs.
Comparing each region's share of late orders against its share of all orders:

| Region | Share of late orders ÷ share of all orders |
|---|---|
| Northeast | **2.05×** |
| North | 1.39× |
| Centre-West | 1.06× |
| South | 0.93× |
| Southeast | 0.85× |

At state level: Alagoas 3.4×, Maranhão 2.8×, Ceará 2.3×. The Northeast absorbs
twice the failure its volume explains.

### 5. Late orders cost 1.75 review points

**Mean review score falls from 4.32 to 2.56 when an order misses its date.** This
is what makes the operational number a business number.

### 6. 72 sellers hold half the late orders

Of 777 sellers with at least 20 orders, **72 account for half of all late
orders**; the worst 10% account for 49.7%. That is a scoped management action, not
a floor-process problem — and it is the clearest evidence in the project that some
failure sits upstream of the operation entirely.

---

## Method

**Three stages, from five timestamps.** Approval (`purchase → approved`), seller
handover (`approved → given to carrier`), carrier transit (`carrier → customer`).

**Attribution is by excess over baseline, not by longest stage.** For each late
order, every stage is compared against its own median duration among on-time
orders, and the order is blamed on whichever stage ran furthest over. The carrier
stage takes a median of 208 hours between states against 43 for the seller stage,
so blaming the longest stage would blame the carrier on almost every order and
the seller stage would never surface at all. Measuring deviation from each
stage's own normal separates *slow by nature* from *slow on this order*.

**Baselines are computed per stage per order type.** An in-state carrier leg (81 h
median) and a between-states one (209 h) are different operations. Pooling them
would make every in-state order look fast, so attribution would track geography
rather than what went wrong.

**Baselines come from on-time orders only.** Including the failures would let the
outliers pollute the very normal they are being measured against.

**Then two narrowings.** Where the misses concentrate, measured as share of late
orders against share of all orders. Then which observable factors separate late
orders from on-time ones — distance, seller, product category, freight value,
month, weekday.

**Rankings carry volume floors**, stated wherever a ranking appears: 30 orders for
a route, 20 for a seller, 200 for a product category. Without them a route with
three orders and two failures tops every list.

---

## These are associations, not causes

The data is observational and the predictors are confounded. Distance, customer
region and seller location all move together, because sellers concentrate in the
Southeast and the longest routes are the ones running out of it. Distance shows a
real gradient — 93.4% on time under 100 km against 86.7% beyond 1,500 km — but
nothing here can separate a distance effect from an infrastructure effect from a
seller-location effect.

What this analysis can say is where the losses concentrate and which factors
travel with them. It cannot say which one is responsible. Separating them would
need hub-level instrumentation or a comparison holding the route fixed. The
caveat is rendered inside the dashboard's analysis panel, not buried here.

---

## What was excluded

94.1% of raw orders survive to analysis. Every rule records a count, the counts
are served by `/api/meta`, and the dashboard displays them.

| Rule | Orders removed | Why |
|---|---|---|
| Not delivered | 2,963 | No delivery timestamp exists, so no deadline can be assessed |
| Multi-seller orders | 1,272 | One handover timestamp cannot be attributed to several sellers |
| Negative durations | 1,317 | Carrier date before approval, or delivery before handover: recording errors |
| Outside 2017-01 to 2018-08 | 267 | 2016 is sparse enough to make early volume look like a collapse |
| Missing a timestamp | 23 | A missing timestamp means an unknown stage, not a zero-length one |
| Over 180 days total | 14 | Physically impossible; nothing else is trimmed from the tail |
| **Remaining** | **93,585 of 99,441** | |

Negative durations are dropped rather than clamped to zero. A zero-length stage
would read as the fastest part of the network and quietly win every baseline
comparison. A further 470 orders have no distance because one end's postcode is
absent from the geolocation table; they are counted but kept, since distance is a
driver rather than a requirement.

---

## Running it

Requires Python 3.12+ and Node 20+.

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python -m uvicorn api.main:app --port 8000
```

Open <http://127.0.0.1:8000>. One process serves the dashboard and the API.

The cleaned table (`data/orders_clean.parquet`) is committed, so this works from
a fresh clone with no Kaggle account.

```bash
python -m pytest tests/
```

27 tests pass on a fresh clone. The 28th rebuilds the cleaned table from the raw
CSVs and reconciles the exclusion counts against it, so it skips unless those
files are present.

**To rebuild the data from source**, download the nine CSVs from the
[Kaggle dataset](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
into `data/raw/`, then:

```bash
python -m data.clean     # rewrites the parquet and the cleaning report
python -m pytest tests/  # all 28 now run
```

**For frontend development**, `npm run dev` in `frontend/` gives hot reload on
port 5173 and proxies `/api` to uvicorn.

---

## Layout

```
config.py            every rule that shapes the population: cleaning, regions,
                     distance bands, ranking floors
data/clean.py        joins seven Olist tables, derives the stages and both
                     deadlines, applies each rule and counts what it removed
analysis/loader.py   loads the cleaned table and asserts its invariants
analysis/kpis.py     on-time rate, promise slack, seller deadlines, throughput,
                     review impact
analysis/lanes.py    origin-destination routes and the two rankings
analysis/rca.py      the narrowing, the drivers, the generated headline
api/main.py          eight read-only JSON endpoints; computes nothing
frontend/src/        the dashboard
tests/               cleaning invariants and analysis invariants
```

Metrics are defined once, in `analysis/`. Nothing in `api/` or the frontend
calculates a number — a metric computed in two places will eventually give two
answers.

---

## Limitations

**The carrier stage is a black box.** Olist records no intermediate scans, so
line haul, sortation and last-mile delivery are one measurement. The largest
source of delay is the one this data can say least about, and a delay in each of
those has a different owner.

**Associations, not causes.** See above. The predictors are confounded.

**One dominant cause per late order.** Attribution names a single stage, when in
reality delays compound across several.

**Brazilian, not Indian.** The structure transfers — a marketplace model with
third-party sellers, a platform-operated logistics layer, and a large geography
with wide regional infrastructure variation. Brazil's north-south delivery
gradient is a reasonable analogue for a metro versus tier-2 gradient. What does
not transfer: returns from failed cash-on-delivery attempts, festive-peak volume
surges, and quick commerce. None appear in this data. No Indian dataset is public
at this granularity.

**2016 to 2018.** Pre-pandemic, and e-commerce logistics changed substantially
after it.

**Seller findings cover a subset.** Multi-seller orders are excluded, so the
seller conclusions apply to single-seller orders only.

**No delivery attempts, no returns.** One delivery timestamp per order, no
attempt count, no return-to-origin flow.

**No workforce or facility dimension.** Nothing about staffing, shift patterns or
facility capacity, which drive real throughput more than most process variables.

**Straight-line distance.** Computed between postcode centroids, so it understates
every route by a variable factor. Adequate as a monotonic proxy for testing
whether delay travels with distance; not a routing figure.

---

## What I would do next

**Recalibrate the delivery estimate first.** The slack is 12 days at the median.
That is a pricing decision, it needs no operational change, and it is the largest
single gap between what this operation does and what it tells customers.

**Work the 72 sellers.** Half the late orders sit with 9% of sellers. That is
upstream of the operation and cannot be fixed on the floor.

**Instrument the carrier stage.** Right now the largest source of delay is a
single measurement with no owner. Splitting it into transit, sortation and last
mile is what would turn the biggest finding in this project into something
actionable.

Route and hub optimisation are the natural structural lever after that. They are
scoped here, not built, and appear in no part of this repository as though they
exist.

---

Data © Olist, published on Kaggle under CC BY-NC-SA 4.0. Code in this repository
is Apache 2.0.
