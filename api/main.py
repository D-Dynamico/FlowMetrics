"""Read-only JSON API over the analysis.

Run with `uvicorn api.main:app --reload` from the repository root.

Endpoints are thin: each one calls an analysis function and serialises the
result. **Nothing here computes a metric.** If a number needed by the dashboard
does not exist yet, it gets added to `analysis/`, not to a route handler — a
metric calculated in two places will eventually disagree with itself.

The cleaned table is loaded into memory once at startup and shared by every
request. It is 93,585 rows and never changes during a run, so there is no
database and no cache to invalidate.
"""

from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import config as cfg
from analysis import kpis, lanes
from analysis.loader import load_orders, order_type_split
from analysis.rca import run_rca

app = FastAPI(
    title="FlowMetrics",
    description="Delivery KPIs and root cause analysis over the Olist dataset.",
    version="1.0.0",
)

# The dashboard runs on a different port in development. Read-only public data,
# so there is nothing here worth protecting with a narrower policy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

ORDERS = load_orders()

# Loading the table costs about half a second; each RCA run costs about two.
# Running all three order-type scopes at import would roughly triple startup for
# results a given session may never ask for, so each scope is computed on its
# first request and kept. The table never changes during a run, which is what
# makes holding the result safe rather than a stale cache.
_RCA_CACHE: dict[str | None, dict] = {}


def _rca_for(order_type: str | None) -> dict:
    if order_type not in _RCA_CACHE:
        _RCA_CACHE[order_type] = run_rca(order_type_split(ORDERS, order_type))
    return _RCA_CACHE[order_type]


def _json_safe(value):
    """Convert numpy and pandas scalars into things `json` can serialise.

    Pandas hands back `numpy.int64` and `numpy.bool_` from aggregations, and
    FastAPI's default encoder rejects both. Converting at the boundary keeps the
    analysis layer free of serialisation concerns.
    """
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return None if np.isnan(value) else float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if value is pd.NaT or (isinstance(value, float) and np.isnan(value)):
        return None
    return value


def _scoped(order_type: str | None) -> pd.DataFrame:
    """Apply the dashboard's order type toggle, rejecting unknown values."""
    if order_type in (None, "", "all"):
        return ORDERS
    if order_type not in ("interstate", "intrastate"):
        raise HTTPException(
            status_code=400,
            detail="order_type must be 'interstate', 'intrastate' or 'all'",
        )
    return ORDERS[ORDERS["order_type"] == order_type]


@app.get("/api/kpis")
def get_kpis(order_type: str | None = Query(None)) -> dict:
    """Headline KPIs, including promise slack, seller SLA and review impact."""
    return _json_safe(kpis.kpi_summary(_scoped(order_type)))


@app.get("/api/kpis/by-geo")
def get_kpis_by_geo(order_type: str | None = Query(None)) -> dict:
    """Adherence by customer state and by region, worst first."""
    scoped = _scoped(order_type)
    return _json_safe(
        {
            "by_state": kpis.adherence_by(scoped, "customer_state").to_dict("records"),
            "by_region": lanes.region_summary(scoped).to_dict("records"),
        }
    )


@app.get("/api/throughput")
def get_throughput(
    state: str | None = Query(None), order_type: str | None = Query(None)
) -> dict:
    """Daily delivered volume with same-day adherence, optionally for one state."""
    series = kpis.throughput(_scoped(order_type), state=state)
    series = series.assign(delivered_date=series["delivered_date"].astype(str))
    return _json_safe({"series": series.to_dict("records"), "state": state})


@app.get("/api/rca")
def get_rca(order_type: str | None = Query(None)) -> dict:
    """The full root cause analysis, including the generated causal caveat."""
    key = None if order_type in (None, "", "all") else order_type
    if key not in (None, "interstate", "intrastate"):
        raise HTTPException(
            status_code=400,
            detail="order_type must be 'interstate', 'intrastate' or 'all'",
        )
    return _json_safe(_rca_for(key))


@app.get("/api/sellers")
def get_sellers(order_type: str | None = Query(None)) -> dict:
    """Seller handover performance and the concentration summary.

    The minimum order count is returned alongside the ranking so the dashboard
    can display it. A ranking whose floor is invisible invites the reader to
    wonder why a seller they expected is missing.
    """
    scoped = _scoped(order_type)
    volumes = scoped.groupby("seller_id").size()
    eligible = volumes[volumes >= cfg.MIN_ORDERS_PER_SELLER].index

    table = (
        scoped[scoped["seller_id"].isin(eligible)]
        .groupby("seller_id")
        .agg(
            orders=("is_late", "size"),
            late_orders=("is_late", "sum"),
            handover_breaches=("seller_breached_handover", "sum"),
            median_seller_leg_hrs=("seller_leg_hrs", "median"),
        )
    )
    table["adherence"] = 1 - table["late_orders"] / table["orders"]
    table["handover_breach_rate"] = table["handover_breaches"] / table["orders"]

    return _json_safe(
        {
            "pareto": kpis.seller_pareto(scoped),
            "seller_sla": kpis.seller_sla(scoped),
            "min_orders_per_seller": cfg.MIN_ORDERS_PER_SELLER,
            "sellers": table.round(4)
            .sort_values("adherence")
            .reset_index()
            .to_dict("records"),
        }
    )


@app.get("/api/lanes")
def get_lanes(
    order_type: str | None = Query(None),
    sort_by: str = Query("adherence", pattern="^(adherence|late_orders)$"),
    limit: int = Query(50, ge=1, le=500),
) -> dict:
    """Lane table, sortable by worst adherence or by largest absolute loss.

    Both orderings are offered because they answer different questions: a small
    lane at low adherence is a quality problem, a large lane losing many orders
    may cost more customers in total.
    """
    scoped = _scoped(order_type)
    return _json_safe(
        {
            "lanes": lanes.rank_lanes(scoped, by=sort_by, top=limit),
            "sort_by": sort_by,
            "min_orders_per_lane": cfg.MIN_ORDERS_PER_LANE,
            "lanes_above_floor": int(len(lanes.lane_table(scoped))),
        }
    )


@app.get("/api/orders")
def get_orders(
    state: str | None = Query(None),
    category: str | None = Query(None),
    order_type: str | None = Query(None),
    late: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> dict:
    """Filterable, paginated order rows for the table at the bottom of the page."""
    scoped = _scoped(order_type)
    if state:
        scoped = scoped[scoped["customer_state"] == state]
    if category:
        scoped = scoped[scoped["category"] == category]
    if late is not None:
        scoped = scoped[scoped["is_late"] == late]

    columns = [
        "order_id", "order_type", "lane", "customer_state", "customer_region",
        "category", "seller_id", "distance_km", "approval_leg_hrs",
        "seller_leg_hrs", "carrier_leg_hrs", "total_tat_hrs", "is_late",
        "seller_breached_handover", "review_score", "delivered_date",
    ]
    start = (page - 1) * page_size
    page_rows = scoped[columns].iloc[start : start + page_size].copy()
    page_rows["delivered_date"] = page_rows["delivered_date"].astype(str)

    return _json_safe(
        {
            "orders": page_rows.round(2).to_dict("records"),
            "total": int(len(scoped)),
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/meta")
def get_meta() -> dict:
    """Cleaning report, row counts, date range and data source attribution.

    This endpoint is not filler. It is how the dashboard shows what was excluded
    and why, which is what makes every number above it trustworthy, and it
    carries the attribution the dataset's licence requires.
    """
    report = {}
    if os.path.exists(cfg.CLEANING_REPORT_PATH):
        with open(cfg.CLEANING_REPORT_PATH, encoding="utf-8") as handle:
            report = json.load(handle)

    return _json_safe(
        {
            "cleaning_report": report,
            "orders": int(len(ORDERS)),
            "date_range": [
                str(ORDERS["order_purchase_timestamp"].min().date()),
                str(ORDERS["order_purchase_timestamp"].max().date()),
            ],
            "order_type_counts": ORDERS["order_type"].value_counts().to_dict(),
            "data_source": cfg.DATA_SOURCE,
            "floors": {
                "min_orders_per_lane": cfg.MIN_ORDERS_PER_LANE,
                "min_orders_per_seller": cfg.MIN_ORDERS_PER_SELLER,
                "min_orders_per_category": cfg.MIN_ORDERS_PER_CATEGORY,
            },
        }
    )
