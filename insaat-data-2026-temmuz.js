(() => {
  'use strict';
  const construction = [{"poz":"15.100.1001","tanim":"1 ton her cins çimento ve kirecin taşıtlara yükleme, boşaltma ve istifi (Fabrikadan alınan malzemeden yükleme bedeli düşülür.)","birim":"Ton","fiyat":"287,83","montaj":"","kaynak":"2026 Temmuz İnşaat"},{"poz":"15.100.1002","tanim":"1 m³ kum, çakıl, tuvenan, stabilize, kırmataş, hafif agrega ve mermer pirinci taşıtlara yükleme, boşaltma ve figüresi","birim":"m³","fiyat":"50,10","montaj":"","kaynak":"2026 Temmuz İnşaat"},{"poz":"15.100.1003","tanim":"1 m³ her nevi taşın taşıtlara yükleme boşaltma ve figüresi","birim":"m³","fiyat":"54,88","montaj":"","kaynak":"2026 Temmuz İnşaat"},{"poz":"15.100.1004","tanim":"1 ton her cins betonarme demiri, profil ve lama demiri ile sacların taşıtlara yükleme, boşaltma ve istifi (Fabrikadan alınan malzemeden yükleme bedeli düşülür.)","birim":"Ton","fiyat":"217,03","montaj":"","kaynak":"2026 Temmuz İnşaat"},{"poz":"15.100.1005","tanim":"1 ton çelik borunun taşıtlara yükleme, boşaltma ve istifi","birim":"Ton","fiyat":"434,05","montaj":"","kaynak":"2026 Temmuz İnşaat"},{"poz":"15.100.1006","tanim":"1 ton her cins ve ölçüde PE, HDPE ve PVC esaslı borunun taşıtlara yükleme, boşaltma ve istifi","birim":"Ton","fiyat":"651,06","montaj":"","kaynak":"2026 Temmuz İnşaat"},{"poz":"15.100.1007","tanim":"Normal, cephe, modüler dolu veya delikli tuğlalar ve oluklu kiremidin taşıtlara yükleme, boşaltma ve istifi","birim":"1000 Ad","fiyat":"282,83","montaj":"","kaynak":"2026 Temmuz İnşaat"},{"poz":"15.100.1008","tanim":"Her cins hafif gazbeton malzemesi, genleştirilmiş perlit agregası ve bu agrega ile yapılmış (tuğla, pano, hazır kuru harç ve benzeri) malzemenin taşıtlara yükleme, boşaltma ve istifi","birim":"m³","fiyat":"80,81","montaj":"","kaynak":"2026 Temmuz İnşaat"}];
  const normalizePoz = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const merged = new Map();
  const mechanical = Array.isArray(window.POZ_DATA) ? window.POZ_DATA : [];
  for (const item of mechanical) merged.set(normalizePoz(item.poz), item);
  for (const item of construction) merged.set(normalizePoz(item.poz), item);
  window.POZ_DATA = Array.from(merged.values());
  const oldMeta = window.POZ_META || {};
  window.POZ_META = {
    ...oldMeta,
    title: '2026 Temmuz Mekanik + İnşaat Poz Listesi',
    recordCount: window.POZ_DATA.length,
    constructionRecordCount: construction.length,
    sourceFile: [oldMeta.sourceFile, '2026-Temmuz-Insaat-Birim-Fiyat-Listesi.xlsx'].filter(Boolean).join(' + '),
    priceColumn: '2026 Temmuz Güncel Birim Fiyat (TL)'
  };
  window.BYSAY_INSAAT_READY = true;
})();
