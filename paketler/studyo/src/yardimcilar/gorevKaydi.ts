// Görev kaydı olayı (0.0.8): tek ortak çalışma alanında bir görevin işi kaydedilince çekirdeğin yayınladığı
// "gorev.kaydedildi". Olay ortak tiplere (SunucuOlayi) ayrı bir çalışmayla girer; Stüdyo onu tipe bağlanmadan,
// biçimine bakarak okur: tanınmayan alanlar yok sayılır, görev kimliği ya da kodu olmayan olay kayıt sayılmaz.
// Ofis kaydedenin başında küçük bir onay işareti, Pano kartında kısa bir "kaydedildi" gösterir.
//
// Tanınan alanlar (hepsi isteğe bağlı; ilk bulunan geçer):
//   görev:    gorev {id, kod, atananId, projeId} · gorevId · gorevKodu · kod
//   kaydeden: ajanId · kaydedenId · ajan {id} · gorev.atananId
//   proje:    projeId · gorev.projeId
//   özet:     mesaj · ozet · kayit {mesaj, ozet} · commit {mesaj, message}
//   kimlik:   kimlik · kisaKimlik · hash · kayit {kimlik, hash} · commit {kimlik, hash, sha} (40 haneli sha kısaltılır)

export const GOREV_KAYDI_OLAYI = "gorev.kaydedildi";

export interface GorevKaydi {
  projeId: string | null;
  gorevId: string | null;
  kod: string | null;
  /** Kaydeden çalışan; olayda yoksa görevin atananı */
  ajanId: string | null;
  /** Kaydın iletisi (commit mesajı gibi), tek satır */
  ozet: string | null;
  /** Kaydın kısa kimliği */
  kimlik: string | null;
}

type Nesne = Record<string, unknown>;

const nesne = (v: unknown): Nesne | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Nesne) : null);
const dize = (...adaylar: unknown[]): string | null => {
  for (const v of adaylar) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};

/** Olay bir görev kaydıysa okunur; değilse null */
export function gorevKaydiOku(olay: unknown): GorevKaydi | null {
  const o = nesne(olay);
  if (!o || o.tur !== GOREV_KAYDI_OLAYI) return null;
  const g = nesne(o.gorev);
  const k = nesne(o.kayit) ?? nesne(o.commit);
  const gorevId = dize(o.gorevId, g?.id, k?.gorevId);
  const kod = dize(o.gorevKodu, o.kod, g?.kod, k?.gorevKodu);
  if (!gorevId && !kod) return null;
  const ozet = dize(o.mesaj, o.ozet, k?.mesaj, k?.ozet, k?.message);
  const kimlik = dize(o.kimlik, o.kisaKimlik, o.hash, k?.kimlik, k?.kisaKimlik, k?.hash, k?.sha);
  return {
    projeId: dize(o.projeId, g?.projeId),
    gorevId,
    kod,
    ajanId: dize(o.ajanId, o.kaydedenId, nesne(o.ajan)?.id, g?.atananId),
    ozet: ozet ? (ozet.split(/\r?\n/)[0] ?? "").trim() || null : null,
    kimlik: kimlik ? (/^[0-9a-f]{12,}$/i.test(kimlik) ? kimlik.slice(0, 7) : kimlik) : null,
  };
}
