(() => {
  'use strict';

  const STORAGE_KEY = 'BYSAY_POZ_MALIYET_KAYDI_V1';

  const notify = (message, duration = 3200) => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), duration);
  };

  const readRowsFromTable = () => Array.from(document.querySelectorAll('#resultBody tr')).map(tr => ({
    poz: tr.querySelector('.poz-input')?.value?.trim() || '',
    quantity: tr.querySelector('.qty-input')?.value?.trim() || '1'
  })).filter(row => row.poz);

  const save = () => {
    const rows = readRowsFromTable();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      rows
    }));
    const lastAction = document.getElementById('lastAction');
    if (lastAction) lastAction.textContent = `${rows.length.toLocaleString('tr-TR')} satır kaydedildi`;
    notify(`${rows.length.toLocaleString('tr-TR')} satır kaydedildi.`);
  };

  const restore = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved?.rows) || !saved.rows.length) return;

      const bulk = document.getElementById('bulkInput');
      const importButton = document.getElementById('importPasteBtn');
      if (!bulk || !importButton) return;

      bulk.value = saved.rows
        .filter(row => row?.poz)
        .map(row => `${row.poz}\t${row.quantity || 1}`)
        .join('\n');
      importButton.click();

      const lastAction = document.getElementById('lastAction');
      if (lastAction) lastAction.textContent = 'Kayıtlı liste yüklendi';
      notify('Kayıtlı liste yüklendi.', 2200);
    } catch (error) {
      console.error('Kayıt geri yüklenemedi:', error);
    }
  };

  const loadStageUi = () => {
    if (document.querySelector('script[data-bysay-stage-ui]')) return;
    const script = document.createElement('script');
    script.dataset.bysayStageUi = '1';
    script.src = `stage-ui-20260712.js?v=20260712-23-${Date.now()}`;
    document.body.appendChild(script);
  };

  const waitForProgram = (attempt = 0) => {
    const saveButton = document.getElementById('saveBtn');
    const importButton = document.getElementById('importPasteBtn');
    const resultBody = document.getElementById('resultBody');

    if (saveButton && importButton && resultBody && resultBody.querySelector('tr')) {
      saveButton.addEventListener('click', save);
      restore();
      loadStageUi();
      return;
    }

    if (attempt < 100) setTimeout(() => waitForProgram(attempt + 1), 100);
    else loadStageUi();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitForProgram(), {once: true});
  } else {
    waitForProgram();
  }
})();
