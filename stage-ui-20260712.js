(() => {
  'use strict';

  const VERSION = '20260712-23';

  const apply = () => {
    const sourceName = document.getElementById('sourceName');
    if (sourceName) sourceName.textContent = 'ÇŞİDB Temmuz 2026';

    const footer = document.querySelector('footer');
    if (footer) footer.textContent = '© 2026 BYSAY • Sürüm 2026.07.12.23 • Yaklaşık Maliyet Hesap Programı';

    document.documentElement.dataset.activePozBookStage = window.BYSAY_ACTIVE_INSTITUTIONAL_STAGE || 'DSI';
    document.documentElement.dataset.nextPozBook = window.BYSAY_NEXT_INSTITUTIONAL_BOOK || 'DSİ';
    document.documentElement.dataset.bysayStageUiVersion = VERSION;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, {once:true});
  } else {
    apply();
  }
  setTimeout(apply, 250);
})();
