"""Load the cleaned order table and assert the invariants the analysis assumes.

The heavy work happens once in `data/clean.py`. This module exists so that every
consumer — the API, the tests, a notebook — reaches the data through one door and
gets the same guarantees, rather than each one re-deriving columns and slowly
drifting apart.

The assertions here are cheap and they fail loudly. If a cleaning rule is
loosened and a null leg or a negative duration reaches the analysis, this is
where it stops, not three layers up in a chart that looks plausible.
"""

from __future__ import annotations

import pandas as pd

import config as cfg

LEG_COLUMNS = tuple(f"{leg}_leg_hrs" for leg in cfg.LEGS)


def load_orders(path: str | None = None) -> pd.DataFrame:
    """Read the cleaned parquet and verify it is fit for analysis.

    Raises rather than repairing. A loader that quietly patches its input hides
    the very pipeline regression it should be surfacing, and the repair then
    lives outside the cleaning report where nobody can count it.
    """
    df = pd.read_parquet(path or cfg.CLEAN_PATH)

    for column in LEG_COLUMNS + ("total_tat_hrs",):
        assert not df[column].isna().any(), f"{column} contains nulls"
        assert (df[column] >= 0).all(), f"{column} contains negative durations"

    assert df["order_id"].is_unique, "order_id is not unique"
    assert set(df["order_type"]) <= {"interstate", "intrastate"}, "unexpected order_type"

    return df


def order_type_split(df: pd.DataFrame, order_type: str | None) -> pd.DataFrame:
    """Filter to one order type, or return everything when given None.

    Every KPI is reported with its order-type split, so this filter is applied in
    enough places to be worth naming once. `None` means "All", which is what the
    dashboard toggle sends when it is not narrowing.
    """
    if order_type is None:
        return df
    return df[df["order_type"] == order_type]
