(() => {
  'use strict';

  const VERSION = '20260712-8';

  const loadScript = source => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Program dosyası yüklenemedi: ${source}`));
    document.body.appendChild(script);
  });

  const findConstructionLoader = () => {
    const fixedNames = [
      'BYSAY_LOAD_INSAAT',
      'BYSAY_LOAD_INSAAT_V7',
      'BYSAY_LOAD_INSAAT_V8',
      'BYSAY_INSAAT_LOAD',
      'BYSAY_LOAD_CONSTRUCTION'
    ];

    for (const name of fixedNames) {
      if (typeof window[name] === 'function') return window[name].bind(window);
    }

    const dynamicName = Object.getOwnPropertyNames(window).find(name =>
      typeof window[name] === 'function' &&
      /BYSAY/i.test(name) &&
      /INSAAT|CONSTRUCTION/i.test(name) &&
      /LOAD|YUKLE/i.test(name)
    );

    return dynamicName ? window[dynamicName].bind(window) : null;
  };

  const constructionAlreadyLoaded = () => {
    const meta = window.POZ_META || {};
    const data = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    return Number(meta.constructionRecordCount || 0) > 0 || data.length > 5677;
  };

  const waitForLoader = async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (constructionAlreadyLoaded()) return null;
      const loader = findConstructionLoader();
      if (loader) return loader;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  };

  (async () => {
    try {
      if (!constructionAlreadyLoaded()) {
        const loader = await waitForLoader();
        if (!loader) throw new Error('İnşaat veri yükleyicisi bulunamadı.');
        await loader();
      }

      if (!constructionAlreadyLoaded()) {
        throw new Error('İnşaat fiyat verisi yüklendi ancak poz listesine eklenemedi.');
      }
    } catch (error) {
      console.error('İnşaat birim fiyat listesi yüklenemedi:', error);
      window.BYSAY_DATA_LOAD_ERROR = error?.message || String(error);
    }

    try {
      await loadScript(`app.js?v=${VERSION}`);
      await loadScript(`word-xml-sanitize.js?v=${VERSION}`);
      await loadScript(`word-import-all-20260712.js?v=${VERSION}`);
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Program başlatılırken bir hata oluştu.');
      return;
    }

    if (window.BYSAY_DATA_LOAD_ERROR) {
      setTimeout(() => {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = `İnşaat fiyat listesi yüklenemedi: ${window.BYSAY_DATA_LOAD_ERROR}`;
        toast.classList.add('show');
      }, 150);
    }
  })();
})();
