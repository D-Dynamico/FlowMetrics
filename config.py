"""Every parameter that shapes the analysis population, in one file.

A reviewer should be able to open this file alone and see every judgement call:
which orders survive cleaning, where the date window starts, what counts as a
long lane, and what volume floors guard the rankings. Scattering these through
the pipeline hides decisions that ought to be defended out loud.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

RAW_DIR = "data/raw"
CLEAN_PATH = "data/orders_clean.parquet"

RAW_FILES = {
    "orders": "olist_orders_dataset.csv",
    "order_items": "olist_order_items_dataset.csv",
    "customers": "olist_customers_dataset.csv",
    "sellers": "olist_sellers_dataset.csv",
    "products": "olist_products_dataset.csv",
    "reviews": "olist_order_reviews_dataset.csv",
    "geolocation": "olist_geolocation_dataset.csv",
    "category_translation": "product_category_name_translation.csv",
}

# ---------------------------------------------------------------------------
# Population rules
# ---------------------------------------------------------------------------

# Only delivered orders carry a delivery timestamp, so nothing else can be
# assessed against an SLA at all.
KEEP_ORDER_STATUS = "delivered"

# 2016 holds a few hundred orders against tens of thousands per month later, so
# including it makes early monthly series look like a collapse in volume rather
# than the ramp-up of a young marketplace.
DATE_WINDOW = ("2017-01-01", "2018-08-31")

# An order can hold items from several sellers, which makes "the seller leg"
# ambiguous: one handover timestamp cannot be attributed to three sellers. The
# analysis is restricted to single-seller orders and the exclusion is counted.
SINGLE_SELLER_ONLY = True

# Physically impossible values only. The operational tail is the subject of this
# analysis, not noise to be trimmed, so nothing else is cut from the top of the
# distribution. A delivery 180 days after purchase is a data error, not a slow
# delivery.
MAX_TOTAL_TAT_DAYS = 180

# ---------------------------------------------------------------------------
# Legs
# ---------------------------------------------------------------------------

# Three observable legs, in journey order. The carrier leg is composite: Olist
# records no intermediate scans, so line haul, sortation and last mile are one
# measurement. Say so wherever it is interpreted.
LEGS = ("approval", "seller", "carrier")

LEG_BOUNDS = {
    "approval": ("order_purchase_timestamp", "order_approved_at"),
    "seller": ("order_approved_at", "order_delivered_carrier_date"),
    "carrier": ("order_delivered_carrier_date", "order_delivered_customer_date"),
}

# Timestamps that must be present for a row to be usable. A missing one means a
# leg is unknown, not that it took no time, so the row is dropped and counted.
REQUIRED_TIMESTAMPS = (
    "order_purchase_timestamp",
    "order_approved_at",
    "order_delivered_carrier_date",
    "order_delivered_customer_date",
    "order_estimated_delivery_date",
)

# ---------------------------------------------------------------------------
# Geography
# ---------------------------------------------------------------------------

# Brazil's five official regions. The north-south infrastructure gradient is the
# broadest cut this data supports, and it is the first place delivery
# performance separates.
STATE_TO_REGION = {
    # North
    "AC": "North", "AP": "North", "AM": "North", "PA": "North",
    "RO": "North", "RR": "North", "TO": "North",
    # Northeast
    "AL": "Northeast", "BA": "Northeast", "CE": "Northeast", "MA": "Northeast",
    "PB": "Northeast", "PE": "Northeast", "PI": "Northeast",
    "RN": "Northeast", "SE": "Northeast",
    # Centre-West
    "DF": "Centre-West", "GO": "Centre-West",
    "MT": "Centre-West", "MS": "Centre-West",
    # Southeast
    "ES": "Southeast", "MG": "Southeast", "RJ": "Southeast", "SP": "Southeast",
    # South
    "PR": "South", "RS": "South", "SC": "South",
}

# Kilometres. Bands rather than a raw distance because adherence per band is
# readable in a sentence, where a scatter plot of 90,000 points is not.
DISTANCE_BANDS_KM = (
    ("0-100", 0, 100),
    ("100-300", 100, 300),
    ("300-700", 300, 700),
    ("700-1500", 700, 1500),
    ("1500+", 1500, float("inf")),
)

# ---------------------------------------------------------------------------
# Ranking guards
# ---------------------------------------------------------------------------

# Without a floor, a "worst adherence" ranking fills with lanes and sellers that
# have three orders and one miss. Both floors are stated wherever a ranking is
# displayed, so nobody wonders why a lane they expected is absent.
MIN_ORDERS_PER_LANE = 30
MIN_ORDERS_PER_SELLER = 20

# Categories need a higher floor than lanes. Olist has 71 categories with a very
# long tail, and at a floor of 30 the best and worst category in the network are
# both decided by fewer than fifty orders, which is noise presented as a finding.
MIN_ORDERS_PER_CATEGORY = 200

# Share of misses a Pareto cut reports against.
PARETO_THRESHOLDS = (0.5, 0.8)

# ---------------------------------------------------------------------------
# Attribution
# ---------------------------------------------------------------------------

# Data source, for the README and the dashboard footer. Attribution is not
# optional when the data is someone else's.
DATA_SOURCE = {
    "name": "Brazilian E-Commerce Public Dataset by Olist",
    "publisher": "Olist Store, via Kaggle",
    "url": "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce",
    "licence": "CC BY-NC-SA 4.0",
}
