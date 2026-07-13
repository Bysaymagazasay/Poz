#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import os
import re
import sys
import time
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin

import fitz  # PyMuPDF
import requests
from bs4 import BeautifulSoup

INDEX_URL = "https://yfk.csb.gov.tr/birim-fiyatlar-i-100468"
OUT_DIR = Path("generated/mechanical-history")
CACHE_DIR = Path(".cache/mechanical-history")
TIMEOUT = 90
USER_AGENT = "BYSAY-Mechanical-Price-History/1.0 (+official YFK archive parser)"

MECHANICAL_START_MARKERS = (
    "SIHHI TESISAT BIRIM FIYAT",
    "YAPI ISLERI SIHHI TESISAT",
    "MAKINA TESISATI BIRIM FIYAT",
    "MEKANIK TESISAT BIRIM FIYAT",
)
MECHANICAL_END_MARKERS = (
    "KUVVETLI AKIM IC TESISATI",
    "ELEKTRIK TESISATI BIRIM FIYAT",
    "YAPI ISLERI KUVVETLI AKIM",
)

UNIT_PATTERN = re.compile(
    r"(?P<unit>(?:100\s*)?(?:Adet|Ad\.?|m²|m2|m³|m3|m|kg|gr|lt|Litre|L|Takım|Tak\.?|Set|Çift|kW|W|MW|kcal/h|kcal\/h|m³/h|m3/h|m²/h|m2/h|m/h|ton|cm|mm|Sa\.?|Saat|Gün|Ay|Nokta|Grup|Cihaz|Komp\.?|Paket|Rulo|Levha|Plaka|Boy|Düzine|Yüz|Bin|ha|da|dm²|dm3|cm²|cm3))\s*$",
    re.IGNORECASE,
)
PRICE_PATTERN = re.compile(r"(?<!\d)(\d{1,3}(?:[. ]\d{3})*(?:,\d{1,4})|\d+(?:,\d{1,4})|\d+(?:\.\d{2,4}))(?!\d)")
CODE_PATTERN = re.compile(
    r"(?<![A-Z0-9])(?:Y\.)?(?:\d{2,3}(?:[.\-/]\d{2,4}){1,3}(?:[A-Z]\d*|[A-Z])?(?:[\-/][A-Z0-9]+)*|\d{3}-\d{3}(?:[\-/]\d{1,4})?)(?![A-Z0-9])",
    re.IGNORECASE,
)


def tr_ascii(value: str) -> str:
    table = str.maketrans({"İ":"I","I":"I","ı":"i","Ş":"S","ş":"s","Ğ":"G","ğ":"g","Ü":"U","ü":"u","Ö":"O","ö":"o","Ç":"C","ç":"c"})
    value = value.translate(table)
    value = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in value if not unicodedata.combining(ch)).upper()


def clean_space(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def normalize_code(value: str) -> str:
    value = clean_space(value).upper().replace("–", "-").replace("—", "-").replace("−", "-")
    value = re.sub(r"\s+", "", value)
    value = re.sub(r"^Y\.", "Y.", value)
    return value.rstrip(".,;:")


def parse_price(value: str) -> float | None:
    text = clean_space(value).replace(" ", "")
    if not text:
        return None
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    else:
        parts = text.split(".")
        if len(parts) > 2:
            text = "".join(parts[:-1]) + "." + parts[-1]
    try:
        amount = float(text)
    except ValueError:
        return None
    return amount if amount > 0 else None


def period_sort_key(label: str) -> tuple[int, int]:
    match = re.search(r"(19\d{2}|20\d{2})(?:\s*/\s*(\d+))?", label)
    if not match:
        return (0, 0)
    return (int(match.group(1)), int(match.group(2) or 9))


def validity_date(label: str) -> str:
    year, part = period_sort_key(label)
    if not year:
        return ""
    if part == 1:
        return f"{year}-01-01"
    if part == 2:
        return f"{year}-06-01" if year == 2022 else f"{year}-07-01"
    if part == 3:
        return f"{year}-07-01"
    if part == 4:
        return f"{year}-10-01"
    if part == 5:
        return f"{year}-12-01"
    return f"{year}-01-01"


@dataclass
class Source:
    period: str
    url: str
    kind: str = "price_book"
    status: str = "pending"
    pages: int = 0
    mechanical_start_page: int = 0
    mechanical_end_page: int = 0
    parsed_rows: int = 0
    note: str = ""


@dataclass
class Record:
    poz_no: str
    unit: str
    price: float
    period: str
    validity_date: str
    source_url: str
    source_page: int
    raw_excerpt: str


def session_get(url: str, *, binary: bool = False) -> bytes | str:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/pdf,text/html,*/*"}
    last_error = None
    for attempt in range(5):
        try:
            response = requests.get(url, headers=headers, timeout=TIMEOUT)
            response.raise_for_status()
            return response.content if binary else response.text
        except Exception as exc:
            last_error = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"İndirilemedi: {url}: {last_error}")


def collect_sources() -> tuple[list[Source], list[Source]]:
    html = session_get(INDEX_URL)
    soup = BeautifulSoup(html, "html.parser")
    price_sources: list[Source] = []
    mapping_sources: list[Source] = []

    current_period = ""
    in_price_archive = False
    for element in soup.find_all(["h1", "h2", "h3", "h4", "p", "div", "tr", "a"]):
        text = clean_space(element.get_text(" ", strip=True))
        upper = tr_ascii(text)
        if "BIRIM FIYATLAR (1933 - 2018" in upper:
            in_price_archive = True
        period_match = re.fullmatch(r"(19\d{2}|20\d{2})(?:\s*/\s*(\d+))?", text)
        if period_match:
            current_period = text.replace(" ", "")
        if element.name != "a":
            continue
        href = element.get("href")
        if not href:
            continue
        url = urljoin(INDEX_URL, href)
        anchor = clean_space(element.get_text(" ", strip=True))
        anchor_upper = tr_ascii(anchor)
        parent_text = clean_space(element.parent.get_text(" ", strip=True)) if element.parent else anchor
        parent_periods = re.findall(r"(?:19\d{2}|20\d{2})(?:\s*/\s*\d+)?", parent_text)
        label = current_period or (parent_periods[0].replace(" ", "") if parent_periods else "")
        if in_price_archive and re.fullmatch(r"(?:19\d{2}|20\d{2})(?:/\d+)?", anchor.replace(" ", "")):
            label = anchor.replace(" ", "")
        if "DEGISTIRILEN POZ NUMARALARI" in anchor_upper:
            mapping_sources.append(Source(period=label or "unknown", url=url, kind="code_map"))
        elif "INSAAT VE TESISAT BIRIM FIYATLARI" in anchor_upper or (in_price_archive and label):
            if url.lower().endswith(".pdf") or "webdosya.csb.gov.tr" in url:
                price_sources.append(Source(period=label or "unknown", url=url))

    # Fallback: the page structure sometimes hides period labels in siblings.
    dedup: dict[str, Source] = {}
    for src in price_sources:
        if src.url not in dedup or period_sort_key(src.period) > period_sort_key(dedup[src.url].period):
            dedup[src.url] = src
    price_sources = sorted(dedup.values(), key=lambda s: period_sort_key(s.period), reverse=True)

    map_dedup = {src.url: src for src in mapping_sources}
    mapping_sources = sorted(map_dedup.values(), key=lambda s: period_sort_key(s.period), reverse=True)
    return price_sources, mapping_sources


def download_pdf(source: Source) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^0-9A-Za-z_-]+", "_", source.period)
    path = CACHE_DIR / f"{source.kind}_{safe}_{abs(hash(source.url))}.pdf"
    if not path.exists() or path.stat().st_size < 1024:
        data = session_get(source.url, binary=True)
        path.write_bytes(data)
    return path


def page_texts(doc: fitz.Document) -> list[str]:
    texts = []
    for page in doc:
        text = page.get_text("text", sort=True) or ""
        texts.append(text)
    return texts


def detect_mechanical_range(texts: list[str]) -> tuple[int, int] | None:
    normalized = [tr_ascii(text) for text in texts]
    start_candidates = []
    for index, text in enumerate(normalized):
        if index < 5:
            continue
        score = sum(marker in text for marker in MECHANICAL_START_MARKERS)
        if score and ("POZ NO" in text or "BIRIM FIYAT" in text or len(text) < 4000):
            start_candidates.append(index)
    if not start_candidates:
        return None
    start = start_candidates[0]
    end = len(texts)
    for index in range(start + 5, len(texts)):
        text = normalized[index]
        if any(marker in text for marker in MECHANICAL_END_MARKERS):
            end = index
            break
    if end <= start:
        return None
    return start, end


def candidate_blocks(text: str) -> Iterable[tuple[str, str]]:
    matches = list(CODE_PATTERN.finditer(text))
    for index, match in enumerate(matches):
        code = normalize_code(match.group(0))
        if re.fullmatch(r"(?:19|20)\d{2}[./-]\d{1,2}", code):
            continue
        if len(re.sub(r"\D", "", code)) < 5:
            continue
        block_end = matches[index + 1].start() if index + 1 < len(matches) else min(len(text), match.end() + 900)
        block = text[match.start():block_end]
        yield code, block


def parse_block(code: str, block: str) -> tuple[str, float, str] | None:
    lines = [clean_space(line) for line in block.splitlines() if clean_space(line)]
    joined = " ".join(lines[:18])
    prices = list(PRICE_PATTERN.finditer(joined))
    if not prices:
        return None
    for price_match in reversed(prices):
        price = parse_price(price_match.group(1))
        if price is None:
            continue
        prefix = joined[:price_match.start()].rstrip(" :-")
        unit_window = prefix[-80:]
        unit_match = UNIT_PATTERN.search(unit_window)
        if not unit_match:
            continue
        unit = clean_space(unit_match.group("unit")).replace(".", "")
        if price > 1e12:
            continue
        return unit, price, joined[:350]
    return None


def parse_price_book(source: Source) -> list[Record]:
    path = download_pdf(source)
    doc = fitz.open(path)
    source.pages = doc.page_count
    texts = page_texts(doc)
    detected = detect_mechanical_range(texts)
    if not detected:
        source.status = "mechanical_section_not_found"
        source.note = "PDF içinde mekanik tesisat başlangıç/bitiş başlıkları bulunamadı; OCR veya elle kontrol gerekebilir."
        return []
    start, end = detected
    source.mechanical_start_page = start + 1
    source.mechanical_end_page = end
    records: dict[str, Record] = {}
    for page_index in range(start, end):
        text = texts[page_index]
        for code, block in candidate_blocks(text):
            parsed = parse_block(code, block)
            if not parsed:
                continue
            unit, price, excerpt = parsed
            record = Record(
                poz_no=code,
                unit=unit,
                price=price,
                period=source.period,
                validity_date=validity_date(source.period),
                source_url=source.url,
                source_page=page_index + 1,
                raw_excerpt=excerpt,
            )
            # Same book may repeat a code in contents/index. Prefer the later detailed occurrence.
            old = records.get(code)
            if old is None or page_index + 1 > old.source_page:
                records[code] = record
    source.parsed_rows = len(records)
    source.status = "ok" if records else "no_rows_parsed"
    return list(records.values())


def parse_code_map(source: Source) -> list[dict[str, str]]:
    path = download_pdf(source)
    doc = fitz.open(path)
    text = "\n".join(page.get_text("text", sort=True) or "" for page in doc)
    rows = []
    for line in text.splitlines():
        codes = [normalize_code(item.group(0)) for item in CODE_PATTERN.finditer(line)]
        unique = []
        for code in codes:
            if code not in unique:
                unique.append(code)
        if len(unique) >= 2:
            rows.append({
                "mapping_period": source.period,
                "old_poz_no": unique[0],
                "new_poz_no": unique[1],
                "source_url": source.url,
                "evidence": clean_space(line)[:500],
                "mapping_type": "official",
            })
    source.status = "ok" if rows else "no_mapping_rows_parsed"
    source.parsed_rows = len(rows)
    return rows


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def build_master(history: list[Record], mappings: list[dict[str, str]]) -> list[dict]:
    old_to_new: dict[str, tuple[str, dict[str, str]]] = {}
    for mapping in mappings:
        old_to_new[normalize_code(mapping["old_poz_no"])] = (normalize_code(mapping["new_poz_no"]), mapping)

    by_code: dict[str, list[Record]] = defaultdict(list)
    for record in history:
        by_code[normalize_code(record.poz_no)].append(record)
    for records in by_code.values():
        records.sort(key=lambda row: (period_sort_key(row.period), row.source_page), reverse=True)

    master: list[dict] = []
    consumed_old = set()
    for code, records in sorted(by_code.items()):
        if code in old_to_new:
            new_code, mapping = old_to_new[code]
            if new_code in by_code:
                consumed_old.add(code)
                continue
        latest = records[0]
        previous = records[1] if len(records) > 1 else None
        alternate_old = sorted(old for old, (new, _map) in old_to_new.items() if new == code and old in by_code)
        master.append({
            "poz_no": code,
            "unit": latest.unit,
            "latest_published_price": latest.price,
            "latest_period": latest.period,
            "validity_date": latest.validity_date,
            "source_url": latest.source_url,
            "source_page": latest.source_page,
            "previous_period": previous.period if previous else "",
            "previous_price": previous.price if previous else "",
            "publication_count": len(records),
            "old_poz_numbers": " | ".join(alternate_old),
            "new_poz_no": "",
            "number_status": "current_with_official_old_numbers" if alternate_old else "same_number_latest",
            "mapping_confidence": "official" if alternate_old else "not_needed",
            "control_note": "Poz adı ikinci işlemde doldurulacak.",
        })

    # Old codes with an official new code absent from parsed books remain visible for control.
    for old_code in sorted(consumed_old):
        new_code, mapping = old_to_new[old_code]
        if new_code not in by_code:
            latest = by_code[old_code][0]
            master.append({
                "poz_no": old_code,
                "unit": latest.unit,
                "latest_published_price": latest.price,
                "latest_period": latest.period,
                "validity_date": latest.validity_date,
                "source_url": latest.source_url,
                "source_page": latest.source_page,
                "previous_period": "",
                "previous_price": "",
                "publication_count": len(by_code[old_code]),
                "old_poz_numbers": "",
                "new_poz_no": new_code,
                "number_status": "officially_changed_new_code_not_found",
                "mapping_confidence": "official",
                "control_note": "Yeni poz numarası kitaplardan ayrıştırılamadı; kontrol gerekli.",
            })

    master.sort(key=lambda row: normalize_code(row["poz_no"]))
    return master


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sources, mapping_sources = collect_sources()
    print(f"Found {len(sources)} price books and {len(mapping_sources)} mapping documents")

    history: list[Record] = []
    all_sources: list[Source] = []
    for index, source in enumerate(sources, 1):
        print(f"[{index}/{len(sources)}] {source.period} {source.url}", flush=True)
        try:
            rows = parse_price_book(source)
            history.extend(rows)
        except Exception as exc:
            source.status = "error"
            source.note = str(exc)[:1000]
            print(f"ERROR {source.period}: {exc}", file=sys.stderr)
        all_sources.append(source)

    mappings: list[dict[str, str]] = []
    for source in mapping_sources:
        print(f"Mapping {source.period} {source.url}", flush=True)
        try:
            mappings.extend(parse_code_map(source))
        except Exception as exc:
            source.status = "error"
            source.note = str(exc)[:1000]
        all_sources.append(source)

    # Deduplicate raw history by exact code+period, preferring later detailed page.
    dedup: dict[tuple[str, str], Record] = {}
    for row in history:
        key = (normalize_code(row.poz_no), row.period)
        old = dedup.get(key)
        if old is None or row.source_page > old.source_page:
            dedup[key] = row
    history = sorted(dedup.values(), key=lambda row: (period_sort_key(row.period), normalize_code(row.poz_no)), reverse=True)
    master = build_master(history, mappings)

    write_csv(
        OUT_DIR / "mechanical_master_latest.csv",
        ["poz_no","unit","latest_published_price","latest_period","validity_date","source_url","source_page","previous_period","previous_price","publication_count","old_poz_numbers","new_poz_no","number_status","mapping_confidence","control_note"],
        master,
    )
    write_csv(
        OUT_DIR / "mechanical_history_raw.csv",
        ["poz_no","unit","price","period","validity_date","source_url","source_page","raw_excerpt"],
        (asdict(row) for row in history),
    )
    write_csv(
        OUT_DIR / "mechanical_code_map.csv",
        ["mapping_period","old_poz_no","new_poz_no","source_url","evidence","mapping_type"],
        mappings,
    )
    write_csv(
        OUT_DIR / "mechanical_sources.csv",
        ["period","url","kind","status","pages","mechanical_start_page","mechanical_end_page","parsed_rows","note"],
        (asdict(source) for source in all_sources),
    )

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "official_index_url": INDEX_URL,
        "price_books_found": len(sources),
        "mapping_documents_found": len(mapping_sources),
        "raw_records": len(history),
        "master_records": len(master),
        "official_code_mappings": len(mappings),
        "successful_price_books": sum(1 for s in sources if s.status == "ok"),
        "unparsed_price_books": sum(1 for s in sources if s.status != "ok"),
        "note": "Poz isimleri bu aşamada özellikle alınmamıştır. Eski/yeni pozlar yalnız resmî değişiklik listesi varsa birleştirilmiştir.",
    }
    import json
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(summary)

    # Fail only if no useful output was produced; partial archive parsing is committed for review.
    return 0 if master else 2


if __name__ == "__main__":
    raise SystemExit(main())
