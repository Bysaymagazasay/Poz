(() => {
  'use strict';

  const VERSION = '20260712-24';
  const EXPECTED = ['DSİ','KGM','AYGM','PTT','İLBANK'];
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const formatCount = value => new Intl.NumberFormat('tr-TR').format(Number(value) || 0);

  const notify = message => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 5000);
  };

  const injectStyles = () => {
    if (document.getElementById('savedBookPanelStyles')) return;
    const style = document.createElement('style');
    style.id = 'savedBookPanelStyles';
    style.textContent = `
      .saved-books-panel{margin:0 0 18px;padding:18px;border:1px solid #d8e2ef;border-radius:18px;background:linear-gradient(180deg,#f9fbfe,#f4f7fb)}
      .saved-books-panel-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:13px}
      .saved-books-panel-head>div{display:flex;flex-direction:column;gap:4px}.saved-books-panel-head strong{font-size:16px;color:#18263d}.saved-books-panel-head small{font-size:11px;color:#6e7b90}.saved-books-panel-head>span{font-size:11px;color:#526078;background:#fff;border:1px solid #dbe3ee;border-radius:999px;padding:7px 10px}
      .saved-books-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
      .saved-book-card{width:100%;border:1px solid #dce4ef;background:#fff;border-radius:15px;padding:12px;display:flex;align-items:center;gap:11px;text-align:left;color:#24324a;cursor:pointer;box-shadow:0 5px 14px rgba(16,24,40,.04);transition:.18s ease}
      .saved-book-card:hover{transform:translateY(-1px);border-color:#9eb4d6;box-shadow:0 10px 24px rgba(16,24,40,.09);background:#fbfdff}
      .saved-book-logo{width:46px;height:46px;flex:0 0 46px;border-radius:14px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#64748b,#334155);font-weight:900;box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 5px 12px rgba(15,23,42,.16)}
      .saved-book-logo.logo-dsi{background:linear-gradient(145deg,#0284c7,#0369a1)}.saved-book-logo.logo-kgm{background:linear-gradient(145deg,#dc2626,#991b1b)}.saved-book-logo.logo-aygm{background:linear-gradient(145deg,#2563eb,#1d4ed8)}.saved-book-logo.logo-ptt{background:linear-gradient(145deg,#facc15,#eab308);color:#302500}.saved-book-logo.logo-ilbank{background:linear-gradient(145deg,#16a34a,#15803d)}.saved-book-logo.logo-tedas,.saved-book-logo.logo-teias,.saved-book-logo.logo-euas{background:linear-gradient(145deg,#f59e0b,#c2410c)}
      .saved-book-copy{min-width:0;display:flex;flex:1;flex-direction:column}.saved-book-copy strong{font-size:12px;color:#1e2c43;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.saved-book-copy span{font-size:9.5px;color:#6e7b90;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.saved-book-copy small{font-size:9.5px;color:#60708a;margin-top:5px;font-weight:700}.saved-book-open{font-size:11px;font-weight:800;color:#2563eb;white-space:nowrap}
      .saved-books-empty{padding:18px;border:1px dashed #cbd5e1;border-radius:14px;background:#fff;color:#64748b;font-size:12px;line-height:1.55}.saved-books-status{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.saved-books-status span{font-size:10px;font-weight:800;border:1px solid #e2e8f0;background:#fff;color:#7b8799;border-radius:999px;padding:6px 9px}.saved-books-status span.loaded{border-color:#b9e3c6;background:#effaf2;color:#23753c}
      @media(max-width:1050px){.saved-books-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.saved-books-grid{grid-template-columns:1fr}.saved-books-panel-head{align-items:flex-start;flex-direction:column}.saved-books-panel-head>span{display:none}}
    `;
    document.head.appendChild(style);
  };

  const openBookWindow = book => {
    const win = window.open('', '_blank');
    if (!win) return notify('Poz kitabı penceresi tarayıcı tarafından engellendi. Açılır pencereye izin verin.');

    const rows = book.records.map((record, index) => `<tr data-search="${escapeHtml(`${record.poz} ${record.tanim} ${record.birim}`.toLocaleLowerCase('tr-TR'))}"><td>${index + 1}</td><td class="code">${escapeHtml(record.poz)}</td><td>${escapeHtml(record.tanim || '—')}</td><td>${escapeHtml(record.birim || '—')}</td><td class="money">${escapeHtml(record.fiyat || '—')}</td><td class="money">${escapeHtml(record.montaj || '—')}</td></tr>`).join('');
    const title = `${book.institution || book.name} Poz Kitabı`;
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
      *{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:#152034;font:14px Arial,sans-serif}.head{position:sticky;top:0;z-index:5;background:#0f1d35;color:#fff;padding:18px 26px;box-shadow:0 6px 22px rgba(15,29,53,.22)}.head-row{display:flex;align-items:center;gap:15px}.logo{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:#fff;color:#0f1d35;font-weight:900}.title{min-width:0}.title h1{margin:0 0 4px;font-size:22px}.title p{margin:0;color:#cbd6e8;font-size:12px}.actions{margin-left:auto;display:flex;gap:8px}.actions button{border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer}.tools{display:flex;gap:12px;align-items:center;padding:16px 24px;background:#fff;border-bottom:1px solid #dfe5ee}.tools input{flex:1;min-width:180px;border:1px solid #cfd8e6;border-radius:11px;padding:11px 13px;font-size:14px}.tools strong{white-space:nowrap;color:#56637a}.wrap{padding:18px 24px 32px}.table{overflow:auto;background:#fff;border:1px solid #dfe5ee;border-radius:16px;box-shadow:0 8px 26px rgba(18,34,61,.06)}table{width:100%;border-collapse:collapse;min-width:1050px}th{position:sticky;top:90px;background:#eef3f8;color:#43516a;text-align:left;font-size:11px;padding:12px 13px;border-bottom:1px solid #d9e1eb}td{padding:11px 13px;border-bottom:1px solid #edf1f5;vertical-align:top}tbody tr:hover{background:#f8fbff}.code{font-weight:800;color:#1d4ed8;white-space:nowrap}.money{text-align:right;white-space:nowrap;font-weight:700}th:first-child,td:first-child{width:58px;text-align:center;color:#7a8799}th:nth-child(4),td:nth-child(4){width:90px;text-align:center}th:nth-child(5),th:nth-child(6){text-align:right;width:140px}.empty{display:none;padding:50px;text-align:center;color:#7a8799}@media print{.head{position:static}.actions,.tools{display:none}.wrap{padding:0}.table{border:0;box-shadow:none}th{position:static}}
    </style></head><body><header class="head"><div class="head-row"><div class="logo">${escapeHtml(book.initials || 'PK')}</div><div class="title"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(book.name)} • ${escapeHtml(book.period || '2026')} • ${formatCount(book.count)} poz</p></div><div class="actions"><button onclick="window.print()">Yazdır</button><button id="csvBtn">CSV İndir</button></div></div></header><div class="tools"><input id="search" type="search" placeholder="Poz no veya açıklamada ara…"><strong id="visibleCount">${formatCount(book.count)} kayıt</strong></div><main class="wrap"><div class="table"><table><thead><tr><th>#</th><th>Poz No</th><th>Poz Açıklaması</th><th>Birim</th><th>Poz Fiyatı</th><th>Montaj Bedeli</th></tr></thead><tbody id="rows">${rows}</tbody></table><div class="empty" id="empty">Aramanızla eşleşen poz bulunamadı.</div></div></main><script>
      const search=document.getElementById('search'),rows=[...document.querySelectorAll('#rows tr')],count=document.getElementById('visibleCount'),empty=document.getElementById('empty');search.addEventListener('input',()=>{const q=search.value.toLocaleLowerCase('tr-TR').trim();let visible=0;rows.forEach(row=>{const show=!q||row.dataset.search.includes(q);row.style.display=show?'':'none';if(show)visible++;});count.textContent=visible.toLocaleString('tr-TR')+' kayıt';empty.style.display=visible?'none':'block';});document.getElementById('csvBtn').addEventListener('click',()=>{const lines=[['Sıra','Poz No','Poz Açıklaması','Birim','Poz Fiyatı','Montaj Bedeli'],...rows.map(row=>[...row.cells].map(cell=>cell.innerText.trim()))];const esc=v=>'"'+String(v).replace(/"/g,'""')+'"';const csv='\\uFEFF'+lines.map(line=>line.map(esc).join(';')).join('\\r\\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='${escapeHtml(book.institution || 'Poz_Kitabi').replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü_-]/g,'_')}_Poz_Kitabi.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
    <\/script></body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const render = () => {
    injectStyles();
    const modal = document.getElementById('pozBookModal');
    if (!modal) return false;
    const uploadBox = modal.querySelector('.book-upload-box');
    if (!uploadBox) return false;

    let panel = modal.querySelector('#savedInstitutionBooksPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'savedInstitutionBooksPanel';
      panel.className = 'saved-books-panel';
      uploadBox.insertAdjacentElement('beforebegin', panel);
      panel.addEventListener('click', event => {
        const button = event.target.closest('[data-saved-book-id]');
        if (!button) return;
        const books = Array.isArray(window.BYSAY_USER_BOOK_CATALOG) ? window.BYSAY_USER_BOOK_CATALOG : [];
        const book = books.find(item => String(item.id) === button.dataset.savedBookId);
        if (book) openBookWindow(book);
      });
    }

    const books = Array.isArray(window.BYSAY_USER_BOOK_CATALOG) ? window.BYSAY_USER_BOOK_CATALOG : [];
    const cards = books.map(book => `<button type="button" class="saved-book-card" data-saved-book-id="${escapeHtml(book.id)}"><span class="saved-book-logo logo-${escapeHtml(book.slug || 'custom')}">${escapeHtml(book.initials || 'PK')}</span><span class="saved-book-copy"><strong>${escapeHtml(book.institution || book.name)}</strong><span>${escapeHtml(book.name)}</span><small>${escapeHtml(book.period || '2026')} • ${formatCount(book.count)} poz</small></span><span class="saved-book-open">Aç ›</span></button>`).join('');
    const loadedCodes = new Set(books.map(book => String(book.institution || '').toLocaleUpperCase('tr-TR')));
    const status = EXPECTED.map(code => `<span class="${loadedCodes.has(code) ? 'loaded' : ''}">${escapeHtml(code)} ${loadedCodes.has(code) ? 'yüklü' : 'yüklü değil'}</span>`).join('');

    panel.innerHTML = `<div class="saved-books-panel-head"><div><strong>Kayıtlı Kurum Poz Kitapları</strong><small>${books.length} kitap • ${formatCount(books.reduce((sum, book) => sum + book.count, 0))} poz</small></div><span>Kitaba tıklayarak tam listeyi açın</span></div>${books.length ? `<div class="saved-books-grid">${cards}</div>` : '<div class="saved-books-empty">Bu tarayıcıda kaydedilmiş kurum poz kitabı bulunamadı. Daha önce hata veren yüklemeler kaydedilmemiş olabilir. Aşağıdaki <strong>Dosya Seç</strong> düğmesiyle kitabı bir kez yeniden yükleyin.</div>'}<div class="saved-books-status">${status}</div>`;
    document.documentElement.dataset.savedBooksPanelVersion = VERSION;
    return true;
  };

  const init = (attempt = 0) => {
    if (render()) return;
    if (attempt < 150) setTimeout(() => init(attempt + 1), 100);
  };

  document.getElementById('pozBookBtn')?.addEventListener('click', () => setTimeout(render, 80));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), {once:true});
  else init();
})();
