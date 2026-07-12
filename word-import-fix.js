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
    if (!code || code.length < 3 || code.length > 80 || !/[0-9]/.test(code)) return false;
    if (/^\d+(?:\.\d+){2,}(?:[-/][A-Z0-9]+)?$/i.test(code)) return true;
    return /^[A-ZÇĞİÖŞÜ0-9]+(?:[.\/_-]+[A-ZÇĞİÖŞÜ0-9]+)+$/i.test(code);
  };

  const isQuantity = value => {
    const s = String(value ?? '').trim().replace(/\s/g, '');
    return /^[-+]?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(s) || /^[-+]?\d+(?:[.,]\d+)?$/.test(s);
  };

  const decodeXml = value => String(value ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

  const getElements = (xml, localName) => {
    const expression = `<(?:[A-Za-z0-9_]+:)?${localName}\\b[^>]*>[\\s\\S]*?<\\/(?:[A-Za-z0-9_]+:)?${localName}>`;
    return String(xml ?? '').match(new RegExp(expression, 'gi')) || [];
  };

  const getXmlText = fragment => {
    const prepared = String(fragment ?? '')
      .replace(/<(?:[A-Za-z0-9_]+:)?tab\b[^>]*\/?\s*>/gi, '\t')
      .replace(/<(?:[A-Za-z0-9_]+:)?br\b[^>]*\/?\s*>/gi, ' ')
      .replace(/<\/(?:[A-Za-z0-9_]+:)?p\s*>/gi, ' ');

    const values = [];
    const expression = /<(?:[A-Za-z0-9_]+:)?(?:t|instrText)\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?(?:t|instrText)>/gi;
    let match;
    while ((match = expression.exec(prepared))) {
      values.push(decodeXml(match[1].replace(/<[^>]+>/g, '')));
    }

    return values.join('').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
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

  function parseRowsFromXml(xmlText) {
    return getElements(xmlText, 'tr').map(rowXml =>
      getElements(rowXml, 'tc').map(getXmlText)
    ).filter(row => row.length > 0);
  }

  function detectColumns(grid) {
    let headerRow = -1;
    let codeCol = -1;
    let qtyCol = -1;

    for (let r = 0; r < Math.min(grid.length, 80); r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const header = normalizeHeader(grid[r][c]);
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
      if (codeCol >= 0 && qtyCol >= 0) break;
    }

    return {headerRow, codeCol, qtyCol};
  }

  function extractRows(grid) {
    const detected = detectColumns(grid);
    const results = [];
    const startRow = detected.headerRow >= 0 ? detected.headerRow + 1 : 0;

    for (let r = startRow; r < grid.length; r++) {
      const row = grid[r];
      let codeColumn = detected.codeCol;
      let code = codeColumn >= 0 ? cleanCode(row[codeColumn]) : '';

      if (!isCode(code)) {
        codeColumn = row.findIndex((value, index) => index > 0 && isCode(cleanCode(value)));
        code = codeColumn >= 0 ? cleanCode(row[codeColumn]) : '';
      }

      if (!isCode(code)) continue;

      let quantity = detected.qtyCol >= 0 ? String(row[detected.qtyCol] ?? '').trim() : '';
      if (!isQuantity(quantity)) {
        quantity = '';
        for (let c = Math.max(0, codeColumn + 1); c < row.length; c++) {
          const candidate = String(row[c] ?? '').trim();
          if (isQuantity(candidate)) {
            quantity = candidate;
            break;
          }
        }
      }

      results.push({code, quantity: quantity || '1'});
    }

    return results;
  }

  async function parseDocx(file) {
    if (!window.JSZip) {
      throw new Error('Word okuyucu yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
    }

    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error('Word belgesinin ana içeriği okunamadı.');

    const xmlText = await entry.async('string');
    const grid = parseRowsFromXml(xmlText);
    if (!grid.length) throw new Error('Word belgesindeki tablo satırları okunamadı.');

    return extractRows(grid);
  }

  input.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.docx')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    setLoading(true);

    try {
      const rows = await parseDocx(file);
      if (!rows.length) {
        throw new Error('Word dosyasında İş Kalemi No / Poz No sütunundan aktarılabilir kod bulunamadı.');
      }

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
