// arnorg: adresleri. Biçim: arnorg:/<projeId>/<alan>/<yol>
// alan "ana" (proje reposu) ya da ajan kimliğidir (ajanın git worktree'si).

export const SEMA = "arnorg";
/** Git'teki sürümler (HEAD, indeks, temel) salt okunur belge olarak bu şemayla açılır; ref sorgu parametresidir */
export const GIT_SEMASI = "arnorg-git";

export interface Konum {
  projeId: string;
  alan: string;
  /** Alan köküne göre yol, / ayraçlı; kökte "" */
  yol: string;
}

/** Adres yolunu (uri.path) çözer; biçime uymuyorsa null */
export function konumCoz(adresYolu: string): Konum | null {
  const [projeId, alan, ...geri] = adresYolu.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!projeId || !alan) return null;
  return { projeId, alan, yol: geri.join("/") };
}

/** Konumdan adres yolu (uri.path) */
export function adresYolu(k: Konum): string {
  return `/${k.projeId}/${k.alan}${k.yol ? `/${k.yol}` : ""}`;
}

/** Terminal çalışma dizini gibi platform yolundan (\\proje\\alan\\alt ya da /proje/alan/alt) konum;
 * yalnız verilen projeye aitse döner (ev dizini gibi yollar elenir) */
export function yoldanKonum(yol: string | undefined, projeId: string): Konum | null {
  if (!yol) return null;
  const k = konumCoz(yol.replace(/^[a-zA-Z]:/, ""));
  return k && k.projeId === projeId ? k : null;
}
