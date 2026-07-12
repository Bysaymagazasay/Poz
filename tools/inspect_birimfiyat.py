import json, re
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

BASE='https://www.birimfiyat.net/'
s=requests.Session()
s.headers.update({'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'})
r=s.get(BASE,timeout=60)
print('HOME',r.status_code,r.url,len(r.text))
open('home.html','w',encoding='utf-8').write(r.text)

queries=[
 ('minimum',[('arananSozcuk','35.100.1101'),('pozNoda','1')]),
 ('full',[('arananSozcuk','35.100.1101'),('pozNoda','1'),('bfKitaplar[]','10'),('bfYil','31.12.2026'),('siralama','pozno'),('bfPozTipleri[]','140'),('bfPozTipleri[]','232')]),
 ('second',[('arananSozcuk','35.105.1110'),('pozNoda','1'),('bfKitaplar[]','10'),('bfYil','31.12.2026'),('siralama','pozno'),('bfPozTipleri[]','140'),('bfPozTipleri[]','232')]),
]
results=[]
for name,params in queries:
    q=s.get(BASE,params=params,timeout=60)
    open(f'query_{name}.html','w',encoding='utf-8').write(q.text)
    soup=BeautifulSoup(q.text,'html.parser')
    code=params[0][1]
    nodes=[]
    for t in soup.find_all(string=re.compile(re.escape(code))):
        par=t.parent
        nodes.append({'tag':par.name,'class':par.get('class'),'text':' '.join(par.get_text(' ',strip=True).split()),'html':str(par)[:3000]})
    links=[{'href':urljoin(q.url,a.get('href')),'text':' '.join(a.get_text(' ',strip=True).split())} for a in soup.find_all('a',href=True) if code in a.get_text(' ',strip=True) or code in a.get('href','')]
    print('QUERY',name,q.status_code,q.url,len(q.text),'code_count',q.text.count(code),'nodes',len(nodes),'links',len(links))
    print(json.dumps({'nodes':nodes[:20],'links':links[:20]},ensure_ascii=False,indent=2))
    results.append({'name':name,'status':q.status_code,'url':q.url,'length':len(q.text),'code_count':q.text.count(code),'nodes':nodes[:20],'links':links[:20]})
open('query_results.json','w',encoding='utf-8').write(json.dumps(results,ensure_ascii=False,indent=2))
