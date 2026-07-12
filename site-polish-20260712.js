(() => {
  'use strict';

  const DB_NAME = 'BYSAY_POZ_KITAPLARI_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'books';
  const FALLBACK_KEY = 'BYSAY_POZ_KITAPLARI_FALLBACK_V1';
  const HIDDEN_KEY = window.BYSAY_HIDDEN_BOOK_STORAGE_KEY || 'BYSAY_HIDDEN_POZ_BOOK_KEYS_V1';

  const normalizeText = value => String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '');

  const notify = (message, duration = 3200) => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), duration);
  };

  const uploadIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 16V5"></path>
      <path d="m8 9 4-4 4 4"></path>
      <path d="M5 14v4.25A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V14"></path>
    </svg>`;

  const trashIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16"></path>
      <path d="M9 7V4h6v3"></path>
      <path d="m6.5 7 .7 13h9.6l.7-13"></path>
      <path d="M10 11v5M14 11v5"></path>
    </svg>`;

  const polishHeader = () => {
    const logo = document.getElementById('brandLogo');
    if (logo) logo.src = 'assets/bysay-logo.svg?v=20260712-27';
    const dropIcon = document.querySelector('.drop-icon');
    if (dropIcon && dropIcon.dataset.polished !== '1') {
      dropIcon.dataset.polished = '1';
      dropIcon.innerHTML = uploadIcon;
      dropIcon.setAttribute('title', 'Dosya seç');
    }
    const dropTitle = document.querySelector('.drop-title');
    if (dropTitle) dropTitle.textContent = 'Dosyayı sürükleyin veya seçin';
  };

  const cardText = card => String(card?.textContent || '').toLocaleLowerCase('tr-TR');

  const fixCsidbCard = card => {
    const key = card.dataset.openCatalogBook || '';
    const logo = card.querySelector('.catalog-book-logo');
    const initials = logo?.querySelector('b');
    const title = card.querySelector('.catalog-book-copy strong');
    const full = card.querySelector('.catalog-book-copy > span');
    const text = cardText(card);
    const currentInitials = String(initials?.textContent || '').trim().toLocaleUpperCase('tr-TR');

    const isElectric = key.includes('csidb-ELK') || currentInitials === 'ÇE' || text.includes('elektrik');
    const isMechanical = key.includes('csidb-MEK') || currentInitials === 'ÇM' || text.includes('mekanik');
    const isConstruction = key.includes('csidb-İNŞ') || currentInitials === 'İ' || currentInitials === 'I' || currentInitials === 'Çİ' || text.includes('inşaat') || text.includes('insaat');

    if (!isElectric && !isMechanical && !isConstruction) return;
    logo?.classList.remove('logo-custom');
    logo?.classList.add('logo-csidb');

    if (isElectric) {
      if (initials) initials.textContent = 'ÇE';
      if (title) title.textContent = 'ÇŞİDB Elektrik';
      if (full) full.textContent = 'Çevre, Şehircilik ve İklim Değişikliği Bakanlığı • Elektrik';
    } else if (isMechanical) {
      if (initials) initials.textContent = 'ÇM';
      if (title) title.textContent = 'ÇŞİDB Mekanik';
      if (full) full.textContent = 'Çevre, Şehircilik ve İklim Değişikliği Bakanlığı • Mekanik';
    } else if (isConstruction) {
      if (initials) initials.textContent = 'Çİ';
      if (title) title.textContent = 'ÇŞİDB İnşaat';
      if (full) full.textContent = 'Çevre, Şehircilik ve İklim Değişikliği Bakanlığı • İnşaat';
    }
  };

  const wrapCard = card => {
    if (!card || card.parentElement?.classList.contains('catalog-book-card-shell')) return;
    const shell = document.createElement('div');
    shell.className = 'catalog-book-card-shell';
    card.parentNode.insertBefore(shell, card);
    shell.appendChild(card);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'catalog-book-delete';
    deleteButton.dataset.deleteBookKey = card.dataset.openCatalogBook || '';
    deleteButton.setAttribute('aria-label', 'Poz kitabını sil');
    deleteButton.setAttribute('title', 'Poz kitabını sil');
    deleteButton.innerHTML = trashIcon;
    shell.appendChild(deleteButton);
  };

  const polishModal = () => {
    const modal = document.getElementById('pozBookModal');
    if (!modal) return;

    modal.querySelector('#savedInstitutionBooksPanel')?.remove();
    modal.querySelector('.installed-books-panel')?.remove();
    modal.querySelector('.book-list-title')?.remove();
    modal.querySelector('#pozBookList')?.remove();

    const title = modal.querySelector('#pozBookTitle');
    if (title) title.textContent = 'Poz Kitapları';
    const intro = modal.querySelector('.book-modal-head p');
    if (intro) intro.textContent = 'Tüm poz kitaplarını tek listede görüntüleyin, açın, güncelleyin veya silin.';

    const panel = modal.querySelector('#programBookCatalog');
    if (!panel) return;
    const heading = panel.querySelector('.program-book-catalog-head strong');
    if (heading) heading.textContent = 'Tüm Poz Kitapları';
    const helper = panel.querySelector('.program-book-catalog-head > span');
    if (helper) helper.textContent = 'Kitaba tıklayarak tam listeyi açın';

    panel.querySelectorAll('.catalog-book-card').forEach(card => {
      fixCsidbCard(card);
      wrapCard(card);
    });
  };

  const openDb = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('Tarayıcı veritabanı desteklenmiyor.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, {keyPath:'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Poz kitabı veritabanı açılamadı.'));
  });

  const getAllBooks = async () => {
    try {
      const db = await openDb();
      const books = await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return books;
    } catch (_) {
      try {
        const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
  };

  const deleteStoredBooks = async ids => {
    if (!ids.length) return;
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        ids.forEach(id => store.delete(id));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (_) { /* localStorage fallback below */ }

    try {
      const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
      if (Array.isArray(parsed)) localStorage.setItem(FALLBACK_KEY, JSON.stringify(parsed.filter(book => !ids.includes(book.id))));
    } catch (_) { /* no-op */ }
  };

  const keyForStoredBook = book => {
    const first = Array.isArray(book?.records) ? book.records[0] : null;
    if (!first) return '';
    if (typeof window.BYSAY_BOOK_KEY_FOR_RECORD === 'function') return window.BYSAY_BOOK_KEY_FOR_RECORD(first, book.name);
    return '';
  };

  const hideBuiltInBook = key => {
    let hidden = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
      hidden = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) { hidden = []; }
    if (!hidden.includes(key)) hidden.push(key);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
  };

  const deleteBook = async (key, button) => {
    const shell = button.closest('.catalog-book-card-shell');
    const card = shell?.querySelector('.catalog-book-card');
    const title = card?.querySelector('.catalog-book-copy strong')?.textContent?.trim() || 'Bu poz kitabı';
    if (!confirm(`${title} programdan silinsin mi?`)) return;

    button.disabled = true;
    const books = await getAllBooks();
    const exactMatches = books.filter(book => keyForStoredBook(book) === key);
    const titleNorm = normalizeText(title);
    const fuzzyMatches = exactMatches.length ? [] : books.filter(book => {
      const nameNorm = normalizeText(book?.name);
      return titleNorm && (nameNorm.includes(titleNorm) || titleNorm.includes(nameNorm));
    });
    const matches = exactMatches.length ? exactMatches : fuzzyMatches;

    if (matches.length) {
      await deleteStoredBooks(matches.map(book => book.id));
      notify(`${title} silindi. Sayfa yenileniyor…`);
    } else {
      hideBuiltInBook(key);
      notify(`${title} programdan kaldırıldı. Sayfa yenileniyor…`);
    }
    setTimeout(() => location.reload(), 550);
  };

  const setupDeleteHandler = () => {
    const modal = document.getElementById('pozBookModal');
    if (!modal || modal.dataset.deleteHandlerReady === '1') return;
    modal.dataset.deleteHandlerReady = '1';
    modal.addEventListener('click', event => {
      const button = event.target.closest('[data-delete-book-key]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      deleteBook(button.dataset.deleteBookKey, button).catch(error => {
        console.error(error);
        button.disabled = false;
        notify(error?.message || 'Poz kitabı silinemedi.', 5000);
      });
    }, true);
  };

  const cellValue = cell => {
    const input = cell.querySelector('input,textarea,select');
    if (input) return input.value;
    return cell.innerText.trim();
  };

  const setupXlsExport = () => {
    const oldButton = document.getElementById('exportBtn');
    if (!oldButton || oldButton.dataset.xlsReady === '1') return;
    const button = oldButton.cloneNode(true);
    button.dataset.xlsReady = '1';
    button.textContent = 'XLS İndir';
    oldButton.replaceWith(button);

    button.addEventListener('click', () => {
      if (!window.XLSX) return notify('Excel oluşturma bileşeni yüklenemedi.', 5000);
      const table = document.querySelector('.workspace-card table');
      const bodyRows = [...document.querySelectorAll('#resultBody tr')];
      if (!table || !bodyRows.length) return notify('İndirilecek sonuç yok.');

      const headerCells = [...table.querySelectorAll('thead th')];
      const lastIndex = Math.max(0, headerCells.length - 1);
      const headers = headerCells.slice(0, lastIndex).map(th => th.innerText.trim() || '');
      const rows = bodyRows.map(tr => [...tr.cells].slice(0, lastIndex).map(cellValue));
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      sheet['!cols'] = headers.map((header, index) => ({wch: Math.min(55, Math.max(10, header.length + 3, ...rows.map(row => String(row[index] ?? '').length + 2)))}));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Yaklaşık Maliyet');
      XLSX.writeFile(workbook, 'BYSAY_Poz_Maliyet_Sonuclari.xls', {bookType:'xls'});
      notify('XLS dosyası hazırlandı.');
    });
  };

  const refresh = () => {
    polishHeader();
    polishModal();
    setupDeleteHandler();
  };

  const waitUntilAppReady = () => {
    const ready = document.getElementById('recordCount')?.textContent?.trim() !== '—';
    if (!ready) return setTimeout(waitUntilAppReady, 120);
    setupXlsExport();
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, {childList:true, subtree:true});
    document.documentElement.dataset.bysaySitePolishVersion = '20260712-27';
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitUntilAppReady, {once:true});
  else waitUntilAppReady();
})();
