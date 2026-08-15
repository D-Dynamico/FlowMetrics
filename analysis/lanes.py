"""Lane-level aggregation and ranking.

A lane is an origin-destination pair, `seller_state` to `customer_state`. It is
the unit a network planner actually manages: capacity, carrier contracts and
routing are decided per lane, not per destination state. "Adherence is poor in
the North" is a map; "these six lanes into the North carry 4,000 orders at 71%
adherence" is a scope for a carrier conversation.
"""

from __future__ import annotations

import pandas as pd

import config as cfg


def lane_table(df: pd.DataFrame, min_orders: int | None = None) -> pd.DataFrame:
    """Aggregate every order into its lane and report the operational profile.

    Lanes below `min_orders` are dropped rather than shown with a caveat, because
    a two-order lane at 0% adherence outranks every real problem in the network
    and pushes it off the screen. The floor is a config value so it can be
    displayed wherever a ranking is shown.
    """
    floor = cfg.MIN_ORDERS_PER_LANE if min_orders is None else min_orders

    table = df.groupby("lane", observed=True).agg(
        orders=("is_late", "size"),
        late_orders=("is_late", "sum"),
        median_carrier_hrs=("carrier_leg_hrs", "median"),
        median_distance_km=("distance_km", "median"),
        median_freight=("freight_value", "median"),
        seller_state=("seller_state", "first"),
        customer_state=("customer_state", "first"),
        order_type=("order_type", "first"),
    )
    table["adherence"] = 1 - table["late_orders"] / table["orders"]
    table = table[table["orders"] >= floor]
    return table.round(2).reset_index()


def rank_lanes(
    df: pd.DataFrame, by: str = "adherence", top: int = 10, min_orders: int | None = None
) -> list[dict]:
    """Rank lanes by worst adherence or by largest absolute late-order count.

    Both rankings are reported because they answer different questions and
    usually give different answers. A lane at 40% adherence carrying 40 orders is
    a quality problem; a lane at 88% carrying 4,000 is losing more customers in
    total. Presenting only the first makes the network look like a collection of
    small disasters, and only the second makes it look uniformly fine.
    """
    table = lane_table(df, min_orders=min_orders)
    if table.empty:
        return []

    if by == "adherence":
        ordered = table.sort_values("adherence", ascending=True)
    elif by == "late_orders":
        ordered = table.sort_values("late_orders", ascending=False)
    else:
        raise ValueError(f"rank lanes by 'adherence' or 'late_orders', not {by!r}")

    return ordered.head(top).to_dict("records")


def region_summary(df: pd.DataFrame) -> pd.DataFrame:
    """Adherence and carrier TAT by customer region, worst first.

    The broadest geographic cut this data supports, and the first place delivery
    performance separates. It frames the lane table rather than replacing it: a
    region is something to observe, a lane is something to act on.
    """
    summary = df.groupby("customer_region", observed=True).agg(
        orders=("is_late", "size"),
        late_orders=("is_late", "sum"),
        median_carrier_hrs=("carrier_leg_hrs", "median"),
        median_distance_km=("distance_km", "median"),
    )
    summary["adherence"] = 1 - summary["late_orders"] / summary["orders"]
    return summary.round(2).sort_values("adherence").reset_index()
