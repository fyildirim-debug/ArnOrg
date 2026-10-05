// Sahte çekirdeğin 0.0.7 karar yetkisi: projede onaylara CEO (tam otonom, varsayılan) ya da kurul karar verir.
//
//   kur(c): sahte-sunucu.mjs'teki rota, rotalar, db ve yardımcılarla çağrılır (surum-005-*.mjs deseni)
//
// Sipariş Paneli tam otonomda: Ada son saatin onaylarına gerekçeleriyle karar vermiş (Deniz'in main'e push'u ve Mert'in
// rm -rf'i reddedildi; Deniz'in dizin göçü sorusu, Burak'ın token tavanı ve T-22 birleştirmesi onaylandı; Aras'ı kendi
// kararıyla işe aldı, sipariş akışı teslimi kurula sonuç olarak gitti). Onur'un T-19 birleştirmesi Ada'nın kararını
// bekliyor (Ada farkı okuyor; tohumda kendiliğinden karara bağlanmaz). Ada'nın ödeme sağlayıcısı sorusuna kurul karar
// vermiş. Arnex Web Sitesi kurul kipinde.
//
// Tam otonom kipte (çekirdekteki sirket.ts ve karar-yetkisi.ts gibi):
//   - CEO'nun kendi teklifi (işe alım, işten çıkarma, ana yasa, birleştirme, araç izni, teslim) hemen onun kararıyla
//     geçer; teslim kurula sonuç olarak iletilir (karar düğmesiz bilgi penceresi, #genel'de "sonuç kurula iletildi").
//   - Çalışanların onayı kurula pencere açmaz; CEO'ya mesaj olarak gider, CEO bir süre sonra onay_karari ile gerekçeli
//     karar verir. Kurul bekleyen her onaya yine kendisi karar verebilir (kararı veren kurul olur).
//   - CEO'nun kurula sorusu (genel) kurula gider; CEO duraklatılmışsa ya da hatayla durmuşsa onaylar kurula düşer.
//   - Var olan döngülerin "Otomatik onay" notuyla hemen sonuçlandırdığı onaylar (ofis gösterisi) CEO'nun kararı olur.
// Kip PATCH /api/projeler/:pid ile değişir: #genel'e duyurulur, CEO'ya söylenir, bekleyen onaylar yeni muhataba yönelir.
// Yeni projeler CEO kipinde açılır (POST /api/projeler kararVeren alabilir).
//
// Geliştirme uçları (yalnız sahte çekirdek):
//   POST /api/gelistirme/otonom-teslim  Ada teslim eder: kurula düğmesiz bilgi penceresi gelir
//   POST /api/gelistirme/otonom-izin    Deniz'in araç izni Ada'ya gider; Ada bir süre sonra karar verir

import { ceviri, yonelme } from "./dil.mjs";

const OFIS = "siparis-paneli";
/** Tohum projelerin karar yetkisi; yeni projeler CEO kipinde açılır */
const KIPLER = { [OFIS]: "ceo", "arnex-web": "kurul" };
/** Tam otonomda CEO'nun kendi kararıyla hemen geçen teklif türleri; kurula sorusu (genel) kurula gider */
const CEO_KENDI_KARARI = ["ise_alim", "isten_cikarma", "anayasa", "birlestirme", "arac", "teslim"];
/** CEO bu durumlardayken karar veremez; onaylar kurula düşer */
const CEO_KARAR_VEREMEZ = ["duraklatildi", "hata"];
const OTOMATIK_NOTLARI = ["Otomatik onay", "Auto-approved"];
/** CEO'nun çalışanın onayına karar verme süresi (sahne); birleştirmede önce farkı okur */
const CEO_KARAR_MS = 14_000;
const CEO_FARK_MS = 5_000;

const TUR_ADLARI = ceviri(
  { arac: "Araç çağrısı", ise_alim: "İşe alım", birlestirme: "Birleştirme", genel: "Karar", anayasa: "Ana yasa", isten_cikarma: "İşten çıkarma", teslim: "Teslim" },
  { arac: "Tool call", ise_alim: "Hiring", birlestirme: "Merge", genel: "Decision", anayasa: "Constitution", isten_cikarma: "Dismissal", teslim: "Delivery" },
);

export function kur(c) {
  const { rota, rotalar, db, yay, yayDinle, mesajEkle, akisEkle, ajanBul, projeAjanlari, proje, projeGerekli, projeOzeti, projeYay, Hata, simdi, yeniKimlik } = c;
  const once = (dk) => new Date(Date.now() - dk * 60_000).toISOString();
  const kisa = (id) => String(id).slice(0, 8);
  const ajanYay = (a) => yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);
  const KURUL = { kaynak: "kurul", ad: ceviri("Yönetim kurulu", "The board") };
  const OTOMATIK = { kaynak: "otomatik", ad: ceviri("Otomatik onay", "Auto-approval") };
  const ceoKarari = (ceo) => ({ kaynak: "ceo", ad: ceo.ad });
  const ceoKendiNotu = () => ceviri("CEO kararı (tam otonom)", "CEO decision (fully autonomous)");

  // -------------------------------------------------------------------------
  // Kip, CEO ve muhatap
  // -------------------------------------------------------------------------

  const kip = (pid) => (proje(pid)?.kararVeren === "kurul" ? "kurul" : "ceo");
  const ceoBul = (pid) => projeAjanlari(pid).find((a) => a.rol === "ceo") ?? null;
  /** Tam otonomda karar verecek CEO: proje CEO kipinde, CEO var, duraklatılmamış ve hatayla durmamış */
  function kararCeosu(pid) {
    if (kip(pid) !== "ceo") return null;
    const ceo = ceoBul(pid);
    return ceo && !CEO_KARAR_VEREMEZ.includes(ceo.durum) ? ceo : null;
  }
  /** Onayın muhatabı: tam otonomda CEO (CEO'nun kendi kurula sorusu hariç); CEO karar veremiyorsa ve kurul kipinde kurul */
  function muhatapBul(o) {
    const ceo = kararCeosu(o.projeId);
    if (!ceo || !o.ajanId || !ajanBul(o.ajanId)) return "kurul";
    return o.ajanId === ceo.id && o.tur === "genel" ? "kurul" : "ceo";
  }
  /** Bekleyen onayın muhatabını yazar ve yayınlar (Stüdyo CEO'yu bekleyeni ayırır) */
  function muhatapYaz(o, muhatap) {
    if (o.muhatap === muhatap) return;
    o.muhatap = muhatap;
    yay({ tur: "onay.sonuc", onay: o }, o.projeId);
  }

  // Projeler: tohumlar kendi kipinde, sonradan açılanlar (POST /api/projeler, klonlama) CEO kipinde; açılış yayınında
  // alan yoksa yazılır ve yeniden yayınlanır
  for (const p of db.projeler) p.kararVeren ??= KIPLER[p.id] ?? "ceo";
  yayDinle((olay) => {
    if (olay.tur !== "proje.guncellendi") return;
    const p = proje(olay.proje?.id);
    if (!p || p.kararVeren) return;
    p.kararVeren = "ceo";
    projeYay(p.id);
  });

  // -------------------------------------------------------------------------
  // Kurulun penceresi ve CEO'ya giden mesajlar
  // -------------------------------------------------------------------------

  function kurulBildirimi(pid, ajan, tur, baslik, metin, onayId = null) {
    yay({ tur: "kurul.bildirimi", projeId: pid, bildirim: { id: yeniKimlik("kb"), projeId: pid, ajanId: ajan?.id ?? null, ajanAd: ajan?.ad ?? "ArnOrg", tur, baslik, metin, zaman: simdi(), onayId } }, pid);
  }
  /** Onay kurula döner: kurul kipinde otomatik onay kapsamındaysa hemen verilir, değilse her ekranda pencere açılır */
  function kurulaAc(o) {
    const pr = proje(o.projeId);
    if (pr?.kararVeren === "kurul" && pr.otomatikOnay?.etkin && pr.otomatikOnay.turler.includes(o.tur)) {
      kararVer(o, "onayla", ceviri("Otomatik onay", "Auto-approved"), OTOMATIK);
      return;
    }
    const tur = o.tur === "teslim" ? "teslim" : o.tur === "arac" ? "yetki" : o.tur === "genel" ? "istek" : "onay";
    kurulBildirimi(o.projeId, ajanBul(o.ajanId), tur, o.baslik, String(o.ayrinti ?? "").slice(0, 800), o.id);
  }
  /** Ajana ArnOrg'un sistem mesajı (akışta kullanıcı turu olarak görünür) */
  const sistemMesaji = (ajan, metin) => akisEkle(ajan.id, { tur: "kullanici", arac: "ArnOrg", metin: `[ArnOrg] ${metin}` });
  const isteyenMetni = (o) => {
    const a = ajanBul(o.ajanId);
    return a ? `${a.ad} (${a.rolAdi})` : "ArnOrg";
  };
  function ceoOnayMesaji(o) {
    const kimlik = kisa(o.id);
    const ayrinti = String(o.ayrinti ?? "").trim().slice(0, 1500);
    return [
      ceviri(`Kararını bekleyen onay ${kimlik} · ${TUR_ADLARI[o.tur]}`, `Approval ${kimlik} is waiting for your decision · ${TUR_ADLARI[o.tur]}`),
      `${ceviri("İsteyen", "Requested by")}: ${isteyenMetni(o)}`,
      `${ceviri("Başlık", "Title")}: ${o.baslik}`,
      ...(ayrinti ? [`${ceviri("Ayrıntı", "Details")}:\n${ayrinti}`] : []),
      "",
      ceviri(
        `Karar yetkisi sende. mcp__arnorg__onay_karari ile karar ver: onay "${kimlik}", karar "onayla" ya da "reddet", gerekce (kısa ve somut; isteyene iletilir).`,
        `You have the decision authority. Decide with mcp__arnorg__onay_karari: onay "${kimlik}", karar "onayla" or "reddet", gerekce (short and concrete; it is passed on to the requester).`,
      ),
    ].join("\n");
  }
  function ceoOnayListesi(onaylar) {
    const n = onaylar.length;
    return [
      ceviri(`Bekleyen ${n} onay artık senin kararını bekliyor:`, `${n === 1 ? "1 pending approval is" : `${n} pending approvals are`} now waiting for your decision:`),
      ...onaylar.map((o) => `- ${kisa(o.id)} · ${TUR_ADLARI[o.tur]} · ${isteyenMetni(o)} · ${o.baslik}`),
      "",
      ceviri(
        "Her birine mcp__arnorg__onay_karari ile karar ver ve gerekçesini yaz (birleştirmeden önce calisma_farki ile değişikliği oku).",
        "Decide each one with mcp__arnorg__onay_karari and write your reasoning (read the change with calisma_farki before a merge).",
      ),
    ].join("\n");
  }
  const kipMesaji = (yeni) =>
    yeni === "ceo"
      ? ceviri(
          "Kurul karar yetkisini sana bıraktı: şirket artık tam otonom. Çalışanların onay istekleri (araç izni, birleştirme, işe alım, soru) sana mesaj olarak gelecek; onay_karari ile gerekçeli karar ver. Kendi tekliflerin (işe alım, işten çıkarma, ana yasa, birleştirme) hemen geçerli olur; teslimlerin kurula sonuç olarak gider, kabul bekleme. Kurula yalnız insanın yapabileceği şeyler için kurula_sor ile sor (giriş bilgisi, ödeme, dış hesap, geri alınamaz dış etkiler). Ana yasa ve kalite kapısı yine geçerli.",
          "The board has handed decision authority to you: the company is now fully autonomous. Employees' approval requests (tool permissions, merges, hires, questions) will come to you as messages; decide them with reasons using onay_karari. Your own proposals (hire, dismissal, constitution, merge) take effect immediately; your deliveries go to the board as results, so don't wait for acceptance. Ask the board with kurula_sor only for what only a human can do (credentials, payments, external accounts, irreversible external effects). The constitution and the quality gate still apply.",
        )
      : ceviri(
          "Kurul karar yetkisini geri aldı: tekliflerin ve çalışanların onay istekleri artık kurulun kararına gider; onay_karari kullanılamaz. Teklifini gerekçesiyle ver ve sonucu bekle.",
          "The board has taken decision authority back: your proposals and the employees' approval requests now go to the board for a decision; onay_karari can no longer be used. Make proposals with reasons and wait for the decision.",
        );

  // -------------------------------------------------------------------------
  // Karar: asıl uç (işe alım, birleştirme ve öteki tepkiler) kararı verenle; araç izninde CEO'nun metinleri
  // -------------------------------------------------------------------------

  const kararRotasi = rotalar.find((r) => r.yontem === "POST" && r.desen.test("/api/onaylar/x"));
  const asilKarar = kararRotasi.isleyici;
  // Stüdyo'dan gelen karar kurulundur; kararı veren onay.sonuc yayınlanmadan önce yazılır
  kararRotasi.isleyici = (i) => {
    const o = db.onaylar.find((x) => x.id === i.p.oid);
    if (o?.durum === "bekliyor") Object.assign(o, { kararKaynagi: KURUL.kaynak, kararVerenAd: KURUL.ad });
    const sonuc = asilKarar(i);
    planIptal(o?.id);
    return sonuc;
  };

  /** Onayı karara bağlar; bekleyen değilse dokunmaz */
  function kararVer(o, karar, not, veren) {
    if (!o || o.durum !== "bekliyor") return null;
    planIptal(o.id);
    if (o.tur === "arac" && veren.kaynak === "ceo") return ceoAracKarari(o, karar === "onayla", not, veren);
    Object.assign(o, { kararKaynagi: veren.kaynak, kararVerenAd: veren.ad });
    const sonuc = asilKarar({ p: { oid: o.id }, q: new URLSearchParams(), govde: { karar, not } });
    if (veren.kaynak === "ceo" && o.tur === "teslim" && o.durum === "onaylandi") teslimSonucu(o);
    return sonuc;
  }

  /** Denetim kaydı (sahte-sunucu'daki denetimEkle gibi) */
  function denetimYaz(a, arac, girdiOzeti, karar, kural, neden) {
    const k = { id: yeniKimlik("d"), projeId: a.projeId, ajanId: a.id, ajanAd: a.ad, arac, girdiOzeti, karar, kural, neden, aracKimligi: yeniKimlik("toolu"), zaman: simdi() };
    db.denetim.unshift(k);
    yay({ tur: "denetim.kaydi", kayit: k }, a.projeId);
  }

  /** CEO'nun araç izni kararı: denetim kaydı CEO'yu yazar, ajanın beklediği çağrı sonuçlanır */
  function ceoAracKarari(o, kabul, not, veren) {
    Object.assign(o, { durum: kabul ? "onaylandi" : "reddedildi", sonuclanma: simdi(), not, kararKaynagi: "ceo", kararVerenAd: veren.ad });
    const a = ajanBul(o.ajanId);
    if (a) {
      const komut = o.veri?.girdi?.command ?? o.veri?.girdi?.url ?? o.baslik;
      denetimYaz(a, o.veri?.arac ?? "Bash", komut, kabul ? "izin" : "ret", `${veren.ad} (CEO)`, not);
      const cikti = /\bgit\s+push\b/.test(komut)
        ? `To github.com:furkan-y/siparis-paneli.git\n   4be1c02..9f3d7aa  ${a.dal ?? "HEAD"} -> ${a.dal ?? "HEAD"}`
        : o.veri?.girdi?.url
          ? ceviri("Sayfa okundu (14 KB).", "Page read (14 KB).")
          : ceviri("Komut tamamlandı.", "Command finished.");
      akisEkle(a.id, {
        tur: "arac_sonucu",
        aracKimligi: o.veri?.aracKimligi,
        metin: kabul ? cikti : ceviri(`CEO ${veren.ad} izin vermedi. Not: ${not}`, `CEO ${veren.ad} did not allow it. Note: ${not}`),
        hata: !kabul,
      });
      if (a.durum === "karar_bekliyor") a.durum = "calisiyor";
      ajanYay(a);
      setTimeout(() => akisEkle(a.id, { tur: "asistan", metin: kabul ? ceviri("İzin geldi; devam ediyorum.", "Permission granted; carrying on.") : ceviri(`Anlaşıldı: ${not}`, `Understood: ${not}`) }), 1500);
    }
    yay({ tur: "onay.sonuc", onay: o }, o.projeId);
    projeYay(o.projeId);
    return o;
  }

  /** CEO'nun kabul ettiği teslim kurula sonuç olarak iletilir: #genel, düğmesiz bilgi penceresi, teslim edene mesaj */
  function teslimSonucu(o) {
    const baslik = o.veri?.baslik ?? o.baslik;
    const teslimEden = ajanBul(o.ajanId);
    mesajEkle(o.projeId, "genel", "arnorg", ceviri(`Teslim: ${baslik} — sonuç kurula iletildi.`, `Delivery: ${baslik} — the result was passed to the board.`));
    kurulBildirimi(o.projeId, teslimEden ?? ceoBul(o.projeId), "teslim", o.baslik, String(o.ayrinti ?? "").slice(0, 800), o.id);
    if (!teslimEden) return;
    sistemMesaji(
      teslimEden,
      teslimEden.rol === "ceo"
        ? ceviri(
            `"${baslik}" teslimi kurula sonuç olarak iletildi. Kabul bekleme; sıradaki hedefe geç. Kurulun geri bildirimi olursa CEO sohbetinden sana iş olarak gelir.`,
            `The "${baslik}" delivery was passed to the board as a result. Don't wait for acceptance; move on to the next goal. If the board has feedback, it will come to you as work through the CEO chat.`,
          )
        : ceviri(`CEO "${baslik}" teslimini kabul etti; sonuç kurula iletildi.`, `The CEO accepted the "${baslik}" delivery; the result was passed to the board.`),
    );
  }

  // -------------------------------------------------------------------------
  // CEO'nun kararı (sahne): çalışanın onayına bir süre sonra gerekçeli karar
  // -------------------------------------------------------------------------

  const planlar = new Map();
  function planIptal(id) {
    for (const z of planlar.get(id) ?? []) clearTimeout(z);
    planlar.delete(id);
  }
  const planla = (id, ms, is) => {
    const z = setTimeout(is, ms);
    planlar.set(id, [...(planlar.get(id) ?? []), z]);
  };

  /** CEO'nun gerekçesi: araç izninde komuta göre, öteki türlerde kısa ve somut */
  function ceoGerekcesi(o) {
    if (o.tur === "arac") {
      const komut = String(o.veri?.girdi?.command ?? o.veri?.girdi?.url ?? "");
      if (/\bgit\s+push\b.*(--force|\s-f\b)/.test(komut))
        return ["reddet", ceviri("Zorla gönderim yok: dalın geçmişini ezer. --force olmadan gönder; çakışma varsa birleştirerek çöz.", "No force-pushing: it overwrites the branch history. Push without --force; resolve any conflict by merging.")];
      if (/\bgit\s+push\b.*\bmain\b/.test(komut))
        return ["reddet", ceviri("Ana yasanın 4. maddesi: main'e doğrudan gönderim yok. Dalını it; birleştirmeyi kalite kapısı yapar.", "Constitution article 4: no pushing straight to main. Push your branch; the quality gate does the merge.")];
      if (/\bnpm\s+publish\b/.test(komut))
        return ["reddet", ceviri("Paket yayını bu sprintin işi değil; sürüm planı hazır olunca yayınlarız.", "Publishing the package isn't part of this sprint; we'll publish once the release plan is ready.")];
      if (/\bgit\s+push\b/.test(komut)) return ["onayla", ceviri("Kendi dalına gönderim; ana yasaya uygun.", "A push to your own branch; within the constitution.")];
      if (o.veri?.girdi?.url) return ["onayla", ceviri("Yalnız belge okuma; işin için gerekli, ana yasaya uygun.", "Reading documentation only; you need it for the task and it is within the constitution.")];
      return ["onayla", ceviri("Komut işin kapsamında ve ana yasaya uygun; devam et.", "The command is within the task and the constitution; go ahead.")];
    }
    if (o.tur === "birlestirme")
      return ["onayla", ceviri("Farkı okudum: değişiklik görevle sınırlı, inceleme tamam. Kalite kapısına alındı.", "I read the diff: the change stays within the task and the review is done. Sent to the quality gate.")];
    if (o.tur === "ise_alim") return ["onayla", ceviri("Ekibin yükü bunu gerektiriyor; işe alım uygun.", "The team's workload calls for it; the hire is fine.")];
    if (o.tur === "isten_cikarma") return ["onayla", ceviri("Rol artık gerekmiyor; işleri devralana geçsin.", "The role is no longer needed; hand the work over.")];
    if (o.tur === "anayasa") return ["onayla", ceviri("Madde yerinde ve denetlenebilir; ana yasaya girsin.", "The article is sound and checkable; add it to the constitution.")];
    if (o.tur === "teslim") return ["onayla", ceviri("Test adımlarını denedim; sonuç kurula iletildi.", "I tried the test steps; the result went to the board.")];
    return ["onayla", ceviri("Uygun; ilerle ve sonucu #genel'e yaz.", "Fine; go ahead and post the result in #general.")];
  }

  /** Çalışanın onayı CEO'ya gider: mesaj, (birleştirmede) farkı okuma, sonra onay_karari */
  function ceoKararPlanla(o, ceo) {
    sistemMesaji(ceo, ceoOnayMesaji(o));
    if (o.tur === "birlestirme") {
      const sahip = ajanBul(o.veri?.ajanId ?? o.veri?.dal?.split("/")[1]);
      planla(o.id, CEO_FARK_MS, () => {
        if (o.durum !== "bekliyor") return;
        const kimlik = yeniKimlik("toolu");
        akisEkle(ceo.id, { tur: "arac_cagrisi", arac: "mcp__arnorg__calisma_farki", aracKimligi: kimlik, girdi: { ajan: sahip?.ad ?? o.veri?.dal ?? "" } });
        akisEkle(ceo.id, { tur: "arac_sonucu", aracKimligi: kimlik, metin: ceviri(`${o.veri?.dosyaSayisi ?? 4} dosya · +${o.veri?.eklenen ?? 0} −${o.veri?.silinen ?? 0}`, `${o.veri?.dosyaSayisi ?? 4} files · +${o.veri?.eklenen ?? 0} −${o.veri?.silinen ?? 0}`) });
      });
    }
    planla(o.id, CEO_KARAR_MS, () => {
      if (o.durum !== "bekliyor") return;
      const karar = kararCeosu(o.projeId);
      // Bu arada CEO karar veremez oldu (duraklatıldı, hata, kip değişti): kurula düşer
      if (!karar) {
        muhatapYaz(o, "kurul");
        kurulaAc(o);
        return;
      }
      const [k, gerekce] = ceoGerekcesi(o);
      const kimlik = yeniKimlik("toolu");
      akisEkle(karar.id, { tur: "arac_cagrisi", arac: "mcp__arnorg__onay_karari", aracKimligi: kimlik, girdi: { onay: kisa(o.id), karar: k, gerekce } });
      kararVer(o, k, gerekce, ceoKarari(karar));
      const sonuc = k === "onayla" ? ceviri("onaylandı", "approved") : ceviri("reddedildi", "rejected");
      akisEkle(karar.id, {
        tur: "arac_sonucu",
        aracKimligi: kimlik,
        metin: ceviri(`Onay ${kisa(o.id)} ${sonuc} (${TUR_ADLARI[o.tur]}: ${o.baslik}). Gerekçen isteyene iletildi.`, `Approval ${kisa(o.id)} ${sonuc} (${TUR_ADLARI[o.tur]}: ${o.baslik}). Your reasoning was passed on to the requester.`),
      });
    });
  }

  /** Tam otonomda bekleyen onay CEO'ya yönelir: kendi teklifi hemen geçer, başkasınınki CEO'nun kararına gider */
  function ceoyaYonelt(o) {
    const ceo = kararCeosu(o.projeId);
    if (!ceo) {
      muhatapYaz(o, "kurul");
      kurulaAc(o);
      return;
    }
    if (o.ajanId === ceo.id && CEO_KENDI_KARARI.includes(o.tur)) kararVer(o, "onayla", ceoKendiNotu(), ceoKarari(ceo));
    else ceoKararPlanla(o, ceo);
  }

  // Yeni onaylar: muhatap eklenirken yazılır (onay.yeni yayınlanmadan önce; 0.0.2 penceresi CEO'yu bekleyene açılmaz)
  const onayEkle = db.onaylar.unshift;
  Object.defineProperty(db.onaylar, "unshift", {
    value(...ogeler) {
      for (const o of ogeler) yeniOnay(o);
      return onayEkle.apply(this, ogeler);
    },
  });
  function yeniOnay(o) {
    o.kararKaynagi ??= null;
    o.kararVerenAd ??= null;
    if (o.durum === "bekliyor") {
      o.muhatap = muhatapBul(o);
      return;
    }
    o.muhatap ??= null;
    if (o.kararKaynagi || o.durum === "zaman_asimi") return;
    const otomatik = OTOMATIK_NOTLARI.includes(String(o.not ?? "").trim());
    const ceo = kararCeosu(o.projeId);
    // Ofis gösterisinin hemen sonuçlandırdığı onaylar: tam otonomda kararı CEO verir
    if (otomatik && ceo) {
      const kendi = o.ajanId === ceo.id;
      Object.assign(o, {
        kararKaynagi: "ceo",
        kararVerenAd: ceo.ad,
        muhatap: "ceo",
        not: kendi ? ceoKendiNotu() : ceviri("İnceleme tamam, testler geçti; kalite kapısına aldım.", "Review done and the tests pass; sent to the quality gate."),
      });
      if (o.ayrinti === ceviri("İnceleme tamam; otomatik onay.", "Review done; auto-approved.")) o.ayrinti = ceviri("İnceleme tamam.", "Review done.");
      return;
    }
    Object.assign(o, otomatik ? { kararKaynagi: OTOMATIK.kaynak, kararVerenAd: OTOMATIK.ad } : { kararKaynagi: KURUL.kaynak, kararVerenAd: KURUL.ad });
  }

  yayDinle((olay) => {
    if (olay.tur !== "onay.yeni" || olay.onay.durum !== "bekliyor" || olay.onay.muhatap !== "ceo") return;
    const o = olay.onay;
    // Çekirdekte onay bir sonraki döngüde işlenir; Stüdyo önce bekleyen onayı görür
    setTimeout(() => {
      if (o.durum === "bekliyor") ceoyaYonelt(o);
    }, 300);
  });

  // -------------------------------------------------------------------------
  // Kip değişimi ve proje açılışı
  // -------------------------------------------------------------------------

  const KIP_HATASI = ceviri('Geçersiz istek: kararVeren — "ceo" ya da "kurul" bekleniyor', 'Invalid request: kararVeren — expected "ceo" or "kurul"');

  const yama = rotalar.find((r) => r.yontem === "PATCH" && r.desen.test("/api/projeler/x"));
  const asilYama = yama.isleyici;
  yama.isleyici = (i) => {
    const pr = projeGerekli(i.p.pid);
    const yeni = i.govde?.kararVeren;
    if (yeni !== undefined && yeni !== "ceo" && yeni !== "kurul") throw new Hata(400, KIP_HATASI);
    const onceki = kip(pr.id);
    // Önce kip: otomatik onay yalnız kurul kipinde işler (0.0.2 ucu da buna bakar)
    if (yeni) pr.kararVeren = yeni;
    const sonuc = asilYama(i);
    if (!yeni || yeni === onceki) return sonuc;
    kipDegisti(pr, yeni);
    projeYay(pr.id);
    return projeOzeti(pr);
  };

  /** Karar yetkisi değişti: duyurulur, CEO'ya söylenir, bekleyen onaylar yeni muhataplarına yönelir */
  function kipDegisti(pr, yeni) {
    const ceo = ceoBul(pr.id);
    mesajEkle(
      pr.id,
      "genel",
      "arnorg",
      yeni === "ceo"
        ? ceviri(
            `Kurul karar yetkisini ${ceo ? `CEO ${yonelme(ceo.ad)}` : "CEO'ya"} bıraktı: izinler, birleştirmeler, işe alımlar ve öteki onaylar artık CEO'dan geçer; kurul sonuçları görür.`,
            `The board handed decision authority to ${ceo ? `CEO ${ceo.ad}` : "the CEO"}: permissions, merges, hires and the other approvals now go through the CEO; the board sees the results.`,
          )
        : ceviri("Kurul karar yetkisini geri aldı: onaylar yeniden kurula gelir.", "The board took decision authority back: approvals come to the board again."),
    );
    const ceoya = [];
    for (const o of db.onaylar.filter((x) => x.projeId === pr.id && x.durum === "bekliyor").reverse()) {
      const muhatap = muhatapBul(o);
      if ((o.muhatap ?? "kurul") === muhatap) continue;
      planIptal(o.id);
      muhatapYaz(o, muhatap);
      if (muhatap === "kurul") kurulaAc(o);
      else if (ceo && o.ajanId === ceo.id) ceoyaYonelt(o);
      else ceoya.push(o);
    }
    if (!ceo) return;
    sistemMesaji(ceo, [kipMesaji(yeni), ...(ceoya.length ? [ceoOnayListesi(ceoya)] : [])].join("\n\n"));
    // Listedekiler tek tek karara bağlanır (mesaj toplu gitti; tek tek mesaj gönderilmez)
    for (const o of ceoya) {
      planla(o.id, CEO_KARAR_MS, () => {
        if (o.durum !== "bekliyor" || o.muhatap !== "ceo") return;
        const karar = kararCeosu(o.projeId);
        if (!karar) return;
        const [k, gerekce] = ceoGerekcesi(o);
        kararVer(o, k, gerekce, ceoKarari(karar));
      });
    }
  }

  const projeAc = rotalar.find((r) => r.yontem === "POST" && r.desen.test("/api/projeler"));
  const asilProjeAc = projeAc.isleyici;
  projeAc.isleyici = async (i) => {
    const yeni = i.govde?.kararVeren;
    if (yeni !== undefined && yeni !== "ceo" && yeni !== "kurul") throw new Hata(400, KIP_HATASI);
    const sonuc = await asilProjeAc(i);
    const pr = proje(sonuc.id);
    if (pr && yeni && pr.kararVeren !== yeni) {
      pr.kararVeren = yeni;
      projeYay(pr.id);
    }
    return { ...sonuc, kararVeren: pr?.kararVeren ?? "ceo" };
  };

  // -------------------------------------------------------------------------
  // Tohum: Sipariş Paneli'nde Ada'nın son saatteki kararları ve onu bekleyen T-19 birleştirmesi
  // -------------------------------------------------------------------------

  for (const o of db.onaylar) yeniOnayTohum(o);
  /** Var olan onaylar: kararı veren nottan, bekleyenlerin muhatabı boş (0.0.7 öncesi kurula açılmıştı) */
  function yeniOnayTohum(o) {
    o.kararKaynagi ??= null;
    o.kararVerenAd ??= null;
    o.muhatap ??= null;
    if (o.durum === "bekliyor" || o.durum === "zaman_asimi" || o.kararKaynagi) return;
    const otomatik = OTOMATIK_NOTLARI.includes(String(o.not ?? "").trim());
    Object.assign(o, otomatik ? { kararKaynagi: OTOMATIK.kaynak, kararVerenAd: OTOMATIK.ad } : { kararKaynagi: KURUL.kaynak, kararVerenAd: KURUL.ad });
  }

  const ada = ajanBul("ada");
  if (proje(OFIS) && ada && kip(OFIS) === "ceo") tohumla(ada);

  function tohumla(ceo) {
    const veren = ceoKarari(ceo);
    const bul = (id) => db.onaylar.find((o) => o.id === id && o.projeId === OFIS && o.durum === "bekliyor");
    /** Tohum kararı: alanlar doğrudan (tepkisiz), kararın anı dakika önce */
    const karara = (o, karar, not, dk) => Object.assign(o, { durum: karar === "onayla" ? "onaylandi" : "reddedildi", sonuclanma: once(dk), not, kararKaynagi: "ceo", kararVerenAd: ceo.ad, muhatap: "ceo" });
    const akisTohum = (ajanId, dk, oge) => (db.akislar[ajanId] ??= []).push({ id: yeniKimlik("ak"), ajanId, zaman: once(dk), ustAracKimligi: null, ...oge });
    const bekliyorMetni = (m) => m.replace("kurulun kararı bekleniyor", "CEO'nun kararı bekleniyor").replace("waiting for the board's decision", "waiting for the CEO's decision").replace("the board's decision is pending", "the CEO's decision is pending");

    // Deniz'in main'e push'u: Ada reddetti (ana yasa)
    const push = bul("o1");
    if (push) {
      const not = ceviri("Ana yasanın 4. maddesi: main'e doğrudan gönderim yok. Dalını it; birleştirmeyi kalite kapısı yapar.", "Constitution article 4: no pushing straight to main. Push your branch; the quality gate does the merge.");
      karara(push, "reddet", not, 2);
      const deniz = ajanBul(push.ajanId);
      if (deniz) {
        if (deniz.durum === "karar_bekliyor") deniz.durum = "calisiyor";
        deniz.isAciklamasi = String(deniz.isAciklamasi ?? "").split(" · ")[0];
        const akis = db.akislar[deniz.id] ?? [];
        const not_ = akis.findLast((x) => x.tur === "sistem");
        if (not_?.metin) not_.metin = bekliyorMetni(not_.metin);
        akisTohum(deniz.id, 2, { tur: "arac_sonucu", aracKimligi: push.veri?.aracKimligi, metin: ceviri(`CEO ${ceo.ad} izin vermedi. Not: ${not}`, `CEO ${ceo.ad} did not allow it. Note: ${not}`), hata: true });
        akisTohum(deniz.id, 2, { tur: "asistan", metin: ceviri("Anlaşıldı. Dalımı itip birleştirme istiyorum.", "Understood. I'll push my branch and ask for the merge.") });
        db.denetim.unshift({ id: yeniKimlik("d"), projeId: OFIS, ajanId: deniz.id, ajanAd: deniz.ad, arac: "Bash", girdiOzeti: push.veri?.girdi?.command ?? push.baslik, karar: "ret", kural: `${ceo.ad} (CEO)`, neden: not, aracKimligi: push.veri?.aracKimligi ?? yeniKimlik("toolu"), zaman: once(2) });
      }
    }

    // Mert'in rm -rf'i: Ada reddetti (akıştaki ret metni CEO'yu anar)
    const sil = db.onaylar.find((o) => o.id === "o6" && o.projeId === OFIS);
    if (sil && sil.durum === "reddedildi") {
      Object.assign(sil, { kararKaynagi: "ceo", kararVerenAd: ceo.ad, muhatap: "ceo" });
      const sonuc = (db.akislar[sil.ajanId] ?? []).find((x) => x.tur === "arac_sonucu" && x.aracKimligi === sil.veri?.aracKimligi);
      if (sonuc) sonuc.metin = ceviri(`CEO ${ceo.ad} izin vermedi. Not: ${sil.not}`, `CEO ${ceo.ad} did not allow it. Note: ${sil.not}`);
    }

    // Deniz'in dizin göçü sorusu: Ada onayladı, gerekçesi yanıttır
    const goc = bul("o4");
    if (goc) karara(goc, "onayla", ceviri("Uygun. Göçü düşük trafikte çalıştır, geri alma adımını PR açıklamasına yaz.", "Approved. Run the migration during low traffic and put the rollback step in the PR description."), 10);

    // Burak'ın görev token tavanı: Ada onayladı, Burak kaldığı yerden sürer
    const tavan = bul("o-tavan-1");
    if (tavan) {
      karara(tavan, "onayla", ceviri("T-23'ün göç betikleri beklenenden büyük; tavanı yükselt, sürsün. Kerem kalanı iki göreve bölsün.", "T-23's migration scripts are bigger than expected; raise the ceiling and keep going. Kerem should split the rest into two tasks."), 3);
      const burak = ajanBul(tavan.veri?.ajanId);
      const g = db.gorevler.find((x) => x.id === tavan.veri?.gorevId);
      if (burak && g) {
        const not_ = (db.akislar[burak.id] ?? []).findLast((x) => x.tur === "sistem");
        if (not_?.metin) not_.metin = bekliyorMetni(not_.metin);
        const yeniTavan = ceviri(`${(tavan.veri.yeniTavan / 1_000_000).toLocaleString("tr-TR")} M`, `${(tavan.veri.yeniTavan / 1_000_000).toLocaleString("en-US")}M`);
        sistemMesaji(burak, ceviri(`CEO ${ceo.ad} ${g.kod} görevinin token tavanını ${yeniTavan} yaptı. Kaldığın yerden devam et.`, `CEO ${ceo.ad} raised the token ceiling of ${g.kod} to ${yeniTavan}. Continue where you left off.`));
        Object.assign(burak, { durum: "calisiyor", isAciklamasi: `${g.kod} ${g.baslik}` });
      }
    }

    // Sipariş akışı teslimi: Ada'nın kendi kararı, kurula sonuç olarak gitti
    const teslim = bul("o-teslim-1");
    if (teslim) karara(teslim, "onayla", ceoKendiNotu(), 14);

    // Aras: Ada'nın kendi işe alımı hemen geçerli (asıl uç ekibe katar ve #genel'e yazar)
    const aras = bul("o2");
    if (aras) {
      aras.muhatap = "ceo";
      kararVer(aras, "onayla", ceoKendiNotu(), veren);
      aras.sonuclanma = aras.olusturma;
    }

    // T-22: Onur'un birleştirme isteği; Ada farkı okudu ve onayladı (kalite kapısı koşar, geçerse ana dala girer)
    const t22 = bul("o3");
    if (t22) t22.muhatap = "ceo";
    if (t22) kararVer(t22, "onayla", ceviri("Farkı okudum: değişiklik görevle sınırlı, Onur iki turda onayladı ve 48/48 test geçti. Kalite kapısına alındı.", "I read the diff: the change stays within the task, Onur approved it in two rounds and 48/48 tests passed. Sent to the quality gate."), veren);

    // T-19: Onur'un birleştirme isteği Ada'nın kararını bekliyor; Ada farkı okuyor
    const t19 = db.onaylar.find((o) => o.projeId === OFIS && o.tur === "birlestirme" && o.durum === "bekliyor" && o.veri?.gorevId === "g19");
    if (t19) {
      t19.muhatap = "ceo";
      sistemMesaji(ceo, ceoOnayMesaji(t19));
      const kimlik = yeniKimlik("toolu");
      akisEkle(ceo.id, { tur: "arac_cagrisi", arac: "mcp__arnorg__calisma_farki", aracKimligi: kimlik, girdi: { ajan: ajanBul(t19.veri?.ajanId)?.ad ?? "Ece" } });
      akisEkle(ceo.id, {
        tur: "arac_sonucu",
        aracKimligi: kimlik,
        metin: ceviri(`${t19.veri?.dosyaSayisi ?? 5} dosya · +${t19.veri?.eklenen ?? 0} −${t19.veri?.silinen ?? 0}`, `${t19.veri?.dosyaSayisi ?? 5} files · +${t19.veri?.eklenen ?? 0} −${t19.veri?.silinen ?? 0}`),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Geliştirme uçları: bilgi penceresini ve CEO'nun izin kararını elle denemek için
  // -------------------------------------------------------------------------

  const TESLIMLER = ceviri(
    [
      ["Kargo takibi önizlemesi", "Sipariş ayrıntısında kargo durumu ve takip numarası görünüyor; testler yeşil.", ["npm run dev ile paneli aç", "Kargoda olan bir siparişi aç", "Takip numarasına tıkla ve durumu gör"]],
      ["Sipariş listesi ve durum rozetleri", "Liste, sayfalama ve durum rozetleri hazır; testler yeşil.", ["npm run dev ile paneli aç", "Siparişler sayfasında listeyi kaydır", "Bir siparişin durumunu 'Kargoda' yap"]],
    ],
    [
      ["Shipment tracking preview", "Order details show the shipment status and tracking number; tests are green.", ["Open the panel with npm run dev", "Open an order that has shipped", "Click the tracking number and see the status"]],
      ["Order list and status badges", "The list, pagination and status badges are ready; tests are green.", ["Open the panel with npm run dev", "Scroll the list on the Orders page", "Set an order's status to 'Shipped'"]],
    ],
  );
  let teslimNo = 0;
  rota("POST", "/api/gelistirme/otonom-teslim", ({ govde }) => {
    const pid = govde?.projeId ?? OFIS;
    projeGerekli(pid);
    const ceo = ceoBul(pid);
    if (!ceo) throw new Hata(409, ceviri("Bu projede CEO yok.", "This project has no CEO."));
    const [baslik, ozet, adimlar] = TESLIMLER[teslimNo++ % TESLIMLER.length];
    const kimlik = yeniKimlik("toolu");
    akisEkle(ceo.id, { tur: "arac_cagrisi", arac: "mcp__arnorg__teslim_et", aracKimligi: kimlik, girdi: { baslik, ozet, test_adimlari: adimlar, calistir: "npm run dev", adres: "http://localhost:5173" } });
    const o = {
      id: yeniKimlik("o"),
      projeId: pid,
      ajanId: ceo.id,
      tur: "teslim",
      baslik: ceviri(`Teslim: ${baslik}`, `Delivery: ${baslik}`),
      ayrinti: [ozet, "", ceviri("Test adımları:", "Test steps:"), ...adimlar.map((x, i) => `${i + 1}. ${x}`), "", `${ceviri("Çalıştır", "Run")}: npm run dev`, `${ceviri("Adres", "Address")}: http://localhost:5173`].join("\n"),
      veri: { baslik, ozet, testAdimlari: adimlar, calistir: "npm run dev", adres: "http://localhost:5173", dal: "main" },
      durum: "bekliyor",
      olusturma: simdi(),
      sonGecerlilik: null,
      sonuclanma: null,
      not: null,
    };
    db.onaylar.unshift(o);
    yay({ tur: "onay.yeni", onay: o }, pid);
    projeYay(pid);
    const otonom = o.muhatap === "ceo";
    akisEkle(ceo.id, {
      tur: "arac_sonucu",
      aracKimligi: kimlik,
      metin: otonom
        ? ceviri(`Teslim kurula sonuç olarak iletildi (onay ${kisa(o.id)}). Kabul bekleme; sıradaki hedefe geç.`, `The delivery was passed to the board as a result (approval ${kisa(o.id)}). Don't wait for acceptance; move on to the next goal.`)
        : ceviri(`Teslim kurula sunuldu (onay ${kisa(o.id)}).`, `The delivery went to the board (approval ${kisa(o.id)}).`),
    });
    return o;
  });

  const IZINLER = [
    { ajanId: "deniz", arac: "Bash", girdi: { command: "git push origin arnorg/deniz/T-24", description: ceviri("Dalı gönder", "Push the branch") }, kural: ceviri("Dışarı push ve yayın → onaya sor", "Outbound push and publish → ask for approval") },
    { ajanId: "kerem", arac: "WebFetch", girdi: { url: "https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation" }, kural: ceviri("Ağ erişimi → onaya sor", "Network access → ask for approval") },
    { ajanId: "ece", arac: "Bash", girdi: { command: "npm publish --access public", description: ceviri("Bileşen paketini yayınla", "Publish the component package") }, kural: ceviri("Dışarı push ve yayın → onaya sor", "Outbound push and publish → ask for approval") },
  ];
  let izinNo = 0;
  rota("POST", "/api/gelistirme/otonom-izin", () => {
    const s = IZINLER[izinNo++ % IZINLER.length];
    const a = ajanBul(s.ajanId);
    if (!a) throw new Hata(409, ceviri("Ajan bulunamadı.", "Agent not found."));
    const kimlik = yeniKimlik("toolu");
    const komut = s.girdi.command ?? s.girdi.url;
    akisEkle(a.id, { tur: "arac_cagrisi", arac: s.arac, aracKimligi: kimlik, girdi: s.girdi });
    denetimYaz(a, s.arac, komut, "sor", s.kural.split(" →")[0], null);
    const o = {
      id: yeniKimlik("o"),
      projeId: a.projeId,
      ajanId: a.id,
      tur: "arac",
      baslik: `${s.arac} · ${komut}`,
      ayrinti: "",
      veri: { arac: s.arac, girdi: s.girdi, kural: s.kural, aracKimligi: kimlik },
      durum: "bekliyor",
      olusturma: simdi(),
      sonGecerlilik: new Date(Date.now() + Math.min(db.ayarlar.onaySuresiSn ?? 180, 180) * 1000).toISOString(),
      sonuclanma: null,
      not: null,
    };
    db.onaylar.unshift(o);
    a.durum = "karar_bekliyor";
    ajanYay(a);
    yay({ tur: "onay.yeni", onay: o }, a.projeId);
    projeYay(a.projeId);
    return o;
  });
}
