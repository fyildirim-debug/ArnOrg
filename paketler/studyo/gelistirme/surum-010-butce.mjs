// Sahte çekirdeğin 0.0.10 davranışları: kullanım seviyesi ve proje token bütçesi (çekirdekte butce.ts, sirket.ts).
//
//   - Proje özeti: butce (toplam, günlük), seviye, otomatikKademe, toplamToken ve butceDurumu (doluluk, %80 uyarı,
//     doldu, son bir saatin hızıyla tahmini bitiş, kademe düşürmeden sonra geçerli seviye).
//   - Sipariş Paneli: toplam 25 M, günlük 3 M bütçe, Normal seviye. Görevlerde token (T-21 yükseltilmiş 4 M tavanla),
//     Mert'in modeli elle seçilmiş (sabit), ötekiler seviyeye bağlı. Arnex Web Sitesi'nde bütçe yok.
//   - PATCH /api/projeler/:pid bütçe, seviye ve otomatik kademeyi yazar, #genel'e duyurur, seviyeye bağlı çalışanların
//     modelini değiştirir; POST /api/projeler açılışta seçilen bütçe ve seviyeyi kaydeder; işe alımda model verilmezse
//     seviyenin modeli; POST /api/ajanlar/:aid/model { model: null } çalışanı seviyeye bağlar.
//   - Kullanım ucu: butce ve en pahalı görevler. Kullanım olayına (sahnedeki işler) görevin yeni toplamı eklenir.
//
//   kur(c): sahte-sunucu.mjs'teki rota, rotalar, db ve yardımcılarla çağrılır; dönen ozet(p) proje özetine katılır
//
// Ortam:
//   ARNORG_BUTCE=uyari   Sipariş Paneli'nin bütçesi 11 M: %80'i geçmiş, seviye Normal → Tasarruflu inmiş
//   ARNORG_BUTCE=doldu   bütçe 9 M: dolmuş, ekip durmuş; kurul bildirimi "Bütçeyi artır"
// Geliştirme ucu (yalnız sahte çekirdek):
//   POST /api/gelistirme/butce-bildirimi   bütçe durumunun kurul bildirimini hemen yollar (ekran görüntüsü için)

import { ceviri } from "./dil.mjs";

const OFIS = "siparis-paneli";
const SAAT = 3_600_000;
/** Sahnenin harcama hızı (son bir saat): bitiş tahmini bu hızla */
const HIZ = 640_000 / SAAT;

const SEVIYELER = ["zeki", "normal", "tasarruflu"];
const MODELLER = {
  zeki: { yonetim: "fable", gelistirme: "opus", destek: "sonnet" },
  normal: { yonetim: "opus", gelistirme: "sonnet", destek: "haiku" },
  tasarruflu: { yonetim: "sonnet", gelistirme: "haiku", destek: "haiku" },
};
const KADEME = { ceo: "yonetim", cto: "yonetim", inceleme: "yonetim", test: "destek", yazar: "destek", tanitim: "destek" };
const seviyeModeli = (seviye, rol) => MODELLER[seviye][KADEME[rol] ?? "gelistirme"];
const altSeviye = (s) => (s === "zeki" ? "normal" : "tasarruflu");
const seviyeAdi = (s) => (s === "zeki" ? ceviri("Zeki", "Smart") : s === "normal" ? "Normal" : ceviri("Tasarruflu", "Economy"));
const kisa = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString(ceviri("tr-TR", "en-US"), { maximumFractionDigits: 1 })}${ceviri(" M", "M")}` : `${Math.round(n / 1000)}${ceviri(" bin", "k")}`);

/** Görevlerde işlenen token (tohum) ve kurulun yükselttiği tavan */
const GOREV_TOKENLARI = { g21: 2_310_000, g24: 1_420_000, g19: 1_180_000, g26: 860_000, g22: 740_000, g16: 520_000, g15: 410_000, g18: 380_000, g17: 260_000 };
const YUKSELTILMIS = { g21: 4_000_000 };

export function kur(c) {
  const { rota, rotalar, db, yay, yayDinle, projeGerekli, projeAjanlari, mesajEkle, Hata } = c;
  const sahne = process.env.ARNORG_BUTCE;

  // Tohum: projelerin bütçesi ve seviyesi; çalışanların model sabitliği; görev tokenları
  for (const p of db.projeler) {
    p.seviye ??= "normal";
    p.otomatikKademe ??= true;
    p.butce ??= p.id === OFIS ? { toplam: sahne === "uyari" ? 11_000_000 : sahne === "doldu" ? 9_000_000 : 25_000_000, gunluk: sahne ? null : 3_000_000 } : { toplam: null, gunluk: null };
  }
  for (const a of db.ajanlar) a.modelSabit ??= a.id === "mert";
  for (const g of db.gorevler) g.token ??= GOREV_TOKENLARI[g.id] ?? 0;

  const toplamToken = (pid) => projeAjanlari(pid).reduce((t, a) => t + a.toplamToken, 0);
  const bugunToken = (pid) => projeAjanlari(pid).reduce((t, a) => t + a.bugunToken, 0);
  const temelTavan = () => db.ayarlar.gorevTokenTavani ?? 2_000_000;
  const katsayi = { zeki: 2, normal: 1, tasarruflu: 0.5 };

  function kalem(sinir, harcanan) {
    return sinir ? { sinir, harcanan, yuzde: Math.round((harcanan / sinir) * 1000) / 10 } : null;
  }

  function durum(p) {
    const toplam = kalem(p.butce?.toplam, toplamToken(p.id));
    const gunluk = kalem(p.butce?.gunluk, bugunToken(p.id));
    let d = "normal";
    let neden = null;
    let enYuksek = -1;
    for (const [ad, k] of [["toplam", toplam], ["gunluk", gunluk]]) {
      if (!k) continue;
      const x = k.harcanan >= k.sinir ? "doldu" : k.yuzde >= 80 ? "uyari" : "normal";
      const sira = { normal: 0, uyari: 1, doldu: 2 };
      if (x !== "normal" && (sira[x] > sira[d] || (sira[x] === sira[d] && k.yuzde > enYuksek))) {
        d = x;
        neden = ad;
        enYuksek = k.yuzde;
      }
    }
    const kademe = p.otomatikKademe && d !== "normal" && altSeviye(p.seviye) !== p.seviye;
    const etkin = kademe ? altSeviye(p.seviye) : p.seviye;
    let tahminiBitis = null;
    if (d !== "doldu") {
      const kalanlar = [];
      if (toplam) kalanlar.push((toplam.sinir - toplam.harcanan) / HIZ);
      if (gunluk) {
        const gece = new Date();
        gece.setHours(24, 0, 0, 0);
        const ms = (gunluk.sinir - gunluk.harcanan) / HIZ;
        if (ms < gece.getTime() - Date.now()) kalanlar.push(ms);
      }
      if (kalanlar.length) tahminiBitis = new Date(Date.now() + Math.min(...kalanlar)).toISOString();
    }
    return { toplam, gunluk, durum: d, neden, tahminiBitis, seviye: p.seviye, etkinSeviye: etkin, kademe: kademe ? { neden: "butce", pencere: null } : null };
  }

  /** Geçerli seviyeyi seviyeye bağlı çalışanlara uygular; değişenler yayınlanır */
  function seviyeUygula(pid) {
    const p = projeGerekli(pid);
    const etkin = durum(p).etkinSeviye;
    for (const a of projeAjanlari(pid)) {
      if (a.modelSabit) continue;
      const model = seviyeModeli(etkin, a.rol);
      if (a.model === model) continue;
      a.model = model;
      yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);
    }
  }
  for (const p of db.projeler) seviyeUygula(p.id);

  function harcamalar(pid, sinir = 10) {
    const p = projeGerekli(pid);
    const temel = Math.round(temelTavan() * katsayi[durum(p).etkinSeviye]);
    return db.gorevler
      .filter((g) => g.projeId === pid && g.token > 0)
      .sort((a, b) => b.token - a.token || a.no - b.no)
      .slice(0, sinir)
      .map((g) => ({
        gorevId: g.id,
        kod: g.kod,
        baslik: g.baslik,
        durum: g.durum,
        atananId: g.atananId,
        atananAd: g.atananId ? (db.ajanlar.find((a) => a.id === g.atananId)?.ad ?? null) : null,
        token: g.token,
        tavan: Math.max(YUKSELTILMIS[g.id] ?? 0, temel),
      }));
  }

  // ---- uçlar ----

  const yama = rotalar.find((r) => r.yontem === "PATCH" && r.desen.test("/api/projeler/x"));
  const asilYama = yama.isleyici;
  yama.isleyici = async (i) => {
    const p = projeGerekli(i.p.pid);
    const g = i.govde ?? {};
    const onceki = { butce: { ...p.butce }, seviye: p.seviye, otomatikKademe: p.otomatikKademe, durum: durum(p) };
    if (g.butce) p.butce = { toplam: g.butce.toplam || null, gunluk: g.butce.gunluk || null };
    if (SEVIYELER.includes(g.seviye)) p.seviye = g.seviye;
    if (typeof g.otomatikKademe === "boolean") p.otomatikKademe = g.otomatikKademe;
    const sonuc = await asilYama(i);
    const butceMetni = (b) => [b.toplam ? ceviri(`toplam ${kisa(b.toplam)}`, `${kisa(b.toplam)} in total`) : null, b.gunluk ? ceviri(`günde ${kisa(b.gunluk)}`, `${kisa(b.gunluk)} a day`) : null].filter(Boolean).join(", ") || ceviri("sınırsız", "unlimited");
    if (g.butce && (onceki.butce.toplam !== p.butce.toplam || onceki.butce.gunluk !== p.butce.gunluk)) {
      mesajEkle(p.id, "genel", "arnorg", ceviri(`Kurul token bütçesini ${butceMetni(p.butce)} yaptı.`, `The board set the token budget to ${butceMetni(p.butce)}.`));
      if (onceki.durum.durum === "doldu" && durum(p).durum !== "doldu") {
        mesajEkle(p.id, "genel", "arnorg", ceviri("Kurul token bütçesini artırdı; ekip kaldığı yerden sürüyor.", "The board raised the token budget; the team is picking up where it left off."));
      }
    }
    if (onceki.seviye !== p.seviye) mesajEkle(p.id, "genel", "arnorg", ceviri(`Kurul kullanım seviyesini ${seviyeAdi(p.seviye)} yaptı.`, `The board set the usage level to ${seviyeAdi(p.seviye)}.`));
    if (onceki.otomatikKademe !== p.otomatikKademe) {
      mesajEkle(p.id, "genel", "arnorg", p.otomatikKademe ? ceviri("Kurul otomatik kademe düşürmeyi açtı.", "The board turned on automatic step-down.") : ceviri("Kurul otomatik kademe düşürmeyi kapattı.", "The board turned off automatic step-down."));
    }
    seviyeUygula(p.id);
    c.projeYay(p.id);
    return { ...sonuc, ...ozet(p) };
  };

  const projeAc = rotalar.find((r) => r.yontem === "POST" && r.desen.test("/api/projeler"));
  const asilProjeAc = projeAc.isleyici;
  projeAc.isleyici = async (i) => {
    const sonuc = await asilProjeAc(i);
    const p = db.projeler.find((x) => x.id === sonuc.id);
    if (!p) return sonuc;
    const g = i.govde ?? {};
    p.butce = { toplam: g.butce?.toplam || null, gunluk: g.butce?.gunluk || null };
    p.seviye = SEVIYELER.includes(g.seviye) ? g.seviye : "normal";
    p.otomatikKademe = g.otomatikKademe !== false;
    for (const a of projeAjanlari(p.id)) a.modelSabit ??= false;
    seviyeUygula(p.id);
    return { ...sonuc, ...ozet(p) };
  };

  const iseAl = rotalar.find((r) => r.yontem === "POST" && r.desen.test("/api/projeler/x/ajanlar"));
  const asilIseAl = iseAl.isleyici;
  iseAl.isleyici = async (i) => {
    const a = await asilIseAl(i);
    a.modelSabit = Boolean(i.govde?.model);
    if (!a.modelSabit) a.model = seviyeModeli(durum(projeGerekli(a.projeId)).etkinSeviye, a.rol);
    yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);
    return a;
  };

  const modelUcu = rotalar.find((r) => r.yontem === "POST" && r.desen.test("/api/ajanlar/x/model"));
  const asilModel = modelUcu.isleyici;
  modelUcu.isleyici = async (i) => {
    if (i.govde?.model !== null) {
      const a = await asilModel(i);
      a.modelSabit = true;
      yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);
      return a;
    }
    const a = db.ajanlar.find((x) => x.id === i.p.aid);
    if (!a) throw new Hata(404, ceviri("Ajan bulunamadı.", "Agent not found."));
    a.modelSabit = false;
    a.model = seviyeModeli(durum(projeGerekli(a.projeId)).etkinSeviye, a.rol);
    yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);
    return a;
  };

  const kullanimUcu = rotalar.find((r) => r.yontem === "GET" && r.desen.test("/api/projeler/x/kullanim"));
  const asilKullanim = kullanimUcu.isleyici;
  kullanimUcu.isleyici = async (i) => {
    const k = await asilKullanim(i);
    return { ...k, butce: durum(projeGerekli(i.p.pid)), gorevler: harcamalar(i.p.pid) };
  };

  // Sahnedeki işlerin kullanımı çalışanın süren görevine yazılır; Stüdyo görevin yeni toplamını olayla alır
  const yayinlar = new Map();
  /** Ajan → son görülen toplam token (olaydaki artışı bulmak için) */
  const sonToplamlar = new Map(db.ajanlar.map((a) => [a.id, a.toplamToken]));
  yayDinle?.((o) => {
    if (o.tur !== "kullanim" || o.gorev) return;
    const a = db.ajanlar.find((x) => x.id === o.ajanId);
    const fark = Math.max(0, o.toplamToken - (sonToplamlar.get(o.ajanId) ?? 0));
    sonToplamlar.set(o.ajanId, o.toplamToken);
    const g = a?.gorevId ? db.gorevler.find((x) => x.id === a.gorevId && x.durum === "calisiliyor") : null;
    if (!g || !fark) return;
    g.token = (g.token ?? 0) + fark;
    yay({ ...o, gorev: { id: g.id, token: g.token } }, o.projeId);
    if (!yayinlar.has(o.projeId)) {
      yayinlar.set(
        o.projeId,
        setTimeout(() => {
          yayinlar.delete(o.projeId);
          c.projeYay(o.projeId);
        }, 1500),
      );
    }
  });

  rota("POST", "/api/gelistirme/butce-bildirimi", () => {
    const p = projeGerekli(OFIS);
    const d = durum(p);
    const k = d.neden === "gunluk" ? d.gunluk : d.toplam;
    const oran = k ? `${kisa(k.harcanan)} / ${kisa(k.sinir)}` : "";
    const doldu = d.durum === "doldu";
    const yuzde = k ? ceviri(`%${Math.floor(k.yuzde)}`, `${Math.floor(k.yuzde)}%`) : "";
    yay(
      {
        tur: "kurul.bildirimi",
        projeId: OFIS,
        bildirim: {
          id: `butce-${Date.now()}`,
          projeId: OFIS,
          ajanId: null,
          ajanAd: "ArnOrg",
          tur: "uyari",
          baslik: doldu ? ceviri("Proje bütçesi doldu", "The project budget is used up") : ceviri(`Bütçenin ${yuzde}'i harcandı`, `${yuzde} of the budget is used`),
          metin: doldu
            ? ceviri(`Proje token bütçesi doldu (${oran}). Ekip durdu; kurul bütçeyi artırınca kaldığı yerden sürecek.`, `The project's token budget is used up (${oran}). The team has stopped; it will pick up where it left off when the board raises the budget.`)
            : ceviri(`Proje token bütçesinin ${yuzde}'i harcandı (${oran}). Bütçe dolarsa ekip durur.`, `${yuzde} of the project's token budget is used (${oran}). If it runs out, the team stops.`),
          zaman: new Date().toISOString(),
          onayId: null,
          eylem: "butce",
        },
      },
      OFIS,
    );
    return { tamam: true };
  });

  /** Proje özetine katılan alanlar */
  function ozet(p) {
    return { butce: p.butce, seviye: p.seviye, otomatikKademe: p.otomatikKademe, toplamToken: toplamToken(p.id), butceDurumu: durum(p) };
  }
  return { ozet };
}
