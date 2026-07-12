(() => {
  'use strict';

  const input = document.getElementById('fileInput');
  if (!input) return;

  const normalizeHeader = value => String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '');

  const cleanCode = value => String(value ?? '')
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, '')
    .replace(/^[,;:()\[\]]+|[,;:()\[\]]+$/g, '');

  const isCode = code => {
    if (!code || code.length < 3 || code.length > 80) return false;
    if (!/[0-9]/.test(code)) return false;
    if (!/^[A-ZÇĞİÖŞÜ0-9]+(?:[.\/_-]+[A-ZÇĞİÖŞÜ0-9]+)+$/i.test(code)) return false;
    const separators = (code.match(/[.\/_-]/g) || []).length;
    return !(/^\d/.test(code) && separators < 2);
  };

  const parseCell = cell => {
    const paragraphs = Array.from(cell.getElementsByTagNameNS('*', 'p'));
    return paragraphs
      .map(p => Array.from(p.getElementsByTagNameNS('*', 't')).map(t => t.textContent || '').join(''))
      .join(' ')
      .trim();
  };

  const showToast = (message, duration = 5000) => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
  };

  const setLoading = show => {
    const loading = document.getElementById('loadingOverlay');
    if (!loading) return;
    loading.classList.toggle('show', show);
    loading.setAttribute('aria-hidden', show ? 'false' : 'true');
  };

  async function parseDocx(file) {
    if (!window.JSZip) throw new Error('Word okuyucu yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');

    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error('Word belgesinin tablo içeriği okunamadı.');

    const xmlText = await entry.async('string');
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    const tables = Array.from(xml.getElementsByTagNameNS('*', 'tbl'));
    const results = [];

    for (const table of tables) {
      const rows = Array.from(table.children).filter(node => node.localName === 'tr');
      const grid = rows.map(row => Array.from(row.children)
        .filter(node => node.localName === 'tc')
        .map(parseCell));

      let headerRow = -1;
      let codeCol = -1;
      let qtyCol = -1;

      for (let r = 0; r < Math.min(grid.length, 60); r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const header = normalizeHeader(grid[r][c]);
          if (codeCol < 0 && [
            'iskalemino','iskaleminumarasi','iskalemnumarasi','pozno','poznumarasi','kalemno','poz'
          ].some(key => header === key || header.includes(key))) {
            headerRow = r;
            codeCol = c;
          }
          if (qtyCol < 0 && ['miktar','miktari','adet','adedi','metraj','quantity','qty']
            .some(key => header === key || header.includes(key))) {
            qtyCol = c;
          }
        }
        if (codeCol >= 0 && qtyCol >= 0) break;
      }

      if (codeCol < 0) continue;

      for (let r = headerRow + 1; r < grid.length; r++) {
        const row = grid[r];
        const code = cleanCode(row[codeCol]);
        if (!isCode(code)) continue;
        const quantity = String(row[qtyCol] ?? '').trim() || '1';
        results.push({code, quantity});
      }
    }

    return results;
  }

  input.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.docx')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    setLoading(true);

    try {
      const rows = await parseDocx(file);
      if (!rows.length) throw new Error('Word dosyasında İş Kalemi No / Poz No sütunundan aktarılabilir kod bulunamadı.');

      const bulk = document.getElementById('bulkInput');
      const importButton = document.getElementById('importPasteBtn');
      if (!bulk || !importButton) throw new Error('Aktarım alanı bulunamadı.');

      bulk.value = rows.map(row => `${row.code}\t${row.quantity}`).join('\n');
      importButton.click();

      const fileName = document.getElementById('importFileName');
      const detail = document.getElementById('importDetail');
      const result = document.getElementById('importResult');
      const lastAction = document.getElementById('lastAction');

      if (fileName) fileName.textContent = file.name;
      if (detail) detail.textContent = `${rows.length.toLocaleString('tr-TR')} İş Kalemi No ve miktar aktarıldı`;
      if (result) result.classList.add('show');
      if (lastAction) lastAction.textContent = `${rows.length.toLocaleString('tr-TR')} satır Word dosyasından aktarıldı`;
      showToast(`${rows.length.toLocaleString('tr-TR')} poz ve miktar başarıyla aktarıldı.`, 3500);
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Word dosyası okunurken bir hata oluştu.', 6000);
    } finally {
      setLoading(false);
      input.value = '';
    }
  }, true);
})();
