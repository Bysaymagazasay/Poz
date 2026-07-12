(() => {
  'use strict';

  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
  const bookAbbr = code => {
    const key = normalizePoz(code).replace(/-(D|M)$/i, '');
    if (/^25\./.test(key)) return 'MEK';
    if (/^(15|16|17|18|19|20|21|22|23|24)\./.test(key)) return 'İNŞ';
    return 'ÖZL';
  };

  const removeInstallationColumn = () => {
    document.querySelectorAll('th.col-installation, td.installation-cell').forEach(node => node.remove());
  };

  const decorateRows = () => {
    removeInstallationColumn();
    document.querySelectorAll('#resultBody tr').forEach(row => {
      const input = row.querySelector('.poz-input');
      if (!input) return;

      let wrapper = input.closest('.poz-cell-wrap');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'poz-cell-wrap';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
      }

      let tag = wrapper.querySelector('.book-tag');
      if (!tag) {
        tag = document.createElement('span');
        tag.className = 'book-tag';
        wrapper.appendChild(tag);
      }
      const code = input.value.trim();
      tag.textContent = code ? bookAbbr(code) : '';
      tag.classList.toggle('is-empty', !code);
    });
  };

  const updateStaticText = () => {
    const source = document.getElementById('sourceName');
    if (source) source.textContent = 'Çevre, Şehircilik Bakanlığı • Temmuz 2026 birim fiyatları';
    const subtitle = document.querySelector('.brand-sub');
    if (subtitle) subtitle.textContent = 'Çevre, Şehircilik Bakanlığı • Temmuz 2026';
  };

  const downloadCleanCsv = event => {
    const button = event.target.closest('#exportBtn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const tableRows = Array.from(document.querySelectorAll('#resultBody tr'));
    const values = tableRows.map((row, index) => {
      const code = row.querySelector('.poz-input')?.value?.trim() || '';
      if (!code) return null;
      const cells = row.querySelectorAll('td');
      const status = cells[2]?.innerText?.trim() || '';
      const description = cells[3]?.querySelector('.main-text')?.innerText?.trim() || cells[3]?.innerText?.trim() || '';
      const importedDescription = cells[3]?.querySelector('.word-source-meta')?.innerText?.trim() || '';
      const unit = cells[4]?.querySelector('.main-text')?.innerText?.trim() || cells[4]?.innerText?.trim() || '';
      const importedUnit = cells[4]?.querySelector('.word-source-meta')?.innerText?.trim() || '';
      const quantity = row.querySelector('.qty-input')?.value || '';
      const price = cells[6]?.innerText?.trim() || '';
      const total = cells[7]?.innerText?.trim() || '';
      return [index + 1, code, bookAbbr(code), status, description, importedDescription, unit, importedUnit, quantity, price, total];
    }).filter(Boolean);

    if (!values.length) return;
    const header = ['Sıra','Poz No','Poz Kitabı','Durum','Poz Tanımı','Word Tanımı','Birim','Word Birimi','Miktar','Poz Fiyatı','Satır Toplamı'];
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
      new MutationObserver(() => requestAnimationFrame(decorateRows)).observe(body, {childList: true, subtree: true});
      body.addEventListener('input', event => {
        if (event.target.matches('.poz-input')) requestAnimationFrame(decorateRows);
      });
    }

    document.addEventListener('click', downloadCleanCsv, true);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
