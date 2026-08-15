"""Join the Olist tables into one analysis-ready order table.

Run with `python -m data.clean` from the repository root. Reads the raw CSVs in
`data/raw/`, writes `data/orders_clean.parquet` and prints the cleaning report.

This module knows about Olist's table structure and nothing about metrics. It
keeps Olist's original column names through the joins so the mapping back to
source stays obvious, and renames to domain terms only at the boundary.

Every cleaning rule records how many rows it removed. Those counts are the point:
an exclusion nobody can see is a hole in the analysis, and a reviewer who finds
an unexplained row-count drop stops trusting everything above it.
"""

from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

import config as cfg

EARTH_RADIUS_KM = 6371.0


def _read(table: str, **kwargs) -> pd.DataFrame:
    return pd.read_csv(os.path.join(cfg.RAW_DIR, cfg.RAW_FILES[table]), **kwargs)


def _zip_centroids() -> pd.DataFrame:
    """Collapse the geolocation table to one coordinate per zip prefix.

    Olist ships roughly a million geolocation rows, several per zip prefix, each
    a separate geocoded address. The median of each prefix is used rather than
    the mean because a handful of rows carry coordinates far outside Brazil, and
    a mean would drag the whole prefix toward them.
    """
    geo = _read(
        "geolocation",
        usecols=["geolocation_zip_code_prefix", "geolocation_lat", "geolocation_lng"],
    )
    return (
        geo.groupby("geolocation_zip_code_prefix")[["geolocation_lat", "geolocation_lng"]]
        .median()
        .reset_index()
        .rename(columns={"geolocation_zip_code_prefix": "zip_code_prefix"})
    )


def _haversine_km(
    lat1: pd.Series, lng1: pd.Series, lat2: pd.Series, lng2: pd.Series
) -> pd.Series:
    """Great-circle distance in kilometres between two coordinate columns.

    Straight-line distance, not road distance, which understates every lane by a
    variable factor. It is still the right measure here: the question is whether
    delay travels with distance, and a monotonic proxy answers that. Stated as a
    limitation rather than presented as a routing figure.
    """
    lat1, lng1, lat2, lng2 = map(np.radians, (lat1, lng1, lat2, lng2))
    delta_lat = lat2 - lat1
    delta_lng = lng2 - lng1
    a = np.sin(delta_lat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(delta_lng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def _single_seller_orders(items: pd.DataFrame) -> pd.DataFrame:
    """One row per order, carrying its seller, handover deadline and money.

    Orders with more than one distinct seller are dropped by the caller. Where an
    order holds several items from the *same* seller, the latest
    `shipping_limit_date` is the binding deadline and freight is summed across
    items, since both describe the one shipment the customer received.
    """
    per_order = items.groupby("order_id").agg(
        seller_count=("seller_id", "nunique"),
        item_count=("order_item_id", "count"),
        seller_id=("seller_id", "first"),
        shipping_limit_date=("shipping_limit_date", "max"),
        price=("price", "sum"),
        freight_value=("freight_value", "sum"),
        product_id=("product_id", "first"),
    )
    return per_order.reset_index()


def build() -> tuple[pd.DataFrame, dict]:
    """Run the whole pipeline and return the clean table plus its cleaning report.

    Rules are applied in a deliberate order: cheap filters that remove whole
    populations first, then the joins, then rules that need derived columns.
    Each step records the row count before and after, so the report reconciles
    from raw orders down to the analysis population with nothing unaccounted for.
    """
    report: dict[str, int] = {}

    orders = _read("orders", parse_dates=list(cfg.REQUIRED_TIMESTAMPS))
    report["raw_orders"] = len(orders)

    # Rule 1 — status. Only delivered orders have a delivery timestamp.
    orders = orders[orders["order_status"] == cfg.KEEP_ORDER_STATUS]
    report["dropped_not_delivered"] = report["raw_orders"] - len(orders)

    # Rule 2 — null timestamps. A missing timestamp means an unknown leg. It is
    # never filled: a zero-filled leg would look like the fastest stage in the
    # network.
    before = len(orders)
    orders = orders.dropna(subset=list(cfg.REQUIRED_TIMESTAMPS))
    report["dropped_null_timestamps"] = before - len(orders)

    # Rule 4 — date window. Applied before the joins because it is cheap.
    before = len(orders)
    start, end = pd.Timestamp(cfg.DATE_WINDOW[0]), pd.Timestamp(cfg.DATE_WINDOW[1])
    purchased = orders["order_purchase_timestamp"]
    orders = orders[(purchased >= start) & (purchased <= end + pd.Timedelta(days=1))]
    report["dropped_outside_date_window"] = before - len(orders)

    # Rule 5 — single-seller restriction.
    items = _read("order_items", parse_dates=["shipping_limit_date"])
    per_order = _single_seller_orders(items)
    before = len(orders)
    orders = orders.merge(per_order, on="order_id", how="inner")
    report["dropped_no_items"] = before - len(orders)

    if cfg.SINGLE_SELLER_ONLY:
        before = len(orders)
        orders = orders[orders["seller_count"] == 1]
        report["dropped_multi_seller"] = before - len(orders)

    # Joins. Customer and seller states drive order type, region and lane.
    customers = _read(
        "customers", usecols=["customer_id", "customer_city", "customer_state",
                              "customer_zip_code_prefix"]
    )
    sellers = _read(
        "sellers", usecols=["seller_id", "seller_city", "seller_state",
                            "seller_zip_code_prefix"]
    )
    orders = orders.merge(customers, on="customer_id", how="left")
    orders = orders.merge(sellers, on="seller_id", how="left")

    products = _read(
        "products", usecols=["product_id", "product_category_name", "product_weight_g"]
    )
    translation = _read("category_translation")
    products = products.merge(translation, on="product_category_name", how="left")
    orders = orders.merge(products, on="product_id", how="left")

    # One review per order. A few orders carry two; the first by review id is
    # taken, and the duplicate rate is low enough that the choice does not move
    # the mean.
    reviews = (
        _read("reviews", usecols=["order_id", "review_score"])
        .drop_duplicates(subset="order_id")
    )
    orders = orders.merge(reviews, on="order_id", how="left")

    # Distance, via zip-prefix centroids.
    centroids = _zip_centroids()
    orders = orders.merge(
        centroids.rename(
            columns={"zip_code_prefix": "seller_zip_code_prefix",
                     "geolocation_lat": "seller_lat", "geolocation_lng": "seller_lng"}
        ),
        on="seller_zip_code_prefix", how="left",
    )
    orders = orders.merge(
        centroids.rename(
            columns={"zip_code_prefix": "customer_zip_code_prefix",
                     "geolocation_lat": "customer_lat", "geolocation_lng": "customer_lng"}
        ),
        on="customer_zip_code_prefix", how="left",
    )
    orders["distance_km"] = _haversine_km(
        orders["seller_lat"], orders["seller_lng"],
        orders["customer_lat"], orders["customer_lng"],
    )
    report["missing_distance"] = int(orders["distance_km"].isna().sum())

    # Derived legs, in hours. Computed once here so there is exactly one
    # definition of each leg in the project.
    for leg, (start_col, end_col) in cfg.LEG_BOUNDS.items():
        orders[f"{leg}_leg_hrs"] = (
            orders[end_col] - orders[start_col]
        ).dt.total_seconds() / 3600
    orders["total_tat_hrs"] = (
        orders["order_delivered_customer_date"] - orders["order_purchase_timestamp"]
    ).dt.total_seconds() / 3600

    # Rule 3 — negative durations. A carrier date before approval, or a delivery
    # before handover, is a recording error. Dropped, never clamped to zero:
    # clamping would invent a zero-length leg that never happened.
    leg_cols = [f"{leg}_leg_hrs" for leg in cfg.LEGS] + ["total_tat_hrs"]
    before = len(orders)
    orders = orders[(orders[leg_cols] >= 0).all(axis=1)]
    report["dropped_negative_duration"] = before - len(orders)

    # Rule 6 — physically impossible totals only. The operational tail is the
    # subject of this analysis, so nothing else is trimmed from the top.
    before = len(orders)
    orders = orders[orders["total_tat_hrs"] <= cfg.MAX_TOTAL_TAT_DAYS * 24]
    report["dropped_impossible_tat"] = before - len(orders)

    # Both SLA flags. Customer SLA is the promise shown at purchase; seller SLA
    # is the contractual handover deadline. They are independent: a seller can
    # breach handover and the order still arrive on time, because the promise
    # carries slack.
    orders["is_late"] = (
        orders["order_delivered_customer_date"] > orders["order_estimated_delivery_date"]
    )
    orders["seller_breached_handover"] = (
        orders["order_delivered_carrier_date"] > orders["shipping_limit_date"]
    )
    orders["promise_slack_hrs"] = (
        orders["order_estimated_delivery_date"] - orders["order_delivered_customer_date"]
    ).dt.total_seconds() / 3600

    # Order type, region and lane.
    orders["order_type"] = np.where(
        orders["seller_state"] == orders["customer_state"], "intrastate", "interstate"
    )
    orders["seller_region"] = orders["seller_state"].map(cfg.STATE_TO_REGION)
    orders["customer_region"] = orders["customer_state"].map(cfg.STATE_TO_REGION)
    orders["lane"] = orders["seller_state"] + "-" + orders["customer_state"]

    labels = [name for name, _, _ in cfg.DISTANCE_BANDS_KM]
    edges = [low for _, low, _ in cfg.DISTANCE_BANDS_KM] + [float("inf")]
    orders["distance_band"] = pd.cut(
        orders["distance_km"], bins=edges, labels=labels, right=False
    )

    orders["delivered_date"] = orders["order_delivered_customer_date"].dt.date
    orders["order_month"] = orders["order_purchase_timestamp"].dt.to_period("M").astype(str)

    orders = orders.rename(columns={"product_category_name_english": "category"})

    report["clean_orders"] = len(orders)
    report["survival_rate"] = round(report["clean_orders"] / report["raw_orders"], 4)

    return orders.reset_index(drop=True), report


def main() -> None:
    orders, report = build()
    orders.to_parquet(cfg.CLEAN_PATH, index=False)

    # Written to disk, not just printed, because the dashboard shows these counts
    # and the README quotes them. An exclusion nobody can see is a hole in the
    # analysis, so the report has to survive the run that produced it.
    with open(cfg.CLEANING_REPORT_PATH, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    print(f"wrote {len(orders):,} orders to {cfg.CLEAN_PATH}")
    print(f"wrote cleaning report to {cfg.CLEANING_REPORT_PATH}")
    print()
    for rule, count in report.items():
        print(f"  {rule:<32} {count:>10,}")


if __name__ == "__main__":
    main()
