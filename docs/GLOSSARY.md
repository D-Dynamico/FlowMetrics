# Glossary

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
