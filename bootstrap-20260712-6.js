(() => {
  'use strict';

  const VERSION = '20260712-22';
  const REPO_CDN = 'https://cdn.jsdelivr.net/gh/Bysaymagazasay/Poz@main/';
  const REPO_RAW = 'https://raw.githubusercontent.com/Bysaymagazasay/Poz/main/';

  const loadScript = source => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Program dosyası yüklenemedi: ${source}`));
    document.body.appendChild(script);
  });

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const executeScriptText = (code, source) => {
    if (!String(code || '').trim()) throw new Error(`Boş program dosyası: ${source}`);
    (0, eval)(`${code}\n//# sourceURL=${source.replace(/\s/g, '_')}`);
  };

  const fetchScriptText = async (source, expectedToken) => {
    const response = await fetch(source, {cache: 'no-store', mode: 'cors'});
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const code = await response.text();
    if (!code.includes(expectedToken)) {
      throw new Error(`Beklenen veri içeriği bulunamadı: ${expectedToken}`);
    }
    executeScriptText(code, source);
  };

  const loadDataPart = async (path, expectedToken) => {
    const stamp = `${VERSION}-${Date.now()}`;
    const sources = [
      `${path}?v=${stamp}`,
      `${REPO_CDN}${path}?v=${stamp}`,
      `${REPO_RAW}${path}?v=${stamp}`
    ];
    const errors = [];

    for (const source of sources) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await fetchScriptText(source, expectedToken);
          return;
        } catch (error) {
          errors.push(`${source} (${error?.message || error})`);
          if (attempt < 2) await wait(350 * attempt);
        }
      }
    }
    throw new Error(`Poz kitabı veri parçası yüklenemedi: ${path}. ${errors.at(-1) || ''}`);
  };

  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/[–—−]/g, '-');

  const parseNumber = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let text = String(value ?? '').trim().replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
    if (!text) return NaN;
    const comma = text.lastIndexOf(',');
    const dot = text.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
    } else if (comma >= 0) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if ((text.match(/\./g) || []).length > 1) {
      text = text.replace(/\./g, '');
    }
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  };

  const formatPrice = value => new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

  const bookCode = poz => {
    const code = normalizePoz(poz);
    if (/^(35|36)\./.test(code)) return 'ELK';
    if (/^25\./.test(code)) return 'MEK';
    if (/^(15|16|17|18|19|20|21|22|23|24|77)\./.test(code)) return 'İNŞ';
    return 'ÖZL';
  };

  const addMontajDemontajRecords = () => {
    const source = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    const records = new Map();
    source.forEach(item => records.set(normalizePoz(item.poz), {
      ...item,
      kitap: item.kitap || item.disiplin || bookCode(item.poz),
      kitapKaynak: item.kitapKaynak || (item.kaynak ? '' : 'ÇŞİDB Temmuz 2026')
    }));

    let added = 0;
    for (const item of source) {
      const baseCode = normalizePoz(item.poz);
      if (!baseCode || baseCode.endsWith('-M') || baseCode.endsWith('-D')) continue;
      const montaj = parseNumber(item.montaj);
      if (!Number.isFinite(montaj)) continue;
      const kitap = item.kitap || item.disiplin || bookCode(item.poz);
      const kitapKaynak = item.kitapKaynak || (item.kaynak ? '' : 'ÇŞİDB Temmuz 2026');

      const montajCode = `${baseCode}-M`;
      if (!records.has(montajCode)) {
        records.set(montajCode, {
          ...item,
          poz: `${item.poz}-M`,
          tanim: `Mont. ${item.tanim || ''}`.trim(),
          fiyat: formatPrice(montaj),
          kaynak: item.kaynak || 'Montaj fiyatı',
          kitap,
          kitapKaynak,
          ozelTur: 'montaj'
        });
        added++;
      }

      const demontajCode = `${baseCode}-D`;
      if (!records.has(demontajCode)) {
        records.set(demontajCode, {
          ...item,
          poz: `${item.poz}-D`,
          tanim: `Demont. ${item.tanim || ''}`.trim(),
          fiyat: formatPrice(montaj / 2),
          kaynak: item.kaynak || 'Demontaj fiyatı',
          kitap,
          kitapKaynak,
          ozelTur: 'demontaj'
        });
        added++;
      }
    }

    window.POZ_DATA = Array.from(records.values());
    const meta = window.POZ_META || {};
    window.POZ_META = {
      ...meta,
      recordCount: window.POZ_DATA.length,
      specialRecordCount: added,
      sourceFile: meta.sourceFile || 'ÇŞİDB Temmuz 2026 + AYGM 2026 1. Dönem'
    };
  };

  const addPozAliases = () => {
    const source = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    const exact = new Map(source.map(item => [normalizePoz(item.poz), item]));
    const aliases = [];

    const variantsOf = value => {
      const original = normalizePoz(value);
      const suffix = original.match(/-(D|M)$/i)?.[0] || '';
      const base = suffix ? original.slice(0, -suffix.length) : original;
      const variants = new Set();
      const dotted = base.replace(/[\/_-]+/g, '.').replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
      const slashed = base.replace(/[._-]+/g, '/').replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '');
      const compact = base.replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '');
      [dotted, slashed, compact].forEach(item => item && variants.add(item + suffix));
      const withoutPrefix = base.replace(/^(AYGM|DSI|DSİ|KGM|PTT|ILBANK|İLBANK|TEDAS|TEDAŞ|TEIAS|TEİAŞ|EUAS|EÜAŞ|BOTAS|BOTAŞ|TCDD)[.\/_-]+/i, '');
      if (withoutPrefix !== base) {
        variants.add(withoutPrefix + suffix);
        variants.add(withoutPrefix.replace(/[\/_-]+/g, '.') + suffix);
        variants.add(withoutPrefix.replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '') + suffix);
      }
      variants.delete(original);
      return variants;
    };

    for (const item of source) {
      for (const alias of variantsOf(item.poz)) {
        const key = normalizePoz(alias);
        if (!key || exact.has(key)) continue;
        const record = {...item, poz: alias, pozAlias: true, orijinalPoz: item.poz};
        exact.set(key, record);
        aliases.push(record);
      }
    }
    if (aliases.length) window.POZ_DATA = [...source, ...aliases];
    window.BYSAY_POZ_ALIAS_COUNT = aliases.length;
  };

  const loadInstitutionalData = async () => {
    window.BYSAY_KURUM_BOOKS_B64 = '';
    window.BYSAY_INSTITUTIONAL_BOOKS_B64 = '';
    window.BYSAY_INSTITUTIONAL_BOOKS_LOADED = false;
    window.BYSAY_INSTITUTIONAL_BOOKS_META = null;
    window.BYSAY_INSTITUTIONAL_BOOK_CATALOG = [];
    window.BYSAY_INSTITUTIONAL_BOOK_RECORDS = [];
    window.BYSAY_ACTIVE_INSTITUTIONAL_STAGE = null;

    // Eski ve doğru 16 parçalı veri serisinin ilk iki parçası bu adlarla kayıtlıdır.
    for (let part = 1; part <= 2; part++) {
      const number = String(part).padStart(2, '0');
      await loadDataPart(`data/kurum-books-b64-${number}.js`, 'BYSAY_KURUM_BOOKS_B64');
    }

    const firstParts = String(window.BYSAY_KURUM_BOOKS_B64 || '');
    if (!firstParts.startsWith('H4sI') || firstParts.length < 10000) {
      throw new Error(`AYGM veri paketinin ilk bölümü eksik (${firstParts.length} karakter).`);
    }
    window.BYSAY_INSTITUTIONAL_BOOKS_B64 = firstParts;

    // Aynı 16 parçalı serinin devamı.
    for (let part = 3; part <= 16; part++) {
      const number = String(part).padStart(2, '0');
      await loadDataPart(`data/institutional-books-${number}.js`, 'BYSAY_INSTITUTIONAL_BOOKS_B64');
    }

    const encoded = String(window.BYSAY_INSTITUTIONAL_BOOKS_B64 || '');
    if (encoded.length < 100000 || encoded.length % 4 === 1) {
      throw new Error(`AYGM veri paketi tamamlanamadı (${encoded.length} karakter).`);
    }

    if (typeof DecompressionStream !== 'function' && !window.pako) {
      await loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
    }
    await loadScript(`institutional-books-loader.js?v=${VERSION}`);
    if (typeof window.BYSAY_LOAD_INSTITUTIONAL_BOOKS !== 'function') {
      throw new Error('AYGM poz kitabı yükleyicisi bulunamadı.');
    }
    const result = await window.BYSAY_LOAD_INSTITUTIONAL_BOOKS();
    if (!result || result.stage !== 'AYGM' || result.bookCount < 1 || result.recordCount < 1) {
      throw new Error(`AYGM poz kitabı eksik yüklendi (${result?.bookCount || 0} kitap, ${result?.recordCount || 0} poz).`);
    }
    return result;
  };

  (async () => {
    try {
      if (typeof window.BYSAY_LOAD_INSAAT !== 'function') {
        throw new Error('İnşaat veri yükleyicisi bulunamadı.');
      }
      await window.BYSAY_LOAD_INSAAT();
      if (!Array.isArray(window.POZ_DATA) || window.POZ_DATA.length < 7500) {
        throw new Error(`İnşaat pozları listeye eklenemedi (${window.POZ_DATA?.length || 0} toplam kayıt).`);
      }
    } catch (error) {
      console.error('İnşaat birim fiyat listesi yüklenemedi:', error);
      window.BYSAY_DATA_LOAD_ERROR = error?.message || String(error);
    }

    try {
      await loadInstitutionalData();
    } catch (error) {
      console.error('AYGM poz kitabı yüklenemedi:', error);
      window.BYSAY_INSTITUTIONAL_BOOK_ERROR = error?.message || String(error);
    }

    try {
      if (typeof window.BYSAY_LOAD_USER_BOOKS === 'function') {
        await window.BYSAY_LOAD_USER_BOOKS();
      }
    } catch (error) {
      console.error('Kullanıcı poz kitapları yüklenemedi:', error);
      window.BYSAY_USER_BOOK_ERROR = error?.message || String(error);
    }

    addMontajDemontajRecords();
    addPozAliases();

    try {
      await loadScript(`app.js?v=${VERSION}`);
      await loadScript(`word-xml-sanitize.js?v=${VERSION}`);
      await loadScript(`word-import-all-20260712.js?v=${VERSION}`);
      await loadScript(`final-ui-20260712.js?v=${VERSION}`);
      await loadScript(`book-catalog-20260712.js?v=${VERSION}`);
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Program başlatılırken bir hata oluştu.');
      return;
    }

    const errors = [];
    if (window.BYSAY_DATA_LOAD_ERROR) errors.push(`İnşaat fiyat listesi: ${window.BYSAY_DATA_LOAD_ERROR}`);
    if (window.BYSAY_INSTITUTIONAL_BOOK_ERROR) errors.push(`AYGM poz kitabı: ${window.BYSAY_INSTITUTIONAL_BOOK_ERROR}`);
    if (window.BYSAY_USER_BOOK_ERROR) errors.push(`Kayıtlı poz kitapları: ${window.BYSAY_USER_BOOK_ERROR}`);
    if (errors.length) {
      setTimeout(() => {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = errors.join(' • ');
        toast.classList.add('show');
      }, 150);
    }
  })();
})();
