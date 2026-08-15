# SESSION.md — Build log

What was built and what was decided, recorded as it happens. Nothing here is a
plan. `PLAN.md` says what to build, `CLAUDE.md` says how; this file says what
actually got written and why it was written that way.

Every entry is a headline followed by four or five lines at most.

---

## 2026-08-15

### Dropped the synthetic dataset for real Olist data

`config.py`, `data/generate.py` and `data/shipments.csv` are deleted. The
synthetic build worked — 6,000 rows, 0.870 adherence, every planted pattern
recoverable — but generated data only contains the patterns you put in it, so the
analysis could only ever rediscover its own assumptions. Olist gives roughly
100,000 real orders with two recorded SLAs, and it pushes back.

### Zip prefixes collapsed by median, not mean

`_zip_centroids()` reduces Olist's million geolocation rows to one coordinate per
zip prefix using the median. A handful of rows carry coordinates far outside
Brazil, and a mean would drag the whole prefix toward them. 470 orders still end
up without a distance because one side's prefix is absent from the table; they
are counted in the report rather than dropped, since distance is a driver rather
than a requirement.

### Negative durations dropped, never clamped

1,317 orders have a carrier date before approval or a delivery before handover.
Clamping to zero would invent a zero-length leg that never happened, and a
zero-filled leg reads as the fastest stage in the network. They are dropped and
counted. This is the largest single exclusion after multi-seller orders.

### Only physically impossible TAT is trimmed

The 180-day cap removed 14 orders. Nothing else is cut from the top of the
distribution: in an operations context the tail is the subject, not noise, and
trimming it would delete exactly the failures the RCA exists to explain.

### Cleaning survives 94.1% of raw orders

93,585 of 99,441, and the report reconciles with nothing unaccounted for:
2,963 not delivered, 23 null timestamps, 267 outside the date window, 1,272
multi-seller, 1,317 negative durations, 14 impossible TAT. Window runs
2017-01-05 to 2018-08-29.

### First look: the promise is the story, not the execution

Adherence is 0.917, but the median on-time order arrives **12.3 days early**, and
the tenth percentile still arrives 4.9 days early. Of the 9.1% of orders where
the seller breached handover, three quarters still reached the customer on time —
the padding absorbs upstream failure entirely. Late orders score 2.56 on reviews
against 4.32 for on-time, a 1.75-point drop.

### Approval leg is negligible and will rarely be a bottleneck

Median approval leg is 0.3 h against 44 h seller and 222 h carrier (interstate).
Worth keeping in the model because a small number of orders sit in approval for
days and lose the promise before the operation touches them, but the leg
breakdown will be a seller-versus-carrier story in practice.

### No separate `analysis/geo.py`

`PLAN.md` §10 lists one, but distance is computed once in `data/clean.py` and
stored on the row, so a runtime geo module would have nothing left to do. The
haversine helper and the zip centroids live with the join that needs them. A
module that exists only to match a layout diagram is dead code.

### Loader asserts rather than repairs

`load_orders()` raises on nulls, negative durations or duplicate order ids
instead of fixing them. A loader that quietly patches its input hides the
pipeline regression it should be surfacing, and the repair then sits outside the
cleaning report where nobody can count it.

### Promise slack is measured on on-time orders only

For a late order the same subtraction measures failure, not padding, and mixing
the two gives a number that means neither. Median slack is 12.27 days across
85,829 on-time orders, with the tenth percentile still at 4.93 days. The padding
is systematic, not a tail effect.

### Lanes ranked two ways, both reported

Worst adherence and largest absolute late count answer different questions and
the data proves it: PR-AL runs 33 orders at 0.61 adherence, while SP-RJ runs
7,937 orders at 0.84 and loses 1,253 of them. Showing only the first makes the
network look like small disasters; only the second makes it look uniformly fine.

### Seller concentration is real: 72 sellers hold half the misses

Of 777 sellers clearing the 20-order floor, 72 account for half of all late
orders and the top decile accounts for 49.7%. That is a scoped management action
rather than a floor process problem. The floor matters — without it the ranking
fills with three-order sellers at a 100% miss rate.

### Raw CSVs are gitignored, cleaned parquet is committed

`data/raw/` is ignored for Kaggle licensing and size; `data/orders_clean.parquet`
is the committed artefact so a reviewer can run the app without a Kaggle account.
`data/clean.py` stays reproducible from the raw CSVs either way, and the README
documents the download step.
