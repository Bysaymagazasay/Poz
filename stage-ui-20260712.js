(() => {
  'use strict';

  const apply = () => {
    const sourceName = document.getElementById('sourceName');
    const meta = window.BYSAY_INSTITUTIONAL_BOOKS_META;
    const aygmName = Array.isArray(meta?.names) && meta.names.length
      ? meta.names.join(' + ')
      : 'AYGM 2026 1. Dönem';

    if (sourceName) {
      sourceName.textContent = window.BYSAY_INSTITUTIONAL_BOOK_ERROR
        ? 'ÇŞİDB Temmuz 2026'
        : `ÇŞİDB Temmuz 2026 + ${aygmName}`;
    }

    const footer = document.querySelector('footer');
    if (footer) footer.textContent = '© 2026 BYSAY • Sürüm 2026.07.12.22 • Yaklaşık Maliyet Hesap Programı';

    document.documentElement.dataset.activePozBookStage = window.BYSAY_ACTIVE_INSTITUTIONAL_STAGE || 'CSIDB';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, {once:true});
  } else {
    apply();
  }
  setTimeout(apply, 250);
})();
