(() => {
  'use strict';

  const HIDDEN_KEY = 'BYSAY_HIDDEN_POZ_BOOK_KEYS_V1';

  const normalizeText = value => String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '');

  const institutionInfo = text => {
    const norm = normalizeText(text);
    const institutions = [
      {name:'ÇŞİDB', pattern:/cevre|sehircilik|csidb|csb/},
      {name:'AYGM', pattern:/altyapiyatirimlari|aygm/},
      {name:'DSİ', pattern:/devletsuisleri|dsi/},
      {name:'KGM', pattern:/karayollari|kgm/},
      {name:'PTT', pattern:/ptt|postatelgraf/},
      {name:'İLBANK', pattern:/illerbankasi|ilbank/},
      {name:'TEDAŞ', pattern:/tedas/},
      {name:'TEİAŞ', pattern:/teias/},
      {name:'EÜAŞ', pattern:/euas/},
      {name:'BOTAŞ', pattern:/botas/},
      {name:'TCDD', pattern:/tcdd/},
      {name:'VGM', pattern:/vakiflar|vgm/},
      {name:'KTB', pattern:/kulturturizm|ktb/},
      {name:'Milli Saraylar', pattern:/millisaraylar/}
    ];
    return institutions.find(item => item.pattern.test(norm)) || null;
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

  const bookKeyForRecord = (record, forcedSource = null) => {
    if (record?.kitapId) return `embedded-${record.kitapId}`;
    const source = String(forcedSource || record?.kitapKaynak || record?.kitapKurum || record?.kurum || record?.kaynak || '').trim();
    const institution = institutionInfo(`${record?.kitapKurum || ''} ${record?.kurum || ''} ${source}`);
    const discipline = disciplineOf(record);
    const baseSource = !source || /tablo|mekaniktesisat|insaatbirimfiyat|temmuz2026|2026temmuz/.test(normalizeText(source));
    if (institution?.name === 'ÇŞİDB' || (!institution && baseSource)) return `csidb-${discipline}`;
    if (institution) return `institution-${normalizeText(institution.name)}-${normalizeText(source || institution.name)}`;
    const clean = source.replace(/\.(xlsx?|xlsm|csv|json|pdf)$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Yüklenen Poz Kitabı';
    return `custom-${normalizeText(clean)}`;
  };

  const hiddenKeys = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch (_) {
      return new Set();
    }
  };

  window.BYSAY_BOOK_KEY_FOR_RECORD = bookKeyForRecord;
  window.BYSAY_HIDDEN_BOOK_STORAGE_KEY = HIDDEN_KEY;
  window.BYSAY_APPLY_HIDDEN_BOOKS = () => {
    const hidden = hiddenKeys();
    if (!hidden.size) return 0;

    const before = Array.isArray(window.POZ_DATA) ? window.POZ_DATA.length : 0;
    if (Array.isArray(window.POZ_DATA)) {
      window.POZ_DATA = window.POZ_DATA.filter(record => !hidden.has(bookKeyForRecord(record)));
    }
    if (Array.isArray(window.BYSAY_INSTITUTIONAL_BOOK_RECORDS)) {
      window.BYSAY_INSTITUTIONAL_BOOK_RECORDS = window.BYSAY_INSTITUTIONAL_BOOK_RECORDS.filter(record => !hidden.has(bookKeyForRecord(record)));
    }
    if (Array.isArray(window.BYSAY_INSTITUTIONAL_BOOK_CATALOG)) {
      window.BYSAY_INSTITUTIONAL_BOOK_CATALOG = window.BYSAY_INSTITUTIONAL_BOOK_CATALOG.filter(book => !hidden.has(`embedded-${book.id}`));
    }

    window.POZ_META = {...(window.POZ_META || {}), recordCount: Array.isArray(window.POZ_DATA) ? window.POZ_DATA.length : 0};
    return before - (Array.isArray(window.POZ_DATA) ? window.POZ_DATA.length : 0);
  };
})();
