(() => {
  'use strict';

  const VERSION = '20260712-18';
  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '');
  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/[–—−]/g, '-');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const formatCount = value => new Intl.NumberFormat('tr-TR').format(Number(value) || 0);

  const institutionInfo = text => {
    const norm = normalize(text);
    const known = [
      ['ÇŞİDB', 'ÇŞ', 'csidb', /cevre|sehircilik|csidb|csb/],
      ['AYGM', 'AY', 'aygm', /altyapiyatirimlari|aygm/],
      ['DSİ', 'DS', 'dsi', /devletsuisleri|dsi/],
      ['KGM', 'KG', 'kgm', /karayollari|kgm/],
      ['PTT', 'PT', 'ptt', /ptt|postatelgraf/],
      ['İLBANK', 'İL', 'ilbank', /illerbankasi|ilbank/],
      ['TEDAŞ', 'TD', 'custom', /tedas/],
      ['TEİAŞ', 'TE', 'custom', /teias/],
      ['EÜAŞ', 'EÜ', 'custom', /euas/],
      ['BOTAŞ', 'BO', 'custom', /botas/],
      ['TCDD', 'TC', 'custom', /tcdd/],
      ['VGM', 'VG', 'custom', /vakiflar|vgm/],
      ['KTB', 'KT', 'custom', /kulturturizm|ktb/],
      ['Milli Saraylar', 'MS', 'custom', /millisaraylar/]
    ];
    for (const [name, initials, slug, pattern] of known) {
      if (pattern.test(norm)) return {name, initials, slug};
    }
    return null;
  };

  const disciplineOf = record => {
    const explicit = String(record?.disiplin || record?.kitap || '').toLocaleUpperCase('tr-TR');
    if (explicit.includes('ELK')) return 'ELK';
    if (explicit.includes('MEK')) return 'MEK';
    if (explicit.includes('İNŞ') || explicit.includes('INS')) return 'İNŞ';
    const code = normalizePoz(record?.poz).replace(/-(D|M)$/i, '');
    if (/^(35|36)\./.test(code)) return 'ELK';
    if (/^25\./.test(code)) return 'MEK';
    if (/^(15|16|17|18|19|20|21|22|23|24|77)\./.test(code)) return 'İNŞ';
    return 'ÖZL';
  };

  const periodOf = text => {
    const raw = String(text || '');
    const norm = normalize(raw);
    const year = raw.match(/20\d{2}/)?.[0] || '2026';
    const numericMonth = raw.match(/20\d{2}[-_.\s](0?[1-9]|1[0-2])(?:\D|$)/)?.[1];
    const months = [
      ['ocak','Ocak'],['subat','Şubat'],['mart','Mart'],['nisan','Nisan'],['mayis','Mayıs'],['haziran','Haziran'],
      ['temmuz','Temmuz'],['agustos','Ağustos'],['eylul','Eylül'],['ekim','Ekim'],['kasim','Kasım'],['aralik','Aralık']
    ];
    let month = months.find(([key]) => norm.includes(key))?.[1] || '';
    if (!month && numericMonth) month = months[Number(numericMonth) - 1]?.[1] || '';
    if (/1donem|birincidonem/.test(norm)) return `1. Dönem ${year}`;
    if (/2donem|ikincidonem/.test(norm)) return `2. Dönem ${year}`;
    return [month, year].filter(Boolean).join(' ');
  };

  const cleanSourceName = text => String(text || '')
    .replace(/\.(xlsx?|xlsm|csv|json|pdf)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const collectBooks = () => {
    const data = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    const groups = new Map();

    for (const record of data) {
      const code = normalizePoz(record?.poz);
      if (!code || /-(D|M)$/i.test(code)) continue;

      const rawSource = String(record?.kitapKaynak || record?.kitapKurum || record?.kurum || record?.kaynak || '').trim();
      const explicitInstitution = institutionInfo(`${record?.kitapKurum || ''} ${record?.kurum || ''}`);
      const sourceInstitution = institutionInfo(rawSource);
      let institution = explicitInstitution || sourceInstitution;
      const discipline = disciplineOf(record);

      const sourceNorm = normalize(rawSource);
      const looksLikeBase = !rawSource || /tablo|mekaniktesisat|insaatbirimfiyat|temmuz2026|2026temmuz/.test(sourceNorm);
      if (!institution && looksLikeBase && ['İNŞ','MEK','ELK'].includes(discipline)) {
        institution = {name:'ÇŞİDB', initials:'ÇŞ', slug:'csidb'};
      }

      let key;
      let title;
      let period;
      let slug;
      let initials;
      let order = 90;

      if (institution?.name === 'ÇŞİDB') {
        const disciplineLabel = discipline === 'İNŞ' ? 'İnşaat' : discipline === 'MEK' ? 'Mekanik' : discipline === 'ELK' ? 'Elektrik' : 'Özel';
        key = `csidb-${discipline}`;
        title = `ÇŞİDB ${disciplineLabel}`;
        period = 'Temmuz 2026';
        slug = 'csidb';
        initials = discipline === 'İNŞ' ? 'Çİ' : discipline === 'MEK' ? 'ÇM' : discipline === 'ELK' ? 'ÇE' : 'ÇŞ';
        order = discipline === 'İNŞ' ? 1 : discipline === 'MEK' ? 2 : discipline === 'ELK' ? 3 : 4;
      } else if (institution) {
        key = `inst-${normalize(institution.name)}`;
        title = institution.name;
        period = periodOf(rawSource);
        slug = institution.slug;
        initials = institution.initials;
        order = ({AYGM:10,'DSİ':11,KGM:12,PTT:13,'İLBANK':14}[institution.name] ?? 30);
      } else {
        const sourceName = cleanSourceName(rawSource) || 'Yüklenen Poz Kitabı';
        key = `custom-${normalize(sourceName)}`;
        title = sourceName.length > 34 ? `${sourceName.slice(0, 32)}…` : sourceName;
        period = periodOf(rawSource);
        slug = 'custom';
        initials = sourceName.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('tr-TR') || 'PK';
      }

      if (!groups.has(key)) groups.set(key, {key, title, period, slug, initials, order, count:0});
      groups.get(key).count++;
    }

    return Array.from(groups.values())
      .filter(book => book.count > 0)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'tr'));
  };

  const bookCardHtml = (book, modal = false) => `
    <${modal ? 'div' : 'button'} class="${modal ? 'installed-book-item' : 'loaded-book-card'}" ${modal ? '' : 'type="button"'} data-loaded-book="${escapeHtml(book.key)}" title="${escapeHtml(book.title)} • ${formatCount(book.count)} poz">
      <span class="loaded-book-logo logo-${escapeHtml(book.slug)}">${escapeHtml(book.initials)}</span>
      <span class="loaded-book-copy"><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.period)}${modal ? ` • ${formatCount(book.count)} poz` : ''}</small></span>
    </${modal ? 'div' : 'button'}>`;

  const updateModal = books => {
    const modal = document.getElementById('pozBookModal');
    if (!modal) return;
    const dialog = modal.querySelector('.book-modal');
    const uploadBox = modal.querySelector('.book-upload-box');
    if (!dialog || !uploadBox) return;

    const title = modal.querySelector('#pozBookTitle');
    if (title) title.textContent = 'Programdaki Poz Kitapları';
    const intro = modal.querySelector('.book-modal-head p');
    if (intro) intro.textContent = 'Yüklü poz kitaplarını görüntüleyin veya yeni bir fiyat kitabı ekleyip güncelleyin.';
    const userTitle = modal.querySelector('.book-list-title h3');
    if (userTitle) userTitle.textContent = 'Sonradan Eklenen Poz Kitapları';

    let panel = modal.querySelector('.installed-books-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'installed-books-panel';
      uploadBox.insertAdjacentElement('beforebegin', panel);
    }
    panel.innerHTML = `
      <div class="installed-books-panel-head"><strong>Programda yüklü kitaplar</strong><small>${books.length} kitap • ${formatCount(books.reduce((sum, book) => sum + book.count, 0))} temel poz</small></div>
      <div class="installed-books-grid">${books.map(book => bookCardHtml(book, true)).join('')}</div>`;
  };

  const openBookModal = (bookKey, books) => {
    updateModal(books);
    document.getElementById('pozBookBtn')?.click();
    setTimeout(() => {
      const modal = document.getElementById('pozBookModal');
      if (!modal) return;
      modal.querySelectorAll('.installed-book-item').forEach(item => item.classList.toggle('selected', item.dataset.loadedBook === bookKey));
      modal.querySelector(`.installed-book-item[data-loaded-book="${CSS.escape(bookKey)}"]`)?.scrollIntoView({block:'nearest', behavior:'smooth'});
    }, 80);
  };

  const setupHeaderAndFilePicker = () => {
    document.title = 'Bysay Yaklaşık Hesap';
    const name = document.querySelector('.brand-name');
    if (name) name.textContent = 'Bysay Yaklaşık Hesap';
    const sub = document.querySelector('.brand-sub');
    if (sub) sub.textContent = '';

    const dropIcon = document.querySelector('.drop-icon');
    const fileInput = document.getElementById('fileInput');
    const dropTitle = document.querySelector('.drop-title');
    if (dropTitle) dropTitle.textContent = 'Dosyayı buraya sürükleyin veya soldaki ok ile seçin';
    if (dropIcon && fileInput && !dropIcon.dataset.filePickerReady) {
      dropIcon.dataset.filePickerReady = '1';
      dropIcon.setAttribute('role', 'button');
      dropIcon.setAttribute('tabindex', '0');
      dropIcon.setAttribute('aria-label', 'Dosya seç ve içe aktar');
      const chooseFile = event => {
        event.preventDefault();
        event.stopPropagation();
        fileInput.click();
      };
      dropIcon.addEventListener('click', chooseFile);
      dropIcon.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') chooseFile(event);
      });
    }
  };

  const setupBottomAdd = () => {
    const tableWrap = document.querySelector('.workspace-card .table-wrap');
    if (!tableWrap || document.getElementById('bottomAddRowBtn')) return;
    const holder = document.createElement('div');
    holder.className = 'bottom-add-row';
    holder.innerHTML = '<button id="bottomAddRowBtn" type="button" aria-label="Yeni satır ekle" title="Yeni satır ekle">＋</button>';
    tableWrap.insertAdjacentElement('afterend', holder);
    document.getElementById('bottomAddRowBtn')?.addEventListener('click', () => document.getElementById('addRowBtn')?.click());
  };

  const setupBookShelf = books => {
    const actions = document.querySelector('.hero-actions.full-width');
    const bookButton = document.getElementById('pozBookBtn');
    const pasteButton = document.getElementById('focusPasteBtn');
    if (!actions || !bookButton || !pasteButton) return;

    let shelf = document.getElementById('loadedBookShelf');
    if (!shelf) {
      shelf = document.createElement('div');
      shelf.id = 'loadedBookShelf';
      shelf.className = 'loaded-book-shelf';
      bookButton.insertAdjacentElement('afterend', shelf);
      shelf.addEventListener('click', event => {
        const card = event.target.closest('[data-loaded-book]');
        if (card) openBookModal(card.dataset.loadedBook, collectBooks());
      });
    }
    shelf.innerHTML = books.map(book => bookCardHtml(book, false)).join('');
    updateModal(books);

    if (!bookButton.dataset.modalRefreshReady) {
      bookButton.dataset.modalRefreshReady = '1';
      bookButton.addEventListener('click', () => setTimeout(() => updateModal(collectBooks()), 20));
    }
  };

  const init = () => {
    setupHeaderAndFilePicker();
    setupBottomAdd();
    const books = collectBooks();
    if (books.length) setupBookShelf(books);
    document.documentElement.dataset.bysayUiVersion = VERSION;
  };

  const waitUntilReady = () => {
    const appReady = document.getElementById('recordCount')?.textContent?.trim() !== '—' && document.getElementById('resultBody');
    if (!appReady) return setTimeout(waitUntilReady, 120);
    init();
    setTimeout(init, 500);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitUntilReady, {once:true});
  else waitUntilReady();
})();
