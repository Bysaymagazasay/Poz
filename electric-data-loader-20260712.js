(() => {
  'use strict';

  const VERSION = '20260712-26';
  const BOOK_ID = 'csidb-electric-2026-07';
  const BOOK_NAME = 'ÇŞİDB 2026 Temmuz Elektrik Tesisat Fiyat Listesi';
  const INSTITUTION = 'Çevre, Şehircilik ve İklim Değişikliği Bakanlığı';
  const DB_NAME = 'BYSAY_POZ_KITAPLARI_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'books';

  const normalizePoz = value => String(value ?? '')
    .trim().toUpperCase().replace(/\s+/g, '').replace(/[–—−]/g, '-');

  const looksBrokenDescription = (value, poz) => {
    const text = String(value ?? '').trim();
    return !text || normalizePoz(text) === normalizePoz(poz) || /^\d+(?:[.,]\d+)+$/.test(text);
  };

  const persistCorrectedBooks = async books => {
    if (!Array.isArray(books) || !books.length || !window.indexedDB) return;
    try {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME, {keyPath: 'id'});
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        books.forEach(book => store.put(book));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (error) {
      console.warn('Düzeltilmiş elektrik kitabı kalıcı kaydedilemedi:', error);
    }
  };

  window.BYSAY_LOAD_ELECTRIC_2026 = async () => {
    const rows = Array.isArray(window.BYSAY_ELECTRIC_RECORDS) ? window.BYSAY_ELECTRIC_RECORDS : [];
    if (rows.length !== 5911) {
      throw new Error(`Resmî elektrik fiyat verisi eksik (${rows.length}/5911 kayıt).`);
    }

    const official = new Map();
    for (const row of rows) {
      const [poz, tanim, birim, fiyat, montaj] = row;
      if (!poz || !fiyat) continue;
      official.set(normalizePoz(poz), {
        poz,
        tanim: tanim || '',
        birim: birim || '',
        fiyat,
        montaj: montaj || '',
        kaynak: BOOK_NAME,
        kitapKaynak: BOOK_NAME,
        kitapKurum: INSTITUTION,
        kurum: INSTITUTION,
        kitapId: BOOK_ID,
        kitap: 'ELK',
        disiplin: 'ELK',
        kategori: 'Elektrik Tesisatı',
        veriSurumu: VERSION
      });
    }

    const current = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    const merged = new Map(current.map(item => [normalizePoz(item.poz), item]));
    for (const [key, correct] of official) {
      const existing = merged.get(key);
      merged.set(key, {
        ...(existing || {}),
        ...correct,
        tanim: existing && !looksBrokenDescription(existing.tanim, correct.poz) ? existing.tanim : correct.tanim,
        birim: existing?.birim || correct.birim,
        fiyat: correct.fiyat,
        montaj: correct.montaj
      });
    }
    window.POZ_DATA = Array.from(merged.values());

    const books = Array.isArray(window.BYSAY_USER_BOOK_CATALOG) ? window.BYSAY_USER_BOOK_CATALOG : [];
    let correctedBookCount = 0;
    const correctedBooks = books.map(book => {
      let changed = false;
      const records = (Array.isArray(book.records) ? book.records : []).map(record => {
        const correct = official.get(normalizePoz(record.poz));
        if (!correct) return record;
        changed = true;
        return {
          ...record,
          tanim: looksBrokenDescription(record.tanim, record.poz) ? correct.tanim : record.tanim,
          birim: record.birim || correct.birim,
          fiyat: correct.fiyat,
          montaj: correct.montaj,
          kaynak: BOOK_NAME,
          kitapKaynak: BOOK_NAME,
          kitapKurum: INSTITUTION,
          kurum: INSTITUTION,
          disiplin: 'ELK',
          kitap: 'ELK',
          fiyatDuzeltildi: true
        };
      });
      if (!changed) return book;
      correctedBookCount++;
      return {...book, records, count: records.length, correctedAt: new Date().toISOString()};
    });
    window.BYSAY_USER_BOOK_CATALOG = correctedBooks;
    persistCorrectedBooks(correctedBooks.filter(book => book.correctedAt));

    window.BYSAY_ELECTRIC_BOOK_CATALOG = [{
      id: BOOK_ID,
      name: BOOK_NAME,
      institution: INSTITUTION,
      period: 'Temmuz 2026',
      count: official.size,
      records: Array.from(official.values())
    }];

    window.POZ_META = {
      ...(window.POZ_META || {}),
      recordCount: window.POZ_DATA.length,
      electricRecordCount: official.size,
      electricPriceFixVersion: VERSION,
      sourceFile: 'ÇŞİDB Temmuz 2026 Mekanik + İnşaat + Elektrik'
    };
    window.BYSAY_ELECTRIC_LOAD_META = {
      version: VERSION,
      recordCount: official.size,
      correctedBookCount,
      source: window.BYSAY_ELECTRIC_META?.sourceUrl || BOOK_NAME
    };
    return window.BYSAY_ELECTRIC_LOAD_META;
  };
})();
