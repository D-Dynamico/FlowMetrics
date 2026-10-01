# Code guidelines

How the code is structured, and the rules that keep every number defined once.

## Structure

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

## Configuration

All parameters live in `config.py`: paths, the date window, the state-to-region
map, distance bands, the multi-seller rule. A reviewer must be able to open one
file and see every judgement call that shapes the population.

## Naming

Use the domain's vocabulary, not generic programming words. `seller_leg_hrs`, not
`duration_2`. `sla_adherence_rate`, not `success_pct`. `bottleneck_leg`, not
`max_col`. Keep Olist's original column names in `data/clean.py` so the mapping
back to source is obvious, then rename to domain terms at the boundary.

This matters more than usual. The reader is an operations person. Code using
their words reads as someone who understands the domain.

## Docstrings

Every function in `analysis/` states what it computes and, where there is a
judgement call, why it was made that way. The excess-over-baseline attribution in
`rca.py` gets a full paragraph, and so does the causal-limits note in the driver
analysis. Those docstrings are interview answers written in advance, and writing
them is how you find out whether you actually understand the choice.

## Nulls and missing data

Never `fillna(0)` on a duration. A missing timestamp means the leg is unknown,
not that it took no time, and a zero-filled leg will quietly look like the
best-performing stage in the network. Drop the row, count it, and move on.

Never let a null into a mean without deciding explicitly whether it should be
excluded or whether its absence is itself the finding.

## What not to build

No authentication. No database, ORM or migrations. No Docker. No CI. No caching
layer. No machine learning, including delay prediction. No async anything. No
abstract base classes or plugin systems.

Every one of these is a reasonable engineering instinct and every one will eat a
day you do not have while adding nothing an operations reader can see.
Overengineering is the most likely way this project fails to ship.

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
