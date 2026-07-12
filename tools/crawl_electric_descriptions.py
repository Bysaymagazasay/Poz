import base64
import csv
import gzip
import json
import random
import re
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE = 'https://www.birimfiyat.net/'
CODES_FILE = Path('tools/electric_codes.b64')
OUT_JSON = Path('electric_birimfiyat_results.json')
OUT_CSV = Path('electric_birimfiyat_results.csv')
PROGRESS = Path('electric_birimfiyat_progress.json')

codes = json.loads(gzip.decompress(base64.b64decode(CODES_FILE.read_text().strip())).decode('utf-8'))

session = requests.Session()
retry = Retry(total=4, connect=4, read=4, status=4, backoff_factor=0.7,
              status_forcelist=(429, 500, 502, 503, 504), allowed_methods=frozenset(['GET']))
session.mount('https://', HTTPAdapter(max_retries=retry, pool_connections=2, pool_maxsize=2))
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.5',
})

params_base = [
    ('pozNoda', '1'),
    ('bfKitaplar[]', '10'),
    ('bfYil', '31.12.2026'),
    ('siralama', 'pozno'),
    ('bfPozTipleri[]', '140'),
    ('bfPozTipleri[]', '232'),
]

def clean(text):
    return ' '.join(str(text or '').replace('\xa0', ' ').split())

def parse_result(code, html, final_url):
    soup = BeautifulSoup(html, 'html.parser')
    exact = None
    for a in soup.find_all('a', href=True):
        if clean(a.get_text(' ', strip=True)).upper() == code.upper():
            tr = a.find_parent('tr')
            if not tr:
                continue
            cells = [clean(td.get_text(' ', strip=True)) for td in tr.find_all('td')]
            if len(cells) >= 4:
                exact = {
                    'poz': code,
                    'kurum': cells[0] if len(cells) > 0 else '',
                    'tanim': cells[2] if len(cells) > 2 else '',
                    'site_birim': cells[3] if len(cells) > 3 else '',
                    'yayin_tarihi': cells[5] if len(cells) > 5 else '',
                    'kaynak_url': urljoin(final_url, a.get('href')),
                    'durum': 'Birimfiyat.net doğrulandı',
                }
                break
    if exact and exact['tanim']:
        return exact
    return {
        'poz': code,
        'kurum': '',
        'tanim': '',
        'site_birim': '',
        'yayin_tarihi': '',
        'kaynak_url': '',
        'durum': 'Birimfiyat.net üzerinde bulunamadı',
    }

def save(rows):
    OUT_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    with OUT_CSV.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['poz','kurum','tanim','site_birim','yayin_tarihi','kaynak_url','durum'])
        w.writeheader()
        w.writerows(rows)
    PROGRESS.write_text(json.dumps({'completed': len(rows), 'total': len(codes)}, ensure_ascii=False), encoding='utf-8')

rows = []
started = time.time()
for index, code in enumerate(codes, 1):
    params = [('arananSozcuk', code), *params_base]
    try:
        response = session.get(BASE, params=params, timeout=(20, 60))
        response.raise_for_status()
        item = parse_result(code, response.text, response.url)
    except Exception as exc:
        item = {
            'poz': code, 'kurum': '', 'tanim': '', 'site_birim': '', 'yayin_tarihi': '',
            'kaynak_url': '', 'durum': f'Sorgu hatası: {type(exc).__name__}'
        }
    rows.append(item)
    if index % 50 == 0 or index == len(codes):
        save(rows)
        found = sum(1 for row in rows if row['tanim'])
        elapsed = time.time() - started
        print(f'{index}/{len(codes)} tamamlandı | bulunan={found} | süre={elapsed/60:.1f} dk', flush=True)
    time.sleep(0.10 + random.random() * 0.06)

save(rows)
print(json.dumps({
    'total': len(rows),
    'found': sum(1 for row in rows if row['tanim']),
    'missing': sum(1 for row in rows if not row['tanim']),
    'elapsed_minutes': round((time.time() - started) / 60, 2),
}, ensure_ascii=False))
