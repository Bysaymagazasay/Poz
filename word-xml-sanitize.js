(() => {
  'use strict';

  const NativeDOMParser = window.DOMParser;
  if (!NativeDOMParser || window.__BYSAY_WORD_XML_SANITIZER__) return;
  window.__BYSAY_WORD_XML_SANITIZER__ = true;

  const cleanXml = source => String(source ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/^\s*<\?xml[^>]*\?>\s*/i, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  function SafeDOMParser() {
    const parser = new NativeDOMParser();
    const nativeParse = parser.parseFromString.bind(parser);
    parser.parseFromString = (source, type) => nativeParse(cleanXml(source), type);
    return parser;
  }

  SafeDOMParser.prototype = NativeDOMParser.prototype;
  window.DOMParser = SafeDOMParser;
})();
