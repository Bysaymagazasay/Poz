(() => {
  'use strict';

  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
  const normalizeText = value => String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '');

  const disciplineOf = (code, record = null) => {
    const explicit = String(record?.disiplin || '').trim().toLocaleUpperCase('tr-TR');
    if (['İNŞ','MEK','ELK','ÖZL'].includes(explicit)) return explicit;
    const key = normalizePoz(code).replace(/-(D|M)$/i, '');
    const hint = normalizeText(`${record?.kitap || ''} ${record?.kaynak || ''} ${record?.tanim || ''}`);
    if (/elektrik|elektronik|kuvvetliakim|zayifakim|elk/.test(hint) || /^(35|36)\./.test(key)) return 'ELK';
    if (/mekanik|tesisat|mek/.test(hint) || /^25\./.test(key)) return 'MEK';
    if (/insaat|mimari|yapi|ins/.test(hint) || /^(15|16|17|18|19|20|21|22|23|24|77)\./.test(key)) return 'İNŞ';
    return 'ÖZL';
  };

  const yearMonth = source => {
    const text = String(source || '');
    const year = text.match(/20\d{2}/)?.[0] || '';
    const months = [
      ['ocak','Ocak'],['subat','Şubat'],['mart','Mart'],['nisan','Nisan'],['mayis','Mayıs'],['haziran','Haziran'],
      ['temmuz','Temmuz'],['agustos','Ağustos'],['eylul','Eylül'],['ekim','Ekim'],['kasim','Kasım'],['aralik','Aralık']
    ];
    const norm = normalizeText(text);
    const month = months.find(([key]) => norm.includes(key))?.[1] || '';
    return [month, year].filter(Boolean).join(' ');
  };

  const sourceBookOf = record => {
    if (!record) return '';
    const explicit = String(record.kitapKaynak || record.kitapKurum || '').trim();
    if (explicit) return explicit;

    const source = String(record.kaynak || '').trim();
    const norm = normalizeText(source);
    const date = yearMonth(source);
    const withDate = name => [name, date].filter(Boolean).join(' ');

    if (!source || /montajfiyati|demontajfiyati|tablo\d+|json/.test(norm)) return 'ÇŞİDB Temmuz 2026';
    if (/cev|sehircilik|csb|csidb/.test(norm)) return withDate('ÇŞİDB') || 'ÇŞİDB Temmuz 2026';
    if (/altyapiyatirimlari|aygm/.test(norm)) return withDate('AYGM');
    if (/karayollari|kgm/.test(norm)) return withDate('KGM');
    if (/devletsuisleri|dsi/.test(norm)) return withDate('DSİ');
    if (/illerbankasi|ilbank/.test(norm)) return withDate('İLBANK');
    if (/ptt|postatelgrafteskilat/.test(norm)) return withDate('PTT');
    if (/vakiflar|vgm/.test(norm)) return withDate('VGM');
    if (/millisaraylar/.test(norm)) return withDate('Milli Saraylar');
    if (/kultur|turizm|ktb/.test(norm)) return withDate('KTB');
    if (/tedas/.test(norm)) return withDate('TEDAŞ');
    if (/teias/.test(norm)) return withDate('TEİAŞ');
    if (/euas/.test(norm)) return withDate('EÜAŞ');
    if (/botas/.test(norm)) return withDate('BOTAŞ');
    if (/tcdd/.test(norm)) return withDate('TCDD');
    if (/belediye/.test(norm)) return source.replace(/\.(xlsx?|xlsm|csv|json)$/i, '').slice(0, 34);

    return source.replace(/\.(xlsx?|xlsm|csv|json)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 34) || 'Haricî Poz Kitabı';
  };

  const recordMap = () => {
    const map = new Map();
    const data = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    for (const item of data) map.set(normalizePoz(item.poz), item);
    return map;
  };

  const removeInstallationColumn = () => {
    document.querySelectorAll('th.col-installation, td.installation-cell').forEach(node => node.remove());
  };

  const ensureCell = (row, className, afterCell) => {
    let cell = row.querySelector(`.${className}`);
    if (!cell) {
      cell = document.createElement('td');
      cell.className = className;
      afterCell.insertAdjacentElement('afterend', cell);
    }
    return cell;
  };

  const decorateRows = () => {
    removeInstallationColumn();
    const records = recordMap();

    document.querySelectorAll('#resultBody tr').forEach(row => {
      const input = row.querySelector('.poz-input');
      if (!input) return;

      row.querySelectorAll('.book-tag').forEach(node => node.remove());
      const code = input.value.trim();
      const record = records.get(normalizePoz(code));
      const pozCell = input.closest('td');
      if (!pozCell) return;

      const disciplineCell = ensureCell(row, 'discipline-cell', pozCell);
      const sourceCell = ensureCell(row, 'book-source-cell', disciplineCell);
      const discipline = code ? disciplineOf(code, record) : '';
      const source = code && record ? sourceBookOf(record) : '';

      disciplineCell.innerHTML = discipline ? `<span class="discipline-badge discipline-${discipline.toLocaleLowerCase('tr-TR')}">${discipline}</span>` : '';
      sourceCell.innerHTML = source ? `<span class="source-book-badge" title="${source.replace(/"/g, '&quot;')}">${source}</span>` : '';
    });
  };

  const updateStaticText = () => {
    const source = document.getElementById('sourceName');
    if (source) source.textContent = 'ÇŞİDB, AYGM, DSİ, KGM, PTT ve İLBANK • 2026 birim fiyatları';
    const subtitle = document.querySelector('.brand-sub');
    if (subtitle) subtitle.textContent = 'ÇŞİDB, AYGM, DSİ, KGM, PTT ve İLBANK • 2026';
  };

  const downloadCleanCsv = event => {
    const button = event.target.closest('#exportBtn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const values = Array.from(document.querySelectorAll('#resultBody tr')).map((row, index) => {
      const code = row.querySelector('.poz-input')?.value?.trim() || '';
      if (!code) return null;
      const status = row.querySelector('.status-pill')?.innerText?.trim() || '';
      const descriptionCell = row.querySelector('.description');
      const unitCell = row.querySelector('.unit-cell');
      const description = descriptionCell?.querySelector('.main-text')?.innerText?.trim() || descriptionCell?.childNodes?.[0]?.textContent?.trim() || '';
      const importedDescription = descriptionCell?.querySelector('.word-source-meta')?.innerText?.trim() || '';
      const unit = unitCell?.querySelector('.main-text')?.innerText?.trim() || unitCell?.childNodes?.[0]?.textContent?.trim() || '';
      const importedUnit = unitCell?.querySelector('.word-source-meta')?.innerText?.trim() || '';
      const quantity = row.querySelector('.qty-input')?.value || '';
      const price = row.querySelector('.price-cell:not(.installation-cell)')?.innerText?.trim() || '';
      const total = row.querySelector('.total-cell')?.innerText?.trim() || '';
      const discipline = row.querySelector('.discipline-badge')?.innerText?.trim() || '';
      const sourceBook = row.querySelector('.source-book-badge')?.innerText?.trim() || '';
      return [index + 1, code, discipline, sourceBook, status, description, importedDescription, unit, importedUnit, quantity, price, total];
    }).filter(Boolean);

    if (!values.length) return;
    const header = ['Sıra','Poz No','Disiplin','Poz Kitabı','Durum','Poz Tanımı','Word Tanımı','Birim','Word Birimi','Miktar','Poz Fiyatı','Satır Toplamı'];
    const esc = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...values].map(row => row.map(esc).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], {type: 'text/csv;charset=utf-8'});
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'BYSAY_Yaklasik_Maliyet_Sonuclari.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const init = () => {
    updateStaticText();
    decorateRows();

    const body = document.getElementById('resultBody');
    if (body) {
      let scheduled = false;
      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; decorateRows(); });
      };
      new MutationObserver(schedule).observe(body, {childList: true});
      body.addEventListener('input', event => { if (event.target.matches('.poz-input')) schedule(); });
      body.addEventListener('focusout', event => { if (event.target.matches('.poz-input')) schedule(); });
    }

    document.addEventListener('click', downloadCleanCsv, true);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
