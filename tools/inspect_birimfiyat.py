import json, re, sys
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

BASE='https://www.birimfiyat.net/'
s=requests.Session()
s.headers.update({'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'})
r=s.get(BASE,timeout=60)
print('HOME',r.status_code,r.url,len(r.text))
open('home.html','w',encoding='utf-8').write(r.text)
soup=BeautifulSoup(r.text,'html.parser')
info={'url':r.url,'status':r.status_code,'scripts':[],'forms':[],'links':[]}
for sc in soup.find_all('script'):
    src=sc.get('src')
    if src:
        info['scripts'].append(urljoin(r.url,src))
    else:
        txt=sc.get_text('\n')
        if re.search(r'poz|ara|search|api',txt,re.I):
            open(f'inline_{len(info["scripts"])}.js','w',encoding='utf-8').write(txt)
for form in soup.find_all('form'):
    info['forms'].append({
        'action':urljoin(r.url,form.get('action') or ''),
        'method':form.get('method','get'),
        'id':form.get('id'),'class':form.get('class'),
        'inputs':[{'tag':x.name,'name':x.get('name'),'id':x.get('id'),'type':x.get('type'),'value':x.get('value'),'class':x.get('class')} for x in form.find_all(['input','select','textarea','button'])]
    })
for a in soup.find_all('a',href=True):
    h=urljoin(r.url,a['href'])
    t=' '.join(a.get_text(' ',strip=True).split())
    if re.search(r'poz|ara|search',h+' '+t,re.I): info['links'].append({'href':h,'text':t})
open('inspect.json','w',encoding='utf-8').write(json.dumps(info,ensure_ascii=False,indent=2))
print(json.dumps(info,ensure_ascii=False,indent=2))
for i,u in enumerate(info['scripts']):
    try:
        rr=s.get(u,timeout=60)
        print('SCRIPT',i,rr.status_code,u,len(rr.content))
        fn=f'script_{i:02d}.js'
        open(fn,'wb').write(rr.content)
        txt=rr.text
        hits=[]
        for pat in [r'https?://[^\"\']+',r'/[A-Za-z0-9_\-/]*(?:poz|ara|search|api)[A-Za-z0-9_\-/?=&.]*']:
            hits += re.findall(pat,txt,re.I)
        if hits: print('HITS',i,sorted(set(hits))[:100])
    except Exception as e: print('SCRIPTERR',u,repr(e))
