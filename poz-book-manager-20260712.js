(() => {
  'use strict';

  const DB_NAME = 'BYSAY_POZ_KITAPLARI_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'books';
  const FALLBACK_KEY = 'BYSAY_POZ_KITAPLARI_FALLBACK_V1';
  const VERSION = '20260712-11';

  const normalizeText = value => String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '');

  const normalizePoz = value => String(value ?? '')
    .trim().toUpperCase().replace(/\s+/g, '')
    .replace(/[–—]/g, '-').replace(/[，]/g, ',')
    .replace(/[),;:]+$/g, '');

  const formatCount = value => new Intl.NumberFormat('tr-TR').format(Number(value) || 0);

  const notify = (message, duration = 3600) => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), duration);
  };

  const openDb = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB desteklenmiyor.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, {keyPath: 'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Poz kitabı veritabanı açılamadı.'));
  });

  const withStore = async (mode, operation) => {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let request;
        try { request = operation(store); }
        catch (error) { reject(error); return; }
        if (request) {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('Poz kitabı işlemi tamamlanamadı.'));
        } else {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('Poz kitabı işlemi tamamlanamadı.'));
        }
      });
    } finally {
      db.close();
    }
  };

  const fallbackRead = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  };

  const fallbackWrite = books => localStorage.setItem(FALLBACK_KEY, JSON.stringify(books));

  const getAllBooks = async () => {
    try { return await withStore('readonly', store => store.getAll()); }
    catch (error) {
      console.warn('IndexedDB okunamadı, yerel depolama kullanılıyor:', error);
      return fallbackRead();
    }
  };

  const saveBook = async book => {
    try { await withStore('readwrite', store => store.put(book)); }
    catch (error) {
      console.warn('IndexedDB yazılamadı, yerel depolama kullanılıyor:', error);
      const books = fallbackRead().filter(item => item.id !== book.id);
      books.push(book);
      fallbackWrite(books);
    }
  };

  const removeBook = async id => {
    try { await withStore('readwrite', store => store.delete(id)); }
    catch (error) {
      const books = fallbackRead().filter(item => item.id !== id);
      fallbackWrite(books);
    }
  };

  const clearBooks = async () => {
    try { await withStore('readwrite', store => store.clear()); }
    catch (_) { /* fallback below */ }
    localStorage.removeItem(FALLBACK_KEY);
  };

  const HEADER_TERMS = {
    poz: ['pozno','poznumarasi','poznumarasi','pozkodu','iskalemino','iskaleminumarasi','iskalemnumarasi','birimfiyatpozno','kalemno','kodno'],
    desc: ['poztanimi','tanim','aciklama','iskalemiadi','iskalemiismi','imalatincinsi','imalatadi','tarif','malzemeadi','isinadi','isinkisaadi'],
    unit: ['birim','birimi','olcubirimi','olcubirimi'],
    price: ['birimfiyat','pozfiyati','fiyat','guncelfiyat','toplambirimfiyat','tutarbirimfiyat','2026birimfiyat'],
    install: ['montajbedeli','montajfiyati','montajbirimfiyati','montaj']
  };

  const headerScore = (value, type) => {
    const text = normalizeText(value);
    if (!text) return 0;
    let score = 0;
    for (const term of HEADER_TERMS[type]) {
      if (text === term) score = Math.max(score, 10);
      else if (text.includes(term)) score = Math.max(score, 7);
    }
    if (type === 'price' && /montaj|malzeme|iscilik/.test(text) && !/toplam/.test(text)) score -= 6;
    if (type === 'install' && /montaj/.test(text)) score += 5;
    return score;
  };

  const looksLikePoz = value => {
    const code = normalizePoz(value);
    if (!code || code.length < 3 || code.length > 80) return false;
    if (!/^[A-ZÇĞİÖŞÜ0-9._\-/]+$/.test(code)) return false;
    const separators = (code.match(/[.\-_/]/g) || []).length;
    const hasLetter = /[A-ZÇĞİÖŞÜ]/.test(code);
    if (hasLetter) return separators >= 1;
    return separators >= 2 && /^\d+(?:[.\-_/]\d+){2,}$/.test(code);
  };

  const extractPoz = value => {
    const direct = normalizePoz(value);
    if (looksLikePoz(direct)) return direct;
    const text = String(value ?? '').toUpperCase();
    const matches = text.match(/[A-ZÇĞİÖŞÜ0-9]+(?:[.\-_/][A-ZÇĞİÖŞÜ0-9]+){1,8}/g) || [];
    return matches.map(normalizePoz).find(looksLikePoz) || '';
  };

  const parseNumber = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let text = String(value ?? '').trim().replace(/\u00a0/g, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
    if (!text) return NaN;
    const comma = text.lastIndexOf(',');
    const dot = text.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
    else if (comma >= 0) text = text.replace(/\./g, '').replace(',', '.');
    else if ((text.match(/\./g) || []).length > 1) text = text.replace(/\./g, '');
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  };

  const formatPrice = value => {
    const number = parseNumber(value);
    if (!Number.isFinite(number)) return String(value ?? '').trim();
    return new Intl.NumberFormat('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 4}).format(number);
  };

  const detectColumns = grid => {
    let best = null;
    const rowsToScan = Math.min(grid.length, 80);
    const maxCols = Math.max(0, ...grid.slice(0, rowsToScan).map(row => Array.isArray(row) ? row.length : 0));

    for (let rowIndex = 0; rowIndex < rowsToScan; rowIndex++) {
      const current = Array.isArray(grid[rowIndex]) ? grid[rowIndex] : [];
      const next = Array.isArray(grid[rowIndex + 1]) ? grid[rowIndex + 1] : [];
      const columns = {poz: -1, desc: -1, unit: -1, price: -1, install: -1};
      const scores = {poz: 0, desc: 0, unit: 0, price: 0, install: 0};

      for (let col = 0; col < maxCols; col++) {
        const combined = `${current[col] ?? ''} ${next[col] ?? ''}`;
        for (const type of Object.keys(columns)) {
          const score = headerScore(combined, type);
          if (score > scores[type]) { scores[type] = score; columns[type] = col; }
        }
      }

      const total = scores.poz * 4 + scores.desc * 2 + scores.unit + scores.price * 3 + scores.install;
      if (scores.poz >= 7 && (!best || total > best.total)) {
        best = {row: rowIndex, dataStart: rowIndex + 1, columns, scores, total};
      }
    }

    if (best) return best;

    const pozCounts = new Array(maxCols).fill(0);
    for (let rowIndex = 0; rowIndex < Math.min(grid.length, 250); rowIndex++) {
      const row = Array.isArray(grid[rowIndex]) ? grid[rowIndex] : [];
      for (let col = 0; col < maxCols; col++) if (extractPoz(row[col])) pozCounts[col]++;
    }
    const pozCol = pozCounts.indexOf(Math.max(...pozCounts));
    if (pozCol < 0 || pozCounts[pozCol] < 3) return null;

    const numericCounts = new Array(maxCols).fill(0);
    const textLengths = new Array(maxCols).fill(0);
    const textCounts = new Array(maxCols).fill(0);
    const unitCounts = new Array(maxCols).fill(0);
    const units = /^(AD|ADET|M|M2|M²|M3|M³|KG|TON|TAKIM|SET|ÇİFT|CIFT|SAAT|GÜN|GUN|AY|LT|LİTRE|LITRE)$/i;

    for (let rowIndex = 0; rowIndex < Math.min(grid.length, 250); rowIndex++) {
      const row = Array.isArray(grid[rowIndex]) ? grid[rowIndex] : [];
      for (let col = 0; col < maxCols; col++) {
        const value = row[col];
        if (Number.isFinite(parseNumber(value))) numericCounts[col]++;
        const text = String(value ?? '').trim();
        if (text) { textLengths[col] += text.length; textCounts[col]++; }
        if (units.test(text.replace(/\s+/g, ''))) unitCounts[col]++;
      }
    }

    const candidateCols = [...Array(maxCols).keys()].filter(col => col !== pozCol);
    const priceCol = candidateCols.sort((a, b) => numericCounts[b] - numericCounts[a])[0] ?? -1;
    const unitCol = candidateCols.sort((a, b) => unitCounts[b] - unitCounts[a])[0] ?? -1;
    const descCol = candidateCols.sort((a, b) => {
      const avgA = textCounts[a] ? textLengths[a] / textCounts[a] : 0;
      const avgB = textCounts[b] ? textLengths[b] / textCounts[b] : 0;
      return avgB - avgA;
    })[0] ?? -1;

    return {row: -1, dataStart: 0, columns: {poz: pozCol, desc: descCol, unit: unitCol, price: priceCol, install: -1}, scores: {}, total: 0};
  };

  const gridToRecords = (grid, sheetName = '') => {
    const detected = detectColumns(grid);
    if (!detected) return [];
    const {columns, dataStart} = detected;
    const records = [];

    for (let rowIndex = dataStart; rowIndex < grid.length; rowIndex++) {
      const row = Array.isArray(grid[rowIndex]) ? grid[rowIndex] : [];
      const poz = extractPoz(row[columns.poz]);
      if (!poz) continue;
      const tanim = columns.desc >= 0 ? String(row[columns.desc] ?? '').trim() : '';
      const birim = columns.unit >= 0 ? String(row[columns.unit] ?? '').trim() : '';
      const fiyat = columns.price >= 0 ? formatPrice(row[columns.price]) : '';
      const montaj = columns.install >= 0 ? formatPrice(row[columns.install]) : '';
      if (!tanim && !birim && !fiyat && !montaj) continue;
      records.push({poz, tanim, birim, fiyat, montaj, kaynak: sheetName});
    }
    return records;
  };

  const objectRowsToRecords = rows => {
    if (!Array.isArray(rows)) return [];
    const records = [];
    for (const item of rows) {
      if (!item || typeof item !== 'object') continue;
      const entries = Object.entries(item);
      const find = type => {
        let best = null;
        for (const [key, value] of entries) {
          const score = headerScore(key, type);
          if (!best || score > best.score) best = {score, value};
        }
        return best && best.score > 0 ? best.value : '';
      };
      const poz = extractPoz(find('poz'));
      if (!poz) continue;
      records.push({
        poz,
        tanim: String(find('desc') ?? '').trim(),
        birim: String(find('unit') ?? '').trim(),
        fiyat: formatPrice(find('price')),
        montaj: formatPrice(find('install')),
        kaynak: 'JSON'
      });
    }
    return records;
  };

  const parseBookFile = async file => {
    const extension = file.name.split('.').pop().toLowerCase();
    let records = [];

    if (extension === 'json') {
      const parsed = JSON.parse(await file.text());
      records = objectRowsToRecords(Array.isArray(parsed) ? parsed : (parsed.records || parsed.data || []));
    } else {
      if (!window.XLSX) throw new Error('Excel okuyucusu yüklenemedi. Sayfayı yenileyip tekrar deneyin.');
      const workbook = XLSX.read(await file.arrayBuffer(), {type: 'array', raw: false, cellDates: false});
      for (const sheetName of workbook.SheetNames) {
        const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {header: 1, defval: '', raw: false});
        records.push(...gridToRecords(grid, sheetName));
      }
    }

    const unique = new Map();
    for (const record of records) unique.set(normalizePoz(record.poz), record);
    return Array.from(unique.values());
  };

  window.BYSAY_LOAD_USER_BOOKS = async () => {
    const books = await getAllBooks();
    const merged = new Map();
    const base = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    base.forEach(item => merged.set(normalizePoz(item.poz), item));

    let userPozCount = 0;
    for (const book of books.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))) {
      const records = Array.isArray(book.records) ? book.records : [];
      userPozCount += records.length;
      records.forEach(item => merged.set(normalizePoz(item.poz), {...item, kaynak: book.name || item.kaynak || 'Yüklenen poz kitabı'}));
    }

    window.POZ_DATA = Array.from(merged.values());
    const oldMeta = window.POZ_META || {};
    window.POZ_META = {
      ...oldMeta,
      recordCount: window.POZ_DATA.length,
      userBookCount: books.length,
      userPozCount,
      sourceFile: [oldMeta.sourceFile, ...books.map(book => book.name)].filter(Boolean).join(' + ')
    };
    return {bookCount: books.length, pozCount: userPozCount};
  };

  const injectStyles = () => {
    if (document.getElementById('pozBookManagerStyles')) return;
    const style = document.createElement('style');
    style.id = 'pozBookManagerStyles';
    style.textContent = `
      .book-modal-backdrop{position:fixed;inset:0;background:rgba(10,18,32,.58);display:none;align-items:center;justify-content:center;padding:22px;z-index:10020;backdrop-filter:blur(5px)}
      .book-modal-backdrop.show{display:flex}
      .book-modal{width:min(760px,100%);max-height:min(760px,92vh);overflow:auto;background:#fff;border-radius:24px;box-shadow:0 28px 80px rgba(3,10,25,.30);padding:26px;color:#152034}
      .book-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}
      .book-modal-head h2{margin:0 0 6px;font-size:24px}.book-modal-head p{margin:0;color:#657085;line-height:1.55}
      .book-close{border:0;background:#eef2f7;border-radius:12px;width:38px;height:38px;font-size:24px;cursor:pointer;color:#536078}
      .book-upload-box{border:1.5px dashed #b9c6d8;border-radius:18px;padding:22px;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:18px;margin:18px 0}
      .book-upload-box strong{display:block;margin-bottom:5px}.book-upload-box small{display:block;color:#728097;line-height:1.45}
      .book-list-title{display:flex;align-items:center;justify-content:space-between;margin:22px 0 10px}.book-list-title h3{margin:0;font-size:16px}.book-list{display:grid;gap:10px}
      .book-row{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid #e2e8f0;border-radius:15px;padding:14px 15px}
      .book-row-main{min-width:0}.book-row-main strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.book-row-main small{display:block;color:#738096;margin-top:4px}
      .book-delete{border:1px solid #efc9cb;color:#b4232b;background:#fff5f5;border-radius:10px;padding:8px 11px;cursor:pointer;font-weight:700}
      .book-empty{padding:24px;text-align:center;color:#748197;border:1px dashed #d6deea;border-radius:15px}
      .book-progress{display:none;margin-top:12px;padding:12px 14px;border-radius:12px;background:#eef6ff;color:#205b9c;font-weight:700}.book-progress.show{display:block}
      .book-help{margin-top:18px;padding:14px 16px;border-radius:14px;background:#fff8e8;color:#72521b;font-size:13px;line-height:1.55}
      @media(max-width:640px){.book-upload-box{align-items:stretch;flex-direction:column}.book-modal{padding:20px}.book-row{align-items:flex-start}}
    `;
    document.head.appendChild(style);
  };

  const createModal = () => {
    if (document.getElementById('pozBookModal')) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'pozBookModal';
    wrapper.className = 'book-modal-backdrop';
    wrapper.innerHTML = `
      <div class="book-modal" role="dialog" aria-modal="true" aria-labelledby="pozBookTitle">
        <div class="book-modal-head">
          <div><h2 id="pozBookTitle">Poz Kitabı Ekle / Güncelle</h2><p>Excel, CSV veya JSON fiyat kitabını seçin. Aynı dosya adıyla yeniden yüklediğinizde eski kayıt otomatik güncellenir.</p></div>
          <button class="book-close" id="pozBookCloseBtn" aria-label="Kapat">×</button>
        </div>
        <div class="book-upload-box">
          <div><strong>Yeni poz kitabı seçin</strong><small>Program Poz No, Poz Tanımı, Birim, Birim Fiyat ve varsa Montaj Bedeli sütunlarını otomatik algılar.</small></div>
          <button class="btn btn-primary" id="pozBookSelectBtn">Dosya Seç</button>
          <input id="pozBookFileInput" type="file" accept=".xlsx,.xls,.xlsm,.csv,.tsv,.json" hidden>
        </div>
        <div class="book-progress" id="pozBookProgress">Poz kitabı okunuyor…</div>
        <div class="book-list-title"><h3>Kaydedilmiş poz kitapları</h3><button class="btn btn-ghost" id="pozBookClearBtn">Tümünü Sil</button></div>
        <div class="book-list" id="pozBookList"></div>
        <div class="book-help"><strong>Öncelik kuralı:</strong> Yüklediğiniz kitapta aynı poz numarası varsa, programdaki eski fiyatın yerine yeni yüklediğiniz tanım, birim ve fiyat kullanılır. Kayıtlar bu tarayıcıda saklanır ve program yeniden açıldığında otomatik yüklenir.</div>
      </div>`;
    document.body.appendChild(wrapper);
  };

  const renderBookList = async () => {
    const list = document.getElementById('pozBookList');
    if (!list) return;
    const books = await getAllBooks();
    if (!books.length) {
      list.innerHTML = '<div class="book-empty">Henüz haricî poz kitabı yüklenmedi.</div>';
      return;
    }
    books.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    list.innerHTML = books.map(book => `
      <div class="book-row">
        <div class="book-row-main"><strong>${String(book.name || 'Poz kitabı').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}</strong><small>${formatCount(book.count || book.records?.length)} poz • ${new Date(book.updatedAt).toLocaleString('tr-TR')}</small></div>
        <button class="book-delete" data-book-delete="${book.id}">Sil</button>
      </div>`).join('');
  };

  const openModal = async () => {
    const modal = document.getElementById('pozBookModal');
    if (!modal) return;
    await renderBookList();
    modal.classList.add('show');
  };

  const closeModal = () => document.getElementById('pozBookModal')?.classList.remove('show');

  const importBook = async file => {
    const progress = document.getElementById('pozBookProgress');
    progress?.classList.add('show');
    if (progress) progress.textContent = `${file.name} okunuyor…`;
    try {
      const records = await parseBookFile(file);
      if (!records.length) throw new Error('Dosyada aktarılabilir Poz No, Tanım, Birim ve Fiyat satırı bulunamadı.');
      const book = {
        id: normalizeText(file.name) || `book-${Date.now()}`,
        name: file.name,
        updatedAt: new Date().toISOString(),
        count: records.length,
        records
      };
      await saveBook(book);
      if (progress) progress.textContent = `${formatCount(records.length)} poz kaydedildi. Program yenileniyor…`;
      notify(`${formatCount(records.length)} poz kitabına eklendi.`);
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      console.error(error);
      if (progress) progress.textContent = `Hata: ${error?.message || error}`;
      notify(error?.message || 'Poz kitabı yüklenemedi.', 6000);
    }
  };

  const bindUi = () => {
    injectStyles();
    createModal();
    document.getElementById('pozBookBtn')?.addEventListener('click', openModal);
    document.getElementById('pozBookCloseBtn')?.addEventListener('click', closeModal);
    document.getElementById('pozBookModal')?.addEventListener('click', event => { if (event.target.id === 'pozBookModal') closeModal(); });
    document.getElementById('pozBookSelectBtn')?.addEventListener('click', () => document.getElementById('pozBookFileInput')?.click());
    document.getElementById('pozBookFileInput')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) importBook(file);
    });
    document.getElementById('pozBookList')?.addEventListener('click', async event => {
      const button = event.target.closest('[data-book-delete]');
      if (!button) return;
      await removeBook(button.dataset.bookDelete);
      await renderBookList();
      notify('Poz kitabı silindi. Değişikliğin uygulanması için sayfa yenileniyor.');
      setTimeout(() => location.reload(), 650);
    });
    document.getElementById('pozBookClearBtn')?.addEventListener('click', async () => {
      const books = await getAllBooks();
      if (!books.length) return notify('Silinecek kayıtlı poz kitabı yok.');
      if (!confirm('Yüklediğiniz tüm poz kitapları silinsin mi?')) return;
      await clearBooks();
      notify('Tüm haricî poz kitapları silindi.');
      setTimeout(() => location.reload(), 650);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUi, {once: true});
  else bindUi();

  window.BYSAY_POZ_BOOK_MANAGER_VERSION = VERSION;
})();
