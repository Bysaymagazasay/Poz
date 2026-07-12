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

  const isPozCode = value => {
    const code = cleanCode(value);
    if (!code || code.length < 3 || code.length > 90 || !/[0-9]/.test(code)) return false;
    if (/^\d+(?:\.\d+){2,}(?:[-/][A-Z0-9]+)?$/i.test(code)) return true;
    return /^[A-ZÇĞİÖŞÜ0-9]+(?:[._\/-]+[A-ZÇĞİÖŞÜ0-9]+)+$/i.test(code);
  };

  const parseQuantity = value => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const compact = text.replace(/\s/g, '');
    if (/^[-+]?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(compact)) return compact;
    if (/^[-+]?\d+(?:[.,]\d+)?$/.test(compact)) return compact;
    return '';
  };

  const nodesByLocalName = (root, localName) => {
    let nodes = [];
    try { nodes = Array.from(root.getElementsByTagNameNS('*', localName)); } catch (_) {}
    if (!nodes.length) nodes = Array.from(root.getElementsByTagName(`w:${localName}`));
    if (!nodes.length) {
      nodes = Array.from(root.getElementsByTagName('*')).filter(node =>
        node.localName === localName || String(node.nodeName || '').split(':').pop() === localName
      );
    }
    return nodes;
  };

  const directChildren = (node, localName) => Array.from(node.childNodes || []).filter(child =>
    child.nodeType === 1 && (child.localName === localName || String(child.nodeName || '').split(':').pop() === localName)
  );

  const cellText = cell => {
    const paragraphs = nodesByLocalName(cell, 'p');
    if (!paragraphs.length) {
      return nodesByLocalName(cell, 't').map(node => node.textContent || '').join('').trim();
    }
    return paragraphs.map(paragraph =>
      nodesByLocalName(paragraph, 't').map(node => node.textContent || '').join('')
    ).join(' ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const showToast = (message, duration = 6000) => {
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

  function tableToGrid(table) {
    let rows = directChildren(table, 'tr');
    if (!rows.length) rows = nodesByLocalName(table, 'tr');
    return rows.map(row => {
      let cells = directChildren(row, 'tc');
      if (!cells.length) cells = nodesByLocalName(row, 'tc');
      return cells.map(cellText);
    }).filter(row => row.length);
  }

  function detectColumns(grid) {
    let headerRow = -1;
    let codeCol = -1;
    let qtyCol = -1;

    for (let r = 0; r < Math.min(grid.length, 80); r++) {
      const row = grid[r] || [];
      for (let c = 0; c < row.length; c++) {
        const header = normalizeHeader(row[c]);
        if (codeCol < 0 && [
          'iskalemino', 'iskaleminumarasi', 'iskalemnumarasi',
          'pozno', 'poznumarasi', 'kalemno', 'poz'
        ].some(key => header === key || header.includes(key))) {
          headerRow = r;
          codeCol = c;
        }
        if (qtyCol < 0 && [
          'miktar', 'miktari', 'adet', 'adedi', 'metraj', 'quantity', 'qty'
        ].some(key => header === key || header.includes(key))) {
          qtyCol = c;
        }
      }
    }

    const maxCols = Math.max(0, ...grid.map(row => row.length));
    if (codeCol < 0) {
      let bestScore = 0;
      for (let c = 0; c < maxCols; c++) {
        let score = 0;
        for (const row of grid.slice(0, 250)) if (isPozCode(row[c])) score++;
        if (score > bestScore) { bestScore = score; codeCol = c; }
      }
    }

    if (qtyCol < 0 && codeCol >= 0) {
      let bestScore = 0;
      for (let c = codeCol + 1; c < maxCols; c++) {
        let score = 0;
        for (const row of grid.slice(0, 250)) if (parseQuantity(row[c])) score++;
        if (score > bestScore) { bestScore = score; qtyCol = c; }
      }
    }

    return {headerRow, codeCol, qtyCol};
  }

  function extractRows(grid) {
    const {headerRow, codeCol, qtyCol} = detectColumns(grid);
    if (codeCol < 0) return [];

    const results = [];
    const start = headerRow >= 0 ? headerRow + 1 : 0;
    for (let r = start; r < grid.length; r++) {
      const row = grid[r] || [];
      const code = cleanCode(row[codeCol]);
      if (!isPozCode(code)) continue;

      let quantity = qtyCol >= 0 ? parseQuantity(row[qtyCol]) : '';
      if (!quantity) {
        for (let c = codeCol + 1; c < row.length; c++) {
          quantity = parseQuantity(row[c]);
          if (quantity) break;
        }
      }
      results.push({code, quantity: quantity || '1'});
    }
    return results;
  }

  async function readDocx(file) {
    if (!window.JSZip) throw new Error('Word okuyucu yüklenemedi. İnternet bağlantısını kontrol edip sayfayı yenileyin.');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error('Word belgesinin ana tablo içeriği bulunamadı.');

    const xmlText = await entry.async('string');
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (nodesByLocalName(xml, 'parsererror').length) throw new Error('Word belgesinin XML içeriği ayrıştırılamadı.');

    const tables = nodesByLocalName(xml, 'tbl');
    const grids = tables.map(tableToGrid).filter(grid => grid.length);
    const rows = grids.flatMap(extractRows);
    if (!rows.length) throw new Error('Word tablosundaki İş Kalemi No değerleri okunamadı (yeni okuyucu v4).');
    return rows;
  }

  input.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.docx')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    setLoading(true);

    try {
      const rows = await readDocx(file);
      const bulk = document.getElementById('bulkInput');
      const importButton = document.getElementById('importPasteBtn');
      if (!bulk || !importButton) throw new Error('Programdaki aktarım alanı bulunamadı.');

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
      showToast(`${rows.length.toLocaleString('tr-TR')} poz ve miktar başarıyla aktarıldı.`, 4500);
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Word dosyası okunurken bir hata oluştu.', 7000);
    } finally {
      setLoading(false);
      input.value = '';
    }
  }, true);
})();
