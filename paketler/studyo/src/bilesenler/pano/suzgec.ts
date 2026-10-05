// Pano süzgeci: herkes, atanmamış, bir kişi ya da bir rol (o roldeki herkesin görevleri). Seçim metin olarak saklanır:
// "" herkes, "_yok" atanmamış, "a:<kimlik>" kişi, "r:<rol>" rol; 0.0.7'nin yalın ajan kimliği de kişi sayılır. Son seçim
// projeye göre bu tarayıcıda kalır (ekrandan çıkıp dönünce süzgeç yerinde).
import type { Ajan, Gorev } from "@arnorg/ortak";

export type Suzgec = { tur: "hepsi" } | { tur: "atanmamis" } | { tur: "kisi"; id: string } | { tur: "rol"; rol: string };

export function suzgecCoz(deger: string | null | undefined): Suzgec {
  const d = (deger ?? "").trim();
  if (!d) return { tur: "hepsi" };
  if (d === "_yok") return { tur: "atanmamis" };
  if (d.startsWith("r:") && d.length > 2) return { tur: "rol", rol: d.slice(2) };
  if (d.startsWith("a:") && d.length > 2) return { tur: "kisi", id: d.slice(2) };
  return { tur: "kisi", id: d };
}

export function suzgecDegeri(s: Suzgec): string {
  switch (s.tur) {
    case "hepsi":
      return "";
    case "atanmamis":
      return "_yok";
    case "kisi":
      return `a:${s.id}`;
    case "rol":
      return `r:${s.rol}`;
  }
}

/** Süzgeç ekiple hâlâ anlamlı mı: kişi ekipte, rolde en az bir kişi var (yoksa herkes gösterilir) */
export function suzgecGecerli(s: Suzgec, ajanlar: readonly Pick<Ajan, "id" | "rol">[]): boolean {
  if (s.tur === "kisi") return ajanlar.some((a) => a.id === s.id);
  if (s.tur === "rol") return ajanlar.some((a) => a.rol === s.rol);
  return true;
}

export function gorevUyar(g: Pick<Gorev, "atananId">, s: Suzgec, ajanlar: readonly Pick<Ajan, "id" | "rol">[]): boolean {
  switch (s.tur) {
    case "hepsi":
      return true;
    case "atanmamis":
      return !g.atananId;
    case "kisi":
      return g.atananId === s.id;
    case "rol":
      return !!g.atananId && ajanlar.some((a) => a.id === g.atananId && a.rol === s.rol);
  }
}

/** Ekipteki roller (birer kez), görünen adıyla, ada göre sıralı */
export function rolSecenekleri(ajanlar: readonly Pick<Ajan, "rol" | "rolAdi">[], yerel = "tr"): { rol: string; ad: string }[] {
  const roller = new Map<string, string>();
  for (const a of ajanlar) if (!roller.has(a.rol)) roller.set(a.rol, a.rolAdi || a.rol);
  return [...roller].map(([rol, ad]) => ({ rol, ad })).sort((a, b) => a.ad.localeCompare(b.ad, yerel));
}

const anahtar = (projeId: string) => `arnorg.pano.suzgec.${projeId}`;

export function suzgecOku(projeId: string | null): string {
  if (!projeId) return "";
  try {
    return localStorage.getItem(anahtar(projeId)) ?? "";
  } catch {
    return "";
  }
}

export function suzgecYaz(projeId: string | null, deger: string) {
  if (!projeId) return;
  try {
    if (deger) localStorage.setItem(anahtar(projeId), deger);
    else localStorage.removeItem(anahtar(projeId));
  } catch {
    // depolama kapalı: süzgeç yalnız bu oturumda
  }
}
