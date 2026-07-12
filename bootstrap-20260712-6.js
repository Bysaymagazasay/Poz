(() => {
  'use strict';

  const VERSION = '20260712-11';

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
