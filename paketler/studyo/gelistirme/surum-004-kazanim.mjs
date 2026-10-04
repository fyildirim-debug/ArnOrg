// Sahte çekirdeğin 0.0.4 "hızlı kazanım" davranışları: denetim kaydında alt ajan kimliği, denetim saklama süresi
// ayarı ve denetim kaydının JSONL dışa aktarımı.
//
//   kur(c): sahte-sunucu.mjs'teki rota, db ve yardımcılarla çağrılır (surum-002.mjs deseni)
//
// Sahte sunucunun ham yanıt yolu yalnız gövdeyi gönderir (Content-Disposition yok); Stüdyo bu durumda dosya adını
// kendisi verir. Gerçek çekirdek adı başlıkta gönderir.

import { ceviri } from "./dil.mjs";

export function kur(c) {
  const { rota, db, Hata, projeGerekli } = c;

  // -------------------------------------------------------------------------
  // Denetim kaydında alt ajan: Agent aracıyla açılan alt ajanın çağrıları kimliğiyle işaretlenir
  // -------------------------------------------------------------------------

  const ALT_AJANLAR = { d8: "a3f9c2e81b7d4c05", d13: "b71e04d9c2a85f36", d16: "a3f9c2e81b7d4c05" };
  for (const k of db.denetim) k.altAjan = ALT_AJANLAR[k.id] ?? k.altAjan ?? null;

  // -------------------------------------------------------------------------
  // Denetim saklama süresi (gün; 0 süresiz) ve JSONL dışa aktarım
  // -------------------------------------------------------------------------

  db.ayarlar.denetimSaklamaGun ??= 90;

  const KARARLAR = ["izin", "ret", "sor", "degisti"];
  /** Çekirdekteki suzgeceUyar ile aynı: karar, ajan ve araç/girdi/kural/nedende Türkçe harf duyarsız arama */
  const uyar = (k, { karar, ajan, q }) =>
    (!karar || k.karar === karar) &&
    (!ajan || k.ajanId === ajan) &&
    (!q || `${k.arac} ${k.girdiOzeti} ${k.kural ?? ""} ${k.neden ?? ""}`.toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR")));

  rota("GET", "/api/projeler/:pid/denetim/disa-aktar", ({ p, q }) => {
    projeGerekli(p.pid);
    const karar = q.get("karar") || null;
    if (karar && !KARARLAR.includes(karar)) throw new Hata(400, ceviri("Geçersiz karar.", "Invalid decision."));
    const suzgec = { karar, ajan: q.get("ajan") || null, q: q.get("q") || null };
    const kayitlar = db.denetim
      .filter((k) => k.projeId === p.pid && uyar(k, suzgec))
      .sort((a, b) => a.zaman.localeCompare(b.zaman))
      .map((k) => ({ altAjan: null, ...k }));
    return { __ham: Buffer.from(kayitlar.map((k) => `${JSON.stringify(k)}\n`).join(""), "utf8") };
  });
}
