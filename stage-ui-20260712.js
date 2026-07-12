(() => {
  'use strict';

  const VERSION = '20260712-24';

  const apply = () => {
    const books = Array.isArray(window.BYSAY_USER_BOOK_CATALOG) ? window.BYSAY_USER_BOOK_CATALOG : [];
    const sourceName = document.getElementById('sourceName');
    const sources = ['ÇŞİDB Temmuz 2026', ...books.map(book => `${book.institution || book.name}${book.period ? ` ${book.period}` : ''}`)];
    if (sourceName) sourceName.textContent = [...new Set(sources)].join(' + ');

    const footer = document.querySelector('footer');
    if (footer) footer.textContent = '© 2026 BYSAY • Sürüm 2026.07.12.24 • Yaklaşık Maliyet Hesap Programı';

    document.documentElement.dataset.activePozBookStage = books.length ? 'USER_BOOKS' : 'CSIDB';
    document.documentElement.dataset.savedBookCount = String(books.length);
    document.documentElement.dataset.bysayStageUiVersion = VERSION;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, {once:true});
  } else {
    apply();
  }
  setTimeout(apply, 250);
  setTimeout(apply, 1200);
})();
