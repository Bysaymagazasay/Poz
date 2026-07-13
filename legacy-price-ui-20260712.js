(() => {
  'use strict';

  const VERSION = '20260713-30';
  const attempts = new Map();
  const reviewResults = new Map();
  let modal = null;
  let activeCode = '';
  let activeSeed = null;

  const config = window.BYSAY_POZ_LOOKUP_CONFIG || {};
  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g,'').replace(/[–—−]/g,'-');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const formatMoney = value => new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);

  const notify = (message, duration = 3600) => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), duration);
  };

  const rowCode = tr => normalizePoz(tr.querySelector('[data-role="poz"]')?.value || '');
  const isMissingRow = tr => Boolean(tr.querySelector('.status-missing')) || /bulunamadı/i.test(tr.textContent || '');
  const googleSearchUrl = code => `https://www.google.com/search?q=${encodeURIComponent(`"${code}" "birim fiyat"`)}`;

  const actionMarkup = code => {
    const review = reviewResults.has(code)
      ? `<button type="button" class="legacy-review-btn" data-legacy-review="${escapeHtml(code)}">Bulunanı İncele</button>`
      : '';
    return `${review}<button type="button" data-legacy-open="${escapeHtml(code)}">Google'da Ara</button><button type="button" data-legacy-manual="${escapeHtml(code)}">Fiyat Gir</button>`;
  };

  const addActionButtons = tr => {
    const code = rowCode(tr);
    if (!code) return;
    const statusCell = tr.querySelector('.status-missing')?.closest('td') || tr.cells?.[4] || tr.cells?.[2];
    if (!statusCell) return;
    let holder = statusCell.querySelector('.legacy-missing-actions');
    if (!holder) {
      holder = document.createElement('div');
      holder.className = 'legacy-missing-actions';
      statusCell.appendChild(holder);
    }
    holder.innerHTML = actionMarkup(code);
  };

  const setSearching = (tr, searching, label = 'İnternette aranıyor…') => {
    tr.classList.toggle('legacy-searching-row', searching);
    const pill = tr.querySelector('.status-missing');
    if (!pill) return;
    if (searching) {
      if (!pill.dataset.originalText) pill.dataset.originalText = pill.textContent;
      pill.innerHTML = `<i></i>${escapeHtml(label)}`;
    } else if (pill.dataset.originalText) {
      pill.innerHTML = `<i></i>${escapeHtml(pill.dataset.originalText)}`;
    }
  };

  const saveAndReload = (code, result) => {
    const saved = window.BYSAY_SAVE_LEGACY_POZ?.(result);
    if (!saved) throw new Error('Bulunan eski fiyat kaydedilemedi.');
    attempts.set(code, 'success');
    notify(`${code}: Son yayın ${saved.originalYear} · ${saved.targetPeriod} dönemine güncellendi.`, 5600);
    setTimeout(() => location.reload(), 700);
  };

  const autoLookupRow = async tr => {
    const code = rowCode(tr);
    if (!code || !isMissingRow(tr)) return;

    const existing = window.BYSAY_LEGACY_POZ_MAP?.get(code);
    if (existing) {
      const reloadKey = `BYSAY_LEGACY_RELOAD_${code}`;
      try {
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, '1');
          setTimeout(() => location.reload(), 120);
          return;
        }
      } catch (_) { }
      addActionButtons(tr);
      return;
    }

    if (attempts.has(code)) {
      if (attempts.get(code) === 'failed' || attempts.get(code) === 'review') addActionButtons(tr);
      return;
    }

    attempts.set(code, 'pending');
    setSearching(tr, true, 'Web kaynakları taranıyor…');
    try {
      if (!window.BYSAY_ONLINE_POZ_LOOKUP?.lookup) throw new Error('Çevrimiçi poz arama modülü yüklenemedi.');
      const result = await window.BYSAY_ONLINE_POZ_LOOKUP.lookup(code);
      const confidence = Number(result.confidence || 0);
      const minimum = Number(config.minimumConfidence || 0.72);
      if (result.conflict || confidence < minimum) {
        reviewResults.set(code, result);
        attempts.set(code, 'review');
        setSearching(tr, false);
        addActionButtons(tr);
        notify(`${code}: Bir sonuç bulundu ancak kaynaklar doğrulanamadı. “Bulunanı İncele” ile kontrol edin.`, 6000);
        return;
      }
      saveAndReload(code, result);
    } catch (error) {
      console.warn(`Çevrimiçi poz araması başarısız (${code})`, error);
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
        const badge = document.createElement(record.sourceUrl ? 'a' : 'span');
        badge.className = 'legacy-price-badge';
        badge.textContent = `↻ Son yayın ${record.originalYear} → ${record.targetPeriod}`;
        badge.title = [
          `Kaynak: ${record.lookupSource || 'İnternet kaynağı'}`,
          `${record.originalYear} fiyatı: ${formatMoney(record.originalPrice)} TL`,
          `Güncelleme katsayısı: ${Number(record.updateFactor || 0).toFixed(4)}`,
          `${record.sourcePeriod}: ${record.sourceIndex} → ${record.targetPeriod}: ${record.targetIndex}`,
          record.sourceCount > 1 ? `${record.sourceCount} ayrı kaynakla doğrulandı` : 'Tek kaynak sonucu'
        ].join('\n');
        if (record.sourceUrl) {
          badge.href = record.sourceUrl;
          badge.target = '_blank';
          badge.rel = 'noopener noreferrer';
        }
        input.insertAdjacentElement('afterend', badge);
      }
      const status = tr.querySelector('.status-found');
      if (status && !status.classList.contains('status-updated')) {
        status.classList.add('status-updated');
        status.innerHTML = '<i></i>Web + Güncellendi';
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
    const mode = String(config.endpoint || '').trim() ? 'Sunucu taraması' : 'Tarayıcı taraması';
    badge.innerHTML = `<strong>TÜİK İME + Web Poz Tarama</strong><span>${escapeHtml(latest.monthName || '')} ${escapeHtml(latest.year)} · ${formatMoney(latest.index)} · ${escapeHtml(mode)}</span>`;
    source.appendChild(badge);
  };

  const ensureModal = () => {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'legacy-modal-backdrop';
    modal.innerHTML = `<div class="legacy-modal" role="dialog" aria-modal="true" aria-labelledby="legacyModalTitle">
      <div class="legacy-modal-head"><div><h3 id="legacyModalTitle">Eski Poz Fiyatını Güncelle</h3><p>İnternette bulunan son yayın yılı ve fiyatı kontrol edin. Kaydedilen fiyat TÜİK İnşaat Maliyet Endeksiyle güncel döneme taşınır.</p></div><button type="button" data-legacy-close>×</button></div>
      <div class="legacy-form-grid">
        <label>Poz No<input id="legacyCode" readonly></label>
        <label>Son yayın yılı<input id="legacyYear" type="number" min="2000" max="2099" value="2025"></label>
        <label class="wide">Poz Tanımı<input id="legacyDescription"></label>
        <label>Birim<input id="legacyUnit" placeholder="Ad, m, m²…"></label>
        <label>Yayımlanan Birim Fiyat<input id="legacyPrice" inputmode="decimal" placeholder="0,00"></label>
        <label class="wide legacy-source-field">Kaynak<input id="legacySource" readonly></label>
      </div>
      <div class="legacy-review-note" id="legacyReviewNote" hidden></div>
      <div class="legacy-calc-preview" id="legacyPreview">Yıl ve fiyat girildiğinde güncel değer hesaplanır.</div>
      <div class="legacy-modal-actions"><button type="button" data-legacy-site>Kaynağı Aç</button><button type="button" class="primary" data-legacy-save>Güncelle ve Kaydet</button></div>
    </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-legacy-close]')) modal.classList.remove('show');
      if (event.target.closest('[data-legacy-site]')) {
        const url = activeSeed?.sourceUrl || googleSearchUrl(activeCode);
        window.open(url, '_blank', 'noopener');
      }
      if (event.target.closest('[data-legacy-save]')) {
        try {
          const payload = {
            ...(activeSeed || {}),
            poz:activeCode,
            year:Number(modal.querySelector('#legacyYear').value),
            month:1,
            price:modal.querySelector('#legacyPrice').value,
            tanim:modal.querySelector('#legacyDescription').value,
            birim:modal.querySelector('#legacyUnit').value,
            lookupSource:activeSeed?.lookupSource || 'Kullanıcı doğrulamalı internet sonucu',
            confidence:Math.max(Number(activeSeed?.confidence || 0), 0.75),
            conflict:false,
            verifiedAt:new Date().toISOString()
          };
          modal.classList.remove('show');
          saveAndReload(activeCode, payload);
        } catch (error) {
          notify(error?.message || 'Eski fiyat kaydedilemedi.', 5000);
        }
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
    preview.innerHTML = `<strong>${formatMoney(calculation.updatedPrice)} TL</strong><span>Katsayı ${calculation.factor.toFixed(4)} · ${calculation.source.monthName} ${calculation.source.year} → ${calculation.target.monthName} ${calculation.target.year}</span>`;
  };

  const openManual = (code, seed = null) => {
    activeCode = normalizePoz(code);
    activeSeed = seed;
    const dialog = ensureModal();
    dialog.querySelector('#legacyCode').value = activeCode;
    dialog.querySelector('#legacyDescription').value = seed?.tanim || '';
    dialog.querySelector('#legacyUnit').value = seed?.birim || '';
    dialog.querySelector('#legacyPrice').value = seed?.price ? formatMoney(seed.price) : '';
    dialog.querySelector('#legacySource').value = seed?.sourceUrl || seed?.lookupSource || 'Google web araması / kullanıcı doğrulaması';
    const latestYear = Number(window.BYSAY_LEGACY_INDEX?.latest?.year || new Date().getFullYear());
    dialog.querySelector('#legacyYear').value = Number(seed?.year || Math.max(2000, latestYear - 1));
    const review = dialog.querySelector('#legacyReviewNote');
    if (seed) {
      const confidence = Math.round(Number(seed.confidence || 0) * 100);
      review.hidden = false;
      review.innerHTML = `<strong>Otomatik tarama sonucu</strong><span>Güven: %${confidence}${seed.conflict ? ' · Aynı yıl için farklı fiyatlar bulundu' : ''}. Kaydetmeden önce kaynak sayfayı kontrol edin.</span>`;
    } else {
      review.hidden = true;
      review.textContent = '';
    }
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
      if (open) window.open(googleSearchUrl(open.dataset.legacyOpen), '_blank', 'noopener');
      const manual = event.target.closest('[data-legacy-manual]');
      if (manual) openManual(manual.dataset.legacyManual);
      const review = event.target.closest('[data-legacy-review]');
      if (review) openManual(review.dataset.legacyReview, reviewResults.get(normalizePoz(review.dataset.legacyReview)) || null);
    });
  };

  const start = async () => {
    try { await window.BYSAY_LEGACY_READY; } catch (_) { }
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
