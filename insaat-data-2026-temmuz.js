(() => {
  'use strict';

  const VERSION = '20260712-6';
  const FILES = [
    'data/insaat-2026-01.txt',
    'data/insaat-2026-02.txt',
    'data/insaat-2026-03.txt',
    'data/insaat-2026-04.txt',
    'data/insaat-2026-05.txt',
    'data/insaat-2026-06-09.txt'
  ];

  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');

  async function loadPart(path) {
    const response = await fetch(`${path}?v=${VERSION}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`İnşaat veri parçası yüklenemedi: ${path}`);
    return (await response.text()).trim();
  }

  async function gunzipBase64(base64Text) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Tarayıcınız sıkıştırılmış inşaat fiyat verisini açamıyor. Güncel Chrome veya Firefox kullanın.');
    }
    const bytes = Uint8Array.from(atob(base64Text), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  window.BYSAY_LOAD_INSAAT = async () => {
    const parts = await Promise.all(FILES.map(loadPart));
    const jsonText = await gunzipBase64(parts.join(''));
    const construction = JSON.parse(jsonText);
    if (!Array.isArray(construction)) throw new Error('İnşaat fiyat verisi geçersiz.');

    const merged = new Map();
    const mechanical = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    mechanical.forEach(item => merged.set(normalizePoz(item.poz), item));
    construction.forEach(item => merged.set(normalizePoz(item.poz), item));

    window.POZ_DATA = Array.from(merged.values());
    const oldMeta = window.POZ_META || {};
    const sources = [
      oldMeta.sourceFile,
      '2026-Temmuz-Insaat-Birim-Fiyat-Listesi.xlsx'
    ].filter(Boolean);

    window.POZ_META = {
      ...oldMeta,
      title: '2026 Temmuz Mekanik + İnşaat Poz Listesi',
      recordCount: window.POZ_DATA.length,
      constructionRecordCount: construction.length,
      sourceFile: sources.join(' + '),
      priceColumn: '2026 Temmuz Güncel Birim Fiyat (TL)'
    };

    return construction.length;
  };
})();
