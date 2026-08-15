"""Root cause analysis: a three-stage narrowing from symptom to scope.

Each stage takes the pool of failures and asks "of these, where is this
concentrated?", then passes the answer down. Stage one attributes each miss to a
leg, stage two finds where those misses concentrate geographically, stage three
tests which candidate drivers separate late orders from on-time ones.

Stage three is where this differs from an analysis on synthetic data, and the
difference is the point. There is no `delay_reason` column, because real
operational data almost never has one. Nothing here reads off a labelled cause;
every statement is a concentration or an association, and the module says so out
loud in `causal_caveat` rather than leaving the reader to infer it.
"""

from __future__ import annotations

import pandas as pd

import config as cfg
from analysis import kpis, lanes

LEG_HOURS = {leg: f"{leg}_leg_hrs" for leg in cfg.LEGS}
LEG_LABELS = {
    "approval": "payment approval",
    "seller": "seller handover",
    "carrier": "carrier transit",
}


def isolate_failures(df: pd.DataFrame) -> pd.DataFrame:
    """Split the population into late and on-time orders.

    On-time orders carry no information about failure, but they are not discarded:
    they are the only honest source of a baseline for what each leg normally
    takes, so both halves are returned.
    """
    late = df[df["is_late"]].copy()
    on_time = df[~df["is_late"]]
    return late, on_time


def leg_baselines(on_time: pd.DataFrame) -> pd.DataFrame:
    """Median hours per leg, computed per (leg, order_type) from on-time orders.

    Two decisions, both worth defending.

    Median rather than mean, because a handful of very late orders would drag a
    mean upward and the baseline would then be polluted by the same outliers it
    exists to measure against.

    Per order type rather than pooled, because an intrastate carrier leg and an
    interstate one are different operations with different normals. Pooling them
    would make every intrastate order look fast and every interstate one look
    slow, so attribution would track geography rather than what actually went
    wrong on the order.
    """
    return on_time.groupby("order_type")[list(LEG_HOURS.values())].median()


def attribute_to_leg(late: pd.DataFrame, baselines: pd.DataFrame) -> pd.DataFrame:
    """Blame each late order on the leg that ran furthest over its own baseline.

    **Why excess over baseline and not raw duration.** The carrier leg is
    naturally the longest by a wide margin — a median of 222 hours interstate
    against 45 for the seller leg — so blaming the longest leg would blame the
    carrier on virtually every order regardless of what actually went wrong, and
    the seller leg would never surface at all. Measuring how far each leg ran
    over its own normal separates "slow by nature" from "slow on this order",
    which is the only version of the question that has an actionable answer.

    This is the one genuine methodological decision in the project and the most
    likely thing to be probed in an interview.

    The approximation it carries: exactly one leg is blamed per order, when in
    reality delays compound across legs and an order can be late because two
    stages each ran moderately long. That limitation is stated in the README
    rather than hidden here.
    """
    attributed = late.copy()
    for leg, column in LEG_HOURS.items():
        attributed[f"{leg}_excess"] = attributed[column] - attributed["order_type"].map(
            baselines[column]
        )

    excess_columns = [f"{leg}_excess" for leg in cfg.LEGS]
    # idxmax returns the column name, so strip the suffix back to a leg name.
    attributed["bottleneck_leg"] = (
        attributed[excess_columns].idxmax(axis=1).str.replace("_excess", "", regex=False)
    )
    return attributed


def _share(series: pd.Series) -> dict:
    """Value counts as ordered shares, rounded, with plain Python types."""
    counts = series.value_counts(normalize=True).sort_values(ascending=False)
    return {str(k): round(float(v), 4) for k, v in counts.items()}


def _concentration_lift(misses: pd.Series, population: pd.Series) -> dict:
    """Each group's share of misses next to its share of orders, and the ratio.

    Raw concentration on its own is close to meaningless here. SP holds most of
    the volume in this dataset, so "most misses happen in SP" mainly restates
    where the orders are and would be true of any outcome, good or bad. The ratio
    of miss share to order share is what separates a genuinely underperforming
    geography from a merely large one: above 1.0 a group absorbs more failure
    than its volume warrants.

    Both numbers are reported rather than the ratio alone, because a group with a
    lift of 3.0 and forty orders is a different conversation from one with a lift
    of 1.2 and eight thousand.
    """
    miss_share = misses.value_counts(normalize=True)
    order_share = population.value_counts(normalize=True)
    return {
        str(name): {
            "miss_share": round(float(share), 4),
            "order_share": round(float(order_share.get(name, 0.0)), 4),
            "lift": round(float(share / order_share[name]), 2)
            if order_share.get(name, 0.0)
            else None,
            "orders": int((population == name).sum()),
        }
        for name, share in miss_share.sort_values(ascending=False).items()
    }


def _smallest_set_over_half(shares: dict) -> list[str]:
    """The fewest groups that together hold more than half the misses.

    Reported instead of a full ranked list because "these four states hold half
    the misses" is a scope someone can act on, where a table of twenty-seven
    states is something to scroll past.
    """
    running, selected = 0.0, []
    for name, share in shares.items():
        selected.append(name)
        running += share
        if running > 0.5:
            break
    return selected


def _adherence_by_group(df: pd.DataFrame, column: str, min_orders: int = 0) -> dict:
    """Adherence per group with volume, as a plain dict keyed by group name."""
    table = kpis.adherence_by(df, column, min_orders=min_orders)
    return {
        str(row[column]): {
            "adherence": round(float(row["adherence"]), 4),
            "orders": int(row["orders"]),
        }
        for _, row in table.iterrows()
    }


def candidate_drivers(df: pd.DataFrame) -> dict:
    """Test which observable factors separate late orders from on-time ones.

    Effect sizes are reported in plain operational terms — adherence in the
    worst band against the best — rather than as test statistics, because the
    reader is an operations manager deciding where to look next, not a
    statistician deciding what to publish.

    **These are associations, not causes.** The data is observational and the
    predictors are confounded: distance, region and seller location all move
    together, because the sellers are concentrated in the Southeast and the
    longest lanes are the ones running out of it. Nothing here can separate a
    distance effect from an infrastructure effect. The correct framing is "here
    is where the losses concentrate and which factors travel with them, and here
    is what I would instrument next", never "here is the cause".
    """
    drivers: dict[str, dict] = {}

    with_distance = df.dropna(subset=["distance_km"])
    bands = _adherence_by_group(with_distance, "distance_band")
    ordered_bands = [name for name, _, _ in cfg.DISTANCE_BANDS_KM if name in bands]
    if ordered_bands:
        nearest, furthest = ordered_bands[0], ordered_bands[-1]
        drivers["distance"] = {
            "bands": {name: bands[name] for name in ordered_bands},
            "nearest_band": nearest,
            "furthest_band": furthest,
            "adherence_gap": round(
                bands[nearest]["adherence"] - bands[furthest]["adherence"], 4
            ),
            "orders_missing_distance": int(df["distance_km"].isna().sum()),
        }

    drivers["seller"] = kpis.seller_pareto(df)

    categories = _adherence_by_group(
        df.dropna(subset=["category"]),
        "category",
        min_orders=cfg.MIN_ORDERS_PER_CATEGORY,
    )
    if categories:
        worst = list(categories)[0]
        best = list(categories)[-1]
        drivers["category"] = {
            "worst": {"name": worst, **categories[worst]},
            "best": {"name": best, **categories[best]},
            "adherence_gap": round(
                categories[best]["adherence"] - categories[worst]["adherence"], 4
            ),
            "min_orders_per_category": cfg.MIN_ORDERS_PER_CATEGORY,
            "categories_ranked": len(categories),
        }

    freight = df.dropna(subset=["freight_value"]).copy()
    freight["freight_quartile"] = pd.qcut(
        freight["freight_value"], 4, labels=["Q1", "Q2", "Q3", "Q4"]
    )
    drivers["freight"] = {"quartiles": _adherence_by_group(freight, "freight_quartile")}

    drivers["month"] = {"by_month": _adherence_by_group(df, "order_month")}

    weekday = df.copy()
    weekday["purchase_weekday"] = weekday["order_purchase_timestamp"].dt.day_name()
    drivers["weekday"] = {"by_weekday": _adherence_by_group(weekday, "purchase_weekday")}

    return drivers


def _narrow(attributed: pd.DataFrame, df: pd.DataFrame) -> dict:
    """Run stages one to three over one population and return its findings.

    Called once for the whole dataset and once per order type, because the two
    segments fail differently and a pooled figure hides that.
    """
    if attributed.empty:
        return {}

    leg_breakdown = _share(attributed["bottleneck_leg"])
    dominant_leg = next(iter(leg_breakdown))

    dominant = attributed[attributed["bottleneck_leg"] == dominant_leg]
    region_shares = _share(dominant["customer_region"])
    state_shares = _share(dominant["customer_state"])

    # Volume-adjusted view. The raw shares above answer "where do the misses
    # happen"; these answer "where do they happen more than volume explains",
    # which is the question worth acting on.
    state_lift = _concentration_lift(
        dominant["customer_state"], df["customer_state"]
    )
    overweighted = [
        state
        for state, stats in state_lift.items()
        if stats["lift"] is not None
        and stats["lift"] > 1.0
        and stats["orders"] >= cfg.MIN_ORDERS_PER_LANE
    ]

    return {
        "leg_breakdown": leg_breakdown,
        "dominant_leg": dominant_leg,
        "dominant_leg_orders": int(len(dominant)),
        "region_concentration": region_shares,
        "region_lift": _concentration_lift(
            dominant["customer_region"], df["customer_region"]
        ),
        "state_concentration": state_shares,
        "state_lift": state_lift,
        "overweighted_states": overweighted[:10],
        "concentrated_states": _smallest_set_over_half(state_shares),
        "worst_lanes_by_adherence": lanes.rank_lanes(df, by="adherence", top=10),
        "worst_lanes_by_absolute_loss": lanes.rank_lanes(df, by="late_orders", top=10),
        "region_summary": lanes.region_summary(df).to_dict("records"),
        "drivers": candidate_drivers(df),
        "min_orders_per_lane": cfg.MIN_ORDERS_PER_LANE,
    }


def _headline(df: pd.DataFrame, overall: dict, slack: dict) -> str:
    """Assemble the key finding from computed values.

    Never a template with a number typed into it. If a cleaning rule changes,
    this sentence changes with it, which is the only way a README claim stays
    verifiable.
    """
    late_rate = float(df["is_late"].mean())
    leg = overall["dominant_leg"]
    leg_share = overall["leg_breakdown"][leg]

    # Name the states that absorb more failure than their volume warrants, not
    # simply the ones holding the most misses. The latter would mostly recover
    # where the orders are.
    lift = overall["state_lift"]
    ranked = sorted(
        (
            (state, stats)
            for state, stats in lift.items()
            if stats["lift"] is not None and stats["orders"] >= cfg.MIN_ORDERS_PER_LANE
        ),
        key=lambda item: item[1]["lift"],
        reverse=True,
    )[:3]
    # Full state names, not codes. This sentence is the most-read line in the
    # project and goes straight into the README; "AL" means nothing to a reader
    # who is not Brazilian, which is most of them.
    named = ", ".join(
        f"{cfg.STATE_NAMES.get(state, state)} ({stats['lift']:.1f}x)"
        for state, stats in ranked
    )

    return (
        f"{late_rate:.1%} of orders miss their promised delivery date. "
        f"{leg_share:.0%} of those misses attribute to the {LEG_LABELS[leg]} leg. "
        f"Adjusted for order volume, failure lands hardest on {named}, "
        f"where the share of misses runs well above the share of orders. "
        f"The median on-time order still arrives {slack['median_days']:.1f} days "
        f"early, so the promise carries far more slack than the operation needs."
    )


def _segment_note(by_order_type: dict, df: pd.DataFrame) -> str:
    """State how the two segments diverge, from computed values."""
    parts = []
    for order_type, findings in by_order_type.items():
        if not findings:
            continue
        subset = df[df["order_type"] == order_type]
        leg = findings["dominant_leg"]
        parts.append(
            f"{order_type} runs {1 - subset['is_late'].mean():.1%} adherence with "
            f"{findings['leg_breakdown'][leg]:.0%} of misses on the "
            f"{LEG_LABELS[leg]} leg"
        )
    return "; ".join(parts) + "."


CAUSAL_CAVEAT = (
    "These are associations, not causes. The data is observational and the "
    "predictors are confounded: distance, customer region and seller location "
    "all move together, because sellers concentrate in the Southeast and the "
    "longest lanes are the ones running out of it. This analysis can say where "
    "losses concentrate and which factors travel with them; it cannot say which "
    "one is responsible. Separating them would need hub-level instrumentation or "
    "a comparison holding the route fixed."
)


def run_rca(df: pd.DataFrame) -> dict:
    """Run the full narrowing and return the structured finding.

    Returns the overall picture plus a per-order-type breakdown, since the two
    segments fail differently and a pooled number hides that. Every string in the
    output is generated from the computed values above.
    """
    late, on_time = isolate_failures(df)
    baselines = leg_baselines(on_time)
    attributed = attribute_to_leg(late, baselines)

    overall = _narrow(attributed, df)
    by_order_type = {
        order_type: _narrow(
            attributed[attributed["order_type"] == order_type],
            df[df["order_type"] == order_type],
        )
        for order_type in sorted(df["order_type"].unique())
    }

    slack = kpis.promise_slack(df)

    return {
        "orders": int(len(df)),
        "late_count": int(len(late)),
        "late_rate": round(float(df["is_late"].mean()), 4),
        "leg_baselines_hrs": baselines.round(2).to_dict(),
        "overall": overall,
        "by_order_type": by_order_type,
        "headline": _headline(df, overall, slack),
        "segment_note": _segment_note(by_order_type, df),
        "causal_caveat": CAUSAL_CAVEAT,
    }
