import base64
import csv
import gzip
import json
import random
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
target = set(codes)
prefixes = sorted({'.'.join(code.split('.')[:2]) for code in codes})

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

def parse_page(html, final_url):
    soup = BeautifulSoup(html, 'html.parser')
    found = []
    for a in soup.find_all('a', href=True):
        code = clean(a.get_text(' ', strip=True)).upper()
        if code not in target:
            continue
        tr = a.find_parent('tr')
        if not tr:
            continue
        cells = [clean(td.get_text(' ', strip=True)) for td in tr.find_all('td')]
        if len(cells) < 4:
            continue
        found.append({
            'poz': code,
            'kurum': cells[0] if len(cells) > 0 else '',
            'tanim': cells[2] if len(cells) > 2 else '',
            'site_birim': cells[3] if len(cells) > 3 else '',
            'yayin_tarihi': cells[5] if len(cells) > 5 else '',
            'kaynak_url': urljoin(final_url, a.get('href')),
            'durum': 'Birimfiyat.net doğrulandı',
        })
    return found

def save_map(result_map, requests_done, stage):
    rows = [result_map.get(code, {
        'poz': code, 'kurum': '', 'tanim': '', 'site_birim': '', 'yayin_tarihi': '',
        'kaynak_url': '', 'durum': 'Birimfiyat.net üzerinde bulunamadı'
    }) for code in codes]
    OUT_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    with OUT_CSV.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['poz','kurum','tanim','site_birim','yayin_tarihi','kaynak_url','durum'])
        w.writeheader()
        w.writerows(rows)
    PROGRESS.write_text(json.dumps({
        'completed': len(result_map), 'total': len(codes), 'requests': requests_done, 'stage': stage
    }, ensure_ascii=False), encoding='utf-8')

result_map = {}
requests_done = 0
started = time.time()

# Her 35.xxx poz grubu, birimfiyat.net sonuç sayfalarından okunur.
for prefix_index, prefix in enumerate(prefixes, 1):
    page = 1
    seen_for_prefix = set()
    while page <= 150:
        params = [('arananSozcuk', prefix), *params_base, ('sayfa', str(page))]
        response = session.get(BASE, params=params, timeout=(20, 60))
        response.raise_for_status()
        requests_done += 1
        page_rows = parse_page(response.text, response.url)
        new_codes = []
        for item in page_rows:
            code = item['poz']
            if code not in seen_for_prefix:
                seen_for_prefix.add(code)
                new_codes.append(code)
            result_map[code] = item
        if not page_rows or (page > 1 and not new_codes):
            break
        page += 1
        time.sleep(0.08 + random.random() * 0.05)
    save_map(result_map, requests_done, f'önek {prefix_index}/{len(prefixes)}')
    print(f'{prefix_index}/{len(prefixes)} önek tamamlandı: {prefix} | bulunan={len(result_map)} | istek={requests_done}', flush=True)

# Sayfalarda bulunmayan pozlar gerçekten tek tek sorgulanır; tanım hiçbir zaman üretilmez.
missing = [code for code in codes if code not in result_map]
for index, code in enumerate(missing, 1):
    try:
        params = [('arananSozcuk', code), *params_base]
        response = session.get(BASE, params=params, timeout=(20, 60))
        response.raise_for_status()
        requests_done += 1
        items = parse_page(response.text, response.url)
        exact = next((item for item in items if item['poz'] == code), None)
        if exact:
            result_map[code] = exact
    except Exception as exc:
        result_map[code] = {
            'poz': code, 'kurum': '', 'tanim': '', 'site_birim': '', 'yayin_tarihi': '',
            'kaynak_url': '', 'durum': f'Sorgu hatası: {type(exc).__name__}'
        }
    if index % 50 == 0:
        save_map(result_map, requests_done, f'tekil {index}/{len(missing)}')
    time.sleep(0.10 + random.random() * 0.06)

save_map(result_map, requests_done, 'tamamlandı')
rows = json.loads(OUT_JSON.read_text(encoding='utf-8'))
print(json.dumps({
    'total': len(rows),
    'found': sum(1 for row in rows if row['tanim']),
    'missing': sum(1 for row in rows if not row['tanim']),
    'requests': requests_done,
    'elapsed_minutes': round((time.time() - started) / 60, 2),
}, ensure_ascii=False))
