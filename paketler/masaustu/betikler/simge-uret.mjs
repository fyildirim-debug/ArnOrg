// ArnOrg uygulama simgesini üretir: kaynaklar/simge.png (512x512) ve kaynaklar/simge.ico (Windows, çok boyutlu).
// Yalnız node:zlib kullanır; harici bağımlılık yoktur. Çalıştırma: npm run simge -w @arnorg/masaustu
//
// Tasarım: mürekkep (#0a0a0b) kare zemin üzerinde dikdörtgenlerden kurulmuş kalın, geometrik mercan "A".
// Biçim 16x16 birimlik ızgarada tanımlıdır; her boyutta piksel kapsama alanı hesaplanarak çizilir,
// böylece 16/32/48/... boyutlarında kenarlar keskin kalır.

import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..");
const CIKTI = join(KOK, "kaynaklar");

const MUREKKEP = [0x0a, 0x0a, 0x0b];
// oklch(0.72 0.19 25) sRGB'ye çevrilip kırpıldığında #ff6a65
const MERCAN = [0xff, 0x6a, 0x65];

// "A" harfi: birbirine değmeyen dikdörtgenler [x0, y0, x1, y1] (16 birimlik ızgara)
const DIKDORTGENLER = [
  [5, 3, 11, 4], // tepe (dar sıra: basamaklı köşe)
  [4, 4, 12, 5], // tepe (geniş sıra)
  [3, 5, 6, 13], // sol bacak
  [10, 5, 13, 13], // sağ bacak
  [6, 8, 10, 10], // yatay çizgi
];
const IZGARA = 16;

/** Verilen boyutta RGBA piksel dizisi üretir. */
function ciz(boyut) {
  const olcek = boyut / IZGARA;
  const veri = Buffer.alloc(boyut * boyut * 4);
  for (let y = 0; y < boyut; y++) {
    for (let x = 0; x < boyut; x++) {
      // Pikselin dikdörtgenlerle kesişim alanı (0..1)
      let kapsama = 0;
      for (const [x0, y0, x1, y1] of DIKDORTGENLER) {
        const gx = Math.max(0, Math.min(x + 1, x1 * olcek) - Math.max(x, x0 * olcek));
        const gy = Math.max(0, Math.min(y + 1, y1 * olcek) - Math.max(y, y0 * olcek));
        kapsama += gx * gy;
      }
      kapsama = Math.min(1, kapsama);
      const i = (y * boyut + x) * 4;
      for (let k = 0; k < 3; k++) {
        veri[i + k] = Math.round(MUREKKEP[k] * (1 - kapsama) + MERCAN[k] * kapsama);
      }
      veri[i + 3] = 255;
    }
  }
  return veri;
}

function parca(tur, icerik) {
  const uzunluk = Buffer.alloc(4);
  uzunluk.writeUInt32BE(icerik.length);
  const turVeIcerik = Buffer.concat([Buffer.from(tur, "ascii"), icerik]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(turVeIcerik) >>> 0);
  return Buffer.concat([uzunluk, turVeIcerik, crc]);
}

/** RGBA verisinden PNG dosyası üretir (filtre 0, zlib sıkıştırma). */
function pngKodla(boyut, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(boyut, 0);
  ihdr.writeUInt32BE(boyut, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const satirUzunlugu = boyut * 4;
  const ham = Buffer.alloc((satirUzunlugu + 1) * boyut);
  for (let y = 0; y < boyut; y++) {
    ham[y * (satirUzunlugu + 1)] = 0;
    rgba.copy(ham, y * (satirUzunlugu + 1) + 1, y * satirUzunlugu, (y + 1) * satirUzunlugu);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca("IHDR", ihdr),
    parca("IDAT", deflateSync(ham, { level: 9 })),
    parca("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO içine gömülecek 32 bit BMP (DIB) verisi: BITMAPINFOHEADER + alttan üste BGRA + AND maskesi. */
function dibKodla(boyut, rgba) {
  const baslik = Buffer.alloc(40);
  const maskeSatiri = Math.ceil(boyut / 32) * 4;
  const pikselBoyutu = boyut * boyut * 4;
  baslik.writeUInt32LE(40, 0);
  baslik.writeInt32LE(boyut, 4);
  baslik.writeInt32LE(boyut * 2, 8); // XOR + AND yüksekliği
  baslik.writeUInt16LE(1, 12);
  baslik.writeUInt16LE(32, 14);
  baslik.writeUInt32LE(0, 16);
  baslik.writeUInt32LE(pikselBoyutu + maskeSatiri * boyut, 20);
  const piksel = Buffer.alloc(pikselBoyutu);
  for (let y = 0; y < boyut; y++) {
    for (let x = 0; x < boyut; x++) {
      const k = ((boyut - 1 - y) * boyut + x) * 4;
      const i = (y * boyut + x) * 4;
      piksel[k] = rgba[i + 2];
      piksel[k + 1] = rgba[i + 1];
      piksel[k + 2] = rgba[i];
      piksel[k + 3] = rgba[i + 3];
    }
  }
  return Buffer.concat([baslik, piksel, Buffer.alloc(maskeSatiri * boyut)]);
}

/** Çok boyutlu ICO: 256 PNG olarak, küçükler BMP olarak (Windows'un beklediği yaygın düzen). */
function icoKodla(boyutlar) {
  const goruntuler = boyutlar.map((b) => {
    const rgba = ciz(b);
    return { boyut: b, veri: b >= 256 ? pngKodla(b, rgba) : dibKodla(b, rgba) };
  });
  const baslik = Buffer.alloc(6);
  baslik.writeUInt16LE(0, 0);
  baslik.writeUInt16LE(1, 2);
  baslik.writeUInt16LE(goruntuler.length, 4);
  const girdiler = [];
  let konum = 6 + 16 * goruntuler.length;
  for (const g of goruntuler) {
    const girdi = Buffer.alloc(16);
    girdi[0] = g.boyut >= 256 ? 0 : g.boyut;
    girdi[1] = g.boyut >= 256 ? 0 : g.boyut;
    girdi[2] = 0;
    girdi[3] = 0;
    girdi.writeUInt16LE(1, 4);
    girdi.writeUInt16LE(32, 6);
    girdi.writeUInt32LE(g.veri.length, 8);
    girdi.writeUInt32LE(konum, 12);
    konum += g.veri.length;
    girdiler.push(girdi);
  }
  return Buffer.concat([baslik, ...girdiler, ...goruntuler.map((g) => g.veri)]);
}

mkdirSync(CIKTI, { recursive: true });
writeFileSync(join(CIKTI, "simge.png"), pngKodla(512, ciz(512)));
writeFileSync(join(CIKTI, "simge.ico"), icoKodla([16, 24, 32, 48, 64, 128, 256]));
console.log("Simgeler yazıldı:", join(CIKTI, "simge.png"), join(CIKTI, "simge.ico"));
