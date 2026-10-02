// Erişim anahtarı: ilk açılışta adres parçasından (#anahtar=...) alınır,
// sessionStorage'a yazılır ve adres çubuğundan silinir.

const DEPO_ANAHTARI = "arnorg.anahtar";

let bellekteki: string | null = null;
const dinleyiciler = new Set<(anahtar: string | null) => void>();

function depodanOku(): string | null {
  try {
    return sessionStorage.getItem(DEPO_ANAHTARI);
  } catch {
    return null;
  }
}

function depoyaYaz(deger: string | null) {
  try {
    if (deger) sessionStorage.setItem(DEPO_ANAHTARI, deger);
    else sessionStorage.removeItem(DEPO_ANAHTARI);
  } catch {
    // Gizli pencere ya da engellenmiş depolama: anahtar yalnız bellekte kalır
  }
}

/** Uygulama açılışında bir kez çağrılır */
export function anahtariBaslat(): string | null {
  const parca = location.hash.replace(/^#/, "");
  const eslesme = /(?:^|&)anahtar=([^&]+)/.exec(parca);
  if (eslesme?.[1]) {
    const anahtar = decodeURIComponent(eslesme[1]);
    bellekteki = anahtar;
    depoyaYaz(anahtar);
    // Anahtar adres çubuğunda, geçmişte ve ekran paylaşımında görünmesin
    history.replaceState(null, "", location.pathname + location.search);
    return anahtar;
  }
  bellekteki = depodanOku();
  return bellekteki;
}

export function anahtar(): string | null {
  return bellekteki;
}

export function anahtarAyarla(yeni: string | null) {
  bellekteki = yeni && yeni.trim() ? yeni.trim() : null;
  depoyaYaz(bellekteki);
  dinleyiciler.forEach((d) => d(bellekteki));
}

export function anahtarDinle(dinleyici: (anahtar: string | null) => void): () => void {
  dinleyiciler.add(dinleyici);
  return () => dinleyiciler.delete(dinleyici);
}
