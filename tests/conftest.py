"""Shared fixtures. The cleaned table is loaded once for the whole test session.

Loading the parquet takes a moment and every test reads the same table, so a
session-scoped fixture keeps the suite fast enough to run on every change.
"""

from __future__ import annotations

import pytest

from analysis.loader import load_orders
from analysis.rca import run_rca


@pytest.fixture(scope="session")
def orders():
    return load_orders()


@pytest.fixture(scope="session")
def rca(orders):
    return run_rca(orders)
