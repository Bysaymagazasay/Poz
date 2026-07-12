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
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[^A-ZÇĞİÖŞÜ0-9._\/-]/g, '')
    .replace(/^[._\/-]+|[._\/-]+$/g, '');

  const isCode = code => {
    if (!code || code.length < 3 || code.length > 90 || !/[0-9]/.test(code)) return false;
    if (/^\d+(?:\.\d+){2,}(?:[-/][A-Z0-9]+)?$/i.test(code)) return true;
    return /^[A-ZÇĞİÖŞÜ0-9]+(?:[.\/_-]+[A-ZÇĞİÖŞÜ0-9]+)+$/i.test(code);
  };

  const isQuantity = value => {
    const s = String(value ?? '').trim().replace(/\s/g, '');
    return /^[-+]?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(s) || /^[-+]?\d+(?:[.,]\d+)?$/.test(s);
  };

  const textFromCell = cell => {
    const texts = Array.from(cell.getElementsByTagNameNS('*', 't'));
    return texts.map(node => node.textContent || '').join('').replace(/\u00a0/g, ' ').trim();
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

  function parseGrid(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    const parserError = xml.getElementsByTagName('parsererror')[0];
    if (parserError) throw new Error('Word XML içeriği ayrıştırılamadı.');

    const tables = Array.from(xml.getElementsByTagNameNS('*', 'tbl'));
    const grids = [];

    for (const table of tables) {
      const rows = Array.from(table.getElementsByTagNameNS('*', 'tr'));
      const grid = rows.map(row => {
        const cells = Array.from(row.children).filter(node => node.localName === 'tc');
        return cells.map(textFromCell);
      }).filter(row => row.length);
      if (grid.length) grids.push(grid);
    }

    return grids;
  }

  function detectColumns(grid) {
    let headerRow = -1;
    let codeCol = -1;
    let qtyCol = -1;

    for (let r = 0; r < Math.min(grid.length, 80); r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const header = normalizeHeader(grid[r][c]);
        if (codeCol < 0 && ['iskalemino','iskaleminumarasi','iskalemnumarasi','pozno','poznumarasi','kalemno','poz']
          .some(key => header === key || header.includes(key))) {
          headerRow = r;
          codeCol = c;
        }
        if (qtyCol < 0 && ['miktar','miktari','adet','adedi','metraj','quantity','qty']
          .some(key => header === key || header.includes(key))) {
          qtyCol = c;
        }
      }
    }

    if (codeCol < 0) {
      const scores = [];
      const maxCols = Math.max(...grid.map(row => row.length), 0);
      for (let c = 0; c < maxCols; c++) {
        let score = 0;
        for (const row of grid.slice(0, 200)) if (isCode(cleanCode(row[c]))) score++;
        scores.push(score);
      }
      const best = Math.max(...scores, 0);
      if (best > 0) codeCol = scores.indexOf(best);
    }

    if (qtyCol < 0 && codeCol >= 0) {
      const scores = [];
      const maxCols = Math.max(...grid.map(row => row.length), 0);
      for (let c = 0; c < maxCols; c++) {
        if (c === codeCol) { scores.push(-1); continue; }
        let score = 0;
        for (const row of grid.slice(0, 200)) if (isQuantity(row[c])) score++;
        scores.push(score);
      }
      const best = Math.max(...scores, 0);
      if (best > 0) qtyCol = scores.indexOf(best);
    }

    return {headerRow, codeCol, qtyCol};
  }

  function extractRows(grid) {
    const detected = detectColumns(grid);
    const results = [];
    const startRow = detected.headerRow >= 0 ? detected.headerRow + 1 : 0;

    for (let r = startRow; r < grid.length; r++) {
      const row = grid[r];
      let code = detected.codeCol >= 0 ? cleanCode(row[detected.codeCol]) : '';

      if (!isCode(code)) {
        for (let c = 1; c < row.length; c++) {
          const candidate = cleanCode(row[c]);
          if (isCode(candidate)) { code = candidate; break; }
        }
      }
      if (!isCode(code)) continue;

      let quantity = detected.qtyCol >= 0 ? String(row[detected.qtyCol] ?? '').trim() : '';
      if (!isQuantity(quantity)) {
        quantity = '';
        for (let c = 0; c < row.length; c++) {
          if (c === detected.codeCol) continue;
          const candidate = String(row[c] ?? '').trim();
          if (isQuantity(candidate) && !/^\d+$/.test(candidate) || (isQuantity(candidate) && Number(candidate.replace(',', '.')) > 0)) {
            quantity = candidate;
          }
        }
      }

      results.push({code, quantity: quantity || '1'});
    }

    return results;
  }

  async function parseDocx(file) {
    if (!window.JSZip) throw new Error('Word okuyucu yüklenemedi. Sayfayı yenileyin.');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error('Word belgesinin ana içeriği okunamadı.');

    const xmlText = await entry.async('string');
    const grids = parseGrid(xmlText);
    const allRows = grids.flatMap(extractRows);

    const unique = [];
    const seen = new Set();
    for (const row of allRows) {
      const key = `${row.code}|${row.quantity}`;
      if (!seen.has(key)) { seen.add(key); unique.push(row); }
    }
    return unique;
  }

  input.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.docx')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    setLoading(true);

    try {
      const rows = await parseDocx(file);
      if (!rows.length) throw new Error('Word dosyasındaki İş Kalemi No değerleri okunamadı.');

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
      showToast(`${rows.length.toLocaleString('tr-TR')} poz ve miktar başarıyla aktarıldı.`, 4000);
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Word dosyası okunurken bir hata oluştu.', 6500);
    } finally {
      setLoading(false);
      input.value = '';
    }
  }, true);
})();
