(() => {
  'use strict';

  const VERSION = '20260712-22';
  const ACTIVE_STAGE = 'AYGM';

  const normalizePoz = value => String(value ?? '')
    .trim().toUpperCase().replace(/\s+/g, '')
    .replace(/[–—−]/g, '-');

  const normalizeName = value => String(value ?? '')
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]+/g, '');

  const isActiveBook = book => {
    const text = normalizeName(`${book?.id || ''} ${book?.name || ''} ${book?.institution || ''}`);
    return text.includes('AYGM') || text.includes('ALTYAPIYATIRIMLARIGENELMUDURLUGU');
  };

  const prepareBase64 = value => {
    let text = String(value ?? '');
    if (!text) throw new Error('AYGM poz kitabı veri parçaları bulunamadı.');
    text = text
      .replace(/[\u0000-\u0020\u007f-\u00a0\u200b-\u200f\u2028\u2029\ufeff]/g, '')
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .replace(/[^A-Za-z0-9+/=]/g, '')
      .replace(/=/g, '');
    const remainder = text.length % 4;
    if (remainder === 1) {
      throw new Error(`AYGM poz kitabı veri paketi eksik veya bozuk (${text.length} karakter).`);
    }
    return text + '='.repeat((4 - remainder) % 4);
  };

  const decodeBase64 = value => {
    const clean = prepareBase64(value);
    try {
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch (error) {
      throw new Error(`AYGM poz kitabı veri paketi çözülemedi: ${error?.message || error}`);
    }
  };

  const gunzipText = async bytes => {
    if (typeof DecompressionStream === 'function') {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).text();
      } catch (error) {
        console.warn('DecompressionStream kullanılamadı, pako deneniyor:', error);
      }
    }
    if (window.pako?.ungzip) {
      try {
        return window.pako.ungzip(bytes, {to: 'string'});
      } catch (error) {
        throw new Error(`AYGM sıkıştırılmış verisi açılamadı: ${error?.message || error}`);
      }
    }
    throw new Error('Sıkıştırılmış AYGM verisini açacak tarayıcı bileşeni yüklenemedi.');
  };

  const formatPrice = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value ?? '').trim();
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(number);
  };

  window.BYSAY_LOAD_INSTITUTIONAL_BOOKS = async () => {
    if (window.BYSAY_INSTITUTIONAL_BOOKS_LOADED) {
      return window.BYSAY_INSTITUTIONAL_BOOKS_META;
    }

    const encoded = String(window.BYSAY_INSTITUTIONAL_BOOKS_B64 || '');
    if (!encoded) throw new Error('AYGM poz kitabı veri parçaları bulunamadı.');

    const bytes = decodeBase64(encoded);
    const jsonText = await gunzipText(bytes);
    let payload;
    try {
      payload = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`AYGM poz kitabı JSON verisi okunamadı: ${error?.message || error}`);
    }

    if (!Array.isArray(payload.records) || !Array.isArray(payload.books)) {
      throw new Error('AYGM poz kitabı veri yapısı geçersiz.');
    }

    const selectedIndexes = new Set();
    payload.books.forEach((book, index) => {
      if (isActiveBook(book)) selectedIndexes.add(index);
    });
    if (!selectedIndexes.size) {
      throw new Error('AYGM 2026 1. Dönem poz kitabı veri paketinde bulunamadı.');
    }

    const disciplines = Array.isArray(payload.disciplines) ? payload.disciplines : ['İNŞ','MEK','ELK'];
    const merged = new Map();
    const base = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    base.forEach(item => merged.set(normalizePoz(item.poz), item));

    const counts = {};
    const fullRecords = [];
    for (const row of payload.records) {
      const [poz, tanim, birim, fiyat, bookIndex, kategori, disciplineIndex, montaj] = row;
      if (!selectedIndexes.has(bookIndex)) continue;
      const book = payload.books[bookIndex];
      if (!poz || !book) continue;
      const bookId = book.id || `aygm-${bookIndex}`;
      const record = {
        poz,
        tanim: tanim || '',
        birim: birim || '',
        fiyat: formatPrice(fiyat),
        montaj: montaj == null || montaj === '' ? '' : formatPrice(montaj),
        kaynak: book.name,
        kitapKaynak: book.name,
        kitapKurum: book.institution,
        kitapId: bookId,
        kitapIndex: bookIndex,
        kurum: book.institution,
        kategori: kategori || '',
        disiplin: disciplines[disciplineIndex] || 'İNŞ',
        veriSurumu: payload.version || VERSION
      };
      fullRecords.push(record);
      merged.set(normalizePoz(poz), record);
      counts[bookId] = (counts[bookId] || 0) + 1;
    }

    if (!fullRecords.length) {
      throw new Error('AYGM 2026 1. Dönem kitabında aktarılabilir poz bulunamadı.');
    }

    const catalog = payload.books
      .map((book, index) => ({book, index}))
      .filter(item => selectedIndexes.has(item.index))
      .map(({book, index}) => {
        const id = book.id || `aygm-${index}`;
        return {
          ...book,
          id,
          index,
          count: counts[id] || 0,
          stage: ACTIVE_STAGE
        };
      })
      .filter(book => book.count > 0);

    window.POZ_DATA = Array.from(merged.values());
    window.BYSAY_INSTITUTIONAL_BOOK_CATALOG = catalog;
    window.BYSAY_INSTITUTIONAL_BOOK_RECORDS = fullRecords;
    window.BYSAY_ACTIVE_INSTITUTIONAL_STAGE = ACTIVE_STAGE;

    const meta = window.POZ_META || {};
    const bookNames = catalog.map(book => book.name);
    window.POZ_META = {
      ...meta,
      recordCount: window.POZ_DATA.length,
      institutionalBookCount: catalog.length,
      institutionalRecordCount: fullRecords.length,
      institutionalBookNames: bookNames,
      activeInstitutionalStage: ACTIVE_STAGE,
      sourceFile: ['ÇŞİDB Temmuz 2026', ...bookNames].join(' + ')
    };

    window.BYSAY_INSTITUTIONAL_BOOKS_LOADED = true;
    window.BYSAY_INSTITUTIONAL_BOOKS_META = {
      version: payload.version || VERSION,
      stage: ACTIVE_STAGE,
      bookCount: catalog.length,
      recordCount: fullRecords.length,
      names: bookNames,
      counts,
      encodedLength: encoded.length,
      decodedBytes: bytes.length
    };
    delete window.BYSAY_INSTITUTIONAL_BOOKS_B64;
    delete window.BYSAY_KURUM_BOOKS_B64;
    return window.BYSAY_INSTITUTIONAL_BOOKS_META;
  };
})();
