"""Cleaning invariants.

These assert that the pipeline produced a table the analysis can trust. They test
properties rather than today's exact numbers, with one deliberate exception: the
row-count reconciliation, which should break loudly if the pipeline ever starts
dropping rows without recording them.
"""

from __future__ import annotations

import os

import pandas as pd
import pytest

import config as cfg


def test_no_null_leg_durations(orders):
    for leg in cfg.LEGS:
        assert not orders[f"{leg}_leg_hrs"].isna().any()


def test_no_negative_leg_durations(orders):
    """A negative duration means a recording error, and it must not survive.

    Clamping to zero would be worse than dropping: a zero-length leg reads as the
    fastest stage in the network and would quietly win every baseline comparison.
    """
    for leg in cfg.LEGS:
        assert (orders[f"{leg}_leg_hrs"] >= 0).all()
    assert (orders["total_tat_hrs"] >= 0).all()


def test_legs_sum_to_total_tat(orders):
    """The three legs must account for the whole journey, with nothing missing.

    If a leg boundary is ever mis-wired the total will stop reconciling, and this
    catches it before the RCA attributes misses to a stage that does not line up
    with the clock.
    """
    leg_sum = sum(orders[f"{leg}_leg_hrs"] for leg in cfg.LEGS)
    assert ((leg_sum - orders["total_tat_hrs"]).abs() < 0.01).all()


def test_every_order_is_delivered(orders):
    assert (orders["order_status"] == cfg.KEEP_ORDER_STATUS).all()


def test_every_order_falls_inside_the_date_window(orders):
    start = pd.Timestamp(cfg.DATE_WINDOW[0])
    end = pd.Timestamp(cfg.DATE_WINDOW[1]) + pd.Timedelta(days=1)
    purchased = orders["order_purchase_timestamp"]
    assert purchased.min() >= start
    assert purchased.max() <= end


def test_order_ids_are_unique(orders):
    assert orders["order_id"].is_unique


def test_every_order_has_exactly_one_seller(orders):
    assert (orders["seller_count"] == 1).all()
    assert not orders["seller_id"].isna().any()


def test_order_type_matches_the_states(orders):
    same_state = orders["seller_state"] == orders["customer_state"]
    assert (orders.loc[same_state, "order_type"] == "intrastate").all()
    assert (orders.loc[~same_state, "order_type"] == "interstate").all()


def test_every_state_maps_to_a_region(orders):
    """An unmapped state would silently vanish from every regional rollup."""
    assert not orders["customer_region"].isna().any()
    assert not orders["seller_region"].isna().any()


def test_late_flag_matches_the_dates(orders):
    expected = (
        orders["order_delivered_customer_date"] > orders["order_estimated_delivery_date"]
    )
    assert orders["is_late"].equals(expected)


def test_handover_breach_flag_matches_the_dates(orders):
    expected = orders["order_delivered_carrier_date"] > orders["shipping_limit_date"]
    assert orders["seller_breached_handover"].equals(expected)


def test_the_two_slas_are_independent(orders):
    """All four combinations of the two SLAs must actually occur.

    If one cell were empty the flags would be measuring the same thing under two
    names, and the "seller breached but the customer was still on time" finding
    would be an artefact rather than a result.
    """
    combinations = set(
        zip(orders["seller_breached_handover"], orders["is_late"])
    )
    assert combinations == {(True, True), (True, False), (False, True), (False, False)}


def test_cleaning_report_reconciles():
    """Raw orders minus every recorded exclusion must equal the clean row count.

    This is the one test allowed to depend on the current data, because its whole
    purpose is to fail if the pipeline starts losing rows nobody counted. An
    exclusion nobody can see is a hole in the analysis.

    Skipped when the raw CSVs are absent. They are deliberately not committed, so
    a fresh clone has the cleaned parquet but not its source; every other test
    runs against the parquet and still passes. Failing here would tell a reviewer
    the project is broken when it is only missing an optional download.
    """
    missing = [
        name
        for name in cfg.RAW_FILES.values()
        if not os.path.exists(os.path.join(cfg.RAW_DIR, name))
    ]
    if missing:
        pytest.skip(
            f"raw Olist CSVs not present in {cfg.RAW_DIR} "
            f"(missing {len(missing)} of {len(cfg.RAW_FILES)}); "
            "download them to run the full cleaning pipeline"
        )

    from data.clean import build

    orders, report = build()

    dropped = sum(
        count for rule, count in report.items() if rule.startswith("dropped_")
    )
    assert report["raw_orders"] - dropped == report["clean_orders"] == len(orders)
