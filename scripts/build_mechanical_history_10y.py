#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

BASE_PATH = Path(__file__).with_name('build_mechanical_history.py')
spec = importlib.util.spec_from_file_location('mechanical_history_base', BASE_PATH)
assert spec and spec.loader
base = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = base
spec.loader.exec_module(base)

ORIGINAL_COLLECT = base.collect_sources
base.OUT_DIR = Path('generated/mechanical-history-2017-2026')
base.CACHE_DIR = Path('.cache/mechanical-history-2017-2026')
base.TIMEOUT = 60


def year_of(label: str) -> int:
    match = re.search(r'(19\d{2}|20\d{2})', str(label or ''))
    return int(match.group(1)) if match else 0


def collect_sources_10y():
    price_sources, mapping_sources = ORIGINAL_COLLECT()
    price_sources = [source for source in price_sources if 2017 <= year_of(source.period) <= 2026]
    mapping_sources = [source for source in mapping_sources if 2017 <= year_of(source.period) <= 2026]
    price_sources.sort(key=lambda source: base.period_sort_key(source.period), reverse=True)
    mapping_sources.sort(key=lambda source: base.period_sort_key(source.period), reverse=True)
    return price_sources, mapping_sources


def parse_prices_parallel(sources):
    history = []
    workers = min(3, max(1, len(sources)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(base.parse_price_book, source): source for source in sources}
        done = 0
        for future in as_completed(futures):
            source = futures[future]
            done += 1
            try:
                rows = future.result()
                history.extend(rows)
                print(f'[{done}/{len(sources)}] {source.period}: {len(rows)} satır ({source.status})', flush=True)
            except Exception as exc:
                source.status = 'error'
                source.note = str(exc)[:1000]
                print(f'ERROR {source.period}: {exc}', file=sys.stderr, flush=True)
    return history


def parse_mappings_parallel(sources):
    mappings = []
    workers = min(2, max(1, len(sources)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(base.parse_code_map, source): source for source in sources}
        for future in as_completed(futures):
            source = futures[future]
            try:
                rows = future.result()
                mappings.extend(rows)
                print(f'Kod eşleştirme {source.period}: {len(rows)} satır ({source.status})', flush=True)
            except Exception as exc:
                source.status = 'error'
                source.note = str(exc)[:1000]
                print(f'KOD EŞLEŞTİRME HATASI {source.period}: {exc}', file=sys.stderr, flush=True)
    return mappings


def main() -> int:
    base.OUT_DIR.mkdir(parents=True, exist_ok=True)
    sources, mapping_sources = collect_sources_10y()
    print(f'2017-2026 kapsamında {len(sources)} fiyat kitabı ve {len(mapping_sources)} kod değişiklik belgesi bulundu.', flush=True)

    history = parse_prices_parallel(sources)
    mappings = parse_mappings_parallel(mapping_sources) if mapping_sources else []

    dedup = {}
    for row in history:
        key = (base.normalize_code(row.poz_no), row.period)
        old = dedup.get(key)
        if old is None or row.source_page > old.source_page:
            dedup[key] = row
    history = sorted(
        dedup.values(),
        key=lambda row: (base.period_sort_key(row.period), base.normalize_code(row.poz_no)),
        reverse=True,
    )
    master = base.build_master(history, mappings)

    base.write_csv(
        base.OUT_DIR / 'mechanical_master_latest.csv',
        ['poz_no','unit','latest_published_price','latest_period','validity_date','source_url','source_page','previous_period','previous_price','publication_count','old_poz_numbers','new_poz_no','number_status','mapping_confidence','control_note'],
        master,
    )
    base.write_csv(
        base.OUT_DIR / 'mechanical_history_raw.csv',
        ['poz_no','unit','price','period','validity_date','source_url','source_page','raw_excerpt'],
        (asdict(row) for row in history),
    )
    base.write_csv(
        base.OUT_DIR / 'mechanical_code_map.csv',
        ['mapping_period','old_poz_no','new_poz_no','source_url','evidence','mapping_type'],
        mappings,
    )
    all_sources = [*sources, *mapping_sources]
    base.write_csv(
        base.OUT_DIR / 'mechanical_sources.csv',
        ['period','url','kind','status','pages','mechanical_start_page','mechanical_end_page','parsed_rows','note'],
        (asdict(source) for source in all_sources),
    )

    summary = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'official_index_url': base.INDEX_URL,
        'scope_start_year': 2017,
        'scope_end_year': 2026,
        'price_books_found': len(sources),
        'mapping_documents_found': len(mapping_sources),
        'raw_records': len(history),
        'master_records': len(master),
        'official_code_mappings': len(mappings),
        'successful_price_books': sum(1 for source in sources if source.status == 'ok'),
        'unparsed_price_books': sum(1 for source in sources if source.status != 'ok'),
        'periods': [source.period for source in sources],
        'note': 'Poz isimleri bu aşamada özellikle alınmamıştır. Eski/yeni pozlar yalnız resmî değişiklik listesi varsa birleştirilmiştir.',
    }
    (base.OUT_DIR / 'summary.json').write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return 0 if master else 2


if __name__ == '__main__':
    raise SystemExit(main())
