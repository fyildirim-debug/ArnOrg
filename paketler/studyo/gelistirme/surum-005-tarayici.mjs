// Sahte çekirdeğin 0.0.5 "tarayıcı" uçları: düzeltme notları (bellekte) ve "Hepsini yaptır".
//   GET    /api/projeler/:pid/duzeltmeler[?durum=acik|gonderildi]
//   POST   /api/projeler/:pid/duzeltmeler            (gorsel: base64 PNG, en çok 4 MB)
//   POST   /api/projeler/:pid/duzeltmeler/gonder     açık notlar tek kurul mesajıyla #yonetim'e; birkaç saniye
//                                                     sonra CEO görevleri açar, atar ve "görevleri açtım" yazar
//   PATCH  /api/duzeltmeler/:id                      { not }
//   DELETE /api/duzeltmeler/:id
//   GET    /api/duzeltmeler/:id/gorsel               PNG
// Tohum: Sipariş Paneli'nde iki açık, bir gönderilmiş not; küçük görüntüleri burada çizilir (node:zlib ile PNG).

import { deflateSync } from "node:zlib";
import { ceviri } from "./dil.mjs";

const GORSEL_SINIRI = 4 * 1024 * 1024;
const PNG_IMZASI = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ---------------------------------------------------------------------------
// Küçük PNG çizimi (tohum notlarının ekran görüntüleri)
// ---------------------------------------------------------------------------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(tampon) {
  let c = 0xffffffff;
  for (const b of tampon) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function parca(tur, veri) {
  const uzunluk = Buffer.alloc(4);
  uzunluk.writeUInt32BE(veri.length);
  const govde = Buffer.concat([Buffer.from(tur, "ascii"), veri]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(govde));
  return Buffer.concat([uzunluk, govde, crc]);
}

/** Dikdörtgenlerden PNG: [x, y, g, y, "#rrggbb"] listesi, arka plan rengi */
function pngCiz(genislik, yukseklik, arkaPlan, sekiller) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const ham = Buffer.alloc((genislik * 3 + 1) * yukseklik);
  const zemin = rgb(arkaPlan);
  for (let y = 0; y < yukseklik; y++) {
    const satir = y * (genislik * 3 + 1);
    ham[satir] = 0;
    for (let x = 0; x < genislik; x++) ham.set(zemin, satir + 1 + x * 3);
  }
  for (const [sx, sy, sg, sy2, renk] of sekiller) {
    const r = rgb(renk);
    for (let y = Math.max(0, sy); y < Math.min(yukseklik, sy + sy2); y++) {
      for (let x = Math.max(0, sx); x < Math.min(genislik, sx + sg); x++) ham.set(r, y * (genislik * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(genislik, 0);
  ihdr.writeUInt32BE(yukseklik, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([PNG_IMZASI, parca("IHDR", ihdr), parca("IDAT", deflateSync(ham)), parca("IEND", Buffer.alloc(0))]);
}

/** Seçim çerçevesi (mercan, 2 px) */
const cerceve = (x, y, g, y2) => [
  [x, y, g, 2, "#f2715f"],
  [x, y + y2 - 2, g, 2, "#f2715f"],
  [x, y, 2, y2, "#f2715f"],
  [x + g - 2, y, 2, y2, "#f2715f"],
];

const GORSELLER = {
  // Telefonda sağa taşan "Ödemeye geç" düğmesi
  odeme: () =>
    pngCiz(360, 150, "#f6f4f0", [
      [16, 18, 200, 10, "#2b2b30"],
      [16, 36, 130, 8, "#9a958e"],
      [24, 70, 352, 48, "#e8553f"],
      [120, 88, 140, 10, "#fff4ef"],
      ...cerceve(20, 66, 360, 56),
    ]),
  // Tıklanmayan "Stokta olanlar" etiketi
  filtre: () =>
    pngCiz(320, 120, "#ffffff", [
      [16, 22, 14, 14, "#3d3d44"],
      [18, 24, 10, 10, "#ffffff"],
      [40, 25, 120, 8, "#3d3d44"],
      [16, 52, 14, 14, "#3d3d44"],
      [18, 54, 10, 10, "#ffffff"],
      [40, 55, 150, 8, "#3d3d44"],
      [16, 82, 14, 14, "#3d3d44"],
      [40, 85, 96, 8, "#3d3d44"],
      ...cerceve(10, 76, 136, 26),
    ]),
  // Menüdeki "İletişim" bağlantısı
  menu: () =>
    pngCiz(360, 90, "#121216", [
      [16, 38, 56, 8, "#d9d4cc"],
      [96, 38, 64, 8, "#d9d4cc"],
      [184, 38, 48, 8, "#d9d4cc"],
      [256, 38, 72, 8, "#ffffff"],
      ...cerceve(248, 28, 88, 28),
    ]),
};

// ---------------------------------------------------------------------------

/** Çekirdeğin gonderimMetni ile aynı biçim */
function gonderimMetni(notlar) {
  const n = notlar.length;
  const bas = ceviri(
    n === 1
      ? "Tarayıcıda 1 düzeltme notu bıraktım. Bunun için görev aç (kabul ölçütüyle), uygun çalışana ata ve başlat."
      : `Tarayıcıda ${n} düzeltme notu bıraktım. Her biri için görev aç (kabul ölçütüyle), uygun çalışana ata ve başlat.`,
    n === 1
      ? "I left 1 correction note in the browser. Open a task for it (with acceptance criteria), assign it to the right employee and start it."
      : `I left ${n} correction notes in the browser. Open a task for each (with acceptance criteria), assign it to the right employee and start it.`,
  );
  const tek = (m) =>
    m
      .split(/\r?\n/)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" / ");
  const kisalt = (m, u) => (m.length > u ? `${m.slice(0, u - 1)}…` : m);
  const satirlar = notlar.map((d, i) => {
    const p = [d.adres];
    if (d.secici) p.push(`${ceviri("öğe", "element")}: ${kisalt(d.secici, 300)}`);
    if (d.ogeMetni) p.push(`"${kisalt(tek(d.ogeMetni), 120).replace(/"/g, "'")}"`);
    if (d.gorunum) p.push(`${ceviri("görünüm", "viewport")}: ${d.gorunum.genislik}×${d.gorunum.yukseklik}`);
    p.push(`${ceviri("not", "note")}: ${tek(d.not)}`);
    if (d.gorsel) p.push(`${ceviri("ekran görüntüsü", "screenshot")}: ${d.gorsel}`);
    return `${i + 1}) ${p.join(" · ")}`;
  });
  return `${bas}\n\n${satirlar.join("\n")}`;
}

export function kur(c) {
  const { rota, db, yay, Hata, simdi, yeniKimlik, proje, projeGerekli, projeAjanlari, mesajEkle, akisEkle, projeYay } = c;
  /** Not kimliği → PNG */
  const gorseller = new Map();
  db.duzeltmeler = [];

  const yayinla = (d) => yay({ tur: "duzeltme.guncellendi", projeId: d.projeId, duzeltme: d }, d.projeId);
  const bul = (id) => {
    const d = db.duzeltmeler.find((x) => x.id === id);
    if (!d) throw new Hata(404, ceviri("Düzeltme notu bulunamadı.", "Correction note not found."));
    return d;
  };
  const gorselYolu = (pid, id) => `${proje(pid)?.yol ?? "/home/furkan/ArnOrg/proje"}/.arnorg/duzeltmeler/${id}.png`;

  function ekle(pid, alanlar, png, zaman = simdi()) {
    const id = yeniKimlik("dz");
    const d = {
      id,
      projeId: pid,
      adres: alanlar.adres,
      sayfaBasligi: alanlar.sayfaBasligi ?? "",
      secici: alanlar.secici ?? null,
      ogeMetni: alanlar.ogeMetni ?? null,
      ogeHtml: alanlar.ogeHtml ?? null,
      stiller: alanlar.stiller ?? null,
      kutu: alanlar.kutu ?? null,
      gorunum: alanlar.gorunum ?? null,
      not: alanlar.not,
      gorsel: png ? gorselYolu(pid, id) : null,
      durum: alanlar.durum ?? "acik",
      zaman,
      gonderimZamani: alanlar.gonderimZamani ?? null,
    };
    if (png) gorseller.set(id, png);
    db.duzeltmeler.push(d);
    return d;
  }

  // -------------------------------------------------------------------------
  // Tohum: Sipariş Paneli
  // -------------------------------------------------------------------------
  const dk = (n) => new Date(Date.now() - n * 60_000).toISOString();
  if (proje("siparis-paneli")) {
    ekle(
      "siparis-paneli",
      {
        adres: "http://localhost:5173/",
        sayfaBasligi: ceviri("Sipariş Paneli", "Order Panel"),
        secici: "header > nav.ust-menu > a:nth-of-type(4)",
        ogeMetni: ceviri("İletişim", "Contact"),
        ogeHtml: `<a href="/iletisim" class="menu-baglanti">${ceviri("İletişim", "Contact")}</a>`,
        stiller: { yaziTipi: '"Inter", system-ui, sans-serif', boyut: "14px", renk: "rgb(255, 255, 255)", arkaPlan: "rgb(18, 18, 22)" },
        kutu: { x: 612, y: 22, genislik: 72, yukseklik: 20, sayfaX: 612, sayfaY: 22 },
        gorunum: { genislik: 1280, yukseklik: 800 },
        not: ceviri("Menüdeki İletişim bağlantısı 404 veriyor.", "The Contact link in the menu returns a 404."),
        durum: "gonderildi",
        gonderimZamani: dk(140),
      },
      GORSELLER.menu(),
      dk(150),
    );
    ekle(
      "siparis-paneli",
      {
        adres: "http://localhost:5173/sepet",
        sayfaBasligi: ceviri("Sepet · Sipariş Paneli", "Cart · Order Panel"),
        secici: "main > section.sepet-ozet > button.odeme",
        ogeMetni: ceviri("Ödemeye geç", "Go to checkout"),
        ogeHtml: `<button class="odeme" type="submit">${ceviri("Ödemeye geç", "Go to checkout")}</button>`,
        stiller: { yaziTipi: '"Inter", system-ui, sans-serif', boyut: "15px", renk: "rgb(255, 244, 239)", arkaPlan: "rgb(232, 85, 63)" },
        kutu: { x: 24, y: 610, genislik: 352, yukseklik: 48, sayfaX: 24, sayfaY: 1410 },
        gorunum: { genislik: 390, yukseklik: 844 },
        not: ceviri("Telefonda düğme sağ kenardan taşıyor; tam genişlik olmalı ve kenarlarda 16 px boşluk kalmalı.", "On phones the button overflows the right edge; it should be full width with 16 px on each side."),
      },
      GORSELLER.odeme(),
      dk(38),
    );
    ekle(
      "siparis-paneli",
      {
        adres: "http://localhost:5173/urunler?kategori=kahve",
        sayfaBasligi: ceviri("Ürünler · Sipariş Paneli", "Products · Order Panel"),
        secici: "#filtre > label:nth-of-type(3)",
        ogeMetni: ceviri("Stokta olanlar", "In stock only"),
        ogeHtml: `<label><input type="checkbox" name="stok"> ${ceviri("Stokta olanlar", "In stock only")}</label>`,
        stiller: { yaziTipi: '"Inter", system-ui, sans-serif', boyut: "14px", renk: "rgb(61, 61, 68)", arkaPlan: "rgb(255, 255, 255)" },
        kutu: { x: 240, y: 318, genislik: 136, yukseklik: 26, sayfaX: 240, sayfaY: 318 },
        gorunum: { genislik: 1280, yukseklik: 800 },
        not: ceviri("Etikete tıklayınca kutu işaretlenmiyor; yalnız küçük kareye basınca oluyor.", "Clicking the label doesn't tick the box; only the little square works."),
      },
      GORSELLER.filtre(),
      dk(12),
    );
  }

  // -------------------------------------------------------------------------
  // Uçlar
  // -------------------------------------------------------------------------
  rota("GET", "/api/projeler/:pid/duzeltmeler", ({ p, q }) => {
    projeGerekli(p.pid);
    const durum = q.get("durum");
    return db.duzeltmeler.filter((d) => d.projeId === p.pid && (durum !== "acik" && durum !== "gonderildi" ? true : d.durum === durum));
  });

  rota("POST", "/api/projeler/:pid/duzeltmeler", ({ p, govde }) => {
    projeGerekli(p.pid);
    const not = String(govde?.not ?? "").trim();
    if (!not) throw new Hata(400, ceviri("Not boş olamaz.", "The note cannot be empty."));
    let adres = String(govde?.adres ?? "").trim();
    try {
      const u = new URL(adres);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      throw new Hata(400, ceviri("Adres http:// ya da https:// ile başlayan geçerli bir adres olmalı.", "The address must be a valid http:// or https:// URL."));
    }
    let png = null;
    if (govde?.gorsel) {
      const b64 = String(govde.gorsel).replace(/^data:image\/png;base64,/i, "");
      if (Math.floor((b64.length * 3) / 4) > GORSEL_SINIRI) throw new Hata(413, ceviri("Görsel çok büyük; en çok 4 MB olabilir.", "The image is too large; the limit is 4 MB."));
      png = Buffer.from(b64, "base64");
      if (!png.subarray(0, 8).equals(PNG_IMZASI)) throw new Hata(400, ceviri("Görsel PNG değil.", "The image is not a PNG."));
    }
    const d = ekle(
      p.pid,
      {
        adres,
        sayfaBasligi: govde.sayfaBasligi,
        secici: govde.secici || null,
        ogeMetni: govde.ogeMetni || null,
        ogeHtml: govde.ogeHtml ? String(govde.ogeHtml).slice(0, 2000) : null,
        stiller: govde.stiller ?? null,
        kutu: govde.kutu ?? null,
        gorunum: govde.gorunum ?? null,
        not,
      },
      png,
    );
    yayinla(d);
    return d;
  });

  rota("PATCH", "/api/duzeltmeler/:id", ({ p, govde }) => {
    const d = bul(p.id);
    if (d.durum !== "acik") throw new Hata(409, ceviri("Gönderilmiş not değiştirilemez.", "A note that was already sent can't be changed."));
    const not = String(govde?.not ?? "").trim();
    if (!not) throw new Hata(400, ceviri("Not boş olamaz.", "The note cannot be empty."));
    d.not = not;
    yayinla(d);
    return d;
  });

  rota("DELETE", "/api/duzeltmeler/:id", ({ p }) => {
    const d = bul(p.id);
    db.duzeltmeler = db.duzeltmeler.filter((x) => x.id !== d.id);
    if (d.durum === "acik") gorseller.delete(d.id);
    yay({ tur: "duzeltme.silindi", projeId: d.projeId, id: d.id }, d.projeId);
    return { tamam: true };
  });

  rota("GET", "/api/duzeltmeler/:id/gorsel", ({ p }) => {
    const png = gorseller.get(bul(p.id).id);
    if (!png) throw new Hata(404, ceviri("Görüntü bulunamadı.", "Screenshot not found."));
    return { __ham: png };
  });

  rota("POST", "/api/projeler/:pid/duzeltmeler/gonder", ({ p }) => {
    projeGerekli(p.pid);
    const acik = db.duzeltmeler.filter((d) => d.projeId === p.pid && d.durum === "acik");
    if (!acik.length) throw new Hata(400, ceviri("Gönderilecek açık not yok.", "There are no open notes to send."));
    const mesaj = mesajEkle(p.pid, "yonetim", "kurul", gonderimMetni(acik));
    const zaman = simdi();
    for (const d of acik) {
      d.durum = "gonderildi";
      d.gonderimZamani = zaman;
      yayinla(d);
    }
    ceoGorevleriAcar(p.pid, acik);
    return { mesaj, gonderilen: acik };
  });

  /** CEO yazıyor görünür; birkaç saniye sonra her not için görev açar, atar, başlatır ve #yonetim'e yazar */
  function ceoGorevleriAcar(pid, notlar) {
    const ekip = projeAjanlari(pid);
    const ceo = ekip.find((a) => a.rol === "ceo");
    if (!ceo) return;
    const yaziyor = (y) => yay({ tur: "kanal.yaziyor", projeId: pid, kanal: "yonetim", ajanId: ceo.id, ad: ceo.ad, yaziyor: y }, pid);
    yaziyor(true);
    setTimeout(() => {
      const frontend = ekip.find((a) => a.rol === "frontend") ?? ekip.find((a) => a.rol !== "ceo") ?? ceo;
      const kodlar = [];
      for (const d of notlar) {
        const no = Math.max(0, ...db.gorevler.filter((g) => g.projeId === pid).map((g) => g.no)) + 1;
        const yol = (() => {
          try {
            return new URL(d.adres).pathname;
          } catch {
            return d.adres;
          }
        })();
        const g = {
          id: yeniKimlik("g"),
          projeId: pid,
          no,
          kod: `T-${no}`,
          baslik: `${yol} · ${d.not.length > 64 ? `${d.not.slice(0, 63)}…` : d.not}`,
          aciklama: `${ceviri("Kurulun tarayıcı notu", "Board's browser note")}: ${d.not}\n${d.secici ? `${ceviri("Öğe", "Element")}: ${d.secici}\n` : ""}${d.gorsel ? `${ceviri("Ekran görüntüsü", "Screenshot")}: ${d.gorsel}` : ""}`,
          kabulOlcutu: ceviri(`${d.adres} adresinde not edilen sorun giderildi; ${d.gorunum ? `${d.gorunum.genislik} px genişlikte ` : ""}elle denendi.`, `The issue noted at ${d.adres} is fixed and checked by hand${d.gorunum ? ` at ${d.gorunum.genislik} px wide` : ""}.`),
          durum: "calisiliyor",
          atananId: frontend.id,
          bagimliliklar: [],
          etiket: ceviri("tarayıcı", "browser"),
          olusturanId: ceo.id,
          olusturma: simdi(),
          guncelleme: simdi(),
        };
        db.gorevler.push(g);
        kodlar.push(g.kod);
        yay({ tur: "gorev.guncellendi", gorev: g }, pid);
      }
      yaziyor(false);
      const liste = kodlar.join(", ");
      const metin = ceviri(
        `Görevleri açtım: ${liste}. Her birine kabul ölçütü yazdım, ${frontend.ad} ile başlattık; bittiğinde ekran görüntüsüyle haber vereceğim.`,
        `I've opened the tasks: ${liste}. Each has acceptance criteria and ${frontend.ad} has started on them; I'll report back with screenshots when they're done.`,
      );
      mesajEkle(pid, "yonetim", ceo.id, metin);
      akisEkle(ceo.id, { tur: "asistan", metin });
      projeYay(pid);
    }, 3200);
  }
}
