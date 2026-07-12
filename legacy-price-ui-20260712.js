(() => {
  'use strict';

  const VERSION = '20260712-29';
  const attempts = new Map();
  let modal = null;
  let activeCode = '';

  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g,'').replace(/[–—−]/g,'-');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const parseNumber = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let text = String(value ?? '').trim().replace(/\u00a0/g,'').replace(/\s/g,'').replace(/[^0-9,.-]/g,'');
    if (!text) return NaN;
    const comma = text.lastIndexOf(','), dot = text.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) text = comma > dot ? text.replace(/\./g,'').replace(',','.') : text.replace(/,/g,'');
    else if (comma >= 0) text = text.replace(/\./g,'').replace(',','.');
    else if ((text.match(/\./g)||[]).length > 1) text = text.replace(/\./g,'');
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  };

  const notify = (message, duration = 3600) => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), duration);
  };

  const withTimeout = async (url, timeout = 12000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {cache:'no-store', credentials:'omit', signal:controller.signal, headers:{Accept:'text/html,text/plain,*/*'}});
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.text();
    } finally { clearTimeout(timer); }
  };

  const htmlToText = html => {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return String(doc.body?.innerText || doc.documentElement?.textContent || html).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n');
    } catch (_) { return String(html || ''); }
  };

  const extractResult = (rawText, code) => {
    const text = htmlToText(rawText);
    const normalizedCode = normalizePoz(code);
    const compact = text.toUpperCase().replace(/\s+/g,'');
    if (!compact.includes(normalizedCode)) return null;

    const positions = [];
    let start = 0;
    while (true) {
      const pos = text.toUpperCase().indexOf(String(code).toUpperCase(), start);
      if (pos < 0) break;
      positions.push(pos);
      start = pos + String(code).length;
    }
    const contexts = positions.length ? positions.map(pos => text.slice(Math.max(0,pos-500), Math.min(text.length,pos+2500))) : [text];
    const candidates = [];
    const pairPatterns = [
      /\b(20(?:0\d|1\d|2\d))\b[\s\S]{0,100}?(\d{1,3}(?:\.\d{3})*,\d{2,4}|\d+,\d{2,4})\s*(?:TL|₺)?/g,
      /(\d{1,3}(?:\.\d{3})*,\d{2,4}|\d+,\d{2,4})\s*(?:TL|₺)?[\s\S]{0,80}?\b(20(?:0\d|1\d|2\d))\b/g
    ];

    for (const context of contexts) {
      for (let patternIndex=0; patternIndex<pairPatterns.length; patternIndex++) {
        const pattern = pairPatterns[patternIndex];
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(context))) {
          const year = Number(patternIndex === 0 ? match[1] : match[2]);
          const priceText = patternIndex === 0 ? match[2] : match[1];
          const price = parseNumber(priceText);
          if (year >= 2000 && year <= new Date().getFullYear() && Number.isFinite(price) && price > 0) candidates.push({year,price});
        }
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a,b) => b.year - a.year || b.price - a.price);
    const selected = candidates[0];
    const mainContext = contexts[0] || text;
    const codePos = mainContext.toUpperCase().indexOf(String(code).toUpperCase());
    let description = '';
    if (codePos >= 0) {
      description = mainContext.slice(codePos + String(code).length, codePos + String(code).length + 360)
        .split(/\b20\d{2}\b|\d{1,3}(?:\.\d{3})*,\d{2}/)[0]
        .replace(/^[\s:;|\-–—]+/,'').replace(/\s+/g,' ').trim();
    }
    if (description.length < 4 || description.length > 260) description = 'BirimFiyat.Net geçmiş yıl pozu';
    const unitMatch = mainContext.match(/\b(Ad|Adet|m²|m2|m³|m3|m|kg|ton|takım|set|çift|saat|gün)\b/i);
    return {poz:code, year:selected.year, month:1, price:selected.price, tanim:description, birim:unitMatch?.[1] || '', lookupSource:'BirimFiyat.Net otomatik arama'};
  };

  const lookupOnline = async code => {
    const encoded = encodeURIComponent(code);
    const urls = [
      `https://www.birimfiyat.net/?poz-ara=${encoded}`,
      `https://r.jina.ai/http://www.birimfiyat.net/?poz-ara=${encoded}`
    ];
    const errors = [];
    for (const url of urls) {
      try {
        const text = await withTimeout(url);
        const result = extractResult(text, code);
        if (result) return result;
        errors.push(`${url}: sonuç ayrıştırılamadı`);
      } catch (error) { errors.push(`${url}: ${error?.message || error}`); }
    }
    throw new Error(errors.join(' • '));
  };

  const rowCode = tr => normalizePoz(tr.querySelector('[data-role="poz"]')?.value || '');
  const isMissingRow = tr => Boolean(tr.querySelector('.status-missing')) || /bulunamadı/i.test(tr.textContent || '');

  const addActionButtons = tr => {
    const code = rowCode(tr);
    if (!code) return;
    const statusCell = tr.querySelector('.status-missing')?.closest('td') || tr.cells?.[4] || tr.cells?.[2];
    if (!statusCell || statusCell.querySelector('.legacy-missing-actions')) return;
    const holder = document.createElement('div');
    holder.className = 'legacy-missing-actions';
    holder.innerHTML = `<button type="button" data-legacy-open="${escapeHtml(code)}">BFN'de Aç</button><button type="button" data-legacy-manual="${escapeHtml(code)}">Fiyat Gir</button>`;
    statusCell.appendChild(holder);
  };

  const setSearching = (tr, searching) => {
    tr.classList.toggle('legacy-searching-row', searching);
    const pill = tr.querySelector('.status-missing');
    if (!pill) return;
    if (searching) {
      pill.dataset.originalText = pill.textContent;
      pill.innerHTML = '<i></i>Web’de aranıyor…';
    } else if (pill.dataset.originalText) pill.innerHTML = `<i></i>${escapeHtml(pill.dataset.originalText)}`;
  };

  const autoLookupRow = async tr => {
    const code = rowCode(tr);
    if (!code || !isMissingRow(tr)) return;
    const existing = window.BYSAY_LEGACY_POZ_MAP?.get(code);
    if (existing) {
      location.reload();
      return;
    }
    if (attempts.has(code)) {
      if (attempts.get(code) === 'failed') addActionButtons(tr);
      return;
    }
    attempts.set(code, 'pending');
    setSearching(tr, true);
    try {
      const result = await lookupOnline(code);
      const saved = window.BYSAY_SAVE_LEGACY_POZ?.(result);
      if (!saved) throw new Error('Bulunan eski fiyat kaydedilemedi.');
      attempts.set(code, 'success');
      notify(`${code}: ${saved.originalYear} fiyatı ${saved.targetPeriod} dönemine güncellendi.`, 5200);
      setTimeout(() => location.reload(), 700);
    } catch (error) {
      console.warn(`BirimFiyat.Net otomatik arama başarısız (${code})`, error);
      attempts.set(code, 'failed');
      setSearching(tr, false);
      addActionButtons(tr);
    }
  };

  const decorateLegacyRows = () => {
    const map = window.BYSAY_LEGACY_POZ_MAP;
    if (!(map instanceof Map)) return;
    document.querySelectorAll('#resultBody tr').forEach(tr => {
      const code = rowCode(tr);
      const record = map.get(code);
      if (!record) return;
      tr.classList.add('legacy-price-row');
      const input = tr.querySelector('[data-role="poz"]');
      if (input && !input.parentElement.querySelector('.legacy-price-badge')) {
        const badge = document.createElement('span');
        badge.className = 'legacy-price-badge';
        badge.textContent = `↻ ${record.originalYear} → ${record.targetPeriod}`;
        badge.title = `${record.originalYear} fiyatı: ${new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2}).format(record.originalPrice)} TL\nTÜİK İnşaat Maliyet Endeksi katsayısı: ${record.updateFactor.toFixed(4)}\n${record.sourcePeriod}: ${record.sourceIndex} → ${record.targetPeriod}: ${record.targetIndex}`;
        input.insertAdjacentElement('afterend', badge);
      }
      const status = tr.querySelector('.status-found');
      if (status && !status.classList.contains('status-updated')) {
        status.classList.add('status-updated');
        status.innerHTML = '<i></i>Güncellendi';
      }
    });
  };

  const showIndexStatus = () => {
    const source = document.querySelector('.source-note');
    if (!source || source.querySelector('.legacy-index-status')) return;
    const latest = window.BYSAY_LEGACY_INDEX?.latest;
    if (!latest) return;
    const badge = document.createElement('div');
    badge.className = 'legacy-index-status';
    badge.innerHTML = `<strong>TÜİK İME</strong><span>${escapeHtml(latest.monthName || '')} ${escapeHtml(latest.year)} · ${new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2}).format(Number(latest.index)||0)}</span>`;
    source.appendChild(badge);
  };

  const ensureModal = () => {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'legacy-modal-backdrop';
    modal.innerHTML = `<div class="legacy-modal" role="dialog" aria-modal="true" aria-labelledby="legacyModalTitle">
      <div class="legacy-modal-head"><div><h3 id="legacyModalTitle">Eski Poz Fiyatını Güncelle</h3><p>BirimFiyat.Net’te gördüğünüz son geçerli yıl ve fiyatı girin. Güncelleme TÜİK İnşaat Maliyet Endeksiyle otomatik hesaplanır.</p></div><button type="button" data-legacy-close>×</button></div>
      <div class="legacy-form-grid">
        <label>Poz No<input id="legacyCode" readonly></label>
        <label>Son geçerli yıl<input id="legacyYear" type="number" min="2015" max="2099" value="2025"></label>
        <label class="wide">Poz Tanımı<input id="legacyDescription"></label>
        <label>Birim<input id="legacyUnit" placeholder="Ad, m, m²…"></label>
        <label>Eski Birim Fiyat<input id="legacyPrice" inputmode="decimal" placeholder="0,00"></label>
      </div>
      <div class="legacy-calc-preview" id="legacyPreview">Yıl ve fiyat girildiğinde güncel değer hesaplanır.</div>
      <div class="legacy-modal-actions"><button type="button" data-legacy-site>BirimFiyat.Net’te Aç</button><button type="button" class="primary" data-legacy-save>Güncelle ve Kaydet</button></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-legacy-close]')) modal.classList.remove('show');
      if (event.target.closest('[data-legacy-site]')) window.open(`https://www.birimfiyat.net/?poz-ara=${encodeURIComponent(activeCode)}`, '_blank', 'noopener');
      if (event.target.closest('[data-legacy-save]')) {
        try {
          const payload = {
            poz:activeCode,
            year:Number(modal.querySelector('#legacyYear').value),
            month:1,
            price:modal.querySelector('#legacyPrice').value,
            tanim:modal.querySelector('#legacyDescription').value,
            birim:modal.querySelector('#legacyUnit').value,
            lookupSource:'BirimFiyat.Net kullanıcı doğrulaması'
          };
          const saved = window.BYSAY_SAVE_LEGACY_POZ?.(payload);
          if (!saved) throw new Error('Fiyat güncellenemedi.');
          notify(`${activeCode}: ${saved.originalYear} fiyatı ${saved.targetPeriod} dönemine güncellendi.`, 5200);
          modal.classList.remove('show');
          setTimeout(() => location.reload(), 500);
        } catch (error) { notify(error?.message || 'Eski fiyat kaydedilemedi.', 5000); }
      }
    });
    ['legacyYear','legacyPrice'].forEach(id => modal.querySelector(`#${id}`).addEventListener('input', updatePreview));
    return modal;
  };

  const updatePreview = () => {
    if (!modal) return;
    const calculation = window.BYSAY_CALCULATE_LEGACY_PRICE?.({
      year:Number(modal.querySelector('#legacyYear').value),
      month:1,
      price:modal.querySelector('#legacyPrice').value
    });
    const preview = modal.querySelector('#legacyPreview');
    if (!calculation) {
      preview.textContent = 'Yıl ve fiyat girildiğinde güncel değer hesaplanır.';
      return;
    }
    preview.innerHTML = `<strong>${new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(calculation.updatedPrice)} TL</strong><span>Katsayı ${calculation.factor.toFixed(4)} · ${calculation.source.monthName} ${calculation.source.year} → ${calculation.target.monthName} ${calculation.target.year}</span>`;
  };

  const openManual = code => {
    activeCode = normalizePoz(code);
    const dialog = ensureModal();
    dialog.querySelector('#legacyCode').value = activeCode;
    dialog.querySelector('#legacyDescription').value = '';
    dialog.querySelector('#legacyUnit').value = '';
    dialog.querySelector('#legacyPrice').value = '';
    const latestYear = Number(window.BYSAY_LEGACY_INDEX?.latest?.year || new Date().getFullYear());
    dialog.querySelector('#legacyYear').value = Math.max(2015, latestYear - 1);
    updatePreview();
    dialog.classList.add('show');
  };

  const scan = () => {
    decorateLegacyRows();
    showIndexStatus();
    document.querySelectorAll('#resultBody tr').forEach(tr => {
      if (isMissingRow(tr)) setTimeout(() => autoLookupRow(tr), 450);
    });
  };

  const bind = () => {
    document.addEventListener('click', event => {
      const open = event.target.closest('[data-legacy-open]');
      if (open) window.open(`https://www.birimfiyat.net/?poz-ara=${encodeURIComponent(open.dataset.legacyOpen)}`, '_blank', 'noopener');
      const manual = event.target.closest('[data-legacy-manual]');
      if (manual) openManual(manual.dataset.legacyManual);
    });
  };

  const start = async () => {
    try { await window.BYSAY_LEGACY_READY; } catch (_) { /* fallback is already loaded */ }
    bind();
    scan();
    const body = document.getElementById('resultBody');
    if (body) new MutationObserver(scan).observe(body, {childList:true,subtree:true});
    setInterval(scan, 1800);
    document.documentElement.dataset.legacyPriceUiVersion = VERSION;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
