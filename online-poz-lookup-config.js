(() => {
  'use strict';

  const storedEndpoint = (() => {
    try { return localStorage.getItem('BYSAY_POZ_LOOKUP_ENDPOINT') || ''; }
    catch (_) { return ''; }
  })();

  window.BYSAY_POZ_LOOKUP_CONFIG = Object.freeze({
    endpoint: storedEndpoint,
    timeoutMs: 22000,
    maxSearchPages: 4,
    maxCandidatePages: 8,
    minimumConfidence: 0.72,
    browserFallback: true,
    trustedDomains: [
      'birimfiyat.net',
      'www.birimfiyat.net',
      'birimfiyat.com',
      'www.birimfiyat.com',
      'amp.com.tr',
      'www.amp.com.tr',
      'hakedis.org',
      'www.hakedis.org'
    ]
  });
})();
