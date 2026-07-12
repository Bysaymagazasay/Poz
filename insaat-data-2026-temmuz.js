(() => {
  'use strict';

  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');

  window.BYSAY_LOAD_INSAAT = async () => {
    const parts = Array.isArray(window.BYSAY_INSAAT_B64_PARTS) ? window.BYSAY_INSAAT_B64_PARTS : [];
    if (parts.length !== 3) {
      throw new Error(`İnşaat veri parçaları eksik (${parts.length}/3).`);
    }
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Tarayıcınız inşaat fiyat verisini açamıyor. Güncel Firefox veya Chrome kullanın.');
    }

    const base64 = parts.join('');
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const jsonText = await new Response(stream).text();
    const construction = JSON.parse(jsonText);

    if (!Array.isArray(construction) || construction.length !== 1876) {
      throw new Error(`İnşaat fiyat verisi geçersiz (${Array.isArray(construction) ? construction.length : 0} kayıt).`);
    }

    const merged = new Map();
    const mechanical = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    mechanical.forEach(item => merged.set(normalizePoz(item.poz), item));
    construction.forEach(item => merged.set(normalizePoz(item.poz), item));

    window.POZ_DATA = Array.from(merged.values());
    const oldMeta = window.POZ_META || {};
    window.POZ_META = {
      ...oldMeta,
      title: '2026 Temmuz Mekanik + İnşaat Poz Listesi',
      recordCount: window.POZ_DATA.length,
      constructionRecordCount: construction.length,
      sourceFile: [oldMeta.sourceFile, '2026-Temmuz-Insaat-Birim-Fiyat-Listesi.xlsx'].filter(Boolean).join(' + '),
      priceColumn: '2026 Temmuz Güncel Birim Fiyat (TL)'
    };

    return construction.length;
  };
})();
