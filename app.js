(() => {
  'use strict';

  const DATA = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
  const META = window.POZ_META || {};
  const byPoz = new Map();

  const normalizePoz = (value) => String(value ?? '')
    .trim().toUpperCase().replace(/\s+/g, '')
    .replace(/[，]/g, ',').replace(/[–—]/g, '-');

  const normalizeText = (value) => String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '');

  DATA.forEach(item => byPoz.set(normalizePoz(item.poz), item));

  const els = {
    body: document.getElementById('resultBody'),
    empty: document.getElementById('emptyState'),
    recordCount: document.getElementById('recordCount'),
    sourceName: document.getElementById('sourceName'),
    found: document.getElementById('foundCount'),
    missing: document.getElementById('missingCount'),
    waiting: document.getElementById('waitingCount'),
    grandTotal: document.getElementById('grandTotal'),
    lastAction: document.getElementById('lastAction'),
    pasteCard: document.getElementById('pasteCard'),
    bulkInput: document.getElementById('bulkInput'),
    toast: document.getElementById('toast'),
    fileInput: document.getElementById('fileInput'),
    dropZone: document.getElementById('dropZone'),
    importResult: document.getElementById('importResult'),
    importFileName: document.getElementById('importFileName'),
    importDetail: document.getElementById('importDetail'),
    loading: document.getElementById('loadingOverlay')
  };

  let rows = [];
  let nextId = 1;
  let isRendering = false;

  const formatCount = n => new Intl.NumberFormat('tr-TR').format(n || 0);
  const formatMoney = n => new Intl.NumberFormat('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number.isFinite(n) ? n : 0) + ' TL';
  const formatQuantity = n => new Intl.NumberFormat('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 4}).format(Number.isFinite(n) ? n : 0);
  const escapeHtml = str => String(str ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  function parseNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let s = String(value ?? '').trim();
    if (!s) return NaN;
    s = s.replace(/\u00a0/g, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
    if (!s || s === '-' || s === ',' || s === '.') return NaN;

    const comma = s.lastIndexOf(',');
    const dot = s.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      if (comma > dot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (comma >= 0) {
      const parts = s.split(',');
      if (parts.length > 2) s = parts.join('');
      else s = parts[0] + '.' + parts[1];
    } else if (dot >= 0) {
      const parts = s.split('.');
      if (parts.length > 2) s = parts.join('');
      else if (parts[1]?.length === 3 && parts[0].replace('-', '').length >= 1) s = parts.join('');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function priceNumber(data) {
    return data ? parseNumber(data.fiyat) : NaN;
  }

  function lineTotal(row) {
    const price = priceNumber(row.data);
    const quantity = Number(row.quantity);
    return row.status === 'found' && Number.isFinite(price) && Number.isFinite(quantity) ? price * quantity : 0;
  }

  function notify(message, duration = 2400) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => els.toast.classList.remove('show'), duration);
  }

  function setLoading(show) {
    els.loading.classList.toggle('show', show);
    els.loading.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  function makeRow(poz = '', quantity = 1, source = '') {
    const parsedQuantity = parseNumber(quantity);
    return {
      id: nextId++,
      poz: String(poz).trim(),
      quantity: Number.isFinite(parsedQuantity) && parsedQuantity >= 0 ? parsedQuantity : 1,
      status: 'waiting',
      data: null,
      source
    };
  }

  function lookup(row) {
    const key = normalizePoz(row.poz);
    if (!key) { row.status = 'waiting'; row.data = null; return; }
    const found = byPoz.get(key);
    if (found) {
      row.status = 'found';
      row.data = found;
      row.poz = found.poz;
    } else {
      row.status = 'missing';
      row.data = null;
    }
  }

  function statusHtml(status) {
    if (status === 'found') return '<span class="status-pill status-found"><i></i>Bulundu</span>';
    if (status === 'missing') return '<span class="status-pill status-missing"><i></i>Bulunamadı</span>';
    return '<span class="status-pill status-waiting"><i></i>Bekliyor</span>';
  }

  function render() {
    isRendering = true;
    els.empty.classList.toggle('show', rows.length === 0);
    els.body.innerHTML = rows.map((row, index) => {
      const d = row.data;
      const invalid = row.status === 'missing' ? ' invalid' : '';
      const total = lineTotal(row);
      return `<tr data-id="${row.id}">
        <td class="order-cell">${index + 1}</td>
        <td><input class="poz-input${invalid}" data-role="poz" value="${escapeHtml(row.poz)}" placeholder="Poz no yazın" autocomplete="off" spellcheck="false"></td>
        <td>${statusHtml(row.status)}</td>
        <td class="description ${d ? '' : 'muted-value'}">${d ? escapeHtml(d.tanim) : (row.status === 'missing' ? 'Bu poz numarası kaynak listede bulunamadı.' : 'Poz numarası bekleniyor…')}</td>
        <td class="unit-cell ${d ? '' : 'muted-value'}">${d ? escapeHtml(d.birim) : '—'}</td>
        <td><input class="qty-input" data-role="quantity" inputmode="decimal" value="${escapeHtml(formatQuantity(row.quantity))}" aria-label="Miktar"></td>
        <td class="price-cell ${d && d.fiyat ? '' : 'empty muted-value'}">${d && d.fiyat ? escapeHtml(d.fiyat) : '—'}</td>
        <td class="total-cell ${d ? '' : 'empty muted-value'}" data-role="line-total">${d ? escapeHtml(formatMoney(total)) : '—'}</td>
        <td class="price-cell installation-cell ${d && d.montaj ? '' : 'empty muted-value'}">${d && d.montaj ? escapeHtml(d.montaj) : '—'}</td>
        <td><button class="delete-btn" data-role="delete" title="Satırı sil">×</button></td>
      </tr>`;
    }).join('');
    updateSummary();
    isRendering = false;
  }

  function updateSummary() {
    const found = rows.filter(r => r.status === 'found').length;
    const missing = rows.filter(r => r.status === 'missing').length;
    const waiting = rows.length - found - missing;
    const total = rows.reduce((sum, row) => sum + lineTotal(row), 0);
    els.found.textContent = found;
    els.missing.textContent = missing;
    els.waiting.textContent = waiting;
    els.grandTotal.textContent = formatMoney(total);
  }

  function addRows(values, focusLast = false, replaceEmpty = true) {
    const clean = values
      .map(value => typeof value === 'object' ? value : {poz: value, quantity: 1})
      .filter(value => String(value.poz ?? '').trim());

    if (!clean.length) clean.push({poz: '', quantity: 1});
    const addingRealValues = clean.some(value => String(value.poz ?? '').trim());
    if (replaceEmpty && addingRealValues && rows.length && rows.every(r => !normalizePoz(r.poz) && r.status === 'waiting')) rows = [];

    clean.forEach(value => {
      const row = makeRow(value.poz, value.quantity, value.source || '');
      if (row.poz) lookup(row);
      rows.push(row);
    });

    render();
    els.lastAction.textContent = `${clean.length} satır eklendi`;
    if (focusLast) requestAnimationFrame(() => {
      const input = els.body.querySelector('tr:last-child .poz-input');
      if (input) input.focus();
    });
  }

  function parseBulk(text) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    const result = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let parts = line.split('\t');
      if (parts.length < 2) parts = line.trim().split(/\s{2,}|;/);
      const poz = String(parts[0] ?? '').trim();
      const quantity = parts.length > 1 ? parseNumber(parts[1]) : 1;
      if (poz) result.push({poz, quantity: Number.isFinite(quantity) ? quantity : 1, source: 'Toplu yapıştırma'});
    }
    return result;
  }

  const POZ_HEADERS = ['pozno','poznumarasi','poznumarasi','poz','iskalemino','iskaleminumarasi','iskalemnumarasi','birimfiyatpozno','kalemno'];
  const QTY_HEADERS = ['miktar','miktari','miktari','adet','adedi','metraj','quantity','qty','miktaradet'];

  function headerMatches(value, terms) {
    const norm = normalizeText(value);
    if (!norm) return false;
    return terms.some(term => norm === term || norm.includes(term));
  }

  function extractPoz(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const direct = byPoz.get(normalizePoz(raw));
    if (direct) return direct;

    const candidates = raw.toUpperCase().match(/[A-ZÇĞİÖŞÜ0-9]+(?:[.\-/][A-ZÇĞİÖŞÜ0-9]+){1,8}/g) || [];
    for (const candidate of candidates) {
      const found = byPoz.get(normalizePoz(candidate.replace(/[),;:]+$/g, '')));
      if (found) return found;
    }

    const pieces = raw.split(/[\s,;()\[\]]+/).filter(Boolean);
    for (const piece of pieces) {
      const found = byPoz.get(normalizePoz(piece.replace(/[),;:]+$/g, '')));
      if (found) return found;
    }
    return null;
  }

  function detectTable(grid) {
    const maxRows = Math.min(grid.length, 60);
    let pozHeader = null;
    let qtyHeader = null;

    for (let r = 0; r < maxRows; r++) {
      const row = Array.isArray(grid[r]) ? grid[r] : [];
      for (let c = 0; c < row.length; c++) {
        if (!pozHeader && headerMatches(row[c], POZ_HEADERS)) pozHeader = {row: r, col: c};
        if (!qtyHeader && headerMatches(row[c], QTY_HEADERS)) qtyHeader = {row: r, col: c};
      }
      if (pozHeader && qtyHeader && Math.abs(pozHeader.row - qtyHeader.row) <= 2) break;
    }

    const headerRows = [pozHeader?.row, qtyHeader?.row].filter(Number.isInteger);
    const dataStart = headerRows.length ? Math.max(...headerRows) + 1 : 0;
    return {pozCol: pozHeader?.col ?? -1, qtyCol: qtyHeader?.col ?? -1, dataStart};
  }

  function findPozInRow(row, preferredColumn = -1) {
    if (preferredColumn >= 0 && preferredColumn < row.length) {
      const found = extractPoz(row[preferredColumn]);
      if (found) return {data: found, col: preferredColumn};
    }
    for (let c = 0; c < row.length; c++) {
      const found = extractPoz(row[c]);
      if (found) return {data: found, col: c};
    }
    return null;
  }

  function inferQuantity(row, pozColumn, qtyColumn, rowIndex) {
    if (qtyColumn >= 0 && qtyColumn < row.length) {
      const q = parseNumber(row[qtyColumn]);
      if (Number.isFinite(q) && q >= 0) return {value: q, detected: true};
    }

    const start = Math.max(0, pozColumn + 1);
    const end = Math.min(row.length, start + 8);
    for (let c = start; c < end; c++) {
      const raw = row[c];
      const q = parseNumber(raw);
      if (!Number.isFinite(q) || q < 0) continue;
      const rawText = String(raw ?? '').trim();
      if (/^\d{4}$/.test(rawText) && q >= 2000 && q <= 2100) continue;
      if (Number.isInteger(q) && (q === rowIndex || q === rowIndex + 1) && c <= pozColumn) continue;
      return {value: q, detected: true};
    }
    return {value: 1, detected: false};
  }

  function analyzeGrid(grid, sourceLabel) {
    if (!Array.isArray(grid) || !grid.length) return {items: [], missingQuantity: 0};
    const detection = detectTable(grid);
    const items = [];
    let missingQuantity = 0;

    for (let r = detection.dataStart; r < grid.length; r++) {
      const row = Array.isArray(grid[r]) ? grid[r] : [];
      if (!row.length) continue;
      const match = findPozInRow(row, detection.pozCol);
      if (!match) continue;
      const quantity = inferQuantity(row, match.col, detection.qtyCol, r);
      if (!quantity.detected) missingQuantity++;
      items.push({poz: match.data.poz, quantity: quantity.value, source: sourceLabel});
    }

    return {items, missingQuantity, detection};
  }

  function workbookToGrids(file, arrayBuffer) {
    if (!window.XLSX) throw new Error('Excel okuyucu yüklenemedi.');
    const workbook = XLSX.read(arrayBuffer, {type: 'array', cellDates: false, dense: false});
    return workbook.SheetNames.map(name => ({
      name,
      grid: XLSX.utils.sheet_to_json(workbook.Sheets[name], {header: 1, raw: true, defval: ''})
    }));
  }

  async function docxToGrids(arrayBuffer) {
    if (!window.JSZip) throw new Error('Word okuyucu yüklenemedi.');
    const zip = await JSZip.loadAsync(arrayBuffer);
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error('Word belgesinin tablo içeriği okunamadı.');
    const xmlText = await entry.async('string');
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    const tables = Array.from(xml.getElementsByTagNameNS('*', 'tbl'));

    return tables.map((table, index) => {
      const rowsXml = Array.from(table.children).filter(node => node.localName === 'tr');
      const grid = rowsXml.map(rowNode => {
        const cells = Array.from(rowNode.children).filter(node => node.localName === 'tc');
        return cells.map(cell => {
          const paragraphs = Array.from(cell.getElementsByTagNameNS('*', 'p'));
          return paragraphs.map(p => Array.from(p.getElementsByTagNameNS('*', 't')).map(t => t.textContent || '').join('')).join(' ').trim();
        });
      });
      return {name: `Tablo ${index + 1}`, grid};
    });
  }

  async function importFile(file) {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const allowed = ['xlsx','xls','xlsm','csv','tsv','txt','docx'];
    if (!allowed.includes(ext)) {
      notify('Bu dosya türü desteklenmiyor. Excel, CSV veya DOCX seçin.', 3600);
      return;
    }

    setLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      let grids;
      if (ext === 'docx') grids = await docxToGrids(arrayBuffer);
      else grids = workbookToGrids(file, arrayBuffer);

      const analyses = grids.map(item => ({
        name: item.name,
        ...analyzeGrid(item.grid, `${file.name} / ${item.name}`)
      })).filter(item => item.items.length > 0);

      if (!analyses.length) {
        throw new Error('Dosyada kaynak listedeki poz numaraları tespit edilemedi. Poz numaralarının hücrelerde veya Word tablosunda yer aldığını kontrol edin.');
      }

      let imported = [];
      let missingQuantity = 0;
      let usedNames = [];

      if (ext === 'docx') {
        for (const analysis of analyses) {
          imported.push(...analysis.items);
          missingQuantity += analysis.missingQuantity;
          usedNames.push(analysis.name);
        }
      } else {
        const bestCount = Math.max(...analyses.map(a => a.items.length));
        const selected = analyses.filter(a => a.items.length === bestCount || a.items.length >= Math.max(2, bestCount * 0.7));
        for (const analysis of selected) {
          imported.push(...analysis.items);
          missingQuantity += analysis.missingQuantity;
          usedNames.push(analysis.name);
        }
      }

      if (!imported.length) throw new Error('Aktarılabilir satır bulunamadı.');
      rows = [];
      addRows(imported, false, false);
      els.importFileName.textContent = file.name;
      const qtyText = missingQuantity ? ` • ${missingQuantity} satırda miktar bulunamadı, 1 kabul edildi` : ' • tüm miktarlar algılandı';
      els.importDetail.textContent = `${formatCount(imported.length)} poz aktarıldı • ${usedNames.join(', ')}${qtyText}`;
      els.importResult.classList.add('show');
      els.lastAction.textContent = `${formatCount(imported.length)} satır dosyadan aktarıldı`;
      notify(`${formatCount(imported.length)} poz ve miktar başarıyla aktarıldı.`, 3200);
    } catch (error) {
      console.error(error);
      notify(error?.message || 'Dosya okunurken bir hata oluştu.', 5200);
    } finally {
      setLoading(false);
      els.fileInput.value = '';
    }
  }

  els.body.addEventListener('input', event => {
    const tr = event.target.closest('tr');
    if (!tr) return;
    const row = rows.find(r => r.id === Number(tr.dataset.id));
    if (!row) return;

    if (event.target.matches('[data-role="poz"]')) {
      row.poz = event.target.value;
      row.status = 'waiting';
      row.data = null;
      updateSummary();
    }

    if (event.target.matches('[data-role="quantity"]')) {
      const q = parseNumber(event.target.value);
      row.quantity = Number.isFinite(q) && q >= 0 ? q : 0;
      const totalCell = tr.querySelector('[data-role="line-total"]');
      if (totalCell) totalCell.textContent = row.data ? formatMoney(lineTotal(row)) : '—';
      updateSummary();
    }
  });

  els.body.addEventListener('keydown', event => {
    if (!event.target.matches('[data-role="poz"]')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      const tr = event.target.closest('tr');
      const row = rows.find(r => r.id === Number(tr.dataset.id));
      if (row) { row.poz = event.target.value; lookup(row); render(); }
      els.body.querySelector(`tr[data-id="${row?.id}"] .poz-input`)?.focus();
    }
  });

  els.body.addEventListener('focusout', event => {
    if (isRendering) return;
    const tr = event.target.closest('tr');
    if (!tr) return;
    const row = rows.find(r => r.id === Number(tr.dataset.id));
    if (!row) return;

    if (event.target.matches('[data-role="poz"]') && normalizePoz(row.poz)) {
      row.poz = event.target.value;
      lookup(row);
      render();
    }

    if (event.target.matches('[data-role="quantity"]')) {
      const q = parseNumber(event.target.value);
      row.quantity = Number.isFinite(q) && q >= 0 ? q : 0;
      event.target.value = formatQuantity(row.quantity);
      updateSummary();
    }
  });

  els.body.addEventListener('click', event => {
    const btn = event.target.closest('[data-role="delete"]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    rows = rows.filter(r => r.id !== id);
    render();
    els.lastAction.textContent = 'Satır silindi';
  });

  function openFilePicker() { els.fileInput.click(); }
  document.getElementById('selectFileBtn').addEventListener('click', openFilePicker);
  document.getElementById('selectFileTextBtn').addEventListener('click', openFilePicker);
  els.fileInput.addEventListener('change', event => importFile(event.target.files?.[0]));

  ['dragenter','dragover'].forEach(type => els.dropZone.addEventListener(type, event => {
    event.preventDefault();
    els.dropZone.classList.add('dragging');
  }));
  ['dragleave','drop'].forEach(type => els.dropZone.addEventListener(type, event => {
    event.preventDefault();
    els.dropZone.classList.remove('dragging');
  }));
  els.dropZone.addEventListener('drop', event => importFile(event.dataTransfer?.files?.[0]));

  document.getElementById('addRowBtn').addEventListener('click', () => addRows([{poz:'', quantity:1}], true));
  document.getElementById('focusPasteBtn').addEventListener('click', () => {
    els.pasteCard.classList.add('show');
    setTimeout(() => els.bulkInput.focus(), 50);
  });
  document.getElementById('closePasteBtn').addEventListener('click', () => els.pasteCard.classList.remove('show'));
  document.getElementById('clearPasteBtn').addEventListener('click', () => { els.bulkInput.value = ''; els.bulkInput.focus(); });
  document.getElementById('importPasteBtn').addEventListener('click', () => {
    const values = parseBulk(els.bulkInput.value);
    if (!values.length) { notify('Önce en az bir poz numarası girin.'); return; }
    addRows(values);
    els.bulkInput.value = '';
    els.pasteCard.classList.remove('show');
    notify(`${values.length} poz ve miktar listeye eklendi.`);
  });

  document.getElementById('lookupAllBtn').addEventListener('click', () => {
    rows.forEach(lookup);
    render();
    els.lastAction.textContent = `${rows.length} satır sorgulandı`;
    notify('Tüm satırlar sorgulandı.');
  });

  document.getElementById('clearAllBtn').addEventListener('click', () => {
    rows = [];
    render();
    els.importResult.classList.remove('show');
    els.lastAction.textContent = 'Liste temizlendi';
  });

  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('exportBtn').addEventListener('click', () => {
    const exportRows = rows.filter(r => normalizePoz(r.poz));
    if (!exportRows.length) { notify('İndirilecek sonuç yok.'); return; }
    const header = ['Sıra','Poz No','Durum','Poz Tanımı','Birim','Miktar','Poz Fiyatı (TL)','Satır Toplamı (TL)','Montaj Bedeli (TL)','Kaynak'];
    const csvEscape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [header, ...exportRows.map((r,i) => [
      i + 1,
      r.data?.poz || r.poz,
      r.status === 'found' ? 'Bulundu' : (r.status === 'missing' ? 'Bulunamadı' : 'Bekliyor'),
      r.data?.tanim || '',
      r.data?.birim || '',
      formatQuantity(r.quantity),
      r.data?.fiyat || '',
      r.status === 'found' ? new Intl.NumberFormat('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2}).format(lineTotal(r)) : '',
      r.data?.montaj || '',
      r.source || ''
    ])].map(row => row.map(csvEscape).join(';')).join('\r\n');

    const blob = new Blob(['\uFEFF' + lines], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'BYSAY_Poz_Maliyet_Sonuclari.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify('CSV dosyası hazırlandı.');
  });

  els.recordCount.textContent = formatCount(META.recordCount || DATA.length);
  els.sourceName.textContent = META.sourceFile || '2026 poz listesi';
  rows = Array.from({length: 8}, () => makeRow('', 1));
  render();
  els.lastAction.textContent = 'Sorguya hazır';
})();
