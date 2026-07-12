(() => {
  'use strict';

  const VERSION = '20260712-24';
  const DB_NAME = 'BYSAY_POZ_KITAPLARI_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'books';
  const FALLBACK_KEY = 'BYSAY_POZ_KITAPLARI_FALLBACK_V1';

  const normalizeText = value => String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '');

  const normalizePoz = value => String(value ?? '')
    .trim().toUpperCase().replace(/\s+/g, '')
    .replace(/[–—−]/g, '-').replace(/[),;:]+$/g, '');

  const INSTITUTIONS = [
    {code:'DSİ', full:'Devlet Su İşleri Genel Müdürlüğü', initials:'DS', slug:'dsi', test:/dsi|devletsuisleri/},
    {code:'KGM', full:'Karayolları Genel Müdürlüğü', initials:'KG', slug:'kgm', test:/kgm|karayollari/},
    {code:'AYGM', full:'Altyapı Yatırımları Genel Müdürlüğü', initials:'AY', slug:'aygm', test:/aygm|altyapiyatirimlari/},
    {code:'PTT', full:'Posta ve Telgraf Teşkilatı', initials:'PT', slug:'ptt', test:/ptt|postatelgraf/},
    {code:'İLBANK', full:'İller Bankası A.Ş.', initials:'İL', slug:'ilbank', test:/ilbank|illerbankasi/},
    {code:'TEDAŞ', full:'Türkiye Elektrik Dağıtım A.Ş.', initials:'TD', slug:'tedas', test:/tedas/},
    {code:'TEİAŞ', full:'Türkiye Elektrik İletim A.Ş.', initials:'TE', slug:'teias', test:/teias/},
    {code:'EÜAŞ', full:'Elektrik Üretim A.Ş.', initials:'EÜ', slug:'euas', test:/euas/},
    {code:'BOTAŞ', full:'Boru Hatları ile Petrol Taşıma A.Ş.', initials:'BO', slug:'botas', test:/botas/},
    {code:'TCDD', full:'Türkiye Cumhuriyeti Devlet Demiryolları', initials:'TC', slug:'tcdd', test:/tcdd/},
    {code:'VGM', full:'Vakıflar Genel Müdürlüğü', initials:'VG', slug:'vgm', test:/vgm|vakiflar/},
    {code:'KTB', full:'Kültür ve Turizm Bakanlığı', initials:'KT', slug:'ktb', test:/ktb|kulturturizm/},
    {code:'ÇŞİDB', full:'Çevre, Şehircilik ve İklim Değişikliği Bakanlığı', initials:'ÇŞ', slug:'csidb', test:/csidb|csb|cevresehircilik/}
  ];

  const inferPeriod = text => {
    const raw = String(text || '');
    const norm = normalizeText(raw);
    const year = raw.match(/20\d{2}/)?.[0] || '2026';
    const months = [['ocak','Ocak'],['subat','Şubat'],['mart','Mart'],['nisan','Nisan'],['mayis','Mayıs'],['haziran','Haziran'],['temmuz','Temmuz'],['agustos','Ağustos'],['eylul','Eylül'],['ekim','Ekim'],['kasim','Kasım'],['aralik','Aralık']];
    const month = months.find(([key]) => norm.includes(key))?.[1] || '';
    if (/1donem|birincidonem/.test(norm)) return `1. Dönem ${year}`;
    if (/2donem|ikincidonem/.test(norm)) return `2. Dönem ${year}`;
    return [month, year].filter(Boolean).join(' ') || year;
  };

  const inferInstitution = name => {
    const norm = normalizeText(name);
    return INSTITUTIONS.find(item => item.test.test(norm)) || {
      code:String(name || 'Poz Kitabı').replace(/\.(xlsx?|xlsm|csv|json)$/i, '').replace(/[_-]+/g, ' ').trim(),
      full:String(name || 'Yüklenen Poz Kitabı').replace(/\.(xlsx?|xlsm|csv|json)$/i, '').replace(/[_-]+/g, ' ').trim(),
      initials:String(name || 'PK').split(/\s+/).filter(Boolean).slice(0,2).map(word => word[0]).join('').toLocaleUpperCase('tr-TR') || 'PK',
      slug:'custom'
    };
  };

  const disciplineOf = record => {
    const explicit = String(record?.disiplin || record?.kategori || record?.kaynak || '').toLocaleUpperCase('tr-TR');
    if (explicit.includes('ELK') || explicit.includes('ELEKTR')) return 'ELK';
    if (explicit.includes('MEK') || explicit.includes('TESİSAT')) return 'MEK';
    const code = normalizePoz(record?.poz).replace(/-(D|M)$/i, '');
    if (/^(35|36)[.\/-]/.test(code)) return 'ELK';
    if (/^25[.\/-]/.test(code)) return 'MEK';
    return 'İNŞ';
  };

  const openDb = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB desteklenmiyor.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, {keyPath:'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Poz kitabı veritabanı açılamadı.'));
  });

  const readIndexedBooks = async () => {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error || new Error('Kayıtlı poz kitapları okunamadı.'));
      });
    } finally {
      db.close();
    }
  };

  const readFallbackBooks = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  };

  const getAllBooks = async () => {
    try {
      const books = await readIndexedBooks();
      if (books.length) return books;
    } catch (error) {
      console.warn('IndexedDB kitapları okunamadı:', error);
    }
    return readFallbackBooks();
  };

  const enrichBook = book => {
    const institution = inferInstitution(book?.name);
    const records = (Array.isArray(book?.records) ? book.records : []).map(item => ({
      ...item,
      poz:normalizePoz(item?.poz),
      kaynak:book.name || item?.kaynak || institution.full,
      kitapKaynak:book.name || institution.full,
      kitapKurum:institution.full,
      kurum:institution.code,
      kitapId:`user-${book.id}`,
      userBookId:String(book.id),
      userBookName:book.name || institution.full,
      disiplin:disciplineOf(item)
    })).filter(item => item.poz);

    return {
      id:String(book.id),
      name:book.name || institution.full,
      updatedAt:book.updatedAt || '',
      count:records.length,
      institution:institution.code,
      institutionFull:institution.full,
      initials:institution.initials,
      slug:institution.slug,
      period:inferPeriod(book.name),
      records
    };
  };

  window.BYSAY_GET_SAVED_BOOKS = getAllBooks;

  window.BYSAY_LOAD_USER_BOOKS = async () => {
    const rawBooks = await getAllBooks();
    const books = rawBooks.map(enrichBook).filter(book => book.records.length);
    books.sort((a,b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));

    const merged = new Map();
    const base = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
    base.forEach(item => merged.set(normalizePoz(item.poz), item));

    for (const book of books) {
      for (const record of book.records) merged.set(normalizePoz(record.poz), record);
    }

    window.POZ_DATA = Array.from(merged.values());
    window.BYSAY_USER_BOOK_CATALOG = books;
    window.BYSAY_USER_BOOK_RECORDS = books.flatMap(book => book.records);

    const oldMeta = window.POZ_META || {};
    window.POZ_META = {
      ...oldMeta,
      recordCount:window.POZ_DATA.length,
      userBookCount:books.length,
      userPozCount:books.reduce((sum, book) => sum + book.count, 0),
      userBookNames:books.map(book => book.name),
      sourceFile:[oldMeta.sourceFile, ...books.map(book => book.name)].filter(Boolean).join(' + ')
    };

    document.documentElement.dataset.savedBookCount = String(books.length);
    document.documentElement.dataset.userBookLoaderVersion = VERSION;
    return {bookCount:books.length, pozCount:window.POZ_META.userPozCount, books};
  };
})();
