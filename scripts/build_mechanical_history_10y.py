#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
from pathlib import Path

BASE_PATH = Path(__file__).with_name('build_mechanical_history.py')
spec = importlib.util.spec_from_file_location('mechanical_history_base', BASE_PATH)
base = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(base)

ORIGINAL_COLLECT = base.collect_sources


def year_of(label: str) -> int:
    import re
    match = re.search(r'(19\d{2}|20\d{2})', str(label or ''))
    return int(match.group(1)) if match else 0


def collect_sources_10y():
    price_sources, mapping_sources = ORIGINAL_COLLECT()
    price_sources = [source for source in price_sources if 2017 <= year_of(source.period) <= 2026]
    mapping_sources = [source for source in mapping_sources if 2017 <= year_of(source.period) <= 2026]
    return price_sources, mapping_sources


base.collect_sources = collect_sources_10y
base.OUT_DIR = Path('generated/mechanical-history-2017-2026')
base.CACHE_DIR = Path('.cache/mechanical-history-2017-2026')

if __name__ == '__main__':
    raise SystemExit(base.main())
