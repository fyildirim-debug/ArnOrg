// Sahte çekirdeğin 0.0.8 mesaj ekleri: kurul sohbette görsel ve dosya gönderir, CEO ve çalışanlar paylaşır (bellekte).
//   POST   /api/projeler/:pid/ekler   {ad, veri: base64}   → MesajEki (görsel, PDF, metin; arşiv ve çalıştırılabilir 415)
//   DELETE /api/ekler/:id                                  gönderilmemiş taslak
//   GET    /api/ekler/:id                                  ekin baytları
//   POST   /api/projeler/:pid/kanallar/:kanal/mesajlar    {metin, ekler?}: ekli mesajın metni boş olabilir
// Kurul #yonetim'e ekli mesaj yazınca Ada (CEO) görseli anlatan kısa bir yanıt verir, ardından düzeltilmiş ekranın
// görüntüsünü dosya_paylas ile paylaşır.
//
//   kur(c): sahte-sunucu.mjs'teki rota, rotalar, db ve yardımcılarla çağrılır (surum-007-*.mjs deseni)
//
// Tohum (Sipariş Paneli): CEO sohbetinde kurulun ekran görüntüsü, Ada'nın yanıtı ve paylaştığı uygulama görüntüsüyle test
// raporu; #genel'de Kerem'in paylaştığı PDF ve CSV. Görüntüler burada çizilir (node:zlib ile PNG).

import { deflateSync } from "node:zlib";
import { ceviri } from "./dil.mjs";
import { V } from "./tohum.mjs";

const OFIS = "siparis-paneli";
const SINIR = 10 * 1024 * 1024;
const PNG_IMZASI = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ---------------------------------------------------------------------------
// PNG çizimi: dikdörtgenlerden, ölçekli (sahte ekran görüntüleri)
// ---------------------------------------------------------------------------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(t) {
  let c = 0xffffffff;
  for (const b of t) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function parca(tur, veri) {
  const u = Buffer.alloc(4);
  u.writeUInt32BE(veri.length);
  const g = Buffer.concat([Buffer.from(tur, "ascii"), veri]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(g));
  return Buffer.concat([u, g, c]);
}
function pngCiz(genislik, yukseklik, zemin, sekiller) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const satir = genislik * 3 + 1;
  const ham = Buffer.alloc(satir * yukseklik);
  const z = rgb(zemin);
  for (let y = 0; y < yukseklik; y++) for (let x = 0; x < genislik; x++) ham.set(z, y * satir + 1 + x * 3);
  for (const [sx, sy, sg, sh, renk] of sekiller) {
    const r = rgb(renk);
    for (let y = Math.max(0, sy); y < Math.min(yukseklik, sy + sh); y++) for (let x = Math.max(0, sx); x < Math.min(genislik, sx + sg); x++) ham.set(r, y * satir + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(genislik, 0);
  ihdr.writeUInt32BE(yukseklik, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([PNG_IMZASI, parca("IHDR", ihdr), parca("IDAT", deflateSync(ham)), parca("IEND", Buffer.alloc(0))]);
}

/** Sipariş Paneli'nin sipariş listesi ekranı; bozuk: tarih sütunu taşar ve tutar kayar */
function siparisEkrani(bozuk) {
  const G = 960;
  const Y = 600;
  const s = [
    // üst çubuk ve yan menü
    [0, 0, G, 56, "#1d2433"],
    [24, 20, 120, 16, "#f4f1ea"],
    [G - 156, 18, 132, 20, "#e8553f"],
    [0, 56, 200, Y - 56, "#f0ede6"],
    ...[0, 1, 2, 3, 4].map((i) => [24, 88 + i * 40, i === 1 ? 152 : 120, 14, i === 1 ? "#1d2433" : "#9a958e"]),
    // başlık ve süzgeçler
    [232, 84, 260, 22, "#1d2433"],
    [232, 120, 96, 26, "#ffffff"],
    [338, 120, 96, 26, "#ffffff"],
    [444, 120, 120, 26, "#e8553f"],
    // tablo başlığı
    [232, 168, 704, 36, "#e7e3da"],
    ...[0, 1, 2, 3].map((i) => [248 + i * 176, 182, 80, 10, "#5b5750"]),
  ];
  for (let i = 0; i < 8; i++) {
    const y = 212 + i * 44;
    s.push([232, y, 704, 40, i % 2 ? "#faf8f4" : "#ffffff"]);
    s.push([248, y + 15, 92, 10, "#1d2433"]);
    s.push([424, y + 15, 120, 10, "#5b5750"]);
    // tarih sütunu: bozukta yan sütuna taşar
    s.push([600, y + 15, bozuk && i % 3 === 1 ? 210 : 104, 10, bozuk && i % 3 === 1 ? "#c2410c" : "#5b5750"]);
    s.push([bozuk && i % 3 === 1 ? 818 : 776, y + 15, 72, 10, "#1d2433"]);
  }
  if (bozuk) {
    // kurulun işaretlediği bölge
    for (const [x, y, g, h] of [
      [588, 250, 316, 4],
      [588, 390, 316, 4],
      [588, 250, 4, 144],
      [900, 250, 4, 144],
    ])
      s.push([x, y, g, h, "#e8553f"]);
  }
  return pngCiz(G, Y, "#ffffff", s);
}

/** Tek sayfalık, metinli küçük PDF (xref uzaklıkları hesaplanır) */
function pdfYap(satirlar) {
  const akis = `BT /F1 13 Tf 56 760 Td 18 TL ${satirlar.map((s) => `(${s.replace(/[()\\]/g, "")}) Tj T*`).join(" ")} ET`;
  const nesneler = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(akis, "latin1")} >>\nstream\n${akis}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let govde = "%PDF-1.4\n";
  const uzaklar = [];
  nesneler.forEach((n, i) => {
    uzaklar.push(Buffer.byteLength(govde, "latin1"));
    govde += `${i + 1} 0 obj\n${n}\nendobj\n`;
  });
  const xref = Buffer.byteLength(govde, "latin1");
  govde += `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n${uzaklar.map((u) => `${String(u).padStart(10, "0")} 00000 n \n`).join("")}`;
  govde += `trailer\n<< /Size ${nesneler.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(govde, "latin1");
}

// ---------------------------------------------------------------------------

const EXE_ARSIV = [
  [[0x7f, 0x45, 0x4c, 0x46], "calistirilabilir"],
  [[0x4d, 0x5a], "calistirilabilir"],
  [[0x50, 0x4b, 0x03, 0x04], "arsiv"],
  [[0x1f, 0x8b], "arsiv"],
];

/** Çekirdekteki ekTuru'nun kısa karşılığı: görsel imzası, PDF, UTF-8 metin; arşiv ve çalıştırılabilir reddedilir */
function tani(t, ad, Hata) {
  const bas = (...b) => b.every((x, i) => t[i] === x);
  const boyutu = (g, y) => (g > 0 && y > 0 ? { genislik: g, yukseklik: y } : {});
  if (bas(0x89, 0x50, 0x4e, 0x47)) return { tur: "gorsel", mime: "image/png", uzanti: "png", ...boyutu(t.readUInt32BE(16), t.readUInt32BE(20)) };
  if (bas(0xff, 0xd8, 0xff)) return { tur: "gorsel", mime: "image/jpeg", uzanti: "jpg" };
  if (t.toString("latin1", 0, 4) === "GIF8") return { tur: "gorsel", mime: "image/gif", uzanti: "gif", ...boyutu(t.readUInt16LE(6), t.readUInt16LE(8)) };
  if (t.toString("latin1", 0, 4) === "RIFF" && t.toString("latin1", 8, 12) === "WEBP") return { tur: "gorsel", mime: "image/webp", uzanti: "webp" };
  for (const [imza, ret] of EXE_ARSIV) {
    if (bas(...imza)) {
      throw new Hata(
        415,
        ret === "arsiv"
          ? ceviri("Arşiv dosyaları (zip, tar, 7z, rar; docx ve xlsx de zip'tir) eklenemez; dosyaları tek tek ekleyin.", "Archives (zip, tar, 7z, rar; docx and xlsx are zips too) can't be attached; attach the files one by one.")
          : ceviri("Çalıştırılabilir dosyalar eklenemez.", "Executable files can't be attached."),
      );
    }
  }
  if (t.subarray(0, 1024).includes("%PDF-")) return { tur: "pdf", mime: "application/pdf", uzanti: "pdf" };
  try {
    const metin = new TextDecoder("utf-8", { fatal: true }).decode(t);
    if (!metin.includes("\u0000")) {
      const u = /\.([a-z0-9]{1,10})$/i.exec(ad)?.[1]?.toLowerCase() ?? "txt";
      return { tur: "metin", mime: "text/plain; charset=utf-8", uzanti: u };
    }
  } catch {
    // ikili
  }
  throw new Hata(
    415,
    ceviri("Bu dosya türü desteklenmiyor; görsel (PNG, JPEG, GIF, WebP), PDF ya da metin ve kod dosyası ekleyin.", "This file type isn't supported; attach an image (PNG, JPEG, GIF, WebP), a PDF or a text or code file."),
  );
}

export function kur(c) {
  const { rota, rotalar, db, yay, ajanBul, projeAjanlari, projeGerekli, proje, Hata, simdi, yeniKimlik } = c;
  const KURUL_ADI = ceviri("Yönetim kurulu", "Board");
  /** id → { ek, bayt, projeId, mesajId } */
  const ekler = new Map();

  const ekKaydet = (pid, ad, bayt, mesajId = null) => {
    const t = tani(bayt, ad, Hata);
    const id = yeniKimlik("ek");
    const yol = `${proje(pid)?.yol ?? "/home/furkan/ArnOrg/proje"}/.arnorg/ekler/${id}.${t.uzanti}`;
    const ek = { id, ad, tur: t.tur, mime: t.mime, boyut: bayt.length, ...(t.genislik ? { genislik: t.genislik, yukseklik: t.yukseklik } : {}), yol };
    ekler.set(id, { ek, bayt, projeId: pid, mesajId });
    return ek;
  };

  /** Mesaj ekleriyle birlikte yazılır ve yayınlanır (mesajEkle'nin ekli karşılığı) */
  const ekliMesaj = (pid, kanal, gonderenId, metin, ekListesi, zaman = simdi()) => {
    const gonderenAd = gonderenId === "kurul" ? KURUL_ADI : (ajanBul(gonderenId)?.ad ?? gonderenId);
    const anilanlar = projeAjanlari(pid)
      .filter((a) => new RegExp(`@${a.ad}\\b`, "iu").test(metin))
      .map((a) => a.id);
    const m = { id: yeniKimlik("m"), projeId: pid, kanal, gonderenId, gonderenAd, metin, anilanlar, zaman, ...(ekListesi.length ? { ekler: ekListesi } : {}) };
    for (const e of ekListesi) ekler.get(e.id).mesajId = m.id;
    db.mesajlar.push(m);
    yay({ tur: "mesaj.yeni", mesaj: m }, pid);
    return m;
  };

  rota("POST", "/api/projeler/:pid/ekler", ({ p, govde }) => {
    projeGerekli(p.pid);
    const ad = String(govde?.ad ?? "").split(/[\\/]/).pop().trim() || "dosya";
    const b64 = String(govde?.veri ?? "").replace(/^data:[^,]*,/, "");
    if (!b64) throw new Hata(400, ceviri("Dosya boş.", "The file is empty."));
    const bayt = Buffer.from(b64, "base64");
    if (bayt.length > SINIR) throw new Hata(413, ceviri(`Dosya çok büyük; en çok 10 MB olabilir.`, `The file is too large; the limit is 10 MB.`));
    return ekKaydet(p.pid, ad, bayt);
  });
  rota("DELETE", "/api/ekler/:id", ({ p }) => {
    const k = ekler.get(p.id);
    if (!k) throw new Hata(404, ceviri("Ek bulunamadı.", "Attachment not found."));
    if (k.mesajId) throw new Hata(409, ceviri("Gönderilmiş ek silinemez.", "An attachment that was already sent can't be deleted."));
    ekler.delete(p.id);
    return { tamam: true };
  });
  rota("GET", "/api/ekler/:id", ({ p }) => {
    const k = ekler.get(p.id);
    if (!k) throw new Hata(404, ceviri("Ek bulunamadı.", "Attachment not found."));
    return { __ham: k.bayt };
  });

  // Kanal mesajı: ekler alanı varsa ekli mesaj; #yonetim'de Ada görseli anlatır ve düzeltilmiş ekranı paylaşır
  const mesajRotasi = rotalar.find((r) => r.yontem === "POST" && r.desen.test("/api/projeler/x/kanallar/y/mesajlar"));
  const eskiMesaj = mesajRotasi.isleyici;
  mesajRotasi.isleyici = (istek) => {
    const { p, govde } = istek;
    const idler = Array.isArray(govde?.ekler) ? govde.ekler : [];
    if (!idler.length) return eskiMesaj(istek);
    projeGerekli(p.pid);
    if (idler.length > 10) throw new Hata(400, ceviri("Bir mesaja en çok 10 ek eklenebilir.", "A message can have at most 10 attachments."));
    const liste = idler.map((id) => {
      const k = ekler.get(id);
      if (!k || k.projeId !== p.pid) throw new Hata(404, ceviri("Ek bulunamadı.", "Attachment not found."));
      if (k.mesajId) throw new Hata(409, ceviri(`"${k.ek.ad}" zaten gönderildi; yeniden ekleyin.`, `"${k.ek.ad}" was already sent; attach it again.`));
      return k.ek;
    });
    const kanal = decodeURIComponent(p.kanal);
    const m = ekliMesaj(p.pid, kanal, "kurul", String(govde?.metin ?? "").trim(), liste);
    const ceo = projeAjanlari(p.pid).find((a) => a.rol === "ceo");
    if (ceo && (kanal === "yonetim" || kanal === "genel") && !m.anilanlar.length) ceoGorseliAnlatir(p.pid, kanal, ceo, liste);
    return m;
  };

  function ceoGorseliAnlatir(pid, kanal, ceo, liste) {
    const yaziyor = (y) => yay({ tur: "kanal.yaziyor", projeId: pid, kanal, ajanId: ceo.id, ad: ceo.ad, yaziyor: y }, pid);
    const gorsel = liste.find((e) => e.tur === "gorsel");
    yaziyor(true);
    setTimeout(() => {
      yaziyor(false);
      const metin = gorsel
        ? ceviri(
            `Görüntüyü inceledim: ${gorsel.ad} sipariş listesinin tablosu; işaretlediğiniz satırlarda tarih sütunu yanındaki tutar sütununun üstüne taşıyor ve tutarlar sağa kayıyor. Tarihi kısa biçime çevirip sütuna sabit genişlik veriyoruz; Deniz'e T-31 olarak açtım.`,
            `I looked at the screenshot: ${gorsel.ad} is the order list table; in the rows you marked the date column runs into the amount column next to it and the amounts slide right. We'll switch the date to the short format and give the column a fixed width; I opened T-31 for Deniz.`,
          )
        : ceviri(`Dosyayı aldım (${liste.map((e) => e.ad).join(", ")}); okuyup ekiple paylaşıyorum.`, `Got the file (${liste.map((e) => e.ad).join(", ")}); I'll read it and share it with the team.`);
      ekliMesaj(pid, kanal, ceo.id, metin, []);
      if (!gorsel) return;
      // Düzeltmeden sonra uygulamanın ekran görüntüsü (dosya_paylas)
      setTimeout(() => yaziyor(true), 900);
      setTimeout(() => {
        yaziyor(false);
        const ek = ekKaydet(pid, ceviri("siparisler-duzeltildi.png", "orders-fixed.png"), siparisEkrani(false));
        ekliMesaj(pid, kanal, ceo.id, ceviri("Düzeltmeden sonra liste böyle görünüyor; tarih sütunu artık taşmıyor.", "This is the list after the fix; the date column no longer overflows."), [ek]);
      }, 3200);
    }, 2200);
  }

  // Geliştirme ucu: Ada #yonetim'e uygulamanın görüntüsünü paylaşır (ekran görüntüsü almak için)
  rota("POST", "/api/gelistirme/ekli-paylasim", () => {
    const ada = projeAjanlari(OFIS).find((a) => a.rol === "ceo");
    if (!ada) throw new Hata(404, "CEO yok");
    const ek = ekKaydet(OFIS, ceviri("siparisler-guncel.png", "orders-current.png"), siparisEkrani(false));
    return ekliMesaj(OFIS, "yonetim", ada.id, ceviri("Panelin güncel hâli bu.", "This is the panel as it stands."), [ek]);
  });

  // -------------------------------------------------------------------------
  // Tohum: Sipariş Paneli'nin CEO sohbeti ve #genel
  // -------------------------------------------------------------------------

  const ada = projeAjanlari(OFIS).find((a) => a.rol === "ceo");
  const kerem = projeAjanlari(OFIS).find((a) => a.ad === "Kerem") ?? projeAjanlari(OFIS).find((a) => a.rol !== "ceo");
  if (!ada) return;
  const tohum = (kanal, gonderenId, dk, metin, ekListesi) => {
    const m = {
      id: yeniKimlik("m"),
      projeId: OFIS,
      kanal,
      gonderenId,
      gonderenAd: gonderenId === "kurul" ? KURUL_ADI : (ajanBul(gonderenId)?.ad ?? gonderenId),
      metin,
      anilanlar: [],
      zaman: V.once(dk),
      ...(ekListesi.length ? { ekler: ekListesi } : {}),
    };
    for (const e of ekListesi) ekler.get(e.id).mesajId = m.id;
    db.mesajlar.push(m);
  };

  const ekran = ekKaydet(OFIS, ceviri("siparis-listesi.png", "order-list.png"), siparisEkrani(true));
  tohum("yonetim", "kurul", 12, ceviri("Sipariş listesinde tarih sütunu taşıyor, işaretlediğim yere bakar mısın?", "The date column overflows in the order list; can you look at the part I marked?"), [ekran]);
  tohum(
    "yonetim",
    ada.id,
    11,
    ceviri(
      "Görüntüde tarih sütunu tutarın üstüne binmiş; uzun tarih biçimi dar sütuna sığmıyor. Deniz'le kısa biçime geçip sütunu sabitliyoruz.",
      "In the screenshot the date runs over the amount; the long date format doesn't fit the narrow column. Deniz and I will switch to the short format and fix the column width.",
    ),
    [],
  );
  const duzeltilmis = ekKaydet(OFIS, ceviri("siparisler-duzeltildi.png", "orders-fixed.png"), siparisEkrani(false));
  const rapor = ekKaydet(
    OFIS,
    ceviri("test-raporu.md", "test-report.md"),
    Buffer.from(
      ceviri(
        "# Sipariş listesi: tarih sütunu\n\n- 1440, 1024 ve 390 px genişlikte denendi.\n- Tarih kısa biçimde (05.10.2026 14:32).\n- 48 birim testi geçti.\n",
        "# Order list: date column\n\n- Tried at 1440, 1024 and 390 px wide.\n- Dates use the short format (05/10/2026 14:32).\n- 48 unit tests pass.\n",
      ),
    ),
  );
  tohum("yonetim", ada.id, 3, ceviri("Düzeltildi. Güncel liste ve test raporu:", "Fixed. The current list and the test report:"), [duzeltilmis, rapor]);

  if (kerem) {
    const pdf = ekKaydet(
      OFIS,
      ceviri("odeme-akisi.pdf", "payment-flow.pdf"),
      pdfYap(ceviri(["Odeme akisi taslagi", "1. Sepet  2. Adres  3. Odeme  4. Onay", "Iade: 14 gun"], ["Payment flow draft", "1. Cart  2. Address  3. Payment  4. Confirmation", "Refunds: 14 days"])),
    );
    const csv = ekKaydet(OFIS, ceviri("haftalik-siparis.csv", "weekly-orders.csv"), Buffer.from("gun;siparis;iade\npzt;42;1\nsal;51;0\ncar;47;2\n"));
    tohum("genel", kerem.id, 6, ceviri("Ödeme akışının taslağı ve geçen haftanın sipariş sayıları:", "The payment flow draft and last week's order counts:"), [pdf, csv]);
  }
  db.mesajlar.sort((a, b) => a.zaman.localeCompare(b.zaman));
}
