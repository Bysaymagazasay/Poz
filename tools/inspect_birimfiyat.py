import json, re
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

BASE='https://www.birimfiyat.net/'
s=requests.Session()
s.headers.update({'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'})
params=[('poz-ara',''),('arananSozcuk','35'),('pozNoda','1'),('bfKitaplar[]','10'),('bfYil','31.12.2026'),('siralama','pozno'),('bfPozTipleri[]','140'),('bfPozTipleri[]','232')]
r=s.get(BASE,params=params,timeout=60)
open('browse.html','w',encoding='utf-8').write(r.text)
soup=BeautifulSoup(r.text,'html.parser')
code_re=re.compile(r'^35\.\d{3}\.\d{4}$')
rows=[]
for a in soup.find_all('a',href=True):
    code=' '.join(a.get_text(' ',strip=True).split())
    if code_re.fullmatch(code):
        tr=a.find_parent('tr')
        cells=[' '.join(td.get_text(' ',strip=True).split()) for td in tr.find_all('td')] if tr else []
        rows.append({'code':code,'href':urljoin(r.url,a['href']),'cells':cells})
pages=[]
for a in soup.find_all('a',href=True):
    h=urljoin(r.url,a['href'])
    if 'page=' in h or 'sayfa=' in h:
        pages.append({'text':' '.join(a.get_text(' ',strip=True).split()),'href':h,'class':a.get('class'),'id':a.get('id')})
print('SEARCH',r.status_code,r.url,len(r.text),'ROWS',len(rows),'PAGES',len(pages))
print(json.dumps({'rows':rows[:30],'pages':pages[:100]},ensure_ascii=False,indent=2))
open('browse_results.json','w',encoding='utf-8').write(json.dumps({'status':r.status_code,'url':r.url,'length':len(r.text),'rows':rows,'pages':pages},ensure_ascii=False,indent=2))
