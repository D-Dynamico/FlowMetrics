"""Pure KPI functions. DataFrame in, dict or DataFrame out.

No printing, no plotting, no HTTP, no file paths. Every number in the project has
exactly one definition and it lives here, so the API and the dashboard cannot
compute a metric two different ways and quietly disagree.
"""

from __future__ import annotations

import pandas as pd

import config as cfg


def sla_adherence(df: pd.DataFrame) -> float:
    """Share of orders delivered on or before the promised delivery date.

    The headline promise-keeping number, and the one a target gets set against.
    Always report it with its order-type split: interstate and intrastate are
    different operations, so a pooled figure is an average of two unlike
    populations and moves whenever the order mix moves, without anything in the
    operation changing.
    """
    if df.empty:
        return float("nan")
    return float(1 - df["is_late"].mean())


def adherence_by(df: pd.DataFrame, column: str, min_orders: int = 0) -> pd.DataFrame:
    """Adherence and volume grouped by any column, sorted worst first.

    `min_orders` guards rankings. Without it a group holding three orders and one
    miss tops a worst-adherence list at 67% and means nothing; the floor is a
    config value so it can be stated wherever the ranking is displayed.
    """
    grouped = df.groupby(column, observed=True).agg(
        orders=("is_late", "size"),
        late_orders=("is_late", "sum"),
    )
    grouped["adherence"] = 1 - grouped["late_orders"] / grouped["orders"]
    grouped = grouped[grouped["orders"] >= min_orders]
    return grouped.sort_values("adherence").reset_index()


def promise_slack(df: pd.DataFrame) -> dict:
    """How early on-time orders actually arrive, in days.

    Measured on on-time orders only, because for a late order the same
    subtraction is a measure of failure rather than of padding, and mixing the
    two produces a number that means neither.

    This is the metric this dataset practically hands you and most analyses miss.
    A large median says the estimate is padded rather than the operation being
    fast, which makes the first lever a repricing decision rather than an
    operational one. Being able to separate "we are fast" from "we promised
    slowly" is the planning-versus-execution distinction an operations reader is
    listening for.
    """
    on_time = df.loc[~df["is_late"], "promise_slack_hrs"] / 24
    if on_time.empty:
        return {}
    quantiles = on_time.quantile([0.1, 0.25, 0.5, 0.75, 0.9])
    return {
        "median_days": round(float(quantiles.loc[0.5]), 2),
        "mean_days": round(float(on_time.mean()), 2),
        "p10_days": round(float(quantiles.loc[0.1]), 2),
        "p25_days": round(float(quantiles.loc[0.25]), 2),
        "p75_days": round(float(quantiles.loc[0.75]), 2),
        "p90_days": round(float(quantiles.loc[0.9]), 2),
        "orders": int(on_time.size),
    }


def leg_tat(df: pd.DataFrame) -> pd.DataFrame:
    """Mean and median hours for each leg, by order type.

    Median is reported alongside mean because leg durations are long-tailed and
    the gap between the two is itself informative: a mean far above the median
    says a small number of orders are running very late, which is a different
    operational problem from everything running slightly slow.
    """
    columns = [f"{leg}_leg_hrs" for leg in cfg.LEGS] + ["total_tat_hrs"]
    stats = df.groupby("order_type")[columns].agg(["mean", "median"])
    return stats.round(2)


def seller_sla(df: pd.DataFrame) -> dict:
    """Handover breach rate and the four-state cross-tab against customer outcome.

    The two SLAs are independent: a seller can miss the contractual handover
    deadline and the order still reach the customer on time, because the promised
    delivery date carries slack. The interesting cell is "seller breached,
    customer still on time" — it quantifies how much failure the padding is
    absorbing, which is a planning finding rather than an execution one.
    """
    if df.empty:
        return {}
    cross = pd.crosstab(df["seller_breached_handover"], df["is_late"], normalize=True)

    def cell(breached: bool, late: bool) -> float:
        try:
            return round(float(cross.loc[breached, late]), 4)
        except KeyError:
            return 0.0

    breached = df["seller_breached_handover"]
    absorbed = float((breached & ~df["is_late"]).sum())
    return {
        "handover_breach_rate": round(float(breached.mean()), 4),
        "breached_and_late": cell(True, True),
        "breached_but_on_time": cell(True, False),
        "on_time_handover_and_late": cell(False, True),
        "on_time_handover_and_on_time": cell(False, False),
        "share_of_breaches_absorbed_by_slack": round(absorbed / max(breached.sum(), 1), 4),
    }


def seller_pareto(df: pd.DataFrame, min_orders: int | None = None) -> dict:
    """How few sellers account for how much of the late-order volume.

    A ranked table says some sellers are slow. A Pareto says twelve sellers out
    of hundreds account for half the misses, which is a management action with a
    defined scope. It is also the clearest way to show a problem sitting upstream
    of the operation, where the lever is seller management rather than anything
    that can be fixed on the floor.

    Sellers below `min_orders` are excluded before ranking. Without that floor a
    seller with three orders and three misses tops a breach-rate list at 100% and
    carries no volume worth acting on.
    """
    floor = cfg.MIN_ORDERS_PER_SELLER if min_orders is None else min_orders
    volumes = df.groupby("seller_id")["is_late"].size()
    eligible = volumes[volumes >= floor].index
    pool = df[df["seller_id"].isin(eligible)]

    late_by_seller = (
        pool[pool["is_late"]].groupby("seller_id").size().sort_values(ascending=False)
    )
    if late_by_seller.empty:
        return {"min_orders_per_seller": floor, "eligible_sellers": 0}

    cumulative = late_by_seller.cumsum() / late_by_seller.sum()
    thresholds = {
        f"sellers_to_{int(t * 100)}": int((cumulative < t).sum()) + 1
        for t in cfg.PARETO_THRESHOLDS
    }

    decile = max(int(len(late_by_seller) * 0.1), 1)
    top = late_by_seller.head(10)
    breach_rate = pool.groupby("seller_id")["is_late"].mean()

    return {
        "min_orders_per_seller": floor,
        "eligible_sellers": int(len(eligible)),
        "sellers_with_late_orders": int(len(late_by_seller)),
        "total_late_orders": int(late_by_seller.sum()),
        **thresholds,
        "top_decile_share": round(float(cumulative.iloc[decile - 1]), 4),
        "top_sellers": [
            {
                "seller_id": seller_id,
                "late_orders": int(count),
                "orders": int(volumes[seller_id]),
                "late_rate": round(float(breach_rate[seller_id]), 4),
            }
            for seller_id, count in top.items()
        ],
    }


def throughput(df: pd.DataFrame, state: str | None = None) -> pd.DataFrame:
    """Orders delivered per day, optionally for one customer state.

    Volume context, without which an adherence dip cannot be read: the same dip
    during a volume spike is a capacity story and on a normal day it is a process
    story.
    """
    scoped = df if state is None else df[df["customer_state"] == state]
    series = scoped.groupby("delivered_date").agg(
        orders=("is_late", "size"),
        late_orders=("is_late", "sum"),
    )
    series["adherence"] = 1 - series["late_orders"] / series["orders"]
    return series.reset_index().sort_values("delivered_date")


def review_impact(df: pd.DataFrame) -> dict:
    """Mean review score for on-time versus late orders, plus each distribution.

    This is what converts an operational metric into a business consequence. A
    manager can ignore a percentage; a measurable drop in customer satisfaction
    is harder to leave alone, and it is the strongest single line this dataset
    gives you.
    """
    scored = df.dropna(subset=["review_score"])
    if scored.empty:
        return {}

    def summarise(subset: pd.DataFrame) -> dict:
        distribution = subset["review_score"].value_counts(normalize=True).sort_index()
        return {
            "mean_score": round(float(subset["review_score"].mean()), 3),
            "orders": int(len(subset)),
            "distribution": {int(k): round(float(v), 4) for k, v in distribution.items()},
        }

    on_time = summarise(scored[~scored["is_late"]])
    late = summarise(scored[scored["is_late"]])
    return {
        "on_time": on_time,
        "late": late,
        "score_gap": round(on_time["mean_score"] - late["mean_score"], 3),
    }


def kpi_summary(df: pd.DataFrame) -> dict:
    """The header-row numbers, with adherence carrying its order-type split.

    The split travels with the headline figure rather than sitting in a separate
    endpoint, because the pooled number on its own invites exactly the
    misreading this project exists to avoid.
    """
    return {
        "orders": int(len(df)),
        "sla_adherence": round(sla_adherence(df), 4),
        "adherence_by_order_type": {
            order_type: round(sla_adherence(group), 4)
            for order_type, group in df.groupby("order_type")
        },
        "late_orders": int(df["is_late"].sum()),
        "median_total_tat_hrs": round(float(df["total_tat_hrs"].median()), 2),
        "promise_slack": promise_slack(df),
        "seller_sla": seller_sla(df),
        "review_impact": review_impact(df),
        "date_range": [
            str(df["order_purchase_timestamp"].min().date()),
            str(df["order_purchase_timestamp"].max().date()),
        ],
    }
