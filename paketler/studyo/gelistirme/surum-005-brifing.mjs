// Sahte çekirdeğin 0.0.5 "brifing" davranışları: CEO brifingi (POST /api/projeler/:pid/brifing), günlük brifing
// ayarı (Ayarlar.gunlukBrifing) ve Claude Code'un model kataloğu (GET /api/modeller) sürümlü adlarıyla.
//
//   kur(c): sahte-sunucu.mjs'teki rota, db ve yardımcılarla çağrılır (surum-004-*.mjs deseni)
//
// Brifing isteğinde önce CEO'nun "yazıyor" olayı gider, birkaç saniye sonra #yonetim'e CEO'dan o anki panodan
// derlenmiş örnek bir brifing düşer. CEO yanıt verene dek (en çok 5 dk) ikinci istek "hazirlaniyor" alır.
// CEO'nun varsayılan modeli Fable olduğundan rol kataloğu, Ada ve yeni projelerin CEO'su Fable'la görünür.

import { ceviri } from "./dil.mjs";
import { V } from "./tohum.mjs";

/** Çekirdekteki HAZIRLANIYOR_MS ile aynı */
const HAZIRLANIYOR_MS = 5 * 60_000;
/** CEO'nun brifingi yazma süresi (sahne) */
const YAZMA_MS = 3500;
const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Claude Code'un supportedModels() listesinden ayrıştırılmış katalog ("default" satırı çıkarılmış; çekirdekteki biçim) */
const MODELLER = [
  { deger: "sonnet", ad: "Sonnet 5.5", kimlik: "claude-sonnet-5-5", aciklama: "Efficient for routine tasks" },
  { deger: "fable", ad: "Fable 5.1", kimlik: "claude-fable-5-1", aciklama: "Most capable for your hardest and longest-running tasks" },
  { deger: "opus", ad: "Opus 5.5", kimlik: "claude-opus-5-5", aciklama: "Best for everyday, complex tasks" },
  { deger: "haiku", ad: "Haiku 4.5", kimlik: "claude-haiku-4-5-20251001", aciklama: "Fastest for quick answers" },
];

const ONAY_TURLERI = ceviri(
  { arac: "Araç çağrısı", ise_alim: "İşe alım", birlestirme: "Birleştirme", genel: "Karar", anayasa: "Ana yasa", isten_cikarma: "İşten çıkarma", teslim: "Teslim" },
  { arac: "Tool call", ise_alim: "Hiring", birlestirme: "Merge", genel: "Decision", anayasa: "Constitution", isten_cikarma: "Dismissal", teslim: "Delivery" },
);

export function kur(c) {
  const { rota, rotalar, db, yay, yayDinle, mesajEkle, akisEkle, ajanBul, projeAjanlari, projeGerekli, Hata, simdi, yeniKimlik } = c;
  const ceo = (pid) => projeAjanlari(pid).find((a) => a.rol === "ceo");

  // -------------------------------------------------------------------------
  // Model kataloğu ve CEO'nun Fable'ı
  // -------------------------------------------------------------------------

  const guncelleme = simdi();
  rota("GET", "/api/modeller", () => ({ modeller: MODELLER, kaynak: "claude", guncelleme }));

  const ceoRolu = V.roller.find((r) => r.kimlik === "ceo");
  if (ceoRolu) ceoRolu.varsayilanModel = "fable";
  const ada = ajanBul("ada");
  if (ada) ada.model = "fable";
  // Yeni açılan projenin CEO'su da Fable'la başlar (çekirdekte rolün varsayılanı; katalogda yoksa Opus)
  yayDinle((olay) => {
    if (olay.tur !== "proje.guncellendi") return;
    const a = ceo(olay.proje.id);
    if (a && a.model === "opus" && Date.now() - Date.parse(a.olusturma) < 10_000) a.model = "fable";
  });

  // -------------------------------------------------------------------------
  // Günlük brifing ayarı: GET/PUT /api/ayarlar db.ayarlar'dan okur ve yazar; saat SS:DD olmalı
  // -------------------------------------------------------------------------

  db.ayarlar.gunlukBrifing ??= { acik: true, saat: "09:00" };
  const ayarRotasi = rotalar.find((r) => r.yontem === "PUT" && r.desen.test("/api/ayarlar"));
  if (ayarRotasi) {
    const asil = ayarRotasi.isleyici;
    ayarRotasi.isleyici = (i) => {
      const g = i.govde?.gunlukBrifing;
      if (g !== undefined && (typeof g?.acik !== "boolean" || !SAAT.test(g?.saat ?? ""))) {
        throw new Hata(400, ceviri("Geçersiz istek: gunlukBrifing.saat — Saat SS:DD biçiminde olmalı.", "Invalid request: gunlukBrifing.saat — The time must be in HH:MM format."));
      }
      return asil(i);
    };
  }

  // -------------------------------------------------------------------------
  // Brifing: panodan derlenen örnek; CEO dört bölümle yazar
  // -------------------------------------------------------------------------

  function brifingMetni(pid, giris) {
    const ad = (id) => ajanBul(id)?.ad ?? null;
    const gorevler = db.gorevler.filter((g) => g.projeId === pid);
    const kod = (id) => gorevler.find((g) => g.id === id)?.kod ?? "?";
    const biten = gorevler.filter((g) => g.durum === "tamam").slice(-2);
    const incelemede = gorevler.filter((g) => g.durum === "inceleme");
    const suren = gorevler.filter((g) => g.durum === "calisiliyor");
    const siradaki = gorevler.filter((g) => g.durum === "planlandi" || g.durum === "bekleyen").slice(0, 3);
    const onaylar = db.onaylar.filter((o) => o.projeId === pid && o.durum === "bekliyor").slice(0, 3);

    const yapilan = [
      ...biten.map((g) => ceviri(`- ${g.kod} ${g.baslik} tamamlandı${ad(g.atananId) ? ` (${ad(g.atananId)})` : ""}`, `- ${g.kod} ${g.baslik} is done${ad(g.atananId) ? ` (${ad(g.atananId)})` : ""}`)),
      ...incelemede.slice(0, 2).map((g) => ceviri(`- ${g.kod} ${g.baslik} incelemeye geçti${ad(g.atananId) ? ` (${ad(g.atananId)})` : ""}`, `- ${g.kod} ${g.baslik} moved to review${ad(g.atananId) ? ` (${ad(g.atananId)})` : ""}`)),
    ].slice(0, 4);
    const suan = suren.slice(0, 3).map((g) => {
      const kim = ad(g.atananId);
      const a = ajanBul(g.atananId);
      const durum = a?.durum === "duraklatildi" ? ceviri("; kararınızı bekliyor", "; waiting for your decision") : "";
      return ceviri(`- ${g.kod} ${g.baslik}${kim ? `: ${kim} çalışıyor` : ""}${durum}`, `- ${g.kod} ${g.baslik}${kim ? `: ${kim} is on it` : ""}${durum}`);
    });
    const sonra = siradaki.map((g) => {
      const bekledigi = g.bagimliliklar.filter((b) => gorevler.find((x) => x.id === b)?.durum !== "tamam").map(kod);
      const kim = ad(g.atananId);
      return ceviri(
        `- ${g.kod} ${g.baslik}${kim ? ` (${kim})` : ", henüz atanmadı"}${bekledigi.length ? `; ${bekledigi.join(", ")} bitince başlar` : ""}`,
        `- ${g.kod} ${g.baslik}${kim ? ` (${kim})` : ", not assigned yet"}${bekledigi.length ? `; starts once ${bekledigi.join(", ")} is done` : ""}`,
      );
    });
    // Başlık türle başlıyorsa ("Teslim: …") tür yeniden yazılmaz
    const onayMaddesi = (o) => {
      const tur = ONAY_TURLERI[o.tur] ?? o.tur;
      return o.baslik.startsWith(`${tur}:`) ? `- ${o.baslik}` : `- ${tur}: ${o.baslik}`;
    };
    const karar = onaylar.length
      ? onaylar.map(onayMaddesi)
      : [ceviri("- Şu an kararınızı bekleyen bir şey yok.", "- Nothing is waiting for your decision right now.")];
    const yok = ceviri("- Bu aralıkta yok.", "- Nothing in this period.");
    return [
      ...(giris ? [giris, ""] : []),
      ceviri("**Yaptıklarımız**", "**What we did**"),
      ...(yapilan.length ? yapilan : [yok]),
      "",
      ceviri("**Şu an**", "**Right now**"),
      ...(suan.length ? suan : [yok]),
      "",
      ceviri("**Sıradaki**", "**Up next**"),
      ...(sonra.length ? sonra : [yok]),
      "",
      ceviri("**Kararınızı bekleyen**", "**Awaiting your decision**"),
      ...karar,
    ].join("\n");
  }

  // Sabahki günlük brifing: Karargâh sohbeti brifingin nasıl göründüğünü ilk açılışta gösterir
  if (ada) {
    db.mesajlar.push({
      id: yeniKimlik("m"),
      projeId: ada.projeId,
      kanal: "yonetim",
      gonderenId: ada.id,
      gonderenAd: ada.ad,
      metin: brifingMetni(ada.projeId, ceviri("Günlük brifing.", "Daily briefing.")),
      anilanlar: [],
      zaman: new Date(Date.now() - 150 * 60_000).toISOString(),
    });
  }

  /** Proje → brifing isteğinin anı; CEO yazınca silinir */
  const bekleyenler = new Map();

  rota("POST", "/api/projeler/:pid/brifing", ({ p }) => {
    const pr = projeGerekli(p.pid);
    const a = ceo(pr.id);
    if (!a) throw new Hata(409, ceviri("Bu projede CEO yok; brifing için önce bir CEO işe alın.", "This project has no CEO; hire a CEO before asking for a briefing."));
    const onceki = bekleyenler.get(pr.id);
    if (onceki && Date.now() - onceki < HAZIRLANIYOR_MS) return { durum: "hazirlaniyor" };
    bekleyenler.set(pr.id, Date.now());
    akisEkle(a.id, {
      tur: "kullanici",
      metin: ceviri(
        "Kurul brifing istiyor. Aşağıdaki veriye ve kendi bildiklerine dayanarak kısa bir brifing yaz ve #yonetim kanalına mesaj_gonder ile gönder.",
        "The board is asking for a briefing. Using the data below and what you know yourself, write a short briefing and send it to #ceo with mesaj_gonder.",
      ),
    });
    yay({ tur: "kanal.yaziyor", projeId: pr.id, kanal: "yonetim", ajanId: a.id, ad: a.ad, yaziyor: true }, pr.id);
    setTimeout(() => {
      bekleyenler.delete(pr.id);
      yay({ tur: "kanal.yaziyor", projeId: pr.id, kanal: "yonetim", ajanId: a.id, ad: a.ad, yaziyor: false }, pr.id);
      const metin = brifingMetni(pr.id, null);
      mesajEkle(pr.id, "yonetim", a.id, metin);
      akisEkle(a.id, { tur: "asistan", metin });
    }, YAZMA_MS);
    return { durum: "istendi" };
  });
}
