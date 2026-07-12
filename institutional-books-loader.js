(() => {
  'use strict';

  const VERSION = '20260712-17';
  const normalizePoz = value => String(value ?? '')
    .trim().toUpperCase().replace(/\s+/g, '')
    .replace(/[–—−]/g, '-');

  const decodeBase64 = value => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  const gunzipText = async bytes => {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Tarayıcınız sıkıştırılmış poz verisini açmayı desteklemiyor. Chrome veya Firefox güncel sürümünü kullanın.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  };

  const formatPrice = value => new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);

  window.BYSAY_LOAD_INSTITUTIONAL_BOOKS = async () => {
    if (window.BYSAY_INSTITUTIONAL_BOOKS_LOADED) {
      return window.BYSAY_INSTITUTIONAL_BOOKS_META;
    }

    const encoded = String(window.BYSAY_INSTITUTIONAL_BOOKS_B64 || '');
    if (!encoded) throw new Error('Kurum poz kitabı veri parçaları bulunamadı.');

    const jsonText = await gunzipText(decodeBase64(encoded));
    const payload = JSON.parse(jsonText);
    if (!Array.isArray(payload.records) || !Array.isArray(payload.books)) {
      throw new Error('Kurum poz kitabı veri yapısı geçersiz.');
    }

    const disciplines = Array.isArray(payload.disciplines) ? payload.disciplines : ['İNŞ','MEK','ELK'];
    const merged = new Map();
    const base = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    base.forEach(item => merged.set(normalizePoz(item.poz), item));

    const counts = {};
    for (const row of payload.records) {
      const [poz, tanim, birim, fiyat, bookIndex, kategori, disciplineIndex] = row;
      const book = payload.books[bookIndex];
      if (!poz || !book) continue;
      const record = {
        poz,
        tanim: tanim || '',
        birim: birim || '',
        fiyat: formatPrice(fiyat),
        montaj: '',
        kaynak: book.name,
        kitapKaynak: book.name,
        kitapKurum: book.institution,
        kurum: book.institution,
        kategori: kategori || '',
        disiplin: disciplines[disciplineIndex] || 'İNŞ',
        veriSurumu: payload.version || VERSION
      };
      merged.set(normalizePoz(poz), record);
      counts[book.id] = (counts[book.id] || 0) + 1;
    }

    window.POZ_DATA = Array.from(merged.values());
    const meta = window.POZ_META || {};
    const bookNames = payload.books.map(book => book.name);
    window.POZ_META = {
      ...meta,
      recordCount: window.POZ_DATA.length,
      institutionalBookCount: payload.books.length,
      institutionalRecordCount: payload.records.length,
      institutionalBookNames: bookNames,
      sourceFile: [
        'ÇŞİDB Temmuz 2026',
        ...bookNames
      ].join(' + ')
    };

    window.BYSAY_INSTITUTIONAL_BOOKS_LOADED = true;
    window.BYSAY_INSTITUTIONAL_BOOKS_META = {
      version: payload.version || VERSION,
      bookCount: payload.books.length,
      recordCount: payload.records.length,
      counts
    };
    delete window.BYSAY_INSTITUTIONAL_BOOKS_B64;
    return window.BYSAY_INSTITUTIONAL_BOOKS_META;
  };
})();
