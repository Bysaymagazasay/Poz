(() => {
  'use strict';

  const FILES = [
    'data/insaat-2026-01.txt',
    'data/insaat-2026-02.txt',
    'data/insaat-2026-03.txt',
    'data/insaat-2026-04.txt',
    'data/insaat-2026-05.txt',
    'data/insaat-2026-06-09.txt'
  ];

  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');

  const readWithFetch = async path => {
    if (location.protocol === 'file:') throw new Error('file protokolünde fetch kullanılmadı');
    const response = await fetch(`${path}?v=20260712-9`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`${path} (${response.status})`);
    return response.text();
  };

  const readWithXhr = path => new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', path, true);
      xhr.overrideMimeType('text/plain; charset=utf-8');
      xhr.onload = () => {
        if ((xhr.status >= 200 && xhr.status < 300) || (location.protocol === 'file:' && xhr.responseText)) {
          resolve(xhr.responseText);
        } else {
          reject(new Error(`${path} XHR ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error(`${path} XHR okunamadı`));
      xhr.send();
    } catch (error) {
      reject(error);
    }
  });

  const readWithIframe = path => new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px';
    const cleanup = () => frame.remove();
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${path} iframe zaman aşımı`));
    }, 8000);

    frame.onload = () => {
      clearTimeout(timer);
      try {
        const text = frame.contentDocument?.body?.textContent || frame.contentWindow?.document?.body?.textContent || '';
        cleanup();
        if (text.trim()) resolve(text);
        else reject(new Error(`${path} iframe içeriği boş`));
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    frame.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(`${path} iframe okunamadı`));
    };
    frame.src = path;
    document.body.appendChild(frame);
  });

  const readPart = async path => {
    const errors = [];
    for (const reader of [readWithFetch, readWithXhr, readWithIframe]) {
      try {
        const text = await reader(path);
        const clean = String(text || '').replace(/\s+/g, '');
        if (clean) return clean;
      } catch (error) {
        errors.push(error?.message || String(error));
      }
    }
    throw new Error(`${path} okunamadı: ${errors.join(' | ')}`);
  };

  const gunzipBase64 = async base64Text => {
    const bytes = Uint8Array.from(atob(base64Text), character => character.charCodeAt(0));
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Tarayıcınız sıkıştırılmış inşaat verisini açamıyor. Güncel Firefox veya Chrome kullanın.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  };

  window.BYSAY_LOAD_INSAAT = async () => {
    const parts = [];
    for (const path of FILES) parts.push(await readPart(path));

    const jsonText = await gunzipBase64(parts.join(''));
    const construction = JSON.parse(jsonText);
    if (!Array.isArray(construction) || !construction.length) throw new Error('İnşaat fiyat verisi boş veya geçersiz.');

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
      priceColumn: '2026 Temmuz TÜİK Endeksleriyle Güncel Birim Fiyat (TL)'
    };

    return construction.length;
  };
})();
