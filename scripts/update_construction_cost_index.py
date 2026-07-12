#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SOURCE_URL = "https://www.hakedis.org/endeksler/insaat-maliyet-endeksi-ve-degisim-orani"
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "construction-cost-index.json"
MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"]


def parse_number(value: str) -> float:
    text = value.strip().replace("\xa0", "").replace(" ", "")
    text = re.sub(r"[^0-9,.-]", "", text)
    if not text:
        raise ValueError("empty number")
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".") if text.rfind(",") > text.rfind(".") else text.replace(",", "")
    elif "," in text:
        text = text.replace(".", "").replace(",", ".")
    elif text.count(".") > 1:
        text = text.replace(".", "")
    return float(text)


def extract_rows(html: str) -> dict[str, list[float]]:
    soup = BeautifulSoup(html, "html.parser")
    years: dict[str, list[float]] = {}

    for tr in soup.select("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.select("th,td")]
        if not cells or not re.fullmatch(r"20\d{2}", cells[0]):
            continue
        values: list[float] = []
        for cell in cells[1:13]:
            try:
                values.append(parse_number(cell))
            except ValueError:
                break
        if values:
            years[cells[0]] = values

    if years:
        return years

    text = " ".join(soup.stripped_strings)
    for match in re.finditer(r"\b(20\d{2})\b\s+((?:\d{1,4}(?:[.,]\d+)?\s+){1,12})", text):
        year = match.group(1)
        tokens = re.findall(r"\d{1,4}(?:[.,]\d+)?", match.group(2))[:12]
        values = []
        for token in tokens:
            try:
                values.append(parse_number(token))
            except ValueError:
                break
        if values:
            years[year] = values

    return years


def load_existing() -> dict:
    if OUTPUT.exists():
        return json.loads(OUTPUT.read_text(encoding="utf-8"))
    return {}


def main() -> None:
    response = requests.get(SOURCE_URL, timeout=40, headers={"User-Agent":"BYSAY-Poz-Index-Updater/1.0"})
    response.raise_for_status()
    extracted = extract_rows(response.text)
    if not extracted:
        raise RuntimeError("İnşaat Maliyet Endeksi tablosu ayrıştırılamadı")

    existing = load_existing()
    years: dict[str, list[dict]] = {}
    for year, values in sorted(extracted.items()):
        years[year] = [
            {"month": index + 1, "monthName": MONTHS[index], "index": value}
            for index, value in enumerate(values)
        ]

    latest_year = max(int(year) for year, values in extracted.items() if values)
    latest_values = extracted[str(latest_year)]
    latest_month = len(latest_values)
    latest_value = latest_values[-1]

    payload = {
        "schemaVersion": 1,
        "indexName": "TÜİK İnşaat Maliyet Endeksi",
        "method": "Eski yıllık birim fiyatlar için kaynak yıl Ocak endeksi; hedef için yayımlanmış en son aylık endeks kullanılır.",
        "officialSource": "Türkiye İstatistik Kurumu (TÜİK)",
        "mirrorSource": SOURCE_URL,
        "sourceNote": "Hakediş.org tablosu verilerin güncel olarak TÜİK sitesinden alındığını belirtir.",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "latest": {
            "year": latest_year,
            "month": latest_month,
            "monthName": MONTHS[latest_month - 1],
            "index": latest_value,
        },
        "years": years,
    }

    for key, value in existing.items():
        if key not in payload and key not in {"years", "latest", "updatedAt"}:
            payload[key] = value

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {OUTPUT}: {latest_year}-{latest_month:02d} = {latest_value}")


if __name__ == "__main__":
    main()
