(() => {
  'use strict';

  const VERSION = '20260713-30';
  const config = window.BYSAY_POZ_LOOKUP_CONFIG || {};
  const currentYear = new Date().getFullYear();
  const TRUSTED_DOMAINS = new Set(config.trustedDomains || []);

  const normalizePoz = value => String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[–—−]/g, '-');

  const parseNumber = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let text = String(value ?? '')
      .trim()
      .replace(/\u00a0/g, '')
      .replace(/\s/g, '')
      .replace(/[^0-9,.-]/g, '');
    if (!text) return NaN;
    const comma = text.lastIndexOf(',');
    const dot = text.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
    } else if (comma >= 0) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if ((text.match(/\./g) || []).length > 1) {
      text = text.replace(/\./g, '');
    }
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  };

  const compactCode = value => normalizePoz(value).replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '');

  const withTimeout = async (url, options = {}, timeoutMs = Number(config.timeoutMs) || 22000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json,text/plain,text/html,*/*',
          ...(options.headers || {})
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } finally {
      clearTimeout(timer);
    }
  };

  const readerUrl = target => {
    const clean = String(target || '').trim();
    if (!clean) return '';
    if (clean.startsWith('https://r.jina.ai/http://') || clean.startsWith('https://r.jina.ai/https://')) return clean;
    if (clean.startsWith('https://')) return `https://r.jina.ai/http://${clean.slice(8)}`;
    if (clean.startsWith('http://')) return `https://r.jina.ai/http://${clean.slice(7)}`;
    return `https://r.jina.ai/http://${clean}`;
  };

  const safeUrl = raw => {
    try {
      let value = String(raw || '').trim().replace(/[),.;]+$/g, '');
      if (!value) return null;
      if (value.startsWith('//')) value = `https:${value}`;
      if (value.startsWith('/url?')) value = `https://www.google.com${value}`;
      const url = new URL(value);
      if (/google\./i.test(url.hostname) && url.pathname === '/url') {
        const actual = url.searchParams.get('q') || url.searchParams.get('url');
        if (actual) return safeUrl(actual);
      }
      if (!/^https?:$/.test(url.protocol)) return null;
      return url.toString();
    } catch (_) {
      return null;
    }
  };

  const domainOf = url => {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
    catch (_) { return ''; }
  };

  const isUsefulDomain = url => {
    const host = domainOf(url);
    if (!host) return false;
    if (TRUSTED_DOMAINS.has(host) || TRUSTED_DOMAINS.has(`www.${host}`)) return true;
    return host.endsWith('.gov.tr') || host.endsWith('.bel.tr') || host.endsWith('.edu.tr');
  };

  const extractUrls = text => {
    const urls = new Set();
    const source = String(text || '');
    const markdown = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
    const plain = /https?:\/\/[^\s<>'"\])]+/g;
    let match;
    while ((match = markdown.exec(source))) {
      const url = safeUrl(match[1]);
      if (url) urls.add(url);
    }
    while ((match = plain.exec(source))) {
      const url = safeUrl(match[0]);
      if (url) urls.add(url);
    }
    return [...urls];
  };

  const cleanText = value => String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const priceToken = '(?:\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,4})?|\\d+(?:,\\d{1,4})?|\\d+(?:\\.\\d{1,4})?)';
  const yearToken = '(20(?:0\\d|1\\d|2\\d))';

  const priceYearCandidates = context => {
    const candidates = [];
    const patterns = [
      new RegExp(`${yearToken}[^\\n]{0,120}?(?:birim\\s*fiyat|fiyat|bedel|tutar)[^0-9]{0,20}(${priceToken})\\s*(?:TL|₺)?`, 'gi'),
      new RegExp(`${yearToken}[^\\n]{0,80}?(${priceToken})\\s*(?:TL|₺)`, 'gi'),
      new RegExp(`(${priceToken})\\s*(?:TL|₺)[^\\n]{0,90}?${yearToken}`, 'gi'),
      new RegExp(`(?:birim\\s*fiyat|fiyat|bedel)[^0-9]{0,18}(${priceToken})[^\\n]{0,100}?${yearToken}`, 'gi')
    ];

    patterns.forEach((pattern, patternIndex) => {
      let match;
      while ((match = pattern.exec(context))) {
        const reverse = patternIndex >= 2;
        const year = Number(reverse ? match[2] : match[1]);
        const price = parseNumber(reverse ? match[1] : match[2]);
        if (year < 2000 || year > currentYear || !Number.isFinite(price) || price <= 0) continue;
        candidates.push({
          year,
          price,
          explicit: /birim\s*fiyat|fiyat|bedel|tutar/i.test(match[0]),
          evidence: match[0].replace(/\s+/g, ' ').slice(0, 240)
        });
      }
    });

    const lines = context.split(/\n+/).map(line => line.trim()).filter(Boolean);
    lines.forEach(line => {
      const yearMatch = line.match(/\b(20(?:0\d|1\d|2\d))\b/);
      if (!yearMatch) return;
      const year = Number(yearMatch[1]);
      const priceMatches = [...line.matchAll(/(?:^|\s)(\d{1,3}(?:\.\d{3})*,\d{2,4}|\d+,\d{2,4})\s*(?:TL|₺)?\b/g)];
      priceMatches.forEach(item => {
        const price = parseNumber(item[1]);
        if (Number.isFinite(price) && price > 0) {
          candidates.push({
            year,
            price,
            explicit: /birim\s*fiyat|fiyat|bedel|tutar/i.test(line),
            evidence: line.slice(0, 240)
          });
        }
      });
    });

    const dedup = new Map();
    candidates.forEach(item => {
      const key = `${item.year}|${item.price.toFixed(4)}`;
      const current = dedup.get(key);
      if (!current || (!current.explicit && item.explicit)) dedup.set(key, item);
    });
    return [...dedup.values()];
  };

  const extractDescription = (context, code) => {
    const index = context.toUpperCase().indexOf(String(code).toUpperCase());
    if (index < 0) return '';
    const after = context.slice(index + String(code).length, index + String(code).length + 520);
    const cleaned = after
      .split(/\b20\d{2}\b|(?:birim\s*fiyat|fiyat|bedel)\s*[:\-]?\s*\d|(?:birim|ölçü\s*birimi)\s*[:\-]/i)[0]
      .replace(/^[\s:;|\-–—#*]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length >= 4 && cleaned.length <= 300 ? cleaned : '';
  };

  const extractUnit = context => {
    const match = context.match(/(?:birim|ölçü\s*birimi)\s*[:\-]?\s*(Adet|Ad|m²|m2|m³|m3|mt|m|kg|ton|takım|set|çift|saat|gün)(?![A-Za-z0-9²³])/i)
      || context.match(/\b(Adet|Ad|m²|m2|m³|m3|mt|m|kg|ton|takım|set|çift|saat|gün)(?![A-Za-z0-9²³])/i);
    return match?.[1] || '';
  };

  const extractFromPage = ({text, code, url, title = ''}) => {
    const cleaned = cleanText(text);
    const normalized = normalizePoz(code);
    const compact = compactCode(code);
    const upper = cleaned.toUpperCase();
    const compactText = upper.replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '');
    const exact = upper.includes(normalized) || compactText.includes(compact);
    if (!exact) return [];

    const positions = [];
    let offset = 0;
    while (true) {
      const position = upper.indexOf(normalized, offset);
      if (position < 0) break;
      positions.push(position);
      offset = position + normalized.length;
    }
    if (!positions.length) positions.push(Math.max(0, compactText.indexOf(compact)));

    const host = domainOf(url);
    const trusted = isUsefulDomain(url);
    const results = [];
    positions.slice(0, 8).forEach(position => {
      const context = cleaned.slice(Math.max(0, position - 800), Math.min(cleaned.length, position + 2600));
      const candidates = priceYearCandidates(context);
      candidates.forEach(candidate => {
        let score = 0.42;
        if (exact) score += 0.18;
        if (trusted) score += 0.12;
        if (/birim\s*fiyat|poz\s*no|birim\s*fiyat\s*tarihi/i.test(context)) score += 0.10;
        if (candidate.explicit) score += 0.10;
        if (host === 'birimfiyat.net' || host === 'birimfiyat.com') score += 0.05;
        results.push({
          poz: normalized,
          year: candidate.year,
          month: 1,
          price: candidate.price,
          tanim: extractDescription(context, code) || title || 'İnternetten bulunan geçmiş yıl pozu',
          birim: extractUnit(context),
          sourceUrl: url,
          sourceDomain: host,
          sourceTitle: title || host,
          lookupSource: host || 'İnternet kaynağı',
          confidence: Math.min(0.98, score),
          evidence: candidate.evidence
        });
      });
    });
    return results;
  };

  const rankResults = results => {
    if (!results.length) return null;
    const grouped = new Map();
    results.forEach(item => {
      const key = `${item.year}|${item.price.toFixed(2)}`;
      const group = grouped.get(key) || {items: [], domains: new Set()};
      group.items.push(item);
      if (item.sourceDomain) group.domains.add(item.sourceDomain);
      grouped.set(key, group);
    });

    const ranked = [...grouped.values()].map(group => {
      const best = group.items.sort((a, b) => b.confidence - a.confidence)[0];
      const agreementBonus = Math.min(0.16, Math.max(0, group.domains.size - 1) * 0.08);
      return {
        ...best,
        confidence: Math.min(0.99, best.confidence + agreementBonus),
        sourceCount: group.domains.size,
        sources: group.items.map(item => ({
          url: item.sourceUrl,
          domain: item.sourceDomain,
          title: item.sourceTitle,
          evidence: item.evidence
        }))
      };
    });

    ranked.sort((a, b) => b.year - a.year || b.confidence - a.confidence || b.sourceCount - a.sourceCount);
    const latestYear = ranked[0].year;
    const sameYear = ranked.filter(item => item.year === latestYear);
    const conflict = sameYear.length > 1 && Math.abs(sameYear[0].price - sameYear[1].price) > Math.max(0.05, sameYear[0].price * 0.002);
    return {
      ...sameYear[0],
      conflict,
      alternatives: sameYear.slice(1, 4).map(item => ({price: item.price, confidence: item.confidence, sourceUrl: item.sourceUrl}))
    };
  };

  const searchProviderUrls = code => {
    const queries = [
      `"${code}" "birim fiyat"`,
      `"${code}" birimfiyat.net`,
      `"${code}" poz fiyatı`,
      `"${code}"`
    ];
    const urls = [];
    queries.forEach(query => {
      const q = encodeURIComponent(query);
      urls.push(`https://r.jina.ai/http://www.google.com/search?q=${q}`);
      urls.push(`https://r.jina.ai/http://www.bing.com/search?q=${q}`);
      urls.push(`https://r.jina.ai/http://html.duckduckgo.com/html/?q=${q}`);
    });
    return urls;
  };

  const directCandidateUrls = code => [
    `https://www.birimfiyat.net/?poz-ara=${encodeURIComponent(code)}`,
    `https://www.birimfiyat.com/poz/${encodeURIComponent(code)}`,
    `https://www.birimfiyat.com/?s=${encodeURIComponent(code)}`
  ];

  const searchCandidateUrls = async code => {
    const discovered = new Set(directCandidateUrls(code));
    const providerUrls = searchProviderUrls(code).slice(0, Number(config.maxSearchPages) || 4);
    const settled = await Promise.allSettled(providerUrls.map(async url => {
      const response = await withTimeout(url);
      return response.text();
    }));
    settled.forEach(result => {
      if (result.status !== 'fulfilled') return;
      extractUrls(result.value).forEach(url => {
        if (isUsefulDomain(url)) discovered.add(url);
      });
    });
    return [...discovered].slice(0, Number(config.maxCandidatePages) || 8);
  };

  const browserLookup = async code => {
    const urls = await searchCandidateUrls(code);
    const pageResults = [];
    const settled = await Promise.allSettled(urls.map(async url => {
      const response = await withTimeout(readerUrl(url));
      const text = await response.text();
      return extractFromPage({text, code, url});
    }));
    settled.forEach(result => {
      if (result.status === 'fulfilled') pageResults.push(...result.value);
    });
    const ranked = rankResults(pageResults);
    if (!ranked) throw new Error('Web kaynaklarında pozun yıl ve fiyat bilgisi bulunamadı.');
    return {...ranked, mode: 'browser-search', checkedUrls: urls.length};
  };

  const endpointLookup = async code => {
    const endpoint = String(config.endpoint || '').trim();
    if (!endpoint) throw new Error('Sunucu arama adresi tanımlı değil.');
    const url = new URL(endpoint);
    url.searchParams.set('poz', code);
    url.searchParams.set('_', String(Date.now()));
    const response = await withTimeout(url.toString(), {headers:{Accept:'application/json'}});
    const payload = await response.json();
    if (!payload?.ok || !payload?.result) throw new Error(payload?.error || 'Sunucu poz sonucu döndürmedi.');
    return {...payload.result, mode:'server'};
  };

  const lookup = async value => {
    const code = normalizePoz(value);
    if (!code || code.length < 4) throw new Error('Geçerli bir poz numarası girilmedi.');
    const errors = [];

    if (String(config.endpoint || '').trim()) {
      try { return await endpointLookup(code); }
      catch (error) { errors.push(`Sunucu: ${error?.message || error}`); }
    }

    if (config.browserFallback !== false) {
      try { return await browserLookup(code); }
      catch (error) { errors.push(`Tarayıcı: ${error?.message || error}`); }
    }

    throw new Error(errors.join(' • ') || 'Çevrimiçi poz araması yapılamadı.');
  };

  window.BYSAY_ONLINE_POZ_LOOKUP = Object.freeze({
    version: VERSION,
    lookup,
    browserLookup,
    endpointLookup,
    extractFromPage,
    rankResults,
    readerUrl
  });
})();
