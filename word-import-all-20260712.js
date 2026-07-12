(() => {
  'use strict';

  const input = document.getElementById('fileInput');
  if (!input) return;

  const META_KEY = 'BYSAY_WORD_AKTARIM_META_V1';

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
    if (/^\d+(?:\.\d+){2,}(?:[-/][A-Z0-9]+)*(?:-(?:D|M))?$/i.test(code)) return true;
    return /^[A-ZÇĞİÖŞÜ0-9]+(?:[._\/-]+[A-ZÇĞİÖŞÜ0-9]+)+(?:-(?:D|M))?$/i.test(code);
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
    if (!paragraphs.length) return nodesByLocalName(cell, 't').map(node => node.textContent || '').join('').trim();
    return paragraphs.map(paragraph =>
      nodesByLocalName(paragraph, 't').map(node => node.textContent || '').join('')
    ).join(' ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[character]));

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

  const headerTerms = {
    code: ['iskalemino','iskaleminumarasi','iskalemnumarasi','pozno','poznumarasi','kalemno','poz'],
    qty: ['miktar','miktari','adet','adedi','metraj','quantity','qty'],
    desc: ['iskalemiadivekisaciklamasi','iskalemiadi','iskalemiismi','poztanimi','tanim','aciklama','imalatincinsi','isinadi'],
    unit: ['birim','birimi','olcubirimi']
  };

  function matchesHeader(value, terms) {
    const normalized = normalizeHeader(value);
    return terms.some(key => normalized === key || normalized.includes(key));
  }

  function detectColumns(grid) {
    let headerRow = -1;
    const columns = {code: -1, qty: -1, desc: -1, unit: -1};

    for (let rowIndex = 0; rowIndex < Math.min(grid.length, 80); rowIndex++) {
      const row = grid[rowIndex] || [];
      for (let column = 0; column < row.length; column++) {
        for (const type of Object.keys(columns)) {
          if (columns[type] < 0 && matchesHeader(row[column], headerTerms[type])) {
            columns[type] = column;
            headerRow = Math.max(headerRow, rowIndex);
          }
        }
      }
    }

    const maxColumns = Math.max(0, ...grid.map(row => row.length));
    if (columns.code < 0) {
      let bestScore = 0;
      for (let column = 0; column < maxColumns; column++) {
        let score = 0;
        for (const row of grid.slice(0, 250)) if (isPozCode(row[column])) score++;
        if (score > bestScore) { bestScore = score; columns.code = column; }
      }
    }

    if (columns.qty < 0 && columns.code >= 0) {
      let bestScore = 0;
      for (let column = columns.code + 1; column < maxColumns; column++) {
        let score = 0;
        for (const row of grid.slice(0, 250)) if (parseQuantity(row[column])) score++;
        if (score > bestScore) { bestScore = score; columns.qty = column; }
      }
    }

    return {headerRow, ...columns};
  }

  function extractRows(grid) {
    const detected = detectColumns(grid);
    if (detected.code < 0) return [];

    const results = [];
    const start = detected.headerRow >= 0 ? detected.headerRow + 1 : 0;
    for (let rowIndex = start; rowIndex < grid.length; rowIndex++) {
      const row = grid[rowIndex] || [];
      const code = cleanCode(row[detected.code]);
      if (!isPozCode(code)) continue;

      let quantity = detected.qty >= 0 ? parseQuantity(row[detected.qty]) : '';
      if (!quantity) {
        for (let column = detected.code + 1; column < row.length; column++) {
          quantity = parseQuantity(row[column]);
          if (quantity) break;
        }
      }

      results.push({
        code,
        quantity: quantity || '1',
        description: detected.desc >= 0 ? String(row[detected.desc] ?? '').trim() : '',
        unit: detected.unit >= 0 ? String(row[detected.unit] ?? '').trim() : ''
      });
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
    if (!rows.length) throw new Error('Word tablosundaki İş Kalemi No değerleri okunamadı.');
    return rows;
  }

  let metadataRows = [];
  try {
    const saved = JSON.parse(localStorage.getItem(META_KEY) || '[]');
    if (Array.isArray(saved)) metadataRows = saved;
  } catch (_) {}

  const saveMetadata = rows => {
    metadataRows = rows.map(row => ({
      code: cleanCode(row.code),
      description: String(row.description || '').trim(),
      unit: String(row.unit || '').trim()
    }));
    try { localStorage.setItem(META_KEY, JSON.stringify(metadataRows)); } catch (_) {}
  };

  const decorateRows = () => {
    const tableRows = Array.from(document.querySelectorAll('#resultBody tr'));
    if (!tableRows.length || !metadataRows.length) return;

    const grouped = new Map();
    for (const item of metadataRows) {
      const code = cleanCode(item.code);
      if (!grouped.has(code)) grouped.set(code, []);
      grouped.get(code).push(item);
    }

    const used = new Map();
    for (const tableRow of tableRows) {
      const code = cleanCode(tableRow.querySelector('.poz-input')?.value || '');
      const list = grouped.get(code);
      tableRow.querySelectorAll('.word-source-meta').forEach(node => node.remove());
      if (!list?.length) continue;

      const index = used.get(code) || 0;
      const meta = list[Math.min(index, list.length - 1)];
      used.set(code, index + 1);

      const descriptionCell = tableRow.querySelector('.description');
      const unitCell = tableRow.querySelector('.unit-cell');
      if (descriptionCell && meta.description) {
        descriptionCell.insertAdjacentHTML('beforeend', `<div class="word-source-meta"><strong>Belgedeki Tanım:</strong> ${escapeHtml(meta.description)}</div>`);
      }
      if (unitCell && meta.unit) {
        unitCell.insertAdjacentHTML('beforeend', `<div class="word-source-meta"><strong>Belgedeki Birim:</strong> ${escapeHtml(meta.unit)}</div>`);
      }
    }
  };

  const resultBody = document.getElementById('resultBody');
  if (resultBody) {
    new MutationObserver(() => requestAnimationFrame(decorateRows)).observe(resultBody, {childList: true});
    setTimeout(decorateRows, 250);
  }

  input.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.docx')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    setLoading(true);

    try {
      const rows = await readDocx(file);
      saveMetadata(rows);

      const bulk = document.getElementById('bulkInput');
      const importButton = document.getElementById('importPasteBtn');
      if (!bulk || !importButton) throw new Error('Programdaki aktarım alanı bulunamadı.');

      bulk.value = rows.map(row => `${row.code}\t${row.quantity}`).join('\n');
      importButton.click();
      setTimeout(decorateRows, 80);

      const fileName = document.getElementById('importFileName');
      const detail = document.getElementById('importDetail');
      const result = document.getElementById('importResult');
      const lastAction = document.getElementById('lastAction');
      if (fileName) fileName.textContent = file.name;
      if (detail) detail.textContent = `${rows.length.toLocaleString('tr-TR')} İş Kalemi No, miktar, tanım ve birim aktarıldı`;
      if (result) result.classList.add('show');
      if (lastAction) lastAction.textContent = `${rows.length.toLocaleString('tr-TR')} satır Word dosyasından aktarıldı`;
      showToast(`${rows.length.toLocaleString('tr-TR')} poz başarıyla aktarıldı.`, 4500);
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Word dosyası okunurken bir hata oluştu.', 7000);
    } finally {
      setLoading(false);
      input.value = '';
    }
  }, true);
})();
