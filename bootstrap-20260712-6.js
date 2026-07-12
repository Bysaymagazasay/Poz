(() => {
  'use strict';

  const VERSION = '20260712-12';

  const loadScript = source => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Program dosyası yüklenemedi: ${source}`));
    document.body.appendChild(script);
  });

  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');

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

  const addMontajDemontajRecords = () => {
    const source = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    const records = new Map();
    source.forEach(item => records.set(normalizePoz(item.poz), item));

    let added = 0;
    for (const item of source) {
      const baseCode = normalizePoz(item.poz);
      if (!baseCode || baseCode.endsWith('-M') || baseCode.endsWith('-D')) continue;
      const montaj = parseNumber(item.montaj);
      if (!Number.isFinite(montaj)) continue;

      const montajCode = `${baseCode}-M`;
      if (!records.has(montajCode)) {
        records.set(montajCode, {
          ...item,
          poz: `${item.poz}-M`,
          tanim: `Mont. ${item.tanim || ''}`.trim(),
          fiyat: formatPrice(montaj),
          kaynak: item.kaynak || 'Montaj fiyatı',
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
      specialRecordCount: added
    };
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
      if (typeof window.BYSAY_LOAD_USER_BOOKS === 'function') {
        await window.BYSAY_LOAD_USER_BOOKS();
      }
    } catch (error) {
      console.error('Kullanıcı poz kitapları yüklenemedi:', error);
      window.BYSAY_USER_BOOK_ERROR = error?.message || String(error);
    }

    addMontajDemontajRecords();

    try {
      await loadScript(`app.js?v=${VERSION}`);
      await loadScript(`word-xml-sanitize.js?v=${VERSION}`);
      await loadScript(`word-import-all-20260712.js?v=${VERSION}`);
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Program başlatılırken bir hata oluştu.');
      return;
    }

    const errors = [];
    if (window.BYSAY_DATA_LOAD_ERROR) errors.push(`İnşaat fiyat listesi: ${window.BYSAY_DATA_LOAD_ERROR}`);
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
