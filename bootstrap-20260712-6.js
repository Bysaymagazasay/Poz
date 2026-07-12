(() => {
  'use strict';

  const loadScript = source => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Program dosyası yüklenemedi: ${source}`));
    document.body.appendChild(script);
  });

  (async () => {
    try {
      if (typeof window.BYSAY_LOAD_INSAAT !== 'function') {
        throw new Error('İnşaat veri yükleyicisi bulunamadı.');
      }
      await window.BYSAY_LOAD_INSAAT();
    } catch (error) {
      console.error('İnşaat birim fiyat listesi yüklenemedi:', error);
      window.BYSAY_DATA_LOAD_ERROR = error?.message || String(error);
    }

    try {
      await loadScript('app.js?v=20260712-6');
      await loadScript('word-xml-sanitize.js?v=6');
      await loadScript('word-import-all-20260712.js?v=6');
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
