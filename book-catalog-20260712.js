(() => {
  'use strict';

  const VERSION = '20260712-20';
  const normalizeText = value => String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '');
  const normalizePoz = value => String(value ?? '').trim().toUpperCase()
    .replace(/[–—−]/g, '-').replace(/\s+/g, '')
    .replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const formatCount = value => new Intl.NumberFormat('tr-TR').format(Number(value) || 0);

  const INSTITUTIONS = [
    {name:'ÇŞİDB', full:'Çevre, Şehircilik ve İklim Değişikliği Bakanlığı', initials:'ÇŞ', slug:'csidb', pattern:/cevre|sehircilik|csidb|csb/},
    {name:'AYGM', full:'Altyapı Yatırımları Genel Müdürlüğü', initials:'AY', slug:'aygm', pattern:/altyapiyatirimlari|aygm/},
    {name:'DSİ', full:'Devlet Su İşleri Genel Müdürlüğü', initials:'DS', slug:'dsi', pattern:/devletsuisleri|dsi/},
    {name:'KGM', full:'Karayolları Genel Müdürlüğü', initials:'KG', slug:'kgm', pattern:/karayollari|kgm/},
    {name:'PTT', full:'Posta ve Telgraf Teşkilatı', initials:'PT', slug:'ptt', pattern:/ptt|postatelgraf/},
    {name:'İLBANK', full:'İller Bankası A.Ş.', initials:'İL', slug:'ilbank', pattern:/illerbankasi|ilbank/},
    {name:'TEDAŞ', full:'Türkiye Elektrik Dağıtım A.Ş.', initials:'TD', slug:'tedas', pattern:/tedas/},
    {name:'TEİAŞ', full:'Türkiye Elektrik İletim A.Ş.', initials:'TE', slug:'teias', pattern:/teias/},
    {name:'EÜAŞ', full:'Elektrik Üretim A.Ş.', initials:'EÜ', slug:'euas', pattern:/euas/},
    {name:'BOTAŞ', full:'Boru Hatları ile Petrol Taşıma A.Ş.', initials:'BO', slug:'botas', pattern:/botas/},
    {name:'TCDD', full:'Türkiye Cumhuriyeti Devlet Demiryolları', initials:'TC', slug:'tcdd', pattern:/tcdd/},
    {name:'VGM', full:'Vakıflar Genel Müdürlüğü', initials:'VG', slug:'vgm', pattern:/vakiflar|vgm/},
    {name:'KTB', full:'Kültür ve Turizm Bakanlığı', initials:'KT', slug:'ktb', pattern:/kulturturizm|ktb/},
    {name:'Milli Saraylar', full:'Milli Saraylar Başkanlığı', initials:'MS', slug:'millisaraylar', pattern:/millisaraylar/}
  ];

  const institutionInfo = text => {
    const norm = normalizeText(text);
    return INSTITUTIONS.find(item => item.pattern.test(norm)) || null;
  };

  const disciplineOf = record => {
    const explicit = String(record?.disiplin || record?.kitap || '').toLocaleUpperCase('tr-TR');
    if (explicit.includes('ELK')) return 'ELK';
    if (explicit.includes('MEK')) return 'MEK';
    if (explicit.includes('İNŞ') || explicit.includes('INS')) return 'İNŞ';
    const code = String(record?.poz || '').toUpperCase().replace(/-(D|M)$/i, '');
    if (/^(35|36)[.\/-]/.test(code)) return 'ELK';
    if (/^25[.\/-]/.test(code)) return 'MEK';
    return 'İNŞ';
  };

  const periodOf = text => {
    const raw = String(text || '');
    const norm = normalizeText(raw);
    const year = raw.match(/20\d{2}/)?.[0] || '2026';
    const months = [['ocak','Ocak'],['subat','Şubat'],['mart','Mart'],['nisan','Nisan'],['mayis','Mayıs'],['haziran','Haziran'],['temmuz','Temmuz'],['agustos','Ağustos'],['eylul','Eylül'],['ekim','Ekim'],['kasim','Kasım'],['aralik','Aralık']];
    const month = months.find(([key]) => norm.includes(key))?.[1] || '';
    if (/1donem|birincidonem/.test(norm)) return `1. Dönem ${year}`;
    if (/2donem|ikincidonem/.test(norm)) return `2. Dönem ${year}`;
    return [month, year].filter(Boolean).join(' ');
  };

  const bookIdentity = (record, forced = null) => {
    const source = String(forced || record?.kitapKaynak || record?.kitapKurum || record?.kurum || record?.kaynak || '').trim();
    const inst = institutionInfo(`${record?.kitapKurum || ''} ${record?.kurum || ''} ${source}`);
    const discipline = disciplineOf(record);
    if (inst?.name === 'ÇŞİDB' || (!inst && (!source || /tablo|mekaniktesisat|insaatbirimfiyat|temmuz2026|2026temmuz/.test(normalizeText(source))))) {
      const label = discipline === 'İNŞ' ? 'İnşaat' : discipline === 'MEK' ? 'Mekanik' : discipline === 'ELK' ? 'Elektrik' : 'Özel';
      return {
        key:`csidb-${discipline}`,
        title:`ÇŞİDB ${label}`,
        fullTitle:`Çevre, Şehircilik ve İklim Değişikliği Bakanlığı • ${label}`,
        initials:discipline === 'İNŞ' ? 'Çİ' : discipline === 'MEK' ? 'ÇM' : discipline === 'ELK' ? 'ÇE' : 'ÇŞ',
        slug:'csidb', period:'Temmuz 2026', order:discipline === 'İNŞ' ? 1 : discipline === 'MEK' ? 2 : 3
      };
    }
    if (inst) return {
      key:`institution-${normalizeText(inst.name)}-${normalizeText(source || inst.name)}`,
      title:inst.name,
      fullTitle:inst.full,
      initials:inst.initials,
      slug:inst.slug,
      period:periodOf(source),
      order:({AYGM:10,'DSİ':11,KGM:12,PTT:13,'İLBANK':14,TEDAŞ:15,'TEİAŞ':16,'EÜAŞ':17,BOTAŞ:18,TCDD:19,VGM:20,KTB:21,'Milli Saraylar':22}[inst.name] ?? 30)
    };
    const clean = source.replace(/\.(xlsx?|xlsm|csv|json|pdf)$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Yüklenen Poz Kitabı';
    const initials = clean.split(/\s+/).filter(Boolean).slice(0,2).map(word => word[0]).join('').toLocaleUpperCase('tr-TR') || 'PK';
    return {key:`custom-${normalizeText(clean)}`, title:clean, fullTitle:clean, initials, slug:'custom', period:periodOf(source), order:80};
  };

  const collectBooks = () => {
    const groups = new Map();
    const addRecord = (identity, record) => {
      if (!groups.has(identity.key)) groups.set(identity.key, {...identity, records:[], seen:new Set()});
      const group = groups.get(identity.key);
      const key = normalizePoz(record?.poz);
      if (!key || group.seen.has(key) || /(?:D|M)$/.test(key) && /-(?:D|M)$/i.test(String(record?.poz || ''))) return;
      group.seen.add(key);
      group.records.push(record);
    };

    const institutionalCatalog = Array.isArray(window.BYSAY_INSTITUTIONAL_BOOK_CATALOG) ? window.BYSAY_INSTITUTIONAL_BOOK_CATALOG : [];
    const institutionalRecords = Array.isArray(window.BYSAY_INSTITUTIONAL_BOOK_RECORDS) ? window.BYSAY_INSTITUTIONAL_BOOK_RECORDS : [];
    const catalogById = new Map(institutionalCatalog.map(book => [String(book.id), book]));

    for (const record of institutionalRecords) {
      const book = catalogById.get(String(record.kitapId));
      const identity = bookIdentity(record, book?.name || record.kitapKaynak);
      identity.key = `embedded-${record.kitapId || identity.key}`;
      identity.title = institutionInfo(book?.institution || book?.name)?.name || identity.title;
      identity.fullTitle = book?.name || identity.fullTitle;
      identity.period = periodOf(book?.name || record.kitapKaynak) || identity.period;
      addRecord(identity, record);
    }

    for (const book of institutionalCatalog) {
      const inst = institutionInfo(`${book.institution || ''} ${book.name || ''}`);
      const identity = bookIdentity({kitapKurum:book.institution, kitapKaynak:book.name, poz:''}, book.name);
      identity.key = `embedded-${book.id}`;
      identity.title = inst?.name || identity.title;
      identity.fullTitle = book.name || inst?.full || identity.fullTitle;
      identity.period = periodOf(book.name) || identity.period;
      if (!groups.has(identity.key)) groups.set(identity.key, {...identity, records:[], seen:new Set()});
    }

    const data = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    for (const record of data) {
      if (!record?.poz || record.kitapId || /-(D|M)$/i.test(String(record.poz))) continue;
      addRecord(bookIdentity(record), record);
    }

    return Array.from(groups.values()).map(group => {
      delete group.seen;
      group.records.sort((a,b) => String(a.poz).localeCompare(String(b.poz), 'tr', {numeric:true}));
      group.count = group.records.length;
      return group;
    }).filter(book => book.count > 0).sort((a,b) => a.order - b.order || a.title.localeCompare(b.title, 'tr'));
  };

  const logoHtml = book => `<span class="catalog-book-logo logo-${escapeHtml(book.slug)}"><b>${escapeHtml(book.initials)}</b></span>`;
  const cardHtml = book => `<button type="button" class="catalog-book-card" data-open-catalog-book="${escapeHtml(book.key)}">
    ${logoHtml(book)}
    <span class="catalog-book-copy"><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(book.fullTitle)}</span><small>${escapeHtml(book.period || '2026')} • ${formatCount(book.count)} poz</small></span>
    <span class="catalog-book-open">Aç ›</span>
  </button>`;

  const notify = message => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 5000);
  };

  const openBookWindow = book => {
    const win = window.open('', '_blank');
    if (!win) return notify('Poz kitabı penceresi tarayıcı tarafından engellendi. Açılır pencereye izin verin.');
    const rows = book.records.map((record, index) => `<tr data-search="${escapeHtml(`${record.poz} ${record.tanim} ${record.birim}`.toLocaleLowerCase('tr-TR'))}">
      <td>${index + 1}</td><td class="code">${escapeHtml(record.poz)}</td><td>${escapeHtml(record.tanim || '—')}</td><td>${escapeHtml(record.birim || '—')}</td><td class="money">${escapeHtml(record.fiyat || '—')}</td><td class="money">${escapeHtml(record.montaj || '—')}</td>
    </tr>`).join('');
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(book.title)} Poz Kitabı</title><style>
      *{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:#152034;font:14px Inter,Arial,sans-serif}.head{position:sticky;top:0;z-index:5;background:#0f1d35;color:#fff;padding:18px 26px;box-shadow:0 6px 22px rgba(15,29,53,.22)}.head-row{display:flex;align-items:center;gap:15px}.logo{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:#fff;color:#0f1d35;font-weight:900;font-size:15px}.title{min-width:0}.title h1{margin:0 0 4px;font-size:22px}.title p{margin:0;color:#cbd6e8;font-size:12px}.actions{margin-left:auto;display:flex;gap:8px}.actions button{border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer}.tools{display:flex;gap:12px;align-items:center;padding:16px 24px;background:#fff;border-bottom:1px solid #dfe5ee}.tools input{flex:1;min-width:180px;border:1px solid #cfd8e6;border-radius:11px;padding:11px 13px;font-size:14px}.tools strong{white-space:nowrap;color:#56637a}.wrap{padding:18px 24px 32px}.table{overflow:auto;background:#fff;border:1px solid #dfe5ee;border-radius:16px;box-shadow:0 8px 26px rgba(18,34,61,.06)}table{width:100%;border-collapse:collapse;min-width:1050px}th{position:sticky;top:90px;background:#eef3f8;color:#43516a;text-align:left;font-size:11px;letter-spacing:.03em;padding:12px 13px;border-bottom:1px solid #d9e1eb}td{padding:11px 13px;border-bottom:1px solid #edf1f5;vertical-align:top}tbody tr:hover{background:#f8fbff}.code{font-weight:800;color:#1d4ed8;white-space:nowrap}.money{text-align:right;white-space:nowrap;font-weight:700}th:first-child,td:first-child{width:58px;text-align:center;color:#7a8799}th:nth-child(4),td:nth-child(4){width:90px;text-align:center}th:nth-child(5),th:nth-child(6){text-align:right;width:140px}.empty{display:none;padding:50px;text-align:center;color:#7a8799}@media print{.head{position:static}.actions,.tools{display:none}.wrap{padding:0}.table{border:0;box-shadow:none}th{position:static}}
    </style></head><body><header class="head"><div class="head-row"><div class="logo">${escapeHtml(book.initials)}</div><div class="title"><h1>${escapeHtml(book.title)} Poz Kitabı</h1><p>${escapeHtml(book.fullTitle)} • ${escapeHtml(book.period || '2026')} • ${formatCount(book.count)} poz</p></div><div class="actions"><button onclick="window.print()">Yazdır</button><button id="csvBtn">CSV İndir</button></div></div></header><div class="tools"><input id="search" type="search" placeholder="Poz no veya açıklamada ara…"><strong id="visibleCount">${formatCount(book.count)} kayıt</strong></div><main class="wrap"><div class="table"><table><thead><tr><th>#</th><th>Poz No</th><th>Poz Açıklaması</th><th>Birim</th><th>Poz Fiyatı</th><th>Montaj Bedeli</th></tr></thead><tbody id="rows">${rows}</tbody></table><div class="empty" id="empty">Aramanızla eşleşen poz bulunamadı.</div></div></main><script>
      const search=document.getElementById('search'),rows=[...document.querySelectorAll('#rows tr')],count=document.getElementById('visibleCount'),empty=document.getElementById('empty');
      search.addEventListener('input',()=>{const q=search.value.toLocaleLowerCase('tr-TR').trim();let visible=0;rows.forEach(row=>{const show=!q||row.dataset.search.includes(q);row.style.display=show?'':'none';if(show)visible++;});count.textContent=visible.toLocaleString('tr-TR')+' kayıt';empty.style.display=visible?'none':'block';});
      document.getElementById('csvBtn').addEventListener('click',()=>{const lines=[['Sıra','Poz No','Poz Açıklaması','Birim','Poz Fiyatı','Montaj Bedeli'],...rows.map(row=>[...row.cells].map(cell=>cell.innerText.trim()))];const esc=v=>'"'+String(v).replace(/"/g,'""')+'"';const csv='\\uFEFF'+lines.map(line=>line.map(esc).join(';')).join('\\r\\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='${escapeHtml(book.title).replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü_-]/g,'_')}_Poz_Kitabi.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
    <\/script></body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const updateModal = () => {
    document.getElementById('loadedBookShelf')?.remove();
    const modal = document.getElementById('pozBookModal');
    if (!modal) return false;
    const books = collectBooks();
    const dialog = modal.querySelector('.book-modal');
    const uploadBox = modal.querySelector('.book-upload-box');
    if (!dialog || !uploadBox) return false;

    modal.querySelector('#pozBookTitle')?.replaceChildren(document.createTextNode('Poz Kitapları'));
    const intro = modal.querySelector('.book-modal-head p');
    if (intro) intro.textContent = 'Programdaki tüm poz kitaplarını açıp poz numarası, açıklama, birim, fiyat ve montaj bedeli bilgilerini görüntüleyin.';

    let panel = modal.querySelector('#programBookCatalog');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'programBookCatalog';
      panel.className = 'program-book-catalog';
      uploadBox.insertAdjacentElement('beforebegin', panel);
      panel.addEventListener('click', event => {
        const button = event.target.closest('[data-open-catalog-book]');
        if (!button) return;
        const selected = collectBooks().find(book => book.key === button.dataset.openCatalogBook);
        if (selected) openBookWindow(selected);
      });
    }
    panel.innerHTML = `<div class="program-book-catalog-head"><div><strong>Programa Yüklü Poz Kitapları</strong><small>${books.length} kitap • ${formatCount(books.reduce((sum, book) => sum + book.count, 0))} poz</small></div><span>Kitaba tıklayarak tam listeyi açın</span></div><div class="program-book-catalog-grid">${books.map(cardHtml).join('')}</div>`;
    return true;
  };

  const init = (attempt = 0) => {
    document.getElementById('loadedBookShelf')?.remove();
    const button = document.getElementById('pozBookBtn');
    if (button && !button.dataset.catalogReady) {
      button.dataset.catalogReady = '1';
      button.addEventListener('click', () => setTimeout(updateModal, 30));
    }
    if (updateModal()) {
      document.documentElement.dataset.bysayBookCatalogVersion = VERSION;
      return;
    }
    if (attempt < 100) setTimeout(() => init(attempt + 1), 100);
  };

  const observer = new MutationObserver(() => document.getElementById('loadedBookShelf')?.remove());
  observer.observe(document.documentElement, {childList:true, subtree:true});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), {once:true});
  else init();
})();
