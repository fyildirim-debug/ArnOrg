// Kod zekâsı modellerinin İngilizce açıklamaları (ARNORG_DIL=en); kimlik, boyut ve indirme bilgisi kod-zekasi-verisi.mjs'den gelir

export const MODELLER = {
  kaliteli: {
    aciklama:
      "Multilingual and strong on code; finds code with English or Turkish names from a question in either language. The first indexing is slow (~0.5 s per chunk on 4 cores; heavily used code is embedded first), after that only changed chunks are embedded.",
  },
  hizli: { aciklama: "Smaller and several times faster; a little weaker at code search. A good fit for the first indexing of large projects." },
};
