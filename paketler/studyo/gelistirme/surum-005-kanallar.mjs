// Sahte çekirdeğin 0.0.5 "kanallar" uçları: kurulun kurduğu kanallar (kur, güncelle, sil), üyeler ve serbest konuşma
// (başlat/durdur). Konuşma sürerken birkaç saniyede bir sıradaki üye "yazıyor" görünür ve sahte bir mesaj yazar
// (anılan üye önce, yoksa üye listesinde gönderenden sonraki üye); durdurunca kesilir. Kurulun kanala yazdığı mesaja
// anılan üyeler, anılan yoksa sıradaki üye bir kez yanıt verir. Tohumda geçmiş bir konuşmasıyla bir kurul kanalı var.
//
//   kur(c): sahte-sunucu.mjs'teki rota, rotalar, db ve yardımcılarla çağrılır (surum-004-*.mjs deseni)

import { ceviri } from "./dil.mjs";

const PROJE = "siparis-paneli";
/** Çekirdekteki gibi: sistem kanallarının kimlikleri ve İngilizce görünen adları kurulun kanalına verilemez */
const AYRILMIS = ["genel", "yonetim", "muhendislik", "toplanti", "general", "ceo", "engineering", "meetings"];
const DESEN = /^[\p{L}\p{N}_-]{1,40}$/u;
/** Sırası gelen üyenin "yazıyor"dan mesajına kadar geçen süre (ms) */
const YAZMA = { en: 2600, cok: 4200 };

const once = (dk) => new Date(Date.now() - dk * 60_000).toISOString();
const adDuzelt = (ham) => String(ham ?? "").trim().replace(/^#+/, "").trim().replace(/\s+/g, "-").replace(/İ/g, "i").toLowerCase();

/** Sırayla kullanılan sahte konuşma: rol ve konuya uygun kısa yanıtlar; bazıları bir üyeye söz verir */
const SOZLER = ceviri(
  [
    "Boş durumda tek cümle ve tek eylem yeter: “İlk siparişi oluştur”.",
    "Katılıyorum. Mercanı yalnız birincil eyleme bırakalım, gerisi kıl çizgi.",
    "@Ece filtre çubuğu sipariş yokken gizlensin mi, yoksa pasif mi dursun?",
    "Pasif dursun; yer değiştirince göz kayıyor. Sayılar tabular kalsın.",
    "API tarafında boş liste için ayrı alan gerekmez, `toplam: 0` yetiyor.",
    "O zaman yükleniyor ve hata durumlarını da aynı yerleşimde tutalım.",
    "@Kerem imleçli sayfalamada son sayfayı nasıl anlıyoruz?",
    "`sonrakiImlec` null gelince son sayfadayız; ekranda “daha fazla” düğmesi kalkar.",
    "Dar ekranda tablo yerine satır kartı değil, aynı satırın sıkışık hâli olsun.",
    "Uygun. Taslağı notlara yazıp T-26'ya bağlıyorum.",
  ],
  [
    "One sentence and one action is enough for the empty state: “Create your first order”.",
    "Agreed. Let's keep coral for the primary action only; the rest stays hairline.",
    "@Ece should the filter bar hide when there are no orders, or stay disabled?",
    "Keep it disabled; moving it around makes the eye jump. Numbers stay tabular.",
    "The API doesn't need a separate field for an empty list; `toplam: 0` is enough.",
    "Then let's keep loading and error states in the same layout too.",
    "@Kerem with cursor pagination, how do we know we're on the last page?",
    "When `sonrakiImlec` comes back null we're on the last page, and the “more” button goes away.",
    "On narrow screens, no row cards in place of the table — just a tighter version of the same row.",
    "Works for me. I'll write the draft into the notes and link it to T-26.",
  ],
);

export function kur(c) {
  const { rota, rotalar, db, yay, mesajEkle, ajanBul, projeGerekli, Hata } = c;
  /** Kanal → bekleyen konuşmacı (aynı anda en çok bir) */
  const bekleyenler = new Map();
  let sozNo = 0;

  const anahtar = (pid, ad) => `${pid}\n${ad}`;
  const kanalBul = (pid, ad) => (db.kanallar[pid] ?? []).find((k) => k.ad === ad);
  const mesajSayisi = (pid, ad) => db.mesajlar.filter((m) => m.projeId === pid && m.kanal === ad).length;
  const ozet = (pid, k) => ({ ...k, mesajSayisi: mesajSayisi(pid, k.ad) });
  const kanalYay = (pid, k) => yay({ tur: "kanal.guncellendi", projeId: pid, kanal: ozet(pid, k) }, pid);
  const yaziyor = (pid, ad, ajanId, acik) => {
    const a = ajanBul(ajanId);
    if (a) yay({ tur: "kanal.yaziyor", projeId: pid, kanal: ad, ajanId, ad: a.ad, yaziyor: acik }, pid);
  };
  const ozelKanal = (pid, ham) => {
    projeGerekli(pid);
    const k = kanalBul(pid, decodeURIComponent(ham));
    if (!k) throw new Hata(404, ceviri("Kanal bulunamadı.", "Channel not found."));
    if (!k.ozel) throw new Hata(409, ceviri("Yalnız kurulun kurduğu kanallar düzenlenip silinebilir; ArnOrg'un ve ajanların kanalları olduğu gibi kalır.", "Only channels the board created can be edited or deleted; ArnOrg's and the agents' channels stay as they are."));
    return k;
  };
  const uyeleriDogrula = (pid, uyeler) => {
    const temiz = [...new Set((Array.isArray(uyeler) ? uyeler : []).map((u) => String(u).trim()).filter(Boolean))];
    if (!temiz.length) throw new Hata(400, ceviri("Kanala en az bir üye seçin.", "Choose at least one member for the channel."));
    if (temiz.some((id) => ajanBul(id)?.projeId !== pid)) throw new Hata(400, ceviri("Üyeler bu projenin çalışanlarından seçilmeli.", "Members must be employees of this project."));
    return temiz;
  };

  /** Çekirdekteki kural: anılan üye (gönderen hariç), yoksa üye listesinde `sonra`dan sonraki üye (döngüsel) */
  const siradaki = (k, gonderen, anilanlar = [], sonra = gonderen) => {
    const uyeler = k.uyeler.filter((id) => ajanBul(id));
    const aday = (id) => id !== gonderen && uyeler.includes(id);
    const anilan = anilanlar.find(aday);
    if (anilan) return anilan;
    const i = sonra ? uyeler.indexOf(sonra) : -1;
    for (let adim = 1; adim <= uyeler.length; adim++) {
      const id = uyeler[(i + adim) % uyeler.length];
      if (aday(id)) return id;
    }
    return null;
  };
  const sonKonusan = (pid, k) =>
    db.mesajlar
      .filter((m) => m.projeId === pid && m.kanal === k.ad)
      .reverse()
      .find((m) => k.uyeler.includes(m.gonderenId))?.gonderenId ?? null;

  const iptal = (pid, ad) => {
    const b = bekleyenler.get(anahtar(pid, ad));
    if (!b) return;
    clearTimeout(b.zamanlayici);
    bekleyenler.delete(anahtar(pid, ad));
    yaziyor(pid, ad, b.ajanId, false);
  };

  /** Sıradaki üye "yazıyor" görünür, birkaç saniye sonra yazar; konuşma sürüyorsa zincir onun mesajından sürer */
  const planla = (pid, k, ajanId) => {
    iptal(pid, k.ad);
    if (!ajanId) return;
    yaziyor(pid, k.ad, ajanId, true);
    const zamanlayici = setTimeout(() => {
      bekleyenler.delete(anahtar(pid, k.ad));
      if (!kanalBul(pid, k.ad) || !ajanBul(ajanId)) return;
      yaziyor(pid, k.ad, ajanId, false);
      const m = mesajEkle(pid, k.ad, ajanId, SOZLER[sozNo++ % SOZLER.length]);
      kanalYay(pid, k);
      if (k.konusma === "suruyor") planla(pid, k, siradaki(k, ajanId, m.anilanlar));
    }, YAZMA.en + Math.random() * (YAZMA.cok - YAZMA.en));
    bekleyenler.set(anahtar(pid, k.ad), { ajanId, zamanlayici });
  };

  const durdur = (pid, k) => {
    iptal(pid, k.ad);
    if (k.konusma !== "suruyor") return;
    k.konusma = "durdu";
    kanalYay(pid, k);
  };

  // -------------------------------------------------------------------------
  // Tohum: Sipariş Paneli'nde tasarım üzerine geçmiş bir konuşması olan kurul kanalı
  // -------------------------------------------------------------------------

  const tohum = {
    ad: ceviri("tasarım-masası", "design-desk"),
    aciklama: ceviri("Sipariş ekranlarının tasarımı", "Design of the order screens"),
    ozel: true,
    uyeler: ["selin", "ece", "kerem"],
    konusma: "durdu",
    konu: ceviri("Sipariş listesinin boş durumu", "The order list's empty state"),
    konusmaBaslangic: once(46),
    olusturma: once(60 * 26),
  };
  db.kanallar[PROJE] = [...(db.kanallar[PROJE] ?? []), tohum];
  const gecmis = ceviri(
    [
      ["kurul", 46, "Sipariş listesinin boş durumu"],
      ["selin", 45, "İlk izlenim önemli: boş liste bir hata gibi değil, başlangıç gibi görünmeli."],
      ["ece", 44, "@Kerem boş liste için API'den ayrı bir işaret gelecek mi?", ["kerem"]],
      ["kerem", 43, "Gerek yok; `toplam: 0` ve boş dizi yeterli. Ayrı alan sözleşmeyi şişirir."],
      ["selin", 42, "O hâlde tek cümle, tek düğme. Taslağı Ece'yle eşleyelim."],
    ],
    [
      ["kurul", 46, "The order list's empty state"],
      ["selin", 45, "First impressions matter: an empty list should look like a start, not an error."],
      ["ece", 44, "@Kerem will the API send a separate flag for an empty list?", ["kerem"]],
      ["kerem", 43, "No need; `toplam: 0` and an empty array are enough. A separate field bloats the contract."],
      ["selin", 42, "Then one sentence, one button. Let's pair on the draft, Ece."],
    ],
  );
  gecmis.forEach(([gonderenId, dk, metin, anilanlar = []], i) => {
    const gonderenAd = gonderenId === "kurul" ? ceviri("Yönetim kurulu", "Board") : (ajanBul(gonderenId)?.ad ?? gonderenId);
    db.mesajlar.push({ id: `mk${i + 1}`, projeId: PROJE, kanal: tohum.ad, gonderenId, gonderenAd, metin, anilanlar, zaman: once(dk) });
  });

  // -------------------------------------------------------------------------
  // Uçlar
  // -------------------------------------------------------------------------

  rota("POST", "/api/projeler/:pid/kanallar", ({ p, govde }) => {
    projeGerekli(p.pid);
    const ad = adDuzelt(govde?.ad);
    if (!DESEN.test(ad)) throw new Hata(400, ceviri("Kanal adı 1–40 karakter olmalı; yalnız harf, rakam, tire ve alt çizgi.", "Channel names must be 1–40 characters: letters, digits, hyphens and underscores only."));
    if (AYRILMIS.includes(ad)) throw new Hata(409, ceviri(`#${ad} ArnOrg'un kanallarından birine ayrılmış; başka bir ad seçin.`, `#${ad} is reserved for one of ArnOrg's channels; choose another name.`));
    if (kanalBul(p.pid, ad)) throw new Hata(409, ceviri(`#${ad} adında bir kanal zaten var.`, `There is already a channel named #${ad}.`));
    const k = {
      ad,
      aciklama: String(govde?.aciklama ?? "").trim().slice(0, 300),
      ozel: true,
      uyeler: uyeleriDogrula(p.pid, govde?.uyeler),
      konusma: "durdu",
      konu: null,
      konusmaBaslangic: null,
      olusturma: new Date().toISOString(),
    };
    (db.kanallar[p.pid] ??= []).push(k);
    kanalYay(p.pid, k);
    return ozet(p.pid, k);
  });

  rota("PATCH", "/api/projeler/:pid/kanallar/:kanal", ({ p, govde }) => {
    const k = ozelKanal(p.pid, p.kanal);
    if (govde?.aciklama !== undefined) k.aciklama = String(govde.aciklama).trim().slice(0, 300);
    if (govde?.uyeler !== undefined) {
      k.uyeler = uyeleriDogrula(p.pid, govde.uyeler);
      // Sırası gelen üye çıkarıldıysa sıra bir sonrakine geçer; iki üyeden aza düşünce konuşma durur
      const b = bekleyenler.get(anahtar(p.pid, k.ad));
      if (b && !k.uyeler.includes(b.ajanId)) {
        if (k.uyeler.length < 2) durdur(p.pid, k);
        else planla(p.pid, k, siradaki(k, null, [], sonKonusan(p.pid, k)));
      }
    }
    kanalYay(p.pid, k);
    return ozet(p.pid, k);
  });

  rota("DELETE", "/api/projeler/:pid/kanallar/:kanal", ({ p }) => {
    const k = ozelKanal(p.pid, p.kanal);
    iptal(p.pid, k.ad);
    db.kanallar[p.pid] = db.kanallar[p.pid].filter((x) => x !== k);
    db.mesajlar = db.mesajlar.filter((m) => !(m.projeId === p.pid && m.kanal === k.ad));
    yay({ tur: "kanal.silindi", projeId: p.pid, kanal: k.ad }, p.pid);
    return { tamam: true };
  });

  rota("POST", "/api/projeler/:pid/kanallar/:kanal/konusma", ({ p, govde }) => {
    const k = ozelKanal(p.pid, p.kanal);
    if (govde?.islem === "durdur") {
      durdur(p.pid, k);
      return ozet(p.pid, k);
    }
    if (govde?.islem !== "baslat") throw new Hata(400, ceviri("Geçersiz istek: islem baslat ya da durdur olmalı.", "Invalid request: islem must be baslat or durdur."));
    if (k.uyeler.filter((id) => ajanBul(id)).length < 2) throw new Hata(409, ceviri("Serbest konuşma için kanalda en az iki üye olmalı.", "An open conversation needs at least two members in the channel."));
    const konu = String(govde?.konu ?? "").trim();
    Object.assign(k, { konusma: "suruyor", konusmaBaslangic: new Date().toISOString() }, konu ? { konu } : {});
    kanalYay(p.pid, k);
    if (konu) {
      // Konu kanala kurulun mesajı olarak düşer; anılan üye, yoksa sıradaki üye ilk sözü alır
      const m = mesajEkle(p.pid, k.ad, "kurul", konu);
      planla(p.pid, k, siradaki(k, null, m.anilanlar, sonKonusan(p.pid, k)));
    } else if (!bekleyenler.has(anahtar(p.pid, k.ad))) {
      planla(p.pid, k, siradaki(k, null, [], sonKonusan(p.pid, k)));
    }
    return ozet(p.pid, k);
  });

  // Kurulun kendi kanalına yazdığı mesaj: anılan üyeler (yoksa sıradaki üye) yanıt verir; diğer kanallar eski işleyicide
  const mesajRotasi = rotalar.find((r) => r.yontem === "POST" && r.desen.test("/api/projeler/x/kanallar/y/mesajlar"));
  const eskiMesaj = mesajRotasi.isleyici;
  mesajRotasi.isleyici = (istek) => {
    const k = kanalBul(istek.p.pid, decodeURIComponent(istek.p.kanal));
    if (!k?.ozel) return eskiMesaj(istek);
    projeGerekli(istek.p.pid);
    const metin = String(istek.govde?.metin ?? "").trim();
    if (!metin) throw new Hata(400, ceviri("Mesaj boş olamaz.", "The message can't be empty."));
    const m = mesajEkle(istek.p.pid, k.ad, "kurul", metin);
    kanalYay(istek.p.pid, k);
    const anilanUye = m.anilanlar.find((id) => k.uyeler.includes(id));
    // Konuşma sürerken bir üye yazıyorsa kurulun mesajı ondan sonraki konuşmacının önüne düşer
    if (!anilanUye && k.konusma === "suruyor" && bekleyenler.has(anahtar(istek.p.pid, k.ad))) return m;
    planla(istek.p.pid, k, anilanUye ?? siradaki(k, null, [], sonKonusan(istek.p.pid, k)));
    return m;
  };

  // Mesaiyi durdur projedeki konuşmaları da durdurur; işten çıkarılan ajan üyeliklerden düşer
  const durdurRotasi = rotalar.find((r) => r.yontem === "POST" && r.desen.test("/api/projeler/x/durdur"));
  if (durdurRotasi) {
    const eskiDurdur = durdurRotasi.isleyici;
    durdurRotasi.isleyici = (istek) => {
      for (const k of db.kanallar[istek.p.pid] ?? []) if (k.ozel) durdur(istek.p.pid, k);
      return eskiDurdur(istek);
    };
  }
  const silRotasi = rotalar.find((r) => r.yontem === "DELETE" && r.desen.test("/api/ajanlar/x"));
  const eskiSil = silRotasi.isleyici;
  silRotasi.isleyici = (istek) => {
    const a = ajanBul(decodeURIComponent(istek.p.aid));
    const sonuc = eskiSil(istek);
    if (a) {
      for (const k of db.kanallar[a.projeId] ?? []) {
        if (!k.ozel || !k.uyeler.includes(a.id)) continue;
        k.uyeler = k.uyeler.filter((id) => id !== a.id);
        if (bekleyenler.get(anahtar(a.projeId, k.ad))?.ajanId === a.id) planla(a.projeId, k, siradaki(k, null, [], sonKonusan(a.projeId, k)));
        if (k.konusma === "suruyor" && k.uyeler.length < 2) durdur(a.projeId, k);
        kanalYay(a.projeId, k);
      }
    }
    return sonuc;
  };
}
