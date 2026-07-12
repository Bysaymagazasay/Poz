(() => {
  'use strict';

  const VERSION = '20260712-28';
  const HIDDEN_KEY = window.BYSAY_HIDDEN_BOOK_STORAGE_KEY || 'BYSAY_HIDDEN_POZ_BOOK_KEYS_V1';
  const RESTORE_MARKER = 'BYSAY_RESTORE_BOOKS_20260712_28';

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[ch]));
  const formatCount = value => new Intl.NumberFormat('tr-TR').format(Number(value) || 0);

  const restorePreviouslyHiddenBooks = () => {
    if (sessionStorage.getItem(RESTORE_MARKER) === '1') return false;
    sessionStorage.setItem(RESTORE_MARKER, '1');
    let hidden = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
      hidden = Array.isArray(parsed) ? parsed : [];
    } catch (_) { hidden = []; }
    localStorage.removeItem(HIDDEN_KEY);
    if (hidden.length) {
      location.reload();
      return true;
    }
    return false;
  };

  if (restorePreviouslyHiddenBooks()) return;

  const userBooks = () => Array.isArray(window.BYSAY_USER_BOOK_CATALOG)
    ? window.BYSAY_USER_BOOK_CATALOG
    : [];

  const bookKey = book => {
    const first = Array.isArray(book?.records) ? book.records[0] : null;
    if (first && typeof window.BYSAY_BOOK_KEY_FOR_RECORD === 'function') {
      const rawLike = {...first};
      delete rawLike.kitapId;
      delete rawLike.userBookId;
      const key = window.BYSAY_BOOK_KEY_FOR_RECORD(rawLike, book.name);
      if (key) return key;
    }
    return `user-book-${book?.id || Date.now()}`;
  };

  const cardHtml = (book, key) => {
    const title = book.institution || book.name || 'Poz Kitabı';
    const fullTitle = book.institutionFull || book.name || 'Yüklenen Poz Kitabı';
    const initials = book.initials || title.slice(0, 2).toLocaleUpperCase('tr-TR');
    const slug = book.slug || 'custom';
    return `<button type="button" class="catalog-book-card" data-open-catalog-book="${escapeHtml(key)}" data-user-book-id="${escapeHtml(String(book.id))}">
      <span class="catalog-book-logo logo-${escapeHtml(slug)}"><b>${escapeHtml(initials)}</b></span>
      <span class="catalog-book-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(fullTitle)}</span><small>${escapeHtml(book.period || '2026')} • ${formatCount(book.count || book.records?.length)} poz</small></span>
      <span class="catalog-book-open">Aç ›</span>
    </button>`;
  };

  const openBookWindow = book => {
    const win = window.open('', '_blank');
    if (!win) return;
    const records = Array.isArray(book.records) ? book.records : [];
    const rows = records.map((record, index) => `<tr data-search="${escapeHtml(`${record.poz} ${record.tanim} ${record.birim}`.toLocaleLowerCase('tr-TR'))}">
      <td>${index + 1}</td><td class="code">${escapeHtml(record.poz)}</td><td>${escapeHtml(record.tanim || '—')}</td><td>${escapeHtml(record.birim || '—')}</td><td class="money">${escapeHtml(record.fiyat || '—')}</td><td class="money">${escapeHtml(record.montaj || '—')}</td>
    </tr>`).join('');
    const title = book.institution || book.name || 'Poz Kitabı';
    const fullTitle = book.institutionFull || book.name || 'Yüklenen Poz Kitabı';
    const initials = book.initials || 'PK';
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} Poz Kitabı</title><style>
      *{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:#152034;font:14px Inter,Arial,sans-serif}.head{position:sticky;top:0;z-index:5;background:#0f1d35;color:#fff;padding:18px 26px;box-shadow:0 6px 22px rgba(15,29,53,.22)}.head-row{display:flex;align-items:center;gap:15px}.logo{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:#fff;color:#0f1d35;font-weight:900;font-size:15px}.title{min-width:0}.title h1{margin:0 0 4px;font-size:22px}.title p{margin:0;color:#cbd6e8;font-size:12px}.actions{margin-left:auto;display:flex;gap:8px}.actions button{border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer}.tools{display:flex;gap:12px;align-items:center;padding:16px 24px;background:#fff;border-bottom:1px solid #dfe5ee}.tools input{flex:1;min-width:180px;border:1px solid #cfd8e6;border-radius:11px;padding:11px 13px;font-size:14px}.tools strong{white-space:nowrap;color:#56637a}.wrap{padding:18px 24px 32px}.table{overflow:auto;background:#fff;border:1px solid #dfe5ee;border-radius:16px;box-shadow:0 8px 26px rgba(18,34,61,.06)}table{width:100%;border-collapse:collapse;min-width:1050px}th{position:sticky;top:90px;background:#eef3f8;color:#43516a;text-align:left;font-size:11px;letter-spacing:.03em;padding:12px 13px;border-bottom:1px solid #d9e1eb}td{padding:11px 13px;border-bottom:1px solid #edf1f5;vertical-align:top}tbody tr:hover{background:#f8fbff}.code{font-weight:800;color:#1d4ed8;white-space:nowrap}.money{text-align:right;white-space:nowrap;font-weight:700}th:first-child,td:first-child{width:58px;text-align:center;color:#7a8799}th:nth-child(4),td:nth-child(4){width:90px;text-align:center}th:nth-child(5),th:nth-child(6){text-align:right;width:140px}.empty{display:none;padding:50px;text-align:center;color:#7a8799}@media print{.head{position:static}.actions,.tools{display:none}.wrap{padding:0}.table{border:0;box-shadow:none}th{position:static}}
    </style></head><body><header class="head"><div class="head-row"><div class="logo">${escapeHtml(initials)}</div><div class="title"><h1>${escapeHtml(title)} Poz Kitabı</h1><p>${escapeHtml(fullTitle)} • ${escapeHtml(book.period || '2026')} • ${formatCount(records.length)} poz</p></div><div class="actions"><button onclick="window.print()">Yazdır</button><button id="csvBtn">CSV İndir</button></div></div></header><div class="tools"><input id="search" type="search" placeholder="Poz no veya açıklamada ara…"><strong id="visibleCount">${formatCount(records.length)} kayıt</strong></div><main class="wrap"><div class="table"><table><thead><tr><th>#</th><th>Poz No</th><th>Poz Açıklaması</th><th>Birim</th><th>Poz Fiyatı</th><th>Montaj Bedeli</th></tr></thead><tbody id="rows">${rows}</tbody></table><div class="empty" id="empty">Aramanızla eşleşen poz bulunamadı.</div></div></main><script>
      const search=document.getElementById('search'),rows=[...document.querySelectorAll('#rows tr')],count=document.getElementById('visibleCount'),empty=document.getElementById('empty');search.addEventListener('input',()=>{const q=search.value.toLocaleLowerCase('tr-TR').trim();let visible=0;rows.forEach(row=>{const show=!q||row.dataset.search.includes(q);row.style.display=show?'':'none';if(show)visible++;});count.textContent=visible.toLocaleString('tr-TR')+' kayıt';empty.style.display=visible?'none':'block';});document.getElementById('csvBtn').addEventListener('click',()=>{const lines=[['Sıra','Poz No','Poz Açıklaması','Birim','Poz Fiyatı','Montaj Bedeli'],...rows.map(row=>[...row.cells].map(cell=>cell.innerText.trim()))];const esc=v=>'"'+String(v).replace(/"/g,'""')+'"';const csv='\\uFEFF'+lines.map(line=>line.map(esc).join(';')).join('\\r\\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='${escapeHtml(title).replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü_-]/g,'_')}_Poz_Kitabi.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
    <\/script></body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const updateHeaderCount = panel => {
    const cards = [...panel.querySelectorAll('.catalog-book-card')];
    const total = cards.reduce((sum, card) => {
      const text = card.querySelector('.catalog-book-copy small')?.textContent || '';
      const match = text.match(/([\d.]+)\s*poz/i);
      return sum + (match ? Number(match[1].replace(/\./g, '')) : 0);
    }, 0);
    const small = panel.querySelector('.program-book-catalog-head small');
    const value = `${cards.length} kitap • ${formatCount(total)} poz`;
    if (small && small.textContent !== value) small.textContent = value;
  };

  const sync = () => {
    const logo = document.getElementById('brandLogo');
    if (logo && !logo.src.includes('v=20260712-28')) logo.src = 'assets/bysay-logo.svg?v=20260712-28';

    const modal = document.getElementById('pozBookModal');
    const panel = modal?.querySelector('#programBookCatalog');
    const grid = panel?.querySelector('.program-book-catalog-grid');
    if (!modal || !panel || !grid) return;

    for (const book of userBooks()) {
      const id = String(book.id);
      if (grid.querySelector(`[data-user-book-id="${CSS.escape(id)}"]`)) continue;
      const key = bookKey(book);
      if (grid.querySelector(`[data-open-catalog-book="${CSS.escape(key)}"]`)) continue;
      grid.insertAdjacentHTML('beforeend', cardHtml(book, key));
    }
    updateHeaderCount(panel);
  };

  const bindOpenHandler = () => {
    const modal = document.getElementById('pozBookModal');
    if (!modal || modal.dataset.userBookOpenReady === '1') return;
    modal.dataset.userBookOpenReady = '1';
    modal.addEventListener('click', event => {
      if (event.target.closest('.catalog-book-delete')) return;
      const card = event.target.closest('[data-user-book-id]');
      if (!card) return;
      const book = userBooks().find(item => String(item.id) === card.dataset.userBookId);
      if (!book) return;
      event.preventDefault();
      event.stopPropagation();
      openBookWindow(book);
    }, true);
  };

  const refresh = () => {
    bindOpenHandler();
    sync();
  };

  const start = () => {
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, {childList:true, subtree:true});
    document.getElementById('pozBookBtn')?.addEventListener('click', () => setTimeout(refresh, 60));
    document.documentElement.dataset.bysayCatalogHotfixVersion = VERSION;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();