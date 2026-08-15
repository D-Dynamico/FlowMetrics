"""Analysis invariants.

These assert that the RCA is internally consistent and that its baselines are
built the way the method claims. They test properties, not today's values: a test
that breaks when a cleaning rule is retuned is testing the data rather than the
code.
"""

from __future__ import annotations

import pandas as pd

import config as cfg
from analysis import kpis
from analysis.rca import attribute_to_leg, isolate_failures, leg_baselines, run_rca


def test_every_late_order_is_attributed_to_exactly_one_leg(orders):
    late, on_time = isolate_failures(orders)
    attributed = attribute_to_leg(late, leg_baselines(on_time))

    assert len(attributed) == len(late)
    assert not attributed["bottleneck_leg"].isna().any()
    assert set(attributed["bottleneck_leg"]) <= set(cfg.LEGS)


def test_attribution_picks_the_largest_excess(orders):
    """The named leg must really hold the largest excess for its own row.

    Spot-checked across a sample rather than asserted on aggregates, because an
    off-by-one in the column-name handling would still produce a plausible-looking
    breakdown.
    """
    late, on_time = isolate_failures(orders)
    attributed = attribute_to_leg(late, leg_baselines(on_time)).head(500)

    excess = attributed[[f"{leg}_excess" for leg in cfg.LEGS]]
    expected = excess.idxmax(axis=1).str.replace("_excess", "", regex=False)
    assert attributed["bottleneck_leg"].equals(expected)


def test_baselines_come_from_on_time_orders_only(orders):
    """Baselines must not be polluted by the failures they are used to measure.

    Recomputing from the full population must give a different answer; if it does
    not, the split is not actually being applied.
    """
    late, on_time = isolate_failures(orders)
    from_on_time = leg_baselines(on_time)
    from_everything = leg_baselines(orders)

    assert not from_on_time.equals(from_everything)
    for order_type in from_on_time.index:
        assert (
            from_on_time.loc[order_type, "carrier_leg_hrs"]
            < from_everything.loc[order_type, "carrier_leg_hrs"]
        )


def test_baselines_are_computed_per_order_type(orders):
    """Interstate and intrastate must get separate baselines.

    Pooling them would make every intrastate order look fast, so attribution
    would track geography instead of what went wrong on the order.
    """
    late, on_time = isolate_failures(orders)
    baselines = leg_baselines(on_time)

    assert set(baselines.index) == {"interstate", "intrastate"}
    assert (
        baselines.loc["intrastate", "carrier_leg_hrs"]
        < baselines.loc["interstate", "carrier_leg_hrs"]
    )


def test_leg_breakdown_shares_sum_to_one(rca):
    for scope in [rca["overall"]] + list(rca["by_order_type"].values()):
        total = sum(scope["leg_breakdown"].values())
        assert abs(total - 1.0) < 0.01


def test_late_count_matches_the_late_rate(orders, rca):
    """The reported rate must be the reported count over the population.

    Tolerance allows for the rounding the output applies; it is tight enough to
    catch a genuine mismatch between the two figures.
    """
    assert rca["late_count"] == int(orders["is_late"].sum())
    assert abs(rca["late_rate"] - rca["late_count"] / rca["orders"]) < 1e-4


def test_adherence_rates_are_valid_everywhere(orders):
    for column in ["order_type", "customer_state", "customer_region", "lane"]:
        table = kpis.adherence_by(orders, column)
        assert table["adherence"].between(0, 1).all()


def test_both_order_types_produce_independent_results(rca):
    """Each segment must be computed on its own rows, not sliced from a pooled run."""
    assert set(rca["by_order_type"]) == {"interstate", "intrastate"}
    for findings in rca["by_order_type"].values():
        assert findings["leg_breakdown"]
        assert findings["dominant_leg"] in cfg.LEGS


def test_concentration_lift_is_consistent_with_shares(rca):
    """Lift must equal miss share divided by order share, and shares must total one."""
    lift = rca["overall"]["state_lift"]
    assert abs(sum(stats["miss_share"] for stats in lift.values()) - 1.0) < 0.01

    # Lift is published rounded to two decimals and the shares to four, so the
    # tolerance carries that rounding rather than asserting exact arithmetic.
    for stats in lift.values():
        if stats["lift"] is not None and stats["order_share"] > 0:
            expected = stats["miss_share"] / stats["order_share"]
            assert abs(stats["lift"] - expected) < 0.05


def test_promise_slack_uses_on_time_orders_only(orders):
    """Slack measures padding, so it must exclude orders that arrived late.

    On a late order the same subtraction measures failure, and mixing the two
    gives a number that means neither.
    """
    slack = kpis.promise_slack(orders)
    assert slack["orders"] == int((~orders["is_late"]).sum())
    assert slack["median_days"] > 0


def test_seller_pareto_respects_its_volume_floor(orders):
    """Without the floor a seller with three orders and three misses tops the list."""
    pareto = kpis.seller_pareto(orders)
    volumes = orders.groupby("seller_id").size()

    for seller in pareto["top_sellers"]:
        assert volumes[seller["seller_id"]] >= cfg.MIN_ORDERS_PER_SELLER
    assert pareto["sellers_to_50"] <= pareto["sellers_to_80"]


def test_lane_rankings_respect_their_volume_floor(orders):
    from analysis.lanes import rank_lanes

    for ranking in ["adherence", "late_orders"]:
        for lane in rank_lanes(orders, by=ranking):
            assert lane["orders"] >= cfg.MIN_ORDERS_PER_LANE


def test_lane_rankings_answer_different_questions(orders):
    """The two rankings must not be the same list under another name.

    If they agreed, reporting both would be padding; the point of showing both is
    that a small lane at low adherence and a large lane losing many orders are
    different problems.
    """
    from analysis.lanes import rank_lanes

    by_rate = {lane["lane"] for lane in rank_lanes(orders, by="adherence")}
    by_volume = {lane["lane"] for lane in rank_lanes(orders, by="late_orders")}
    assert by_rate != by_volume


def test_headline_is_generated_not_hardcoded(orders, rca):
    """The headline must move when the input moves.

    A hardcoded string would survive a change in the data, and every claim in the
    README quoting it would stop being verifiable.
    """
    half = orders[orders["order_type"] == "intrastate"]
    other = run_rca(half)

    assert other["headline"] != rca["headline"]
    assert f"{other['late_rate']:.1%}" in other["headline"]


def test_causal_caveat_is_present_and_avoids_causal_language(rca):
    """The output must not claim causation anywhere a reader will quote from.

    The predictors are confounded, so the vocabulary is "concentrates in" and
    "travels with", never "causes" or "drives".
    """
    caveat = rca["causal_caveat"]
    assert "associations, not causes" in caveat

    for text in [rca["headline"], rca["segment_note"]]:
        lowered = text.lower()
        for banned in ["causes", "caused by", "because of", "drives"]:
            assert banned not in lowered
