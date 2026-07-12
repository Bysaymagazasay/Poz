(() => {
  'use strict';

  const VERSION = '20260712-29';
  const LOCAL_CACHE_KEY = 'BYSAY_LEGACY_POZ_CACHE_V1';
  const INDEX_URL = `data/construction-cost-index.json?v=${VERSION}`;
  const STATIC_CACHE_URL = `data/legacy-poz-cache.json?v=${VERSION}`;
  const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const FALLBACK_INDEX = {
    indexName:'TÜİK İnşaat Maliyet Endeksi',
    officialSource:'Türkiye İstatistik Kurumu (TÜİK)',
    mirrorSource:'https://www.hakedis.org/endeksler/insaat-maliyet-endeksi-ve-degisim-orani',
    latest:{year:2026,month:5,monthName:'Mayıs',index:2412.77},
    january:{2015:97.13,2016:108.19,2017:124.69,2018:144.92,2019:184.83,2020:202.04,2021:258.24,2022:464.60,2023:829.42,2024:1392.33,2025:1762.81,2026:2210.24}
  };

  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g,'').replace(/[–—−]/g,'-');
  const parseNumber = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let text = String(value ?? '').trim().replace(/\u00a0/g,'').replace(/\s/g,'').replace(/[^0-9,.-]/g,'');
    if (!text) return NaN;
    const comma = text.lastIndexOf(','), dot = text.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) text = comma > dot ? text.replace(/\./g,'').replace(',','.') : text.replace(/,/g,'');
    else if (comma >= 0) text = text.replace(/\./g,'').replace(',','.');
    else if ((text.match(/\./g)||[]).length > 1) text = text.replace(/\./g,'');
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  };
  const formatPrice = value => new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
  const readLocal = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  };
  const writeLocal = records => localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(records));
  const fetchJson = async url => {
    const response = await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`, {cache:'no-store'});
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  };

  const state = {index:null, staticRecords:[], localRecords:[], map:new Map()};

  const getMonthEntry = (year, month = 1) => {
    const index = state.index;
    const list = index?.years?.[String(year)];
    if (Array.isArray(list)) {
      const exact = list.find(item => Number(item.month) === Number(month));
      if (exact && Number.isFinite(Number(exact.index))) return {...exact, year:Number(year)};
      const first = list.find(item => Number.isFinite(Number(item.index)));
      if (first) return {...first, year:Number(year)};
    }
    const fallback = FALLBACK_INDEX.january[Number(year)];
    return Number.isFinite(fallback) ? {year:Number(year),month:1,monthName:'Ocak',index:fallback} : null;
  };

  const latestEntry = () => {
    const latest = state.index?.latest || FALLBACK_INDEX.latest;
    return {...latest, index:Number(latest.index)};
  };

  const calculate = ({year, month = 1, price}) => {
    const source = getMonthEntry(Number(year), Number(month) || 1);
    const target = latestEntry();
    const oldPrice = parseNumber(price);
    if (!source || !target || !Number.isFinite(oldPrice) || oldPrice <= 0 || !Number.isFinite(source.index) || source.index <= 0) return null;
    const factor = target.index / Number(source.index);
    return {
      originalPrice:oldPrice,
      updatedPrice:oldPrice * factor,
      factor,
      source,
      target
    };
  };

  const disciplineOf = poz => {
    const code = normalizePoz(poz).replace(/-(D|M)$/i,'');
    if (/^(35|36)[.\/-]/.test(code)) return 'ELK';
    if (/^25[.\/-]/.test(code)) return 'MEK';
    if (/^(15|16|17|18|19|20|21|22|23|24|77)[.\/-]/.test(code)) return 'İNŞ';
    return 'ÖZL';
  };

  const makeRecord = raw => {
    const poz = normalizePoz(raw.poz || raw.code);
    const year = Number(raw.year || raw.lastYear || raw.originalYear);
    const month = Number(raw.month || raw.sourceMonth || 1) || 1;
    const calculation = calculate({year, month, price:raw.price ?? raw.originalPrice ?? raw.fiyat});
    if (!poz || !calculation) return null;
    const targetPeriod = `${calculation.target.monthName || MONTHS[Number(calculation.target.month)-1] || ''} ${calculation.target.year}`.trim();
    const sourcePeriod = `${calculation.source.monthName || MONTHS[month-1] || 'Ocak'} ${year}`;
    return {
      poz,
      tanim:String(raw.tanim || raw.description || 'BirimFiyat.Net geçmiş yıl pozu').trim(),
      birim:String(raw.birim || raw.unit || '').trim(),
      fiyat:formatPrice(calculation.updatedPrice),
      montaj:String(raw.montaj || '').trim(),
      disiplin:disciplineOf(poz),
      kitap:disciplineOf(poz),
      kitapKaynak:`BirimFiyat.Net ${year} · TÜİK İME ile güncellendi`,
      kaynak:`BirimFiyat.Net ${year} fiyatı / TÜİK İnşaat Maliyet Endeksi`,
      legacyUpdate:true,
      originalYear:year,
      originalMonth:month,
      originalPrice:calculation.originalPrice,
      updateFactor:calculation.factor,
      sourceIndex:calculation.source.index,
      targetIndex:calculation.target.index,
      sourcePeriod,
      targetPeriod,
      lookupSource:String(raw.lookupSource || raw.source || 'BirimFiyat.Net'),
      updatedAt:new Date().toISOString()
    };
  };

  const refreshMap = () => {
    state.map.clear();
    [...state.staticRecords, ...state.localRecords].forEach(raw => {
      const record = makeRecord(raw);
      if (record) state.map.set(normalizePoz(record.poz), record);
    });
    window.BYSAY_LEGACY_POZ_MAP = state.map;
  };

  const apply = () => {
    const base = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    const merged = new Map(base.map(item => [normalizePoz(item.poz), item]));
    for (const [key, record] of state.map) if (!merged.has(key)) merged.set(key, record);
    window.POZ_DATA = Array.from(merged.values());
    window.POZ_META = {...(window.POZ_META || {}), recordCount:window.POZ_DATA.length, legacyPozCount:state.map.size};
    return state.map.size;
  };

  const save = payload => {
    const record = makeRecord(payload);
    if (!record) throw new Error('Eski poz fiyatı veya yıl bilgisi geçersiz.');
    const key = normalizePoz(record.poz);
    const next = readLocal().filter(item => normalizePoz(item.poz || item.code) !== key);
    next.push({
      poz:record.poz,
      tanim:record.tanim,
      birim:record.birim,
      year:record.originalYear,
      month:record.originalMonth,
      price:record.originalPrice,
      lookupSource:record.lookupSource,
      savedAt:new Date().toISOString()
    });
    writeLocal(next);
    state.localRecords = next;
    refreshMap();
    apply();
    return record;
  };

  window.BYSAY_LEGACY_CONFIG = {version:VERSION, localCacheKey:LOCAL_CACHE_KEY, indexUrl:INDEX_URL};
  window.BYSAY_CALCULATE_LEGACY_PRICE = calculate;
  window.BYSAY_APPLY_LEGACY_CACHE = apply;
  window.BYSAY_SAVE_LEGACY_POZ = save;

  window.BYSAY_LEGACY_READY = (async () => {
    try { state.index = await fetchJson(INDEX_URL); }
    catch (error) { console.warn('Güncel inşaat maliyet endeksi alınamadı, yedek değerler kullanılıyor.', error); state.index = FALLBACK_INDEX; }
    try {
      const staticCache = await fetchJson(STATIC_CACHE_URL);
      state.staticRecords = Array.isArray(staticCache) ? staticCache : (Array.isArray(staticCache?.records) ? staticCache.records : []);
    } catch (error) { console.warn('Eski poz statik önbelleği okunamadı.', error); state.staticRecords = []; }
    state.localRecords = readLocal();
    refreshMap();
    window.BYSAY_LEGACY_INDEX = state.index;
    document.documentElement.dataset.legacyIndexPeriod = `${latestEntry().monthName || ''}-${latestEntry().year}`;
    return {index:state.index, count:state.map.size};
  })();
})();
