(() => {
  'use strict';

  const VERSION = '20260712-26';
  const NEXT_STAGE = 'DSI';
  const loadScript = source => new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=source;s.onload=resolve;s.onerror=()=>reject(new Error(`Program dosyası yüklenemedi: ${source}`));document.body.appendChild(s);});
  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g,'').replace(/[–—−]/g,'-');
  const parseNumber = value => {if(typeof value==='number')return Number.isFinite(value)?value:NaN;let t=String(value??'').trim().replace(/\s/g,'').replace(/[^0-9,.-]/g,'');if(!t)return NaN;const c=t.lastIndexOf(','),d=t.lastIndexOf('.');if(c>=0&&d>=0)t=c>d?t.replace(/\./g,'').replace(',','.'):t.replace(/,/g,'');else if(c>=0)t=t.replace(/\./g,'').replace(',','.');else if((t.match(/\./g)||[]).length>1)t=t.replace(/\./g,'');const n=Number(t);return Number.isFinite(n)?n:NaN;};
  const formatPrice = value => new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
  const bookCode = poz => {const c=normalizePoz(poz);if(/^(35|36)\./.test(c))return'ELK';if(/^25\./.test(c))return'MEK';if(/^(15|16|17|18|19|20|21|22|23|24|77)\./.test(c))return'İNŞ';return'ÖZL';};

  const resetInstitutionalStage = () => {
    delete window.BYSAY_KURUM_BOOKS_B64;delete window.BYSAY_INSTITUTIONAL_BOOKS_B64;delete window.BYSAY_LOAD_INSTITUTIONAL_BOOKS;delete window.BYSAY_INSTITUTIONAL_BOOK_ERROR;
    window.BYSAY_INSTITUTIONAL_BOOKS_LOADED=false;window.BYSAY_INSTITUTIONAL_BOOKS_META=null;window.BYSAY_INSTITUTIONAL_BOOK_CATALOG=[];window.BYSAY_INSTITUTIONAL_BOOK_RECORDS=[];window.BYSAY_ACTIVE_INSTITUTIONAL_STAGE=NEXT_STAGE;window.BYSAY_NEXT_INSTITUTIONAL_BOOK='DSİ';
  };

  const addMontajDemontajRecords = () => {
    const source=Array.isArray(window.POZ_DATA)?window.POZ_DATA:[];const map=new Map();
    source.forEach(item=>map.set(normalizePoz(item.poz),{...item,kitap:item.kitap||item.disiplin||bookCode(item.poz),kitapKaynak:item.kitapKaynak||(!item.kaynak?'ÇŞİDB Temmuz 2026':'')}));
    let added=0;
    for(const item of source){const base=normalizePoz(item.poz);if(!base||/-(M|D)$/.test(base))continue;const montaj=parseNumber(item.montaj);if(!Number.isFinite(montaj))continue;const common={...item,kitap:item.kitap||item.disiplin||bookCode(item.poz),kitapKaynak:item.kitapKaynak||(!item.kaynak?'ÇŞİDB Temmuz 2026':'')};
      const m=`${base}-M`,d=`${base}-D`;
      if(!map.has(m)){map.set(m,{...common,poz:`${item.poz}-M`,tanim:`Mont. ${item.tanim||''}`.trim(),fiyat:formatPrice(montaj),ozelTur:'montaj'});added++;}
      if(!map.has(d)){map.set(d,{...common,poz:`${item.poz}-D`,tanim:`Demont. ${item.tanim||''}`.trim(),fiyat:formatPrice(montaj/2),ozelTur:'demontaj'});added++;}
    }
    window.POZ_DATA=[...map.values()];window.POZ_META={...(window.POZ_META||{}),recordCount:window.POZ_DATA.length,specialRecordCount:added};
  };

  const addPozAliases = () => {
    const source=Array.isArray(window.POZ_DATA)?window.POZ_DATA:[];const exact=new Map(source.map(i=>[normalizePoz(i.poz),i]));const aliases=[];
    for(const item of source){const original=normalizePoz(item.poz);if(/^\d+(?:\.\d+){2,}(?:-(?:D|M))?$/.test(original))continue;const suffix=original.match(/-(D|M)$/)?.[0]||'';const base=suffix?original.slice(0,-suffix.length):original;const variants=new Set([base.replace(/[\/_-]+/g,'.'),base.replace(/[._-]+/g,'/'),base.replace(/[^A-ZÇĞİÖŞÜ0-9]/g,'')]);for(const v of variants){const alias=v+suffix,key=normalizePoz(alias);if(!key||key===original||exact.has(key))continue;const rec={...item,poz:alias,pozAlias:true,orijinalPoz:item.poz};exact.set(key,rec);aliases.push(rec);}}
    if(aliases.length)window.POZ_DATA=[...source,...aliases];window.BYSAY_POZ_ALIAS_COUNT=aliases.length;
  };

  (async()=>{
    try{if(typeof window.BYSAY_LOAD_INSAAT!=='function')throw new Error('İnşaat veri yükleyicisi bulunamadı.');await window.BYSAY_LOAD_INSAAT();}catch(error){console.error(error);window.BYSAY_DATA_LOAD_ERROR=error?.message||String(error);}
    resetInstitutionalStage();
    try{if(typeof window.BYSAY_LOAD_USER_BOOKS==='function')await window.BYSAY_LOAD_USER_BOOKS();}catch(error){console.error(error);window.BYSAY_USER_BOOK_ERROR=error?.message||String(error);}
    try{if(typeof window.BYSAY_LOAD_ELECTRIC_2026!=='function')throw new Error('Elektrik fiyat düzeltme yükleyicisi bulunamadı.');await window.BYSAY_LOAD_ELECTRIC_2026();}catch(error){console.error(error);window.BYSAY_ELECTRIC_LOAD_ERROR=error?.message||String(error);}
    addMontajDemontajRecords();addPozAliases();
    try{await loadScript(`app.js?v=${VERSION}`);await loadScript(`word-xml-sanitize.js?v=${VERSION}`);await loadScript(`word-import-all-20260712.js?v=${VERSION}`);await loadScript(`final-ui-20260712.js?v=${VERSION}`);await loadScript(`book-catalog-20260712.js?v=${VERSION}`);}catch(error){console.error(error);alert(error?.message||'Program başlatılırken bir hata oluştu.');return;}
    const errors=[];if(window.BYSAY_DATA_LOAD_ERROR)errors.push(`İnşaat fiyat listesi: ${window.BYSAY_DATA_LOAD_ERROR}`);if(window.BYSAY_USER_BOOK_ERROR)errors.push(`Kayıtlı poz kitapları: ${window.BYSAY_USER_BOOK_ERROR}`);if(window.BYSAY_ELECTRIC_LOAD_ERROR)errors.push(`Elektrik fiyat listesi: ${window.BYSAY_ELECTRIC_LOAD_ERROR}`);
    if(errors.length)setTimeout(()=>{const t=document.getElementById('toast');if(t){t.textContent=errors.join(' • ');t.classList.add('show');}},150);
  })();
})();
