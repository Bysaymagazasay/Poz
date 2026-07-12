#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

CANDIDATE_URLS = [
    'https://webdosya.csb.gov.tr/v2/yfk/2026/07/elektrik-birim-fiyatlar-2026-temmuz-20260703140638.pdf',
    'https://webdosya.csb.gov.tr/v2/yfk/2026/07/2026-temmuz-elektrik-birim-fiyat-20260703140638.pdf',
    'https://webdosya.csb.gov.tr/db/yfk/icerikler/2026-temmuz-elektrik-birim-fiyat-20260703140638.pdf',
]

CODE_RE = re.compile(r'^\s*((?:35|36)\.\d{3}\.\d{4})\b')
PRICE_RE = re.compile(r'\b\d{1,3}(?:\.\d{3})*,\d{2}\b')
UNITS = ('Adet', 'Ad', 'Kg', 'm²', 'm2', 'm')


def download_pdf(destination: Path) -> str:
    errors: list[str] = []
    for url in CANDIDATE_URLS:
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 BYSAY-Poz-Build/1.0'})
            with urllib.request.urlopen(request, timeout=90) as response:
                data = response.read()
            if not data.startswith(b'%PDF') or len(data) < 1_000_000:
                raise RuntimeError(f'Geçersiz PDF ({len(data)} bayt)')
            destination.write_bytes(data)
            print(f'Elektrik PDF indirildi: {url} ({len(data)} bayt)')
            return url
        except Exception as exc:
            errors.append(f'{url}: {exc}')
    raise RuntimeError('Temmuz elektrik PDF indirilemedi. ' + ' | '.join(errors))


def parse_records(pdf_path: Path, text_path: Path) -> list[list[str]]:
    subprocess.run(['pdftotext', '-layout', str(pdf_path), str(text_path)], check=True)
    lines = text_path.read_text(encoding='utf-8', errors='ignore').splitlines()
    records: list[list[str]] = []
    seen: set[str] = set()

    for index, line in enumerate(lines):
        match = CODE_RE.match(line)
        if not match:
            continue
        code = match.group(1)
        block = [line]
        for next_line in lines[index + 1:index + 6]:
            if CODE_RE.match(next_line):
                break
            block.append(next_line)
            if len(PRICE_RE.findall(' '.join(block))) >= 2:
                break

        joined = ' '.join(part.strip() for part in block if part.strip())
        prices = PRICE_RE.findall(joined)
        if len(prices) < 2:
            continue
        price, installation = prices[-2:]
        prefix = joined[:joined.rfind(price)]

        unit = ''
        unit_position = -1
        for candidate in UNITS:
            for unit_match in re.finditer(r'(?<!\w)' + re.escape(candidate) + r'(?!\w)', prefix, re.IGNORECASE):
                if unit_match.start() > unit_position:
                    unit = candidate
                    unit_position = unit_match.start()
        if unit_position < 0:
            continue

        description = prefix[len(code):unit_position].strip(' .-\t')
        description = re.sub(r'\s+', ' ', description)
        description = re.sub(
            r'Poz No\s+Tanım\s+Birim.*?Bedeli \(TL\)',
            '',
            description,
            flags=re.IGNORECASE,
        ).strip()

        if code not in seen:
            records.append([code, description, unit, price, installation])
            seen.add(code)

    if len(records) != 5911:
        raise RuntimeError(f'Elektrik kayıt sayısı beklenenden farklı: {len(records)} (beklenen 5911)')
    return records


def write_javascript(records: list[list[str]], source_url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    metadata = {
        'version': '2026.07.12.26',
        'recordCount': len(records),
        'sourceUrl': source_url,
        'book': {
            'id': 'csidb-electric-2026-07',
            'name': 'ÇŞİDB 2026 Temmuz Elektrik Tesisat Fiyat Listesi',
            'institution': 'Çevre, Şehircilik ve İklim Değişikliği Bakanlığı',
            'period': 'Temmuz 2026',
        },
    }
    content = (
        'window.BYSAY_ELECTRIC_META=' + json.dumps(metadata, ensure_ascii=False, separators=(',', ':')) + ';\n'
        'window.BYSAY_ELECTRIC_RECORDS=' + json.dumps(records, ensure_ascii=False, separators=(',', ':')) + ';\n'
    )
    destination.write_text(content, encoding='utf-8')
    print(f'{destination}: {len(records)} kayıt, {destination.stat().st_size} bayt')


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    work = root / '.build-electric'
    work.mkdir(exist_ok=True)
    pdf_path = work / 'electric-july-2026.pdf'
    text_path = work / 'electric-july-2026.txt'
    output = root / 'generated' / 'electric-data.js'
    source_url = download_pdf(pdf_path)
    records = parse_records(pdf_path, text_path)
    write_javascript(records, source_url, output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
