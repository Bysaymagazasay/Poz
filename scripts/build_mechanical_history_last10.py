#!/usr/bin/env python3
from __future__ import annotations

import build_mechanical_history as base

START_YEAR = 2017
END_YEAR = 2026
_original_collect_sources = base.collect_sources


def period_year(label: str) -> int:
    return base.period_sort_key(label)[0]


def collect_sources_last_ten_years():
    price_sources, mapping_sources = _original_collect_sources()
    price_sources = [
        source for source in price_sources
        if START_YEAR <= period_year(source.period) <= END_YEAR
    ]
    mapping_sources = [
        source for source in mapping_sources
        if START_YEAR <= period_year(source.period) <= END_YEAR
    ]
    return price_sources, mapping_sources


base.collect_sources = collect_sources_last_ten_years

if __name__ == "__main__":
    raise SystemExit(base.main())
