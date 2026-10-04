// Sahte çekirdeğin 0.0.4 "tavan" uçları: Ayarlar › Çalışma düzeni (esZamanliAjan, acilistaSurdur, gorevTokenTavani),
// eşzamanlı tavan yüzünden sırada bekleyen ajan ("Sırada: …" iş açıklaması), görev token tavanı onayı ve kararı,
// Mesaiyi durdur (POST /api/projeler/:pid/durdur). Örnekler betiklerin dokunmadığı ajanlarla kurulur: Burak T-23'te
// token tavanını aşıp durmuş, Zeynep sırada bekliyor; aynı anda en çok 4 ajan (Ada, Kerem, Deniz, Ece) çalışıyor.

import { ceviri, DIL } from "./dil.mjs";

const PROJE = "siparis-paneli";
const SIRADA = /^(Sırada|Queued): /;
const MILYON = 1_000_000;

/** 2_140_000 → "2,1 M" (İngilizce "2.1M"); çekirdeğin onay başlığıyla aynı biçim */
function kisaToken(n) {
  const tr = DIL === "tr";
  const yerel = tr ? "tr-TR" : "en-US";
  if (n >= MILYON) return `${(n / MILYON).toLocaleString(yerel, { maximumFractionDigits: 1 })}${tr ? " M" : "M"}`;
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString(yerel)}${tr ? " bin" : "k"}`;
  return String(Math.round(n));
}

export function kur(c) {
  const { rota, db, yay, ajanBul, akisEkle, projeYay, onaySonucuDinle, Hata } = c;
  const ajanYay = (a) => yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);
  const siraMetni = () => ceviri(`Sırada: aynı anda en çok ${db.ayarlar.esZamanliAjan} ajan çalışır`, `Queued: at most ${db.ayarlar.esZamanliAjan} agents work at the same time`);

  // -------------------------------------------------------------------------
  // Ayarlar: GET/PUT /api/ayarlar bu alanları db.ayarlar'dan okur ve yazar
  // -------------------------------------------------------------------------
  Object.assign(db.ayarlar, { esZamanliAjan: 4, acilistaSurdur: true, gorevTokenTavani: 2 * MILYON });

  // -------------------------------------------------------------------------
  // Görev token tavanı: Burak T-23'te 2,1 M token işledi (tavan 2 M), durdu ve kurulun kararını bekliyor
  // -------------------------------------------------------------------------
  const burak = ajanBul("burak");
  const gorev = db.gorevler.find((g) => g.id === "g23");
  if (burak && gorev) {
    Object.assign(gorev, { atananId: burak.id, durum: "calisiliyor", guncelleme: new Date(Date.now() - 18 * 60_000).toISOString() });
    Object.assign(burak, { gorevId: gorev.id, durum: "duraklatildi", isAciklamasi: ceviri("Görev token tavanı aşıldı", "Task token ceiling exceeded") });
    const toplam = 2_140_000;
    const tavan = 2 * MILYON;
    const yeniTavan = 4 * MILYON;
    const oran = `${kisaToken(toplam)} / ${kisaToken(tavan)}`;
    db.onaylar.unshift({
      id: "o-tavan-1",
      projeId: PROJE,
      ajanId: burak.id,
      tur: "genel",
      baslik: ceviri(`${gorev.kod} görevi token tavanını aştı (${oran}). Sürsün mü?`, `${gorev.kod} went over its token ceiling (${oran}). Keep going?`),
      ayrinti: ceviri(
        `${burak.ad}, ${gorev.kod} "${gorev.baslik}" görevinde ${kisaToken(toplam)} token işledi; görevin tavanı ${kisaToken(tavan)}. Ajan durdu ve kararınızı bekliyor. Onaylarsanız tavan ${kisaToken(yeniTavan)} olur ve ${burak.ad} kaldığı yerden sürer. Reddederseniz ${burak.ad} durur; Kerem görevi bölmesi ya da yeniden planlaması için uyarılır.`,
        `${burak.ad} has processed ${kisaToken(toplam)} tokens on ${gorev.kod} "${gorev.baslik}"; the task's ceiling is ${kisaToken(tavan)}. The agent has stopped and is waiting for your decision. If you approve, the ceiling becomes ${kisaToken(yeniTavan)} and ${burak.ad} picks up where they left off. If you reject, ${burak.ad} stays stopped and Kerem is asked to split or re-plan the task.`,
      ),
      veri: { altTur: "gorev_token_tavani", ajanId: burak.id, gorevId: gorev.id, gorevKodu: gorev.kod, toplam, tavan, yeniTavan },
      durum: "bekliyor",
      olusturma: new Date(Date.now() - 4 * 60_000).toISOString(),
      sonGecerlilik: null,
      sonuclanma: null,
      not: null,
    });
    akisEkle(burak.id, { tur: "sistem", metin: ceviri(`${gorev.kod} görevinin token tavanı aşıldı (${oran}); tur kesildi, kurulun kararı bekleniyor.`, `${gorev.kod} went over its token ceiling (${oran}); the turn was cut and the board's decision is pending.`) });
  }

  // Kurulun kararı: onayda tavan bir kat artar ve Burak sürer; redde Burak durur, yöneticisi Kerem uyarılır
  onaySonucuDinle((o) => {
    if (o.tur !== "genel" || o.veri?.altTur !== "gorev_token_tavani") return;
    const a = ajanBul(o.veri.ajanId);
    const g = db.gorevler.find((x) => x.id === o.veri.gorevId);
    if (!a || !g) return;
    if (o.durum === "onaylandi") {
      akisEkle(a.id, { tur: "kullanici", arac: "ArnOrg", metin: ceviri(`[ArnOrg] Kurul ${g.kod} görevinin token tavanını ${kisaToken(o.veri.yeniTavan)} yaptı. Kaldığın yerden devam et.`, `[ArnOrg] The board raised the token ceiling of ${g.kod} to ${kisaToken(o.veri.yeniTavan)}. Continue where you left off.`) });
      Object.assign(a, { durum: "calisiyor", isAciklamasi: `${g.kod} ${g.baslik}` });
    } else {
      Object.assign(a, { durum: "duraklatildi", isAciklamasi: ceviri("Görev token tavanı aşıldı; kurul sürdürmedi", "Task token ceiling exceeded; the board stopped it") });
      const yonetici = ajanBul(a.yoneticiId) ?? ajanBul("ada");
      if (yonetici) {
        akisEkle(yonetici.id, {
          tur: "kullanici",
          arac: "ArnOrg",
          metin: ceviri(
            `[ArnOrg] ${a.ad}, ${g.kod} "${g.baslik}" görevinde token tavanını aştı; kurul sürdürmeyi onaylamadı ve ${a.ad} durdu. Görevi daha küçük görevlere böl ya da yeniden planla.`,
            `[ArnOrg] ${a.ad} went over the token ceiling on ${g.kod} "${g.baslik}"; the board did not approve going on and ${a.ad} has stopped. Split the task into smaller ones or re-plan it.`,
          ),
        });
      }
    }
    ajanYay(a);
    projeYay(a.projeId);
  });

  // -------------------------------------------------------------------------
  // Eşzamanlı tavan: Zeynep sırada bekliyor (Ada, Kerem, Deniz ve Ece çalışıyor; tavan 4)
  // -------------------------------------------------------------------------
  const zeynep = ajanBul("zeynep");
  if (zeynep) Object.assign(zeynep, { durum: "kapali", isAciklamasi: siraMetni() });

  // Mesaiyi durdur: sıradaki işler düşer (oturumları ajan başına durdur kapatır)
  rota("POST", "/api/projeler/:pid/durdur", ({ p }) => {
    if (!db.projeler.some((x) => x.id === p.pid)) throw new Hata(404, ceviri("Proje bulunamadı.", "Project not found."));
    for (const a of db.ajanlar) {
      if (a.projeId !== p.pid || !SIRADA.test(a.isAciklamasi ?? "")) continue;
      a.isAciklamasi = "";
      ajanYay(a);
    }
    projeYay(p.pid);
    return { tamam: true };
  });
}
