(() => {
  'use strict';

  const VERSION = '20260712-26';
  const DB_NAME = 'BYSAY_POZ_KITAPLARI_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'books';
  const FALLBACK_KEY = 'BYSAY_POZ_KITAPLARI_FALLBACK_V1';

  const normalizeText = value => String(value ?? '').toLocaleLowerCase('tr-TR')
    .replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g,'');
  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g,'').replace(/[–—−]/g,'-').replace(/[),;:]+$/g,'');
  const looksLikePoz = value => /^(?:[A-ZÇĞİÖŞÜ0-9]+[.\/_-]){1,8}[A-ZÇĞİÖŞÜ0-9]+$/.test(normalizePoz(value));
  const extractPoz = value => {
    const direct = normalizePoz(value);
    if (looksLikePoz(direct)) return direct;
    const candidates = String(value ?? '').toUpperCase().match(/[A-ZÇĞİÖŞÜ0-9]+(?:[.\/_-][A-ZÇĞİÖŞÜ0-9]+){1,8}/g) || [];
    return candidates.map(normalizePoz).find(looksLikePoz) || '';
  };
  const parseNumber = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let text = String(value ?? '').trim().replace(/\u00a0/g,'').replace(/\s/g,'').replace(/[^0-9,.-]/g,'');
    if (!text) return NaN;
    const comma=text.lastIndexOf(','), dot=text.lastIndexOf('.');
    if (comma>=0 && dot>=0) text=comma>dot?text.replace(/\./g,'').replace(',','.'):text.replace(/,/g,'');
    else if (comma>=0) text=text.replace(/\./g,'').replace(',','.');
    else if ((text.match(/\./g)||[]).length>1) text=text.replace(/\./g,'');
    const n=Number(text); return Number.isFinite(n)?n:NaN;
  };
  const formatPrice = value => {
    const n=parseNumber(value); if (!Number.isFinite(n)) return '';
    return new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:4}).format(n);
  };
  const isPriceForPoz = (value, poz) => {
    if (!value) return false;
    if (looksLikePoz(value)) return true;
    const digits = normalizePoz(poz).replace(/[^0-9]/g,'');
    const n = parseNumber(value);
    return digits && Number.isFinite(n) && String(Math.trunc(Math.abs(n))) === digits;
  };

  const headerKind = value => {
    const t=normalizeText(value);
    if (!t) return '';
    if (/pozno|poznumarasi|pozkodu|iskalemino|birimfiyatpozno/.test(t)) return 'poz';
    if (/montajbedeli|montajfiyati|montajbirimfiyati/.test(t)) return 'install';
    if (/birimfiyat|pozfiyati|guncelfiyat|2026birimfiyat/.test(t) && !/pozno|pozkodu|montaj/.test(t)) return 'price';
    if (/poztanimi|tanim|aciklama|iskalemiadi|imalatincinsi|tarif/.test(t)) return 'desc';
    if (/^birim$|birimi|olcubirimi/.test(t)) return 'unit';
    return '';
  };

  const detect = grid => {
    const maxCols=Math.max(0,...grid.slice(0,100).map(r=>Array.isArray(r)?r.length:0));
    let best=null;
    for (let r=0;r<Math.min(grid.length,100);r++) {
      const cols={poz:-1,desc:-1,unit:-1,price:-1,install:-1};
      for (let c=0;c<maxCols;c++) {
        const combined=[grid[r]?.[c],grid[r+1]?.[c],grid[r+2]?.[c]].filter(Boolean).join(' ');
        const kind=headerKind(combined);
        if (kind && cols[kind]<0) cols[kind]=c;
      }
      if (cols.poz>=0) {
        const score=Object.values(cols).filter(v=>v>=0).length;
        if (!best || score>best.score) best={row:r,start:r+1,cols,score};
      }
    }
    if (best) {
      const used=new Set([best.cols.poz]);
      for (const key of ['desc','unit','price','install']) {
        const col=best.cols[key];
        if (col>=0 && used.has(col)) best.cols[key]=-1;
        else if (col>=0) used.add(col);
      }
      if (best.cols.price>=0) return best;
    }

    const limit=Math.min(grid.length,400);
    const pozCounts=Array(maxCols).fill(0), unitCounts=Array(maxCols).fill(0), numberCounts=Array(maxCols).fill(0), pozLikeCounts=Array(maxCols).fill(0), textScore=Array(maxCols).fill(0);
    const units=/^(AD|ADET|M|M2|M²|M3|M³|KG|TON|TAKIM|SET|ÇİFT|CIFT|SAAT|GÜN|GUN|LT|LİTRE|LITRE)$/i;
    for (let r=0;r<limit;r++) for (let c=0;c<maxCols;c++) {
      const v=grid[r]?.[c], text=String(v??'').trim();
      if (extractPoz(v)) pozCounts[c]++;
      if (looksLikePoz(v)) pozLikeCounts[c]++;
      if (Number.isFinite(parseNumber(v))) numberCounts[c]++;
      if (units.test(text.replace(/\s+/g,''))) unitCounts[c]++;
      if (text && !Number.isFinite(parseNumber(v))) textScore[c]+=Math.min(text.length,100);
    }
    const poz=pozCounts.indexOf(Math.max(...pozCounts));
    if (poz<0 || pozCounts[poz]<3) return null;
    const candidates=[...Array(maxCols).keys()].filter(c=>c!==poz);
    const unit=[...candidates].sort((a,b)=>unitCounts[b]-unitCounts[a])[0]??-1;
    const desc=[...candidates].filter(c=>c!==unit).sort((a,b)=>textScore[b]-textScore[a])[0]??-1;
    const numeric=[...candidates].filter(c=>c!==unit&&c!==desc).sort((a,b)=>(numberCounts[b]-pozLikeCounts[b]*4)-(numberCounts[a]-pozLikeCounts[a]*4));
    const price=numeric[0]??-1, install=numeric[1]??-1;
    return {row:-1,start:0,cols:{poz,desc,unit,price,install},score:0};
  };

  const parseGrid = (grid, sheetName) => {
    const d=detect(grid); if (!d) return [];
    const out=[];
    for (let r=d.start;r<grid.length;r++) {
      const row=Array.isArray(grid[r])?grid[r]:[];
      const poz=extractPoz(row[d.cols.poz]); if (!poz) continue;
      let rawPrice=d.cols.price>=0?row[d.cols.price]:'';
      let rawInstall=d.cols.install>=0?row[d.cols.install]:'';
      if (isPriceForPoz(rawPrice,poz)) rawPrice='';
      if (isPriceForPoz(rawInstall,poz)) rawInstall='';
      const fiyat=formatPrice(rawPrice), montaj=formatPrice(rawInstall);
      const tanim=d.cols.desc>=0?String(row[d.cols.desc]??'').trim():'';
      const birim=d.cols.unit>=0?String(row[d.cols.unit]??'').trim():'';
      if (!tanim&&!birim&&!fiyat&&!montaj) continue;
      out.push({poz,tanim,birim,fiyat,montaj,kaynak:sheetName});
    }
    return out;
  };

  const saveBook = async book => {
    try {
      const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(DB_NAME,DB_VERSION);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(STORE_NAME))q.result.createObjectStore(STORE_NAME,{keyPath:'id'});};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
      await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).put(book);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
      db.close();
    } catch (error) {
      const books=JSON.parse(localStorage.getItem(FALLBACK_KEY)||'[]').filter(item=>item.id!==book.id);books.push(book);localStorage.setItem(FALLBACK_KEY,JSON.stringify(books));
    }
  };
  const notify = message => {const t=document.getElementById('toast');if(t){t.textContent=message;t.classList.add('show');}};

  const parseFile = async file => {
    if (!window.XLSX) throw new Error('Excel okuyucusu yüklenemedi.');
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',raw:false,cellDates:false});
    const all=[];
    for (const name of wb.SheetNames) {
      const grid=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false});
      all.push(...parseGrid(grid,name));
    }
    const unique=new Map();for(const rec of all)unique.set(normalizePoz(rec.poz),rec);
    return [...unique.values()];
  };

  const bind = (attempt=0) => {
    const input=document.getElementById('pozBookFileInput');
    if (!input) {if(attempt<100)setTimeout(()=>bind(attempt+1),100);return;}
    input.addEventListener('change',async event=>{
      const file=event.target.files?.[0];
      if (!file || file.name.toLowerCase().endsWith('.json')) return;
      event.stopImmediatePropagation(); event.preventDefault(); event.target.value='';
      const progress=document.getElementById('pozBookProgress');progress?.classList.add('show');if(progress)progress.textContent=`${file.name} güvenli biçimde okunuyor…`;
      try {
        const records=await parseFile(file);if(!records.length)throw new Error('Dosyada aktarılabilir poz kaydı bulunamadı.');
        const wrong=records.filter(r=>isPriceForPoz(r.fiyat,r.poz)).length;
        if(wrong)throw new Error(`${wrong} satırda fiyat yerine poz numarası algılandı; kayıt yapılmadı.`);
        const book={id:normalizeText(file.name)||`book-${Date.now()}`,name:file.name,updatedAt:new Date().toISOString(),count:records.length,records};
        await saveBook(book);if(progress)progress.textContent=`${records.length.toLocaleString('tr-TR')} poz doğru sütunlardan kaydedildi. Program yenileniyor…`;notify(`${records.length.toLocaleString('tr-TR')} poz kitabına eklendi.`);setTimeout(()=>location.reload(),900);
      } catch(error){console.error(error);if(progress)progress.textContent=`Hata: ${error?.message||error}`;notify(error?.message||'Poz kitabı yüklenemedi.');}
    },true);
    document.documentElement.dataset.bookImportFixVersion=VERSION;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>bind(),{once:true});else bind();
})();
