#!/usr/bin/env node
// ArnOrg sahte çekirdeği: Stüdyo geliştirmesi için docs/API.md uçlarını bellekte uygular.
// Bağımlılık yok: node:http ve en küçük WebSocket el sıkışması burada yazılıdır.
//
//   node paketler/studyo/gelistirme/sahte-sunucu.mjs
//   PORT=47820 ARNORG_ANAHTAR=gelistirme  (varsayılanlar)
//   ARNORG_DIL=en  tohum verisi ve canlı metinler İngilizce (dil.mjs, tohum.mjs, *.en.mjs)

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ceviri, kanalGorunenAdi, yonelme } from "./dil.mjs";
import { dilBul } from "./dosyalar.mjs";
import * as KZ from "./kod-zekasi-verisi.mjs";
import { kur as surum002 } from "./surum-002.mjs";
import { kur as surum004Kazanim } from "./surum-004-kazanim.mjs";
import { kur as surum004Kalite } from "./surum-004-kalite.mjs";
import { kur as surum004Tavan } from "./surum-004-tavan.mjs";
import { kur as surum005Kanallar } from "./surum-005-kanallar.mjs";
import { kur as surum005Brifing } from "./surum-005-brifing.mjs";
import { kur as surum005Yetenek } from "./surum-005-yetenek.mjs";
import { kur as surum005Tarayici } from "./surum-005-tarayici.mjs";
import { kur as surum005Ofis } from "./surum-005-ofis.mjs";
import { kur as surum007Tanitim } from "./surum-007-tanitim.mjs";
import { kur as surum007Otonom } from "./surum-007-otonom.mjs";
import { kur as surum008Ortak } from "./surum-008-ortak.mjs";
import { kur as surum008Skiller } from "./surum-008-skiller.mjs";
import { kur as surum008Kodzeka } from "./surum-008-kodzeka.mjs";
import { kur as surum008Arayuz } from "./surum-008-arayuz.mjs";
import { kur as surum008Secenek } from "./surum-008-secenek.mjs";
import { kur as surum008Canli } from "./surum-008-canli.mjs";
import { kur as surum008Ekler } from "./surum-008-ekler.mjs";
import { kur as surum010Butce } from "./surum-010-butce.mjs";
import { ana, H, kanalAdi, katmanlar, listeSurumleri, MODELLER, V } from "./tohum.mjs";

const PORT = Number(process.env.PORT ?? 47820);
const ANAHTAR = process.env.ARNORG_ANAHTAR ?? "gelistirme";
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const SURUM = JSON.parse(fs.readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version;

const simdi = () => new Date().toISOString();
const sonra = (sn) => new Date(Date.now() + sn * 1000).toISOString();
let sayac = 100;
const yeniKimlik = (on) => `${on}-${(sayac++).toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const kopya = (x) => structuredClone(x);
/** Ajanların teknik kanalı: Türkçede #muhendislik, İngilizcede #engineering */
const MUHENDISLIK = kanalAdi("muhendislik");

// ---------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------

const db = {
  // Dil: ARNORG_DIL=en ile İngilizce başlar; Ayarlar'dan değişir
  ayarlar: { dil: process.env.ARNORG_DIL === "en" ? "en" : "tr", claudeYolu: null, varsayilanIzinModu: "bypassPermissions", onaySuresiSn: 600, disEditor: "codium", tikanmaDakika: 20, besSaatlikSinirYuzde: 90, haftalikSinirYuzde: 95, kodZekasiModeli: "kaliteli", kodZekasiOtomatik: true },
  projeler: kopya(V.projeler),
  ajanlar: kopya(V.ajanlar),
  gorevler: kopya(V.gorevler),
  kanallar: kopya(V.kanallar),
  mesajlar: kopya(V.mesajlar),
  notlar: {
    "siparis-paneli": kopya(V.notlar),
    "arnex-web": {
      "vizyon.md": ceviri("# Vizyon\n\nArnex'i anlatan, hızlı ve sade bir site.\n", "# Vision\n\nA fast, simple site that tells the Arnex story.\n"),
      "mimari.md": ceviri("# Mimari\n\nAstro, içerik koleksiyonları.\n", "# Architecture\n\nAstro, content collections.\n"),
    },
  },
  notZamanlari: { "siparis-paneli": kopya(V.notZamanlari), "arnex-web": { "vizyon.md": V.once(60 * 24 * 2), "mimari.md": V.once(60 * 24 * 2) } },
  politika: { "siparis-paneli": kopya(V.politika), "arnex-web": kopya(V.politika).slice(0, 3) },
  denetim: kopya(V.denetim),
  onaylar: kopya(V.onaylar),
  akislar: kopya(V.akislar),
  ana: kopya(ana),
  katmanlar: kopya(katmanlar),
  terminaller: new Map(),
  hafiza: kopya(H.hafiza),
  defterler: kopya(H.defterler),
  defterZamanlari: {},
  sorular: kopya(H.sorular),
};

const proje = (pid) => db.projeler.find((p) => p.id === pid);
const ajanBul = (aid) => db.ajanlar.find((a) => a.id === aid);
const projeAjanlari = (pid) => db.ajanlar.filter((a) => a.projeId === pid);

function projeOzeti(p) {
  const ajanlar = projeAjanlari(p.id);
  const gorevSayilari = { bekleyen: 0, planlandi: 0, calisiliyor: 0, inceleme: 0, tamam: 0, iptal: 0 };
  for (const g of db.gorevler) if (g.projeId === p.id) gorevSayilari[g.durum] += 1;
  return {
    uzakAdres: null,
    github: null,
    otomatikGonder: true,
    hazirlik: "tamam",
    otomatikOnay: { etkin: false, turler: [] },
    ...p,
    ajanSayisi: ajanlar.length,
    aktifAjanSayisi: ajanlar.filter((a) => a.durum === "calisiyor" || a.durum === "karar_bekliyor").length,
    gorevSayilari,
    bekleyenOnay: db.onaylar.filter((o) => o.projeId === p.id && o.durum === "bekliyor" && o.muhatap !== "ceo").length,
    bugunToken: ajanlar.reduce((t, a) => t + a.bugunToken, 0),
    // 0.0.10: bütçe, seviye, toplam token ve bütçe durumu (surum-010-butce.mjs)
    ...(butceEki?.ozet(p) ?? {}),
  };
}

/** 0.0.10 bütçe modülü; kurulunca proje özetine alanlarını katar */
let butceEki = null;

// Abonelik: Claude Max, 5 saatlik pencere %42, haftalık %18
const hesapDurumu = {
  durum: "hazir",
  plan: "Max",
  eposta: "kurul@ornek.com",
  kaynak: "claude.ai",
  saglayici: "firstParty",
  pencereVar: true,
  pencereler: [
    { tur: "bes_saat", ad: ceviri("5 saatlik pencere", "5-hour window"), yuzde: 42, sifirlanma: sonra(60 * 112) },
    { tur: "haftalik", ad: ceviri("Haftalık", "Weekly"), yuzde: 18, sifirlanma: sonra(60 * 60 * 24 * 4) },
    { tur: "haftalik_opus", ad: ceviri("Haftalık · Opus", "Weekly · Opus"), yuzde: 9, sifirlanma: sonra(60 * 60 * 24 * 4) },
  ],
  uyari: null,
  hata: null,
};

function hesapCevabi() {
  const a = db.ayarlar;
  const sinirli = hesapDurumu.pencereler.find((p) => {
    const s = p.tur === "bes_saat" ? a.besSaatlikSinirYuzde : a.haftalikSinirYuzde;
    return s > 0 && p.yuzde >= s;
  });
  return {
    ...hesapDurumu,
    sinirYuzdeleri: { besSaatlik: a.besSaatlikSinirYuzde, haftalik: a.haftalikSinirYuzde },
    sinir: sinirli
      ? { pencere: sinirli.ad, yuzde: Math.round(sinirli.yuzde), sinirYuzde: sinirli.tur === "bes_saat" ? a.besSaatlikSinirYuzde : a.haftalikSinirYuzde, sifirlanma: sinirli.sifirlanma }
      : null,
    guncelleme: simdi(),
  };
}

function kullanim(pid) {
  const ajanlar = projeAjanlari(pid);
  return {
    bugunToken: ajanlar.reduce((t, a) => t + a.bugunToken, 0),
    toplamToken: ajanlar.reduce((t, a) => t + a.toplamToken, 0),
    ajanlar: ajanlar.map((a) => ({
      ajanId: a.id,
      ad: a.ad,
      bugunToken: a.bugunToken,
      toplamToken: a.toplamToken,
    })),
    pencere: { tur: "five_hour", durum: "allowed_warning", sifirlanma: sonra(60 * 112) },
  };
}

// ---------------------------------------------------------------------------
// Dosya sistemi
// ---------------------------------------------------------------------------

function alanDosyalari(alan) {
  const dosyalar = { ...db.ana };
  const katman = db.katmanlar[alan];
  if (katman) for (const [yol, icerik] of Object.entries(katman)) {
    if (icerik === null) delete dosyalar[yol];
    else dosyalar[yol] = icerik;
  }
  return dosyalar;
}

function degisiklik(alan, yol) {
  const katman = db.katmanlar[alan];
  if (!katman || !(yol in katman)) return undefined;
  if (katman[yol] === null) return "D";
  if (!(yol in db.ana)) return "A";
  return katman[yol] === db.ana[yol] ? undefined : "M";
}

function agacKur(alan) {
  const kok = { ad: "", yol: "", tur: "klasor", cocuklar: [] };
  const dosyalar = alanDosyalari(alan);
  const yollar = new Set(Object.keys(dosyalar));
  const katman = db.katmanlar[alan] ?? {};
  for (const [yol, icerik] of Object.entries(katman)) if (icerik === null) yollar.add(yol);
  for (const yol of [...yollar].sort()) {
    const parcalar = yol.split("/");
    let d = kok;
    for (let i = 0; i < parcalar.length - 1; i++) {
      const klasorYolu = parcalar.slice(0, i + 1).join("/");
      let alt = d.cocuklar.find((c) => c.yol === klasorYolu);
      if (!alt) {
        alt = { ad: parcalar[i], yol: klasorYolu, tur: "klasor", cocuklar: [] };
        d.cocuklar.push(alt);
      }
      d = alt;
    }
    const dugum = { ad: parcalar[parcalar.length - 1], yol, tur: "dosya" };
    const deg = degisiklik(alan, yol);
    if (deg) dugum.degisiklik = deg;
    d.cocuklar.push(dugum);
  }
  return kok;
}

/** Ajanın şu an düzenlediği dosya (salt okunur kilit) */
function duzenleyen(alan, yol) {
  const kilitler = { deniz: "src/sunucu/siparisRotalari.ts", ece: "src/ekranlar/SiparisListesi.tsx" };
  const a = ajanBul(alan);
  if (!a || kilitler[alan] !== yol) return null;
  return a.durum === "calisiyor" || a.durum === "karar_bekliyor" ? a.id : null;
}

/** Satır tabanlı en uzun ortak alt dizi ile birleşik fark */
function birlesikFark(yol, eski, yeni) {
  const e = eski === null ? [] : eski.replace(/\n$/, "").split("\n");
  const y = yeni === null ? [] : yeni.replace(/\n$/, "").split("\n");
  const n = e.length;
  const m = y.length;
  const t = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = e[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && e[i] === y[j]) ops.push([" ", e[i++], j++]);
    else if (j < m && (i >= n || t[i][j + 1] >= t[i + 1][j])) ops.push(["+", y[j++]]);
    else ops.push(["-", e[i++]]);
  }
  // Parçalara böl (3 satır bağlam)
  const degisen = ops.map((o, k) => (o[0] !== " " ? k : -1)).filter((k) => k >= 0);
  if (!degisen.length) return { metin: "", eklenen: 0, silinen: 0 };
  const parcalar = [];
  let bas = Math.max(0, degisen[0] - 3);
  let son = Math.min(ops.length - 1, degisen[0] + 3);
  for (const k of degisen.slice(1)) {
    if (k - 3 <= son + 1) son = Math.min(ops.length - 1, k + 3);
    else {
      parcalar.push([bas, son]);
      bas = Math.max(0, k - 3);
      son = Math.min(ops.length - 1, k + 3);
    }
  }
  parcalar.push([bas, son]);
  let metin = `diff --git a/${yol} b/${yol}\n`;
  if (eski === null) metin += "new file mode 100644\n";
  if (yeni === null) metin += "deleted file mode 100644\n";
  metin += `--- ${eski === null ? "/dev/null" : `a/${yol}`}\n+++ ${yeni === null ? "/dev/null" : `b/${yol}`}\n`;
  let eklenen = 0;
  let silinen = 0;
  for (const [b, s] of parcalar) {
    let eskiBas = 1;
    let yeniBas = 1;
    for (let k = 0; k < b; k++) {
      if (ops[k][0] !== "+") eskiBas++;
      if (ops[k][0] !== "-") yeniBas++;
    }
    const dilim = ops.slice(b, s + 1);
    const eskiSay = dilim.filter((o) => o[0] !== "+").length;
    const yeniSay = dilim.filter((o) => o[0] !== "-").length;
    metin += `@@ -${eskiSay ? eskiBas : eskiBas - 1},${eskiSay} +${yeniSay ? yeniBas : yeniBas - 1},${yeniSay} @@\n`;
    for (const o of dilim) {
      metin += `${o[0]}${o[1]}\n`;
      if (o[0] === "+") eklenen++;
      if (o[0] === "-") silinen++;
    }
  }
  return { metin, eklenen, silinen };
}

function farkHesapla(alan, tekYol) {
  const katman = db.katmanlar[alan] ?? {};
  const sonuc = { fark: "", dosyalar: [] };
  for (const yol of Object.keys(katman).sort()) {
    if (tekYol && yol !== tekYol) continue;
    const deg = degisiklik(alan, yol);
    if (!deg) continue;
    const f = birlesikFark(yol, yol in db.ana ? db.ana[yol] : null, katman[yol]);
    sonuc.fark += f.metin;
    sonuc.dosyalar.push({ yol, degisiklik: deg, eklenen: f.eklenen, silinen: f.silinen });
  }
  return sonuc;
}

function calismaAlanlari(pid) {
  const p = proje(pid);
  const liste = [{ kimlik: "ana", yol: p.yol, dal: p.varsayilanDal, ajanId: null, ana: true }];
  for (const a of projeAjanlari(pid)) if (a.calismaAlani && a.dal) liste.push({ kimlik: a.id, yol: a.calismaAlani, dal: a.dal, ajanId: a.id, ana: false });
  return liste;
}

// ---------------------------------------------------------------------------
// WebSocket (RFC 6455, yalnız metin çerçeveleri)
// ---------------------------------------------------------------------------

function cerceve(metin, op = 0x1) {
  const yuk = Buffer.from(metin);
  let baslik;
  if (yuk.length < 126) baslik = Buffer.from([0x80 | op, yuk.length]);
  else if (yuk.length < 65536) {
    baslik = Buffer.alloc(4);
    baslik[0] = 0x80 | op;
    baslik[1] = 126;
    baslik.writeUInt16BE(yuk.length, 2);
  } else {
    baslik = Buffer.alloc(10);
    baslik[0] = 0x80 | op;
    baslik[1] = 127;
    baslik.writeBigUInt64BE(BigInt(yuk.length), 2);
  }
  return Buffer.concat([baslik, yuk]);
}

function wsKabul(istek, soket) {
  const anahtar = istek.headers["sec-websocket-key"];
  const kabul = crypto.createHash("sha1").update(`${anahtar}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  soket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${kabul}`, "", ""].join("\r\n"));
  soket.setNoDelay(true);
  const b = {
    acik: true,
    mesaj: () => {},
    kapandi: () => {},
    gonder(metin) {
      if (b.acik) soket.write(cerceve(metin));
    },
    kapat() {
      if (!b.acik) return;
      b.acik = false;
      soket.end(cerceve("", 0x8));
    },
  };
  let tampon = Buffer.alloc(0);
  let parcali = "";
  soket.on("data", (veri) => {
    tampon = Buffer.concat([tampon, veri]);
    while (tampon.length >= 2) {
      const fin = (tampon[0] & 0x80) !== 0;
      const op = tampon[0] & 0x0f;
      const maskeli = (tampon[1] & 0x80) !== 0;
      let uzunluk = tampon[1] & 0x7f;
      let ofset = 2;
      if (uzunluk === 126) {
        if (tampon.length < 4) return;
        uzunluk = tampon.readUInt16BE(2);
        ofset = 4;
      } else if (uzunluk === 127) {
        if (tampon.length < 10) return;
        uzunluk = Number(tampon.readBigUInt64BE(2));
        ofset = 10;
      }
      const maske = maskeli ? tampon.subarray(ofset, ofset + 4) : null;
      if (maskeli) ofset += 4;
      if (tampon.length < ofset + uzunluk) return;
      const yuk = Buffer.from(tampon.subarray(ofset, ofset + uzunluk));
      tampon = tampon.subarray(ofset + uzunluk);
      if (maske) for (let i = 0; i < yuk.length; i++) yuk[i] ^= maske[i % 4];
      if (op === 0x8) {
        b.kapat();
        return;
      }
      if (op === 0x9) {
        soket.write(cerceve(yuk.toString(), 0xa));
        continue;
      }
      if (op === 0x1 || op === 0x0) {
        parcali += yuk.toString("utf8");
        if (fin) {
          const m = parcali;
          parcali = "";
          b.mesaj(m);
        }
      }
    }
  });
  const bitir = () => {
    if (b.acik === false && b._bitti) return;
    b.acik = false;
    b._bitti = true;
    b.kapandi();
  };
  soket.on("close", bitir);
  soket.on("error", bitir);
  return b;
}

// ---------------------------------------------------------------------------
// Canlı olaylar
// ---------------------------------------------------------------------------

const istemciler = new Set();

/** Yayınlanan her olayı gören dinleyiciler (0.0.2 uçları: otomatik onay, kurula açılır pencere) */
const yayDinleyicileri = [];

function yay(olay, projeId = null) {
  // İlk kurulum kipinde sihirbaz bitene kadar tohum projelerin arka plan bildirimleri gelmez
  if (process.env.ARNORG_KURULUM === "yeni" && !db.ayarlar.kurulumTamam) {
    const tohum = (id) => id === "siparis-paneli" || id === "arnex-web";
    if (olay.tur === "bildirim" && (!olay.projeId || tohum(olay.projeId))) return;
    if (olay.tur === "proje.guncellendi" && tohum(olay.proje?.id)) return;
  }
  const metin = JSON.stringify(olay);
  for (const i of istemciler) {
    const herkese = olay.tur === "proje.guncellendi" || olay.tur === "bildirim" || olay.tur === "hesap.guncellendi";
    if (herkese || (projeId && i.projeId === projeId)) i.ws.gonder(metin);
  }
  for (const d of yayDinleyicileri) d(olay);
}

/** Projeye bağlı olmayan olaylar (kurulum, global zekâ) bütün istemcilere */
function herkeseYay(olay) {
  const metin = JSON.stringify(olay);
  for (const i of istemciler) i.ws.gonder(metin);
}

const projeYay = (pid) => yay({ tur: "proje.guncellendi", proje: projeOzeti(proje(pid)) });
const ajanYay = (a) => yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);

function akisEkle(ajanId, oge) {
  const a = ajanBul(ajanId);
  const tam = { id: yeniKimlik("ak"), ajanId, zaman: simdi(), ustAracKimligi: null, ...oge };
  (db.akislar[ajanId] ??= []).push(tam);
  if (a) yay({ tur: "ajan.akis", projeId: a.projeId, oge: tam }, a.projeId);
  return tam;
}

function denetimEkle(ajanId, arac, girdiOzeti, karar, kural = null, neden = null) {
  const a = ajanBul(ajanId);
  if (!a) return;
  const k = { id: yeniKimlik("d"), projeId: a.projeId, ajanId, ajanAd: a.ad, arac, girdiOzeti, karar, kural, neden, aracKimligi: yeniKimlik("toolu"), zaman: simdi() };
  db.denetim.unshift(k);
  yay({ tur: "denetim.kaydi", kayit: k }, a.projeId);
}

function kullan(ajanId, token) {
  const a = ajanBul(ajanId);
  if (!a) return;
  a.bugunToken += token;
  a.toplamToken += token;
  hesapDurumu.pencereler[0].yuzde = Math.min(100, Math.round((hesapDurumu.pencereler[0].yuzde + token / 150_000) * 10) / 10);
  yay({ tur: "kullanim", projeId: a.projeId, ajanId, bugunToken: a.bugunToken, toplamToken: a.toplamToken }, a.projeId);
}

function mesajEkle(pid, kanal, gonderenId, metin) {
  const ajanlar = projeAjanlari(pid);
  const gonderenAd = gonderenId === "kurul" ? ceviri("Yönetim kurulu", "Board") : (ajanBul(gonderenId)?.ad ?? gonderenId);
  const anilanlar = ajanlar.filter((a) => new RegExp(`@${a.ad}\\b`, "iu").test(metin)).map((a) => a.id);
  const m = { id: yeniKimlik("m"), projeId: pid, kanal, gonderenId, gonderenAd, metin, anilanlar, zaman: simdi() };
  db.mesajlar.push(m);
  yay({ tur: "mesaj.yeni", mesaj: m }, pid);
  return m;
}

/** Araç çağrısı + sonuç + denetim kaydı + token kullanımı */
function aracCalistir(ajanId, arac, girdi, sonuc, { ozet, hata = false, karar = "izin", kural = null, token = 1200 } = {}) {
  const kimlik = yeniKimlik("toolu");
  akisEkle(ajanId, { tur: "arac_cagrisi", arac, aracKimligi: kimlik, girdi });
  denetimEkle(ajanId, arac, ozet ?? JSON.stringify(girdi).slice(0, 80), karar, kural, karar === "ret" ? ceviri("Politika", "Policy") : null);
  setTimeout(() => {
    akisEkle(ajanId, { tur: "arac_sonucu", aracKimligi: kimlik, metin: sonuc, hata });
    kullan(ajanId, token);
  }, 700);
}

// ---------------------------------------------------------------------------
// Sahne: ajanlar kendi kendine çalışır
// ---------------------------------------------------------------------------

let listeAdimi = 1;

const sahne = [
  () =>
    calisiyorsa("kerem", () =>
      aracCalistir("kerem", "Read", { file_path: `${V.PROJE_KOKU}/src/auth/jetonDeposu.ts` }, ceviri("// Erişim ve yenileme jetonlarını bellekte… (14 satır)", "// Keeps the access and refresh tokens in memory… (14 lines)"), {
        ozet: "src/auth/jetonDeposu.ts",
      }),
    ),
  () => calisiyorsa("ece", eceDuzenler),
  () =>
    calisiyorsa("kerem", () =>
      aracCalistir("kerem", "mcp__arnorg__not_yaz", { yol: "kararlar/ADR-004-jeton-yenileme.md", metin: "…" }, ceviri("Not güncellendi.", "Note updated."), { ozet: "kararlar/ADR-004-jeton-yenileme.md", token: 2400 }),
    ),
  () =>
    calisiyorsa("ece", () =>
      aracCalistir(
        "ece",
        "Bash",
        { command: "npm run test -- liste", description: ceviri("Liste testlerini çalıştır", "Run the list tests") },
        " ✓ tests/liste.test.tsx (4 tests) 88ms\n\n Test Files  1 passed (1)\n      Tests  4 passed (4)",
        { ozet: "npm run test -- liste", kural: ceviri("Test komutları", "Test commands") },
      ),
    ),
  () =>
    calisiyorsa("ada", () => {
      akisEkle("ada", {
        tur: "dusunce",
        metin: ceviri("T-26 incelemeye yaklaşıyor; Onur'un oturumu kapalı. İnceleme sırası için Kerem'e yazmalıyım.", "T-26 is close to review and Onur's session is closed. I should ask Kerem about the review order."),
      });
      aracCalistir(
        "ada",
        "mcp__arnorg__mesaj_gonder",
        { kanal: MUHENDISLIK, metin: ceviri("@Kerem T-26 bugün incelemeye girebilir; Onur'u uyandıralım mı?", "@Kerem T-26 could go into review today; shall we wake Onur up?") },
        ceviri("Mesaj #muhendislik kanalına yazıldı.", "Message posted to #engineering."),
        { ozet: ceviri("#muhendislik · T-26 incelemesi", "#engineering · T-26 review"), token: 1800 },
      );
      setTimeout(() => mesajEkle("siparis-paneli", MUHENDISLIK, "ada", ceviri("@Kerem T-26 bugün incelemeye girebilir; Onur'u uyandıralım mı?", "@Kerem T-26 could go into review today; shall we wake Onur up?")), 800);
    }),
  () => calisiyorsa("kerem", () => aracCalistir("kerem", "Grep", { pattern: "yenileniyor", path: `${V.PROJE_KOKU}/src` }, "src/auth/oturum.ts:6:let yenileniyor: Promise<void> | null = null;", { ozet: "\"yenileniyor\" src/" })),
  () =>
    calisiyorsa("ece", () => {
      aracCalistir("ece", "WebFetch", { url: "https://cdn.example.com/ikonlar.json" }, ceviri("ArnOrg politikası reddetti: Ağ erişimi (izinli alan adı değil)", "Denied by ArnOrg policy: Network access (domain not allowed)"), {
        ozet: "https://cdn.example.com/ikonlar.json",
        hata: true,
        karar: "ret",
        kural: ceviri("Ağ erişimi", "Network access"),
      });
    }),
  () =>
    calisiyorsa("kerem", () => {
      mesajEkle("siparis-paneli", MUHENDISLIK, "kerem", ceviri("Evet, Onur'u T-26 için uyandırıyorum. @Ece incelemeye geçince haber ver.", "Yes, I'm waking Onur up for T-26. @Ece let me know when it moves to review."));
      kullan("kerem", 1200);
    }),
];

function calisiyorsa(ajanId, is) {
  const a = ajanBul(ajanId);
  if (a && a.durum === "calisiyor") is();
}

function eceDuzenler() {
  const yol = "src/ekranlar/SiparisListesi.tsx";
  listeAdimi = (listeAdimi + 1) % listeSurumleri.length;
  const onceki = db.katmanlar.ece[yol];
  const yeni = listeSurumleri[listeAdimi];
  const kimlik = yeniKimlik("toolu");
  akisEkle("ece", { tur: "arac_cagrisi", arac: "Edit", aracKimligi: kimlik, girdi: { file_path: `${V.PROJE_KOKU}/${yol}`, old_string: onceki.slice(-80), new_string: yeni.slice(-80) } });
  denetimEkle("ece", "Edit", yol, "izin");
  setTimeout(() => {
    db.katmanlar.ece[yol] = yeni;
    zamanlar.set(`ece\0${yol}`, Date.now());
    yay({ tur: "dosya.degisti", projeId: "siparis-paneli", alan: "ece", yol, ajanId: "ece" }, "siparis-paneli");
    akisEkle("ece", { tur: "arac_sonucu", aracKimligi: kimlik, metin: ceviri("Dosya güncellendi.", "File updated.") });
    kullan("ece", 1800);
  }, 600);
}

let sahneAdimi = 0;
setInterval(() => {
  sahne[sahneAdimi % sahne.length]();
  sahneAdimi++;
}, 4200);

// Bekleyen araç çağrıları: süre dolunca reddedilir; karar verilince bir süre sonra yenisi gelir
const sorulacaklar = [
  {
    ajanId: "deniz",
    arac: "Bash",
    girdi: { command: "git push origin arnorg/deniz/T-24 --force", description: ceviri("Dalı zorla gönder", "Force-push the branch") },
    kural: ceviri("Dışarı push ve yayın → onaya sor", "Outbound push and publish → ask for approval"),
  },
  { ajanId: "kerem", arac: "WebFetch", girdi: { url: "https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation" }, kural: ceviri("Ağ erişimi → onaya sor", "Network access → ask for approval") },
  {
    ajanId: "ece",
    arac: "Bash",
    girdi: { command: "npm publish --access public", description: ceviri("Bileşen paketini yayınla", "Publish the component package") },
    kural: ceviri("Dışarı push ve yayın → onaya sor", "Outbound push and publish → ask for approval"),
  },
];
let soruAdimi = 0;

function yeniSoru() {
  const s = sorulacaklar[soruAdimi++ % sorulacaklar.length];
  const a = ajanBul(s.ajanId);
  if (!a || a.durum === "kapali") return;
  const kimlik = yeniKimlik("toolu");
  const komut = s.girdi.command ?? s.girdi.url;
  akisEkle(a.id, { tur: "arac_cagrisi", arac: s.arac, aracKimligi: kimlik, girdi: s.girdi });
  denetimEkle(a.id, s.arac, komut, "sor", s.kural.split(" →")[0]);
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
    sonGecerlilik: sonra(Math.min(db.ayarlar.onaySuresiSn, 180)),
    sonuclanma: null,
    not: null,
  };
  db.onaylar.unshift(o);
  a.durum = "karar_bekliyor";
  ajanYay(a);
  yay({ tur: "onay.yeni", onay: o }, a.projeId);
  projeYay(a.projeId);
}

setInterval(() => {
  const t = Date.now();
  for (const o of db.onaylar) {
    if (o.durum !== "bekliyor" || !o.sonGecerlilik || new Date(o.sonGecerlilik).getTime() > t) continue;
    o.durum = "zaman_asimi";
    o.sonuclanma = simdi();
    yay({ tur: "onay.sonuc", onay: o }, o.projeId);
    const a = ajanBul(o.ajanId);
    if (a && o.tur === "arac") {
      akisEkle(a.id, { tur: "arac_sonucu", aracKimligi: o.veri.aracKimligi, metin: ceviri("Karar süresi doldu; çağrı reddedildi.", "The decision window expired; the call was denied."), hata: true });
      denetimEkle(a.id, o.veri.arac, o.baslik, "ret", null, ceviri("Süre doldu", "Timed out"));
      a.durum = "calisiyor";
      ajanYay(a);
    }
    projeYay(o.projeId);
    setTimeout(yeniSoru, 40_000);
  }
}, 1000);

setTimeout(
  () => yay({ tur: "bildirim", seviye: "uyari", metin: ceviri("T-24 20 dakikadır ilerlemiyor; Deniz'e hatırlatıldı.", "T-24 hasn't moved in 20 minutes; Deniz was reminded."), projeId: "siparis-paneli" }),
  25_000,
);

// ---------------------------------------------------------------------------
// Ofis canlandırması: anmalı mesajlar, #toplanti, görev geçişleri, durum değişimleri,
// işe alım ve birleştirme teklifleri, gözetmen hatırlatması. Ofis ekranı bunları sahneye çevirir.
// (Hafıza ve soru olayları ayrı demo akışında üretilir.)
// ---------------------------------------------------------------------------

const OFIS = "siparis-paneli";
const ofisAjanlari = () => projeAjanlari(OFIS).filter((a) => a.durum !== "kapali");
const rastgeleSec = (liste) => liste[Math.floor(Math.random() * liste.length)];

const ANMALI = ceviri(
  [
    (a) => `@${a} sipariş listesinde \`sonrakiImlec\` boş gelirse ne gösterelim?`,
    (a) => `@${a} T-24 testleri yeşil, **422 gövdesine** bir göz atar mısın?`,
    (a) => `@${a} ADR-005'i güncelledim; imleç alanının adı değişmedi.`,
    (a) => `@${a} hata kutusundaki metni kısalttım, tasarım sistemine uygun mu?`,
    (a) => `@${a} CI'da Windows işi 3 dakika uzadı, önbelleği açıyorum. Bir sakıncası var mı?`,
    (a) => `@${a} durum rozetinin renklerini [taslağa](notlar/tasarim.md) ekledim.`,
    (a) => `@${a} yarın sabah için kısa bir eşleşme yapalım mı? Kargo entegrasyonunu birlikte bölelim.`,
  ],
  [
    (a) => `@${a} what should the order list show when \`sonrakiImlec\` comes back empty?`,
    (a) => `@${a} the T-24 tests are green; could you take a look at the **422 body**?`,
    (a) => `@${a} I updated ADR-005; the cursor field name hasn't changed.`,
    (a) => `@${a} I shortened the text in the error box; does it fit the design system?`,
    (a) => `@${a} the Windows job in CI got 3 minutes slower, so I'm turning on the cache. Any objections?`,
    (a) => `@${a} I added the status badge colors to the [draft](notlar/tasarim.md).`,
    (a) => `@${a} shall we pair for a bit tomorrow morning? We could split up the shipping integration together.`,
  ],
);
const GENEL = ceviri(
  [
    "Sprint panosunu güncelledim; T-27 bağımlılıkları netleşti.",
    "Kargo firması belgelerini okudum, ilk izlenimler notlarda.",
    "Kullanım pencereleri rahat; 5 saatlik pencere %50'nin altında.",
  ],
  [
    "I updated the sprint board; the T-27 dependencies are clear now.",
    "I read the carrier's docs; first impressions are in the notes.",
    "Usage windows look fine; the 5-hour window is under 50%.",
  ],
);

function anmaliMesaj() {
  const ajanlar = ofisAjanlari().filter((a) => a.durum !== "duraklatildi");
  const g = rastgeleSec(ajanlar);
  if (!g) return;
  if (Math.random() < 0.2) {
    mesajEkle(OFIS, "genel", g.id, rastgeleSec(GENEL));
    return;
  }
  const alici = rastgeleSec(projeAjanlari(OFIS).filter((a) => a.id !== g.id));
  if (!alici) return;
  mesajEkle(OFIS, Math.random() < 0.6 ? MUHENDISLIK : "genel", g.id, rastgeleSec(ANMALI)(alici.ad));
  // Karşılık
  setTimeout(() => {
    const a = ajanBul(alici.id);
    if (!a || a.durum === "kapali") return;
    mesajEkle(
      OFIS,
      MUHENDISLIK,
      a.id,
      rastgeleSec(
        ceviri(
          ["Bakıyorum, birazdan dönerim.", `Tamam @${g.ad}, böyle kalsın.`, "Uygun, devam edebilirsin.", "Bir şey eklemem gerek; notlara yazıyorum."],
          ["Looking at it, back in a bit.", `OK @${g.ad}, let's keep it that way.`, "Looks good, go ahead.", "I need to add something; writing it up in the notes."],
        ),
      ),
    );
  }, 7000);
}

// Toplantı: çekirdekteki toplanti_yap ile aynı biçim. Çağıranın #toplanti duyurusu, her katılımcıya
// "Toplantı (X çağırdı): …" sorusu (soru.guncellendi), yanıt gelince soru kapanır ve yanıt #toplanti'ya düşer
let toplantiNo = 0;
const GUNDEMLER = ceviri(
  [
    "Kargo entegrasyonunu nasıl bölelim? Tek firma mı, soyut katman mı?",
    "Sprint 3 kapanışı: T-26 ve T-27 bu hafta yetişir mi?",
    "Ödeme öncesi güvenlik denetimi hangi kapsamla yapılsın?",
    "Sipariş listesinde 500+ satır için sanal kaydırma gerekli mi?",
  ],
  [
    "How should we split the shipping integration? One carrier, or an abstraction layer?",
    "Sprint 3 wrap-up: will T-26 and T-27 make it this week?",
    "What scope should the security audit before payments have?",
    "Do we need virtual scrolling for 500+ rows in the order list?",
  ],
);
const GORUSLER = ceviri(
  [
    "Önce tek firma; arayüzü soyut tutalım, ikinci firma gelince katmanı çıkarırız. Risk: firma API'si sık değişiyor.",
    "T-26 yetişir; T-27 için T-24'ün 422 gövdesi netleşmeli. Risk: testler Windows'ta yavaş.",
    "OWASP ASVS düzey 2 yeter; oturum ve jeton akışı öncelikli. Risk: üçüncü taraf betikler.",
    "Evet, 500 üstünde sanal kaydırma; altında düz tablo. Risk: klavye gezintisi bozulmasın.",
  ],
  [
    "One carrier first; keep the interface abstract and extract the layer when a second carrier comes along. Risk: the carrier's API changes often.",
    "T-26 will make it; for T-27 the 422 body of T-24 has to be settled first. Risk: the tests are slow on Windows.",
    "OWASP ASVS level 2 is enough; session and token flows come first. Risk: third-party scripts.",
    "Yes, virtual scrolling above 500 rows and a plain table below that. Risk: keyboard navigation mustn't break.",
  ],
);
function toplantiMesaji() {
  const ceo = projeAjanlari(OFIS).find((a) => a.rol === "ceo");
  if (!ceo || ceo.durum === "kapali") return;
  const digerleri = ofisAjanlari().filter((a) => a.id !== ceo.id && a.durum !== "duraklatildi");
  const katilimcilar = [...digerleri].sort(() => Math.random() - 0.5).slice(0, 2 + (toplantiNo % 2));
  if (!katilimcilar.length) return;
  const n = toplantiNo++;
  const gundem = GUNDEMLER[n % GUNDEMLER.length];
  mesajEkle(
    OFIS,
    "toplanti",
    ceo.id,
    ceviri(`Toplantı: ${gundem}\nKatılımcılar: ${katilimcilar.map((a) => `@${a.ad}`).join(" ")}`, `Meeting: ${gundem}\nParticipants: ${katilimcilar.map((a) => `@${a.ad}`).join(" ")}`),
  );
  katilimcilar.forEach((a, i) => {
    const s = {
      id: yeniKimlik("s"),
      projeId: OFIS,
      soranId: ceo.id,
      soranAd: ceo.ad,
      soruluId: a.id,
      soruluAd: a.ad,
      soru: ceviri(
        `Toplantı (${ceo.ad} çağırdı): ${gundem}\n\nGörüşünü kısa ver: önerin, gerekçen, gördüğün risk.`,
        `Meeting (called by ${ceo.ad}): ${gundem}\n\nGive your view briefly: your proposal, your reasoning, the risk you see.`,
      ),
      yanit: null,
      durum: "bekliyor",
      olusturma: simdi(),
      yanitlanma: null,
    };
    db.sorular?.unshift(s);
    yay({ tur: "soru.guncellendi", soru: s }, OFIS);
    setTimeout(() => {
      if (!ajanBul(a.id)) return;
      const yanit = GORUSLER[(n + i) % GORUSLER.length];
      Object.assign(s, { yanit, durum: "yanitlandi", yanitlanma: simdi() });
      yay({ tur: "soru.guncellendi", soru: s }, OFIS);
      mesajEkle(OFIS, "toplanti", a.id, yanit);
    }, 9000 + i * 4500);
  });
}

// Görev geçişleri: geçerli olan uygulanır, olmayan atlanır
const GOREV_AKISI = [
  ["g26", "inceleme"],
  ["g27", "calisiliyor"],
  ["g26", "tamam"],
  ["g19", "calisiliyor"],
  ["g24", "inceleme"],
  ["g27", "planlandi"],
  ["g26", "calisiliyor"],
  ["g19", "inceleme"],
  ["g24", "calisiliyor"],
];
let gorevAdimi = 0;
function gorevIlerlet() {
  for (let i = 0; i < GOREV_AKISI.length; i++) {
    const [gid, durum] = GOREV_AKISI[gorevAdimi++ % GOREV_AKISI.length];
    const g = db.gorevler.find((x) => x.id === gid);
    if (!g || !GECISLER[g.durum].includes(durum)) continue;
    g.durum = durum;
    g.guncelleme = simdi();
    const a = ajanBul(g.atananId);
    if (a && durum === "calisiliyor") {
      a.gorevId = g.id;
      a.isAciklamasi = `${g.kod} ${g.baslik}`;
      ajanYay(a);
    }
    yay({ tur: "gorev.guncellendi", gorev: g }, g.projeId);
    projeYay(g.projeId);
    return;
  }
}

// Durum değişimleri: Mert ve Onur işe girip çıkar, Selin arada çalışır
const DURUM_AKISI = [
  ["mert", "calisiyor", ceviri("T-27 uçtan uca testler", "T-27 end-to-end tests")],
  ["onur", "calisiyor", ceviri("T-19 incelemesi", "T-19 review")],
  ["selin", "calisiyor", ceviri("Liste ekranı boş durum çizimi", "Drawing the list screen's empty state")],
  ["mert", "bosta", ceviri("T-27 için T-24'ü bekliyor", "Waiting on T-24 for T-27")],
  ["onur", "bosta", ceviri("İnceleme bitti", "Review done")],
  ["selin", "bosta", ceviri("Taslaklar teslim edildi", "Drafts delivered")],
  ["onur", "kapali", ceviri("T-19 düzeltmelerini bekliyor", "Waiting for the T-19 fixes")],
];
let durumAdimi = 0;
function durumDegistir() {
  const [aid, durum, aciklama] = DURUM_AKISI[durumAdimi++ % DURUM_AKISI.length];
  const a = ajanBul(aid);
  if (!a || a.durum === "karar_bekliyor") return;
  a.durum = durum;
  a.isAciklamasi = aciklama;
  if (durum !== "kapali") a.oturumId ??= `oturum-${a.id}-1`;
  ajanYay(a);
  projeYay(a.projeId);
}

// İşe alım: bekleyen teklif yoksa CEO yeni aday önerir (kapıda siluet olarak bekler)
const ADAYLAR = [
  { ad: "Defne", rol: "tasarim", model: "sonnet", gerekce: ceviri("Mobil ekranlar için ikinci tasarımcı; Selin'in yükü fazla.", "A second designer for the mobile screens; Selin's workload is too heavy.") },
  { ad: "Kaan", rol: "devops", model: "sonnet", gerekce: ceviri("Dağıtım hattı ve gözlem için ayrı bir DevOps.", "A dedicated DevOps engineer for the deployment pipeline and monitoring.") },
  { ad: "Nil", rol: "test", model: "sonnet", gerekce: ceviri("Kargo entegrasyonu için ikinci test mühendisi.", "A second test engineer for the shipping integration.") },
];
let adayNo = 0;
function isAlimDongusu() {
  if (db.onaylar.some((o) => o.projeId === OFIS && o.tur === "ise_alim" && o.durum === "bekliyor")) return;
  const v = ADAYLAR[adayNo++ % ADAYLAR.length];
  if (projeAjanlari(OFIS).some((a) => a.ad === v.ad)) return;
  const rol = V.roller.find((r) => r.kimlik === v.rol);
  const o = {
    id: yeniKimlik("o"),
    projeId: OFIS,
    ajanId: "ada",
    tur: "ise_alim",
    baslik: `${v.ad} · ${rol?.ad ?? v.rol}`,
    ayrinti: v.gerekce,
    veri: { ad: v.ad, rol: v.rol, model: v.model, yoneticiId: "kerem", talimatEki: "" },
    durum: "bekliyor",
    olusturma: simdi(),
    sonGecerlilik: null,
    sonuclanma: null,
    not: null,
  };
  db.onaylar.unshift(o);
  yay({ tur: "onay.yeni", onay: o }, OFIS);
  projeYay(OFIS);
}

// Birleştirme: incelemedeki bir görev için kurul onayı istenir
function birlestirmeDongusu() {
  // 0.0.8: birleştirme yok; ortak çalışma modülü görev kaydı oynatır (surum-008-ortak.mjs)
  if (db.ortakCalisma) return db.ortakCalisma.kayitDongusu();
  if (db.onaylar.some((o) => o.projeId === OFIS && o.tur === "birlestirme" && o.durum === "bekliyor")) return;
  const g = db.gorevler.find((x) => x.projeId === OFIS && x.durum === "inceleme" && x.atananId);
  if (!g) return;
  const o = {
    id: yeniKimlik("o"),
    projeId: OFIS,
    ajanId: "onur",
    tur: "birlestirme",
    baslik: `${g.kod} ${g.baslik} → main`,
    ayrinti: ceviri("İnceleme tamam, testler geçti, çakışma yok.", "Review done, tests passed, no conflicts."),
    veri: { gorevId: g.id, dal: `arnorg/${g.atananId}/${g.kod}`, hedefDal: "main", dosyaSayisi: 4, eklenen: 126, silinen: 9, testler: ceviri("52/52 geçti", "52/52 passed") },
    durum: "bekliyor",
    olusturma: simdi(),
    sonGecerlilik: null,
    sonuclanma: null,
    not: null,
  };
  db.onaylar.unshift(o);
  yay({ tur: "onay.yeni", onay: o }, OFIS);
  projeYay(OFIS);
}

let gozetmenSayaci = 0;
function gozetmen() {
  // Bildirim her ekranda görünür; seyrek gelsin
  if (gozetmenSayaci++ % 3 !== 0) return;
  const g = db.gorevler.find((x) => x.projeId === OFIS && x.durum === "calisiliyor" && x.atananId && ajanBul(x.atananId)?.durum !== "kapali");
  const a = g && ajanBul(g.atananId);
  if (!g || !a) return;
  yay({ tur: "bildirim", seviye: "uyari", metin: ceviri(`${g.kod} 20 dakikadır ilerlemiyor; ${a.ad} hatırlatıldı.`, `${g.kod} hasn't moved in 20 minutes; ${a.ad} was reminded.`), projeId: OFIS });
}

const OFIS_ADIMLARI = [anmaliMesaj, gorevIlerlet, durumDegistir, toplantiMesaji, anmaliMesaj, gorevIlerlet, isAlimDongusu, durumDegistir, anmaliMesaj, birlestirmeDongusu, gozetmen];
let ofisAdimi = 0;
setTimeout(() => {
  anmaliMesaj();
  setInterval(() => OFIS_ADIMLARI[ofisAdimi++ % OFIS_ADIMLARI.length](), 6000);
}, 3000);

// ---------------------------------------------------------------------------
// Ajan tepkileri
// ---------------------------------------------------------------------------

function cevapla(ajanId, metin, gecikme = 1400) {
  setTimeout(() => {
    const a = ajanBul(ajanId);
    if (!a || a.durum === "kapali") return;
    akisEkle(ajanId, { tur: "asistan", metin });
    akisEkle(ajanId, { tur: "sonuc", token: 2400 });
    kullan(ajanId, 2400);
  }, gecikme);
}

function oturumAc(a) {
  if (a.durum === "kapali" || a.durum === "duraklatildi" || a.durum === "hata") {
    a.durum = "calisiyor";
    a.oturumId ??= `oturum-${a.id}-${crypto.randomBytes(2).toString("hex")}`;
    akisEkle(a.id, { tur: "sistem", metin: ceviri(`Oturum açıldı · ${a.dal ?? "ana"} · ${a.model}`, `Session opened · ${a.dal ?? "main"} · ${a.model}`) });
    ajanYay(a);
    projeYay(a.projeId);
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

class Hata extends Error {
  constructor(durum, mesaj) {
    super(mesaj);
    this.durum = durum;
  }
}

const GECISLER = {
  bekleyen: ["planlandi", "calisiliyor", "iptal"],
  planlandi: ["bekleyen", "calisiliyor", "iptal"],
  calisiliyor: ["planlandi", "inceleme", "iptal"],
  inceleme: ["calisiliyor", "tamam", "iptal"],
  tamam: ["calisiliyor"],
  iptal: ["bekleyen"],
};
const DURUM_ADLARI = ceviri(
  { bekleyen: "Bekleyen", planlandi: "Planlandı", calisiliyor: "Çalışılıyor", inceleme: "İncelemede", tamam: "Tamam", iptal: "İptal" },
  { bekleyen: "Backlog", planlandi: "Planned", calisiliyor: "In progress", inceleme: "In review", tamam: "Done", iptal: "Cancelled" },
);

const rotalar = [];
const rota = (yontem, desen, isleyici) => rotalar.push({ yontem, desen: new RegExp(`^${desen.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`), isleyici });

rota("GET", "/api/saglik", () => ({
  surum: SURUM,
  dil: db.ayarlar.dil,
  platform: `${process.platform}-${process.arch}`,
  claudeBulundu: true,
  claudeYolu: "/home/furkan/.local/bin/claude",
  claudeSurumu: "2.1.287",
  sdkSurumu: "0.3.287",
  veriDizini: "/home/furkan/.local/share/arnorg",
}));
rota("GET", "/api/ayarlar", () => db.ayarlar);
rota("PUT", "/api/ayarlar", ({ govde }) => {
  const eskiModel = db.ayarlar.kodZekasiModeli;
  Object.assign(db.ayarlar, govde);
  if (govde?.kodZekasiModeli && govde.kodZekasiModeli !== eskiModel) kodModelDegisti();
  yay({ tur: "hesap.guncellendi", hesap: hesapCevabi() }, null);
  return db.ayarlar;
});
rota("GET", "/api/hesap", () => hesapCevabi());
rota("GET", "/api/roller", () => V.roller);

// İlk kurulum kipi (ARNORG_KURULUM=yeni): kurulum bitene kadar tohum projeler görünmez, gerçek ilk açılış gibi
const ILK_KURULUM = process.env.ARNORG_KURULUM === "yeni";
const TOHUM_PROJELER = new Set(db.projeler.map((p) => p.id));
const tohumGizli = (p) => ILK_KURULUM && !db.ayarlar.kurulumTamam && TOHUM_PROJELER.has(p.id);
rota("GET", "/api/projeler", () => db.projeler.filter((p) => !tohumGizli(p)).map(projeOzeti));
let projeEkleyici = null;
let yonetimIsleyici = null;
const onaySonucuDinleyicileri = [];
rota("POST", "/api/projeler", ({ govde }) => {
  if (!govde?.ad?.trim()) throw new Hata(400, ceviri("Proje adı gerekli.", "Project name is required."));
  if (!govde.olustur && !govde.yol?.trim()) throw new Hata(400, ceviri("Var olan repoyu bağlamak için klasörünü seçin.", "Choose the folder of the existing repository."));
  const klasor = govde.ad.trim().toLocaleLowerCase("tr-TR").replace(/[çğıöşü]/g, (h) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[h]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const yol = govde.yol?.trim() || `/home/furkan/ArnOrg/${klasor || "proje"}`;
  if (!yol.startsWith("/")) throw new Hata(400, ceviri("Yol mutlak olmalı.", "The path must be absolute."));
  if (db.projeler.some((p) => p.yol === yol)) throw new Hata(409, ceviri("Bu repo zaten bir ArnOrg projesi.", "This repository is already an ArnOrg project."));
  const uzak = govde.github ? `${govde.github.sahip || "furkan-y"}/${klasor || "proje"}` : null;
  const p = projeEkleyici(govde.ad.trim(), yol, govde.aciklama ?? "", govde.dal?.trim() || "main", uzak);
  return projeOzeti(p);
});
rota("GET", "/api/projeler/:pid", ({ p }) => projeOzeti(projeGerekli(p.pid)));
rota("DELETE", "/api/projeler/:pid", ({ p }) => {
  projeGerekli(p.pid);
  db.projeler = db.projeler.filter((x) => x.id !== p.pid);
  return { tamam: true };
});

/** Ofis karakteri: hazır kütüphane (k01) ya da üretilmiş (u-<kimlik>); null otomatik */
function karakterDenetle(govde) {
  if (govde && "karakter" in govde && govde.karakter !== null && !/^(k\d{2}|u-[a-z0-9-]{4,64})$/.test(String(govde.karakter))) throw new Hata(400, ceviri("Geçersiz karakter kimliği.", "Invalid character id."));
}

function projeGerekli(pid) {
  const p = proje(pid);
  if (!p) throw new Hata(404, ceviri("Proje bulunamadı.", "Project not found."));
  return p;
}
function ajanGerekli(aid) {
  const a = ajanBul(aid);
  if (!a) throw new Hata(404, ceviri("Ajan bulunamadı.", "Agent not found."));
  return a;
}

rota("GET", "/api/projeler/:pid/ajanlar", ({ p }) => (projeGerekli(p.pid), projeAjanlari(p.pid)));
rota("POST", "/api/projeler/:pid/ajanlar", ({ p, govde }) => {
  const pr = projeGerekli(p.pid);
  const rol = V.roller.find((r) => r.kimlik === govde?.rol);
  if (!govde?.ad || !rol) throw new Hata(400, ceviri("Ad ve geçerli bir rol gerekli.", "A name and a valid role are required."));
  karakterDenetle(govde);
  if (projeAjanlari(p.pid).some((a) => a.ad.toLocaleLowerCase("tr-TR") === govde.ad.toLocaleLowerCase("tr-TR"))) throw new Hata(400, ceviri("Bu adda bir çalışan zaten var.", "An employee with this name already exists."));
  const id = govde.ad.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]+/g, "") || yeniKimlik("a");
  const a = {
    id,
    projeId: p.pid,
    ad: govde.ad,
    rol: rol.kimlik,
    rolAdi: rol.ad,
    model: govde.model ?? rol.varsayilanModel,
    yoneticiId: govde.yoneticiId ?? null,
    durum: "kapali",
    isAciklamasi: ceviri("Yeni işe alındı", "Just hired"),
    gorevId: null,
    oturumId: null,
    calismaAlani: rol.yonetici ? null : `${pr.id === "siparis-paneli" ? V.CALISMA_KOKU : pr.yol + "/.arnorg/calisma"}/${id}`,
    dal: `arnorg/${id}`,
    izinModu: db.ayarlar.varsayilanIzinModu,
    bugunToken: 0,
    toplamToken: 0,
    talimatEki: govde.talimatEki ?? "",
    karakter: govde.karakter ?? null,
    olusturma: simdi(),
  };
  db.ajanlar.push(a);
  db.katmanlar[id] = {};
  db.akislar[id] = [];
  ajanYay(a);
  projeYay(p.pid);
  return a;
});
rota("PATCH", "/api/ajanlar/:aid", ({ p, govde }) => {
  const a = ajanGerekli(p.aid);
  karakterDenetle(govde);
  for (const k of ["model", "izinModu", "yoneticiId", "talimatEki", "karakter"]) if (govde && k in govde) a[k] = govde[k];
  ajanYay(a);
  return a;
});
rota("DELETE", "/api/ajanlar/:aid", ({ p, q }) => {
  const a = ajanGerekli(p.aid);
  // Çekirdekteki gibi: CEO çıkarılamaz; açık işler devralana (verilmezse yöneticisine) geçer
  if (a.rol === "ceo") throw new Hata(400, ceviri("CEO işten çıkarılamaz.", "The CEO cannot be let go."));
  const devralanId = q.get("devralan") || a.yoneticiId;
  const devralan = devralanId ? db.ajanlar.find((x) => x.id === devralanId && x.projeId === a.projeId && x.id !== a.id) : null;
  db.ajanlar = db.ajanlar.filter((x) => x.id !== a.id);
  for (const g of db.gorevler) if (g.atananId === a.id) g.atananId = devralan?.id ?? null;
  mesajEkle(
    a.projeId,
    "genel",
    "arnorg",
    ceviri(
      `${a.ad} (${a.rolAdi}) ekipten ayrıldı${devralan ? `; açık işleri ve bildikleri ${yonelme(devralan.ad)} devredildi` : ""}.`,
      `${a.ad} (${a.rolAdi}) left the team${devralan ? `; open work and knowledge were handed over to ${devralan.ad}` : ""}.`,
    ),
  );
  yay({ tur: "ajan.silindi", projeId: a.projeId, ajanId: a.id }, a.projeId);
  projeYay(a.projeId);
  return { tamam: true };
});
rota("POST", "/api/ajanlar/:aid/baslat", ({ p, govde }) => {
  const a = ajanGerekli(p.aid);
  oturumAc(a);
  const g = db.gorevler.find((x) => x.id === (govde?.gorevId ?? a.gorevId));
  const talimat = govde?.talimat || (g ? ceviri(`${g.kod} üzerinde çalış: ${g.baslik}.`, `Work on ${g.kod}: ${g.baslik}.`) : ceviri("Kaldığın yerden devam et.", "Pick up where you left off."));
  akisEkle(a.id, { tur: "kullanici", metin: talimat });
  if (g) a.isAciklamasi = `${g.kod} ${g.baslik}`;
  ajanYay(a);
  cevapla(
    a.id,
    ceviri(
      `Başlıyorum. Önce ${g ? `${g.kod} kabul ölçütünü` : "son durumu"} okuyup bir plan çıkaracağım.`,
      `Starting now. I'll read ${g ? `the ${g.kod} acceptance criteria` : "the latest status"} first and put together a plan.`,
    ),
  );
  return a;
});
rota("POST", "/api/ajanlar/:aid/mesaj", ({ p, govde }) => {
  const a = ajanGerekli(p.aid);
  if (!govde?.metin) throw new Hata(400, ceviri("Mesaj boş olamaz.", "The message can't be empty."));
  const calisiyordu = a.durum === "calisiyor";
  oturumAc(a);
  if (govde.oncelik === "now" && calisiyordu) akisEkle(a.id, { tur: "sonuc", hata: true, metin: ceviri("Kurul mesajı için kesildi", "Interrupted for a board message") });
  akisEkle(a.id, { tur: "kullanici", metin: govde.metin });
  cevapla(
    a.id,
    ceviri(`Not aldım: "${govde.metin.slice(0, 80)}". Buna göre devam ediyorum.`, `Noted: "${govde.metin.slice(0, 80)}". I'll carry on with that in mind.`),
    govde.oncelik === "now" ? 900 : 2200,
  );
  return { tamam: true };
});
rota("POST", "/api/ajanlar/:aid/kes", ({ p }) => {
  const a = ajanGerekli(p.aid);
  if (a.durum === "calisiyor" || a.durum === "karar_bekliyor") {
    akisEkle(a.id, { tur: "sonuc", hata: true, metin: ceviri("Kurul tarafından kesildi", "Interrupted by the board") });
    a.durum = "duraklatildi";
    a.isAciklamasi = ceviri("Kurul tarafından duraklatıldı", "Paused by the board");
    ajanYay(a);
    projeYay(a.projeId);
  }
  return { tamam: true };
});
rota("POST", "/api/ajanlar/:aid/durdur", ({ p }) => {
  const a = ajanGerekli(p.aid);
  if (a.durum !== "kapali") {
    akisEkle(a.id, { tur: "sistem", metin: ceviri("Oturum kapatıldı · oturum kimliği saklandı", "Session closed · session id kept") });
    a.durum = "kapali";
    ajanYay(a);
    projeYay(a.projeId);
  }
  return a;
});
rota("POST", "/api/ajanlar/:aid/mod", ({ p, govde }) => {
  const a = ajanGerekli(p.aid);
  a.izinModu = govde?.mod ?? a.izinModu;
  if (a.durum !== "kapali") akisEkle(a.id, { tur: "sistem", metin: ceviri(`İzin modu: ${a.izinModu}`, `Permission mode: ${a.izinModu}`) });
  ajanYay(a);
  return a;
});
rota("POST", "/api/ajanlar/:aid/model", ({ p, govde }) => {
  const a = ajanGerekli(p.aid);
  a.model = govde?.model ?? a.model;
  if (a.durum !== "kapali") akisEkle(a.id, { tur: "sistem", metin: `Model: ${a.model}` });
  ajanYay(a);
  return a;
});
rota("GET", "/api/ajanlar/:aid/akis", ({ p, q }) => {
  ajanGerekli(p.aid);
  const sinir = Number(q.get("sinir") ?? 300);
  return (db.akislar[p.aid] ?? []).slice(-sinir);
});

rota("GET", "/api/projeler/:pid/gorevler", ({ p }) => (projeGerekli(p.pid), db.gorevler.filter((g) => g.projeId === p.pid)));
rota("POST", "/api/projeler/:pid/gorevler", ({ p, govde }) => {
  projeGerekli(p.pid);
  if (!govde?.baslik) throw new Hata(400, ceviri("Başlık gerekli.", "A title is required."));
  const no = Math.max(0, ...db.gorevler.filter((g) => g.projeId === p.pid).map((g) => g.no)) + 1;
  const g = {
    id: yeniKimlik("g"),
    projeId: p.pid,
    no,
    kod: `T-${no}`,
    baslik: govde.baslik,
    aciklama: govde.aciklama ?? "",
    kabulOlcutu: govde.kabulOlcutu ?? "",
    durum: govde.durum ?? "bekleyen",
    atananId: govde.atananId ?? null,
    bagimliliklar: govde.bagimliliklar ?? [],
    etiket: govde.etiket ?? "",
    olusturanId: null,
    olusturma: simdi(),
    guncelleme: simdi(),
  };
  db.gorevler.push(g);
  yay({ tur: "gorev.guncellendi", gorev: g }, p.pid);
  projeYay(p.pid);
  return g;
});
rota("PATCH", "/api/gorevler/:gid", ({ p, govde }) => {
  const g = db.gorevler.find((x) => x.id === p.gid);
  if (!g) throw new Hata(404, ceviri("Görev bulunamadı.", "Task not found."));
  if (govde?.durum && govde.durum !== g.durum) {
    if (!GECISLER[g.durum].includes(govde.durum))
      throw new Hata(
        409,
        ceviri(
          `${g.kod}: ${DURUM_ADLARI[g.durum]} → ${DURUM_ADLARI[govde.durum]} geçişine izin yok. İzin verilenler: ${GECISLER[g.durum].map((d) => DURUM_ADLARI[d]).join(", ")}.`,
          `${g.kod}: moving from ${DURUM_ADLARI[g.durum]} to ${DURUM_ADLARI[govde.durum]} isn't allowed. Allowed: ${GECISLER[g.durum].map((d) => DURUM_ADLARI[d]).join(", ")}.`,
        ),
      );
    if (govde.durum === "calisiliyor") {
      const acik = (govde.bagimliliklar ?? g.bagimliliklar).map((id) => db.gorevler.find((x) => x.id === id)).filter((x) => x && x.durum !== "tamam");
      if (acik.length) throw new Hata(409, ceviri(`${g.kod} başlayamaz: bağımlılıklar bitmedi (${acik.map((x) => x.kod).join(", ")}).`, `${g.kod} can't start: its dependencies aren't done (${acik.map((x) => x.kod).join(", ")}).`));
    }
  }
  for (const k of ["baslik", "aciklama", "kabulOlcutu", "durum", "atananId", "bagimliliklar", "etiket"]) if (govde && k in govde) g[k] = govde[k];
  g.guncelleme = simdi();
  if (govde?.durum === "calisiliyor" && g.atananId) {
    const a = ajanBul(g.atananId);
    if (a) {
      a.gorevId = g.id;
      a.isAciklamasi = `${g.kod} ${g.baslik}`;
      oturumAc(a);
    }
  }
  yay({ tur: "gorev.guncellendi", gorev: g }, g.projeId);
  projeYay(g.projeId);
  return g;
});

rota("GET", "/api/projeler/:pid/kanallar", ({ p }) => {
  projeGerekli(p.pid);
  return (db.kanallar[p.pid] ?? []).map((k) => ({ ...k, mesajSayisi: db.mesajlar.filter((m) => m.projeId === p.pid && m.kanal === k.ad).length }));
});
rota("GET", "/api/projeler/:pid/kanallar/:kanal/mesajlar", ({ p, q }) => {
  const sinir = Number(q.get("sinir") ?? 200);
  return db.mesajlar.filter((m) => m.projeId === p.pid && m.kanal === decodeURIComponent(p.kanal)).slice(-sinir);
});
rota("POST", "/api/projeler/:pid/kanallar/:kanal/mesajlar", ({ p, govde }) => {
  projeGerekli(p.pid);
  const kanal = decodeURIComponent(p.kanal);
  if (!govde?.metin?.trim()) throw new Hata(400, ceviri("Mesaj boş olamaz.", "The message can't be empty."));
  const m = mesajEkle(p.pid, kanal, "kurul", govde.metin.trim());
  if (kanal === "yonetim" && !m.anilanlar.length) {
    yonetimIsleyici?.(p.pid, m.metin);
    return m;
  }
  const hedefler = m.anilanlar.length ? m.anilanlar : kanal === "genel" ? projeAjanlari(p.pid).filter((a) => a.rol === "ceo").map((a) => a.id) : [];
  for (const aid of hedefler) {
    const a = ajanBul(aid);
    if (!a) continue;
    oturumAc(a);
    akisEkle(aid, { tur: "kullanici", metin: ceviri(`Kurul (#${kanal}): ${m.metin}`, `Board (#${kanalGorunenAdi(kanal)}): ${m.metin}`) });
    yay({ tur: "kanal.yaziyor", projeId: p.pid, kanal, ajanId: aid, ad: a.ad, yaziyor: true }, p.pid);
    setTimeout(() => {
      yay({ tur: "kanal.yaziyor", projeId: p.pid, kanal, ajanId: aid, ad: a.ad, yaziyor: false }, p.pid);
      const yanit =
        a.rol === "ceo"
          ? ceviri(
              `Not aldım. Kapsamını Kerem'le netleştirip panoya ekliyorum; tahmini süre iki gün. Planı bu akşamki raporda paylaşırım.`,
              `Noted. I'll pin down the scope with Kerem and add it to the board; my estimate is two days. I'll share the plan in tonight's report.`,
            )
          : ceviri(`Aldım, ${m.metin.length > 60 ? "bu notu" : `"${m.metin}"`} hesaba katarak devam ediyorum.`, `Got it, I'll keep ${m.metin.length > 60 ? "this note" : `"${m.metin}"`} in mind as I carry on.`);
      mesajEkle(p.pid, kanal, aid, yanit);
      akisEkle(aid, { tur: "asistan", metin: yanit });
      kullan(aid, 1800);
    }, 1600);
  }
  return m;
});

rota("GET", "/api/projeler/:pid/notlar", ({ p }) => {
  projeGerekli(p.pid);
  const notlar = db.notlar[p.pid] ?? {};
  return Object.entries(notlar).map(([yol, icerik]) => ({ yol, baslik: (/^#\s+(.+)$/m.exec(icerik)?.[1] ?? yol).trim(), guncelleme: db.notZamanlari[p.pid]?.[yol] ?? simdi() }));
});
rota("GET", "/api/projeler/:pid/not", ({ p, q }) => {
  const yol = q.get("yol") ?? "";
  if (yol.includes("..")) throw new Hata(400, ceviri("Yol .. içeremez.", "The path can't contain '..'."));
  const icerik = db.notlar[p.pid]?.[yol];
  if (icerik === undefined) throw new Hata(404, ceviri("Not bulunamadı.", "Note not found."));
  return { yol, icerik };
});
rota("PUT", "/api/projeler/:pid/not", ({ p, govde }) => {
  if (!govde?.yol || govde.yol.includes("..")) throw new Hata(400, ceviri("Geçersiz yol.", "Invalid path."));
  (db.notlar[p.pid] ??= {})[govde.yol] = govde.icerik ?? "";
  (db.notZamanlari[p.pid] ??= {})[govde.yol] = simdi();
  return { yol: govde.yol, baslik: (/^#\s+(.+)$/m.exec(govde.icerik ?? "")?.[1] ?? govde.yol).trim(), guncelleme: simdi() };
});

// ---------------- proje hafızası, defterler, sorular ----------------
const hafizaTurleri = ["olgu", "karar", "tercih", "ogrenilen", "uzmanlik", "ozet"];
const sadeMetin = (m) => String(m ?? "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
function hafizaSirala(liste) {
  return liste.sort((a, b) => b.onem - a.onem || b.guncelleme.localeCompare(a.guncelleme));
}
function hafizaYay(k) {
  yay({ tur: "hafiza.yeni", kayit: k }, k.projeId);
}
function hafizaEkle(pid, g, kaynak) {
  if (!hafizaTurleri.includes(g?.tur)) throw new Hata(400, ceviri("Geçersiz hafıza türü.", "Invalid memory type."));
  if (!g.baslik?.trim() || !g.metin?.trim()) throw new Hata(400, ceviri("Başlık ve metin gerekli.", "A title and text are required."));
  const ayni = db.hafiza.find((k) => k.projeId === pid && !k.yerineGecen && k.tur === g.tur && sadeMetin(k.baslik) === sadeMetin(g.baslik));
  if (ayni && !g.yerineGectigi) {
    Object.assign(ayni, { metin: g.metin.trim(), etiketler: g.etiketler ?? [], onem: Math.max(ayni.onem, g.onem ?? 3), guncelleme: simdi() });
    hafizaYay(ayni);
    return ayni;
  }
  const k = {
    id: yeniKimlik("h"),
    projeId: pid,
    tur: g.tur,
    baslik: g.baslik.trim(),
    metin: g.metin.trim(),
    etiketler: g.etiketler ?? [],
    kaynakAjanId: kaynak.ajanId,
    kaynakAd: kaynak.ad,
    gorevId: g.gorevId ?? null,
    onem: Math.min(Math.max(g.onem ?? 3, 1), 5),
    yerineGecen: null,
    olusturma: simdi(),
    guncelleme: simdi(),
  };
  db.hafiza.unshift(k);
  hafizaYay(k);
  if (g.yerineGectigi) {
    const eski = db.hafiza.find((x) => x.id === g.yerineGectigi);
    if (eski) {
      Object.assign(eski, { yerineGecen: k.id, guncelleme: simdi() });
      hafizaYay(eski);
    }
  }
  return k;
}
rota("GET", "/api/projeler/:pid/hafiza", ({ p, q }) => {
  projeGerekli(p.pid);
  const tur = q.get("tur");
  const aranan = sadeMetin(q.get("q") ?? "").split(/[^a-z0-9]+/).filter((x) => x.length >= 2);
  let liste = db.hafiza.filter((k) => k.projeId === p.pid && (!tur || k.tur === tur));
  if (aranan.length) {
    return liste
      .filter((k) => !k.yerineGecen)
      .map((k) => ({ k, puan: aranan.filter((x) => sadeMetin(`${k.baslik} ${k.metin} ${k.etiketler.join(" ")}`).includes(x)).length }))
      .filter((x) => x.puan > 0)
      .sort((a, b) => b.puan - a.puan || b.k.onem - a.k.onem)
      .map((x) => x.k);
  }
  if (q.get("eskiler") !== "1") liste = liste.filter((k) => !k.yerineGecen);
  return hafizaSirala([...liste]);
});
rota("POST", "/api/projeler/:pid/hafiza", ({ p, govde }) => {
  projeGerekli(p.pid);
  return hafizaEkle(p.pid, govde, { ajanId: null, ad: ceviri("Yönetim kurulu", "Board") });
});
const DURAK = new Set("ve veya ile icin bu bir ne mi gibi daha olarak olan var yok the and or".split(" "));
const sozcukKumesi = (m) => new Set(sadeMetin(m).split(/[^a-z0-9]+/).filter((x) => x.length >= 3 && !DURAK.has(x)));
const ayrikCiftler = new Set();
rota("GET", "/api/projeler/:pid/hafiza/benzerler", ({ p }) => {
  projeGerekli(p.pid);
  const liste = db.hafiza.filter((k) => k.projeId === p.pid && !k.yerineGecen).map((k) => ({ k, s: sozcukKumesi(`${k.baslik} ${k.metin}`) }));
  const sonuc = [];
  for (let i = 0; i < liste.length; i++)
    for (let j = i + 1; j < liste.length; j++) {
      const x = liste[i], y = liste[j];
      if (x.k.tur !== y.k.tur || ayrikCiftler.has([x.k.id, y.k.id].sort().join("|"))) continue;
      let ortak = 0;
      for (const s of x.s) if (y.s.has(s)) ortak++;
      const benzerlik = Math.max(ortak / (x.s.size + y.s.size - ortak), ortak >= 3 ? (ortak / Math.min(x.s.size, y.s.size)) * 0.8 : 0);
      if (benzerlik >= 0.45) sonuc.push({ a: x.k, b: y.k, benzerlik: Math.round(benzerlik * 100) / 100 });
    }
  return sonuc.sort((a, b) => b.benzerlik - a.benzerlik);
});
rota("POST", "/api/projeler/:pid/hafiza/ayri", ({ govde }) => {
  ayrikCiftler.add([govde.a, govde.b].sort().join("|"));
  return { tamam: true };
});
rota("POST", "/api/hafiza/:hid/birlestir", ({ p, govde }) => {
  const t = db.hafiza.find((x) => x.id === p.hid);
  const e = db.hafiza.find((x) => x.id === govde?.eskiyen);
  if (!t || !e) throw new Hata(404, ceviri("Birleştirilecek kayıtlar bulunamadı.", "The records to merge were not found."));
  Object.assign(t, { metin: govde.metin?.trim() || t.metin, etiketler: [...new Set([...t.etiketler, ...e.etiketler])], onem: Math.max(t.onem, e.onem), guncelleme: simdi() });
  Object.assign(e, { yerineGecen: t.id, guncelleme: simdi() });
  hafizaYay(t);
  hafizaYay(e);
  return t;
});
rota("PATCH", "/api/hafiza/:hid", ({ p, govde }) => {
  const k = db.hafiza.find((x) => x.id === p.hid);
  if (!k) throw new Hata(404, ceviri("Hafıza kaydı bulunamadı.", "Memory record not found."));
  for (const alan of ["tur", "baslik", "metin", "etiketler", "onem"]) if (govde?.[alan] !== undefined) k[alan] = govde[alan];
  k.guncelleme = simdi();
  hafizaYay(k);
  return k;
});
rota("DELETE", "/api/hafiza/:hid", ({ p }) => {
  const i = db.hafiza.findIndex((x) => x.id === p.hid);
  if (i < 0) throw new Hata(404, ceviri("Hafıza kaydı bulunamadı.", "Memory record not found."));
  const [k] = db.hafiza.splice(i, 1);
  yay({ tur: "hafiza.silindi", projeId: k.projeId, id: k.id }, k.projeId);
  return { tamam: true };
});
rota("GET", "/api/projeler/:pid/sorular", ({ p, q }) => {
  projeGerekli(p.pid);
  return db.sorular
    .filter((s) => s.projeId === p.pid)
    .sort((a, b) => b.olusturma.localeCompare(a.olusturma))
    .slice(0, Number(q.get("sinir") ?? 100));
});
rota("GET", "/api/ajanlar/:aid/defter", ({ p }) => {
  ajanGerekli(p.aid);
  return { icerik: db.defterler[p.aid] ?? "", guncelleme: db.defterZamanlari[p.aid] ?? (db.defterler[p.aid] ? V.once(40) : null) };
});
rota("PUT", "/api/ajanlar/:aid/defter", ({ p, govde }) => {
  ajanGerekli(p.aid);
  if (typeof govde?.icerik !== "string" || govde.icerik.length > 6000) throw new Hata(400, ceviri("Defter en çok 6000 karakter olabilir.", "The notebook can be at most 6000 characters."));
  db.defterler[p.aid] = govde.icerik.trim();
  db.defterZamanlari[p.aid] = simdi();
  return { tamam: true };
});

// Canlı demo: ajanlar birbirine soru sorar, yanıtlar ve hafızaya yazar
let hafizaDemoAdimi = 0;
setInterval(() => {
  const adim = hafizaDemoAdimi++;
  if (adim % 2 === 0) {
    const d = H.demoSorular[(adim / 2) % H.demoSorular.length];
    const soran = ajanBul(d.soranId);
    if (!soran || soran.durum === "kapali") return;
    const s = { id: yeniKimlik("s"), projeId: "siparis-paneli", soranId: d.soranId, soranAd: d.soranAd, soruluId: d.soruluId, soruluAd: d.soruluAd, soru: d.soru, yanit: null, durum: "bekliyor", olusturma: simdi(), yanitlanma: null };
    db.sorular.unshift(s);
    yay({ tur: "soru.guncellendi", soru: s }, s.projeId);
    akisEkle(d.soranId, { tur: "arac_cagrisi", arac: "mcp__arnorg__ajana_sor", aracKimligi: yeniKimlik("toolu"), girdi: { ajan: d.soruluAd, soru: d.soru } });
    setTimeout(() => {
      Object.assign(s, { yanit: d.yanit, durum: "yanitlandi", yanitlanma: simdi() });
      yay({ tur: "soru.guncellendi", soru: s }, s.projeId);
      akisEkle(d.soruluId, { tur: "arac_cagrisi", arac: "mcp__arnorg__soruyu_yanitla", aracKimligi: yeniKimlik("toolu"), girdi: { soru_id: s.id, yanit: d.yanit } });
    }, 6500);
  } else {
    const k = H.demoKayitlar[((adim - 1) / 2) % H.demoKayitlar.length];
    const a = ajanBul(k.kaynakAjanId);
    if (!a || a.durum === "kapali") return;
    hafizaEkle("siparis-paneli", k, { ajanId: k.kaynakAjanId, ad: k.kaynakAd });
    akisEkle(k.kaynakAjanId, { tur: "arac_cagrisi", arac: "mcp__arnorg__hafiza_kaydet", aracKimligi: yeniKimlik("toolu"), girdi: { tur: k.tur, baslik: k.baslik } });
  }
}, 21_000);

rota("GET", "/api/projeler/:pid/denetim", ({ p, q }) => db.denetim.filter((k) => k.projeId === p.pid).slice(0, Number(q.get("sinir") ?? 300)));
rota("GET", "/api/projeler/:pid/politika", ({ p }) => db.politika[p.pid] ?? []);
rota("PUT", "/api/projeler/:pid/politika", ({ p, govde }) => {
  if (!Array.isArray(govde)) throw new Hata(400, ceviri("Kural listesi bekleniyor.", "Expected a list of rules."));
  for (const k of govde) for (const d of k.desenler ?? []) {
    try {
      new RegExp(d, "i");
    } catch {
      throw new Hata(400, ceviri(`Geçersiz desen: ${d}`, `Invalid pattern: ${d}`));
    }
  }
  db.politika[p.pid] = govde;
  return govde;
});
rota("GET", "/api/projeler/:pid/onaylar", ({ p, q }) => {
  const durum = q.get("durum");
  return db.onaylar.filter((o) => o.projeId === p.pid && (!durum || o.durum === durum)).sort((a, b) => b.olusturma.localeCompare(a.olusturma));
});
rota("POST", "/api/onaylar/:oid", ({ p, govde }) => {
  const o = db.onaylar.find((x) => x.id === p.oid);
  if (!o) throw new Hata(404, ceviri("Onay bulunamadı.", "Approval not found."));
  if (o.durum !== "bekliyor") throw new Hata(409, ceviri(`Bu karar zaten verilmiş (${o.durum}).`, `This decision has already been made (${o.durum}).`));
  const kabul = govde?.karar === "onayla";
  o.durum = kabul ? "onaylandi" : "reddedildi";
  o.sonuclanma = simdi();
  o.not = govde?.not ?? null;
  const a = ajanBul(o.ajanId);
  if (o.tur === "arac" && a) {
    const komut = o.veri?.girdi?.command ?? o.veri?.girdi?.url ?? o.baslik;
    denetimEkle(a.id, o.veri?.arac ?? "Bash", komut, kabul ? "izin" : "ret", kabul ? ceviri("Yönetim kurulu onayı", "Board approval") : ceviri("Yönetim kurulu reddi", "Board rejection"), o.not);
    akisEkle(a.id, {
      tur: "arac_sonucu",
      aracKimligi: o.veri?.aracKimligi,
      metin: kabul ? "To github.com:arnex/siparis-paneli.git\n   4be1c02..9f3d7aa  main -> main" : ceviri(`Kurul reddetti${o.not ? `: ${o.not}` : "."}`, `Rejected by the board${o.not ? `: ${o.not}` : "."}`),
      hata: !kabul,
    });
    a.durum = "calisiyor";
    a.isAciklamasi = a.gorevId ? `${db.gorevler.find((g) => g.id === a.gorevId)?.kod ?? ""} ${db.gorevler.find((g) => g.id === a.gorevId)?.baslik ?? ""}`.trim() : a.isAciklamasi;
    ajanYay(a);
    cevapla(
      a.id,
      kabul
        ? ceviri("Gönderildi. Görevi incelemeye alıyorum.", "Pushed. Moving the task to review.")
        : ceviri(`Anlaşıldı${o.not ? `: ${o.not}` : ""}. Dalımı itip PR açıyorum.`, `Understood${o.not ? `: ${o.not}` : ""}. I'll push my branch and open a PR.`),
    );
    setTimeout(yeniSoru, 45_000);
  }
  if (o.tur === "ise_alim" && kabul && o.veri) {
    const v = o.veri;
    const rol = V.roller.find((r) => r.kimlik === v.rol) ?? V.roller[2];
    const yeni = {
      id: v.ad.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]+/g, ""),
      projeId: o.projeId,
      ad: v.ad,
      rol: rol.kimlik,
      rolAdi: rol.ad,
      model: v.model ?? rol.varsayilanModel,
      yoneticiId: v.yoneticiId ?? null,
      durum: "bosta",
      isAciklamasi: ceviri("İlk görevi bekliyor", "Waiting for a first task"),
      gorevId: null,
      oturumId: `oturum-${v.ad}-1`,
      calismaAlani: `${V.CALISMA_KOKU}/${v.ad.toLocaleLowerCase("tr-TR")}`,
      dal: `arnorg/${v.ad.toLocaleLowerCase("tr-TR")}`,
      izinModu: db.ayarlar.varsayilanIzinModu,
      bugunToken: 0,
      toplamToken: 0,
      talimatEki: v.talimatEki ?? "",
      karakter: v.karakter ?? null,
      olusturma: simdi(),
    };
    db.ajanlar.push(yeni);
    db.katmanlar[yeni.id] = {};
    db.akislar[yeni.id] = [];
    akisEkle(yeni.id, { tur: "sistem", metin: ceviri(`Oturum açıldı · ${yeni.dal} · ${yeni.model}`, `Session opened · ${yeni.dal} · ${yeni.model}`) });
    ajanYay(yeni);
    setTimeout(
      () =>
        mesajEkle(
          o.projeId,
          "genel",
          "ada",
          ceviri(
            `${yeni.ad} ekibe katıldı. @Kerem ilk görevini sen ata; ödeme işine geçmeden oturum ve jeton akışlarını denetlesin.`,
            `${yeni.ad} joined the team. @Kerem please assign the first task; the session and token flows should be audited before we move on to payments.`,
          ),
        ),
      1200,
    );
  }
  if (o.tur === "birlestirme" && kabul && o.veri?.gorevId) {
    const g = db.gorevler.find((x) => x.id === o.veri.gorevId);
    if (g) {
      g.durum = "tamam";
      g.guncelleme = simdi();
      yay({ tur: "gorev.guncellendi", gorev: g }, g.projeId);
    }
  }
  yay({ tur: "onay.sonuc", onay: o }, o.projeId);
  projeYay(o.projeId);
  for (const d of onaySonucuDinleyicileri) d(o);
  return o;
});

rota("GET", "/api/projeler/:pid/calisma-alanlari", ({ p }) => (projeGerekli(p.pid), calismaAlanlari(p.pid)));

// ---------------------------------------------------------------------------
// Kod zekâsı: örnek repodan sahte dizin (gelistirme/kod-zekasi-verisi.mjs); dizinleme ilerlemesi canlı olaylarla
// ---------------------------------------------------------------------------

const kodDurumlari = new Map();
const kodModelKimligi = () => (db.ayarlar.kodZekasiModeli === "kapali" ? null : `${MODELLER.find((m) => m.secim === db.ayarlar.kodZekasiModeli).kimlik}@q8`);

function kodDurumu(pid, alan) {
  const anahtar = `${pid}:${alan}`;
  if (!kodDurumlari.has(anahtar)) {
    const d = KZ.dizinKur(alanDosyalari(alan));
    const hazir = alan === "ana";
    const parca = hazir ? d.parcalar.length : 0;
    kodDurumlari.set(anahtar, {
      alan,
      durum: hazir ? "hazir" : "bos",
      dosya: hazir ? d.kayitlar.length : 0,
      sembol: hazir ? d.semboller.length : 0,
      parca,
      gomulen: kodModelKimligi() ? parca : 0,
      toplamParca: parca,
      model: kodModelKimligi(),
      indirmeYuzde: null,
      sonGuncelleme: hazir ? new Date(Date.now() - 4 * 60_000).toISOString() : null,
      hata: null,
    });
  }
  return kodDurumlari.get(anahtar);
}

const kodYay = (pid, d) => yay({ tur: "kod.dizin", projeId: pid, durum: { ...d } }, pid);
const kodSuren = new Map();

/** Dizinleme gösterimi: tarama, gerekiyorsa model indirme, gömme; her adım kod.dizin olayıyla */
function kodDizinleGoster(pid, alan, { yalnizGomme = false } = {}) {
  const anahtar = `${pid}:${alan}`;
  clearInterval(kodSuren.get(anahtar));
  const d = kodDurumu(pid, alan);
  const dizin = KZ.dizinKur(alanDosyalari(alan));
  const model = MODELLER.find((m) => m.secim === db.ayarlar.kodZekasiModeli);
  Object.assign(d, { model: kodModelKimligi(), hata: null, toplamDosya: dizin.kayitlar.length, taranan: 0 });
  let asama = yalnizGomme ? "gomme" : "tarama";
  if (yalnizGomme) Object.assign(d, { gomulen: 0 });
  const z = setInterval(() => {
    if (asama === "tarama") {
      d.durum = "taraniyor";
      d.taranan = Math.min(d.toplamDosya, d.taranan + 3);
      d.dosya = d.taranan;
      d.sembol = Math.round((dizin.semboller.length * d.taranan) / d.toplamDosya);
      d.parca = d.toplamParca = Math.round((dizin.parcalar.length * d.taranan) / d.toplamDosya);
      if (d.taranan >= d.toplamDosya) {
        Object.assign(d, { dosya: dizin.kayitlar.length, sembol: dizin.semboller.length, parca: dizin.parcalar.length, toplamParca: dizin.parcalar.length, gomulen: 0 });
        asama = !model ? "bitti" : model.indirildi ? "gomme" : "indirme";
        d.indirmeYuzde = asama === "indirme" ? 0 : null;
      }
    } else if (asama === "indirme") {
      d.durum = "model-indiriliyor";
      d.indirmeYuzde = Math.min(100, (d.indirmeYuzde ?? 0) + 9);
      if (d.indirmeYuzde >= 100) {
        model.indirildi = true;
        model.diskMb = model.indirmeMb - 2;
        d.indirmeYuzde = null;
        asama = "gomme";
      }
    } else if (asama === "gomme") {
      d.durum = "gomuluyor";
      d.parca = d.toplamParca = dizin.parcalar.length;
      d.gomulen = Math.min(d.toplamParca, d.gomulen + 4);
      if (d.gomulen >= d.toplamParca) asama = "bitti";
    }
    if (asama === "bitti") {
      clearInterval(z);
      kodSuren.delete(anahtar);
      delete d.taranan;
      delete d.toplamDosya;
      Object.assign(d, { durum: "hazir", sonGuncelleme: simdi(), indirmeYuzde: null, gomulen: d.model ? d.toplamParca : 0 });
    }
    kodYay(pid, d);
  }, 350);
  kodSuren.set(anahtar, z);
  kodYay(pid, d);
}

function kodModelDegisti() {
  for (const [anahtar, d] of kodDurumlari) {
    const [pid, alan] = anahtar.split(":");
    d.model = kodModelKimligi();
    if (d.durum === "bos") continue;
    if (!d.model) {
      clearInterval(kodSuren.get(anahtar));
      Object.assign(d, { durum: "hazir", gomulen: 0, indirmeYuzde: null });
      kodYay(pid, d);
    } else kodDizinleGoster(pid, alan, { yalnizGomme: true });
  }
}

const kodAlani = (p, q) => {
  projeGerekli(p.pid);
  const alan = q.get("alan") || "ana";
  if (alan !== "ana" && !calismaAlanlari(p.pid).some((a) => a.kimlik === alan)) throw new Hata(404, ceviri("Çalışma alanı bulunamadı.", "Workspace not found."));
  const d = kodDurumu(p.pid, alan);
  // Hiç dizinlenmemiş alanda ilk sorgu taramayı başlatır
  if (d.durum === "bos" && !kodSuren.has(`${p.pid}:${alan}`)) kodDizinleGoster(p.pid, alan);
  return { alan, durum: d, dosyalar: alanDosyalari(alan), dizin: KZ.dizinKur(alanDosyalari(alan)) };
};

rota("GET", "/api/kod-zekasi/modeller", () => MODELLER);
rota("GET", "/api/projeler/:pid/kod-zekasi", ({ p, q }) => {
  projeGerekli(p.pid);
  const alan = q.get("alan");
  if (alan) return [kodDurumu(p.pid, alan)];
  return calismaAlanlari(p.pid)
    .map((a) => a.kimlik)
    .filter((a) => a === "ana" || kodDurumlari.has(`${p.pid}:${a}`))
    .map((a) => kodDurumu(p.pid, a));
});
rota("POST", "/api/projeler/:pid/kod-zekasi/dizinle", ({ p, govde }) => {
  projeGerekli(p.pid);
  const alan = govde?.alan || "ana";
  kodDizinleGoster(p.pid, alan);
  return kodDurumu(p.pid, alan);
});
rota("GET", "/api/projeler/:pid/kod-zekasi/ara", ({ p, q }) => {
  const k = kodAlani(p, q);
  const sorgu = q.get("q") ?? "";
  if (!sorgu.trim()) throw new Hata(400, ceviri("Arama metni (q) gerekli.", "Search text (q) is required."));
  const sonuclar = KZ.ara(k.dizin, k.dosyalar, sorgu, { sinir: Number(q.get("sinir") ?? 20), yol: q.get("yol") ?? "" });
  return { sonuclar, durum: k.durum, yalnizSozcuk: !k.durum.model || k.durum.gomulen < k.durum.toplamParca, sureMs: 18 + Math.round(Math.random() * 60) };
});
rota("GET", "/api/projeler/:pid/kod-zekasi/benzer", ({ p, q }) => {
  const k = kodAlani(p, q);
  const sonuclar = KZ.benzer(k.dizin, k.dosyalar, q.get("yol") ?? "", Number(q.get("satir") ?? 1), Number(q.get("sinir") ?? 8));
  if (!sonuclar) throw new Hata(404, ceviri(`${q.get("yol")}:${q.get("satir")} dizinde yok.`, `${q.get("yol")}:${q.get("satir")} is not in the index.`));
  return { sonuclar, durum: k.durum, yalnizSozcuk: !k.durum.model, sureMs: 12 };
});
rota("GET", "/api/projeler/:pid/kod-zekasi/semboller", ({ p, q }) => {
  const k = kodAlani(p, q);
  return KZ.sembolAra(k.dizin, q.get("q") ?? "", q.get("tur") || undefined, Number(q.get("sinir") ?? 200));
});
rota("GET", "/api/projeler/:pid/kod-zekasi/harita", ({ p, q }) => KZ.harita(kodAlani(p, q).dizin));
rota("GET", "/api/projeler/:pid/kod-zekasi/bagimliliklar", ({ p, q }) => {
  const b = KZ.bagimliliklar(kodAlani(p, q).dizin, q.get("yol") ?? "");
  if (!b) throw new Hata(404, ceviri(`${q.get("yol")} dizinde yok.`, `${q.get("yol")} is not in the index.`));
  return b;
});
rota("GET", "/api/projeler/:pid/kod-zekasi/grafik", ({ p, q }) => KZ.grafik(kodAlani(p, q).dizin, q.get("duzey") === "dosya" ? "dosya" : "klasor"));
rota("GET", "/api/projeler/:pid/dosyalar", ({ q }) => agacKur(q.get("alan") ?? "ana"));
rota("GET", "/api/projeler/:pid/dosya", ({ q }) => {
  const alan = q.get("alan") ?? "ana";
  const yol = q.get("yol") ?? "";
  const icerik = alanDosyalari(alan)[yol];
  if (icerik === undefined) throw new Hata(404, ceviri("Dosya bulunamadı.", "File not found."));
  const duz = duzenleyen(alan, yol);
  return { yol, icerik, dil: dilBul(yol), saltOkunur: duz !== null, duzenleyenAjanId: duz };
});
rota("PUT", "/api/projeler/:pid/dosya", ({ p, govde }) => {
  const { alan, yol, icerik } = govde ?? {};
  if (!alan || !yol) throw new Hata(400, ceviri("Alan ve yol gerekli.", "Workspace and path are required."));
  const duz = duzenleyen(alan, yol);
  if (duz) throw new Hata(409, ceviri(`${ajanBul(duz)?.ad ?? "Bir ajan"} bu dosyayı düzenliyor. Önce duraklatın.`, `${ajanBul(duz)?.ad ?? "An agent"} is editing this file. Pause them first.`));
  if (alan === "ana") db.ana[yol] = icerik;
  else (db.katmanlar[alan] ??= {})[yol] = icerik;
  yay({ tur: "dosya.degisti", projeId: p.pid, alan, yol, ajanId: null }, p.pid);
  return { tamam: true };
});
rota("GET", "/api/projeler/:pid/fark", ({ q }) => farkHesapla(q.get("alan") ?? "ana", q.get("yol") || null));
rota("GET", "/api/projeler/:pid/ara", ({ q }) => {
  const alan = q.get("alan") ?? "ana";
  const sorgu = q.get("q") ?? "";
  let desen;
  try {
    desen = new RegExp(sorgu, "i");
  } catch {
    desen = new RegExp(sorgu.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
  const sonuc = [];
  for (const [yol, icerik] of Object.entries(alanDosyalari(alan))) {
    icerik.split("\n").forEach((satir, i) => {
      if (sonuc.length < 500 && desen.test(satir)) sonuc.push({ yol, satir: i + 1, metin: satir });
    });
  }
  return sonuc;
});
rota("POST", "/api/projeler/:pid/disarida-ac", () => ({ tamam: true }));

// ---------------------------------------------------------------------------
// Kod düzenleyici (VS Code tezgâhı): /fs ve /git uçları, bellekteki dosyalar üzerinde
// ---------------------------------------------------------------------------

const ACILIS = Date.now() - 3 * 86_400_000;
/** "alan\0yol" → son değişme anı (ms) */
const zamanlar = new Map();
/** alan → kullanıcının açtığı boş klasörler */
const bosKlasorler = new Map();
// Ana repo git durumu: HEAD (son commit) ve indeks (aşama)
db.anaHead = kopya(db.ana);
db.indeks = kopya(db.ana);

const zamanAnahtari = (alan, yol) => `${alan}\0${yol}`;
const degisme = (alan, yol) => zamanlar.get(zamanAnahtari(alan, yol)) ?? ACILIS;
const temizYol = (y) => String(y ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
function yolDenetle(yol) {
  if (yol.split("/").some((p) => p === "..")) throw new Hata(400, ceviri("Geçersiz dosya yolu.", "Invalid file path."));
  return yol;
}
function yazilabilirMi(yol) {
  if (!yol) throw new Hata(403, ceviri("Çalışma alanının kökü değiştirilemez.", "The workspace root can't be changed."));
  if (yol.split("/").includes(".git")) throw new Hata(403, ceviri(".git içindeki dosyalar düzenleyiciden değiştirilemez.", "Files inside .git can't be changed from the editor."));
}
function sahteYaz(alan, yol, icerik) {
  if (alan === "ana") db.ana[yol] = icerik;
  else (db.katmanlar[alan] ??= {})[yol] = icerik;
  zamanlar.set(zamanAnahtari(alan, yol), Date.now());
}
function sahteSil(alan, yol) {
  if (alan === "ana") delete db.ana[yol];
  else if (yol in db.ana) (db.katmanlar[alan] ??= {})[yol] = null;
  else delete (db.katmanlar[alan] ?? {})[yol];
  zamanlar.set(zamanAnahtari(alan, yol), Date.now());
}
/** Alandaki klasörler: dosya yollarından ve boş açılan klasörlerden */
function klasorler(alan) {
  const s = new Set([""]);
  for (const y of [...Object.keys(alanDosyalari(alan)), ...(bosKlasorler.get(alan) ?? [])]) {
    const p = y.split("/");
    for (let i = 1; i < p.length; i++) s.add(p.slice(0, i).join("/"));
    if (bosKlasorler.get(alan)?.has(y)) s.add(y);
  }
  return s;
}
function fsDurumu(alan, yol) {
  const dosyalar = alanDosyalari(alan);
  if (yol in dosyalar) {
    const duz = duzenleyen(alan, yol);
    return { tur: "dosya", baglanti: false, boyut: Buffer.byteLength(dosyalar[yol]), degisme: degisme(alan, yol), olusturma: ACILIS, saltOkunur: duz !== null, duzenleyenAjanId: duz };
  }
  if (klasorler(alan).has(yol)) return { tur: "klasor", baglanti: false, boyut: 0, degisme: ACILIS, olusturma: ACILIS, saltOkunur: false, duzenleyenAjanId: null };
  return null;
}
const istekKonumu = (q) => ({ alan: q.get("alan") ?? "ana", yol: yolDenetle(temizYol(q.get("yol"))) });

rota("GET", "/api/projeler/:pid/fs/stat", ({ q }) => {
  const { alan, yol } = istekKonumu(q);
  const d = fsDurumu(alan, yol);
  if (!d && q.get("yoksa") !== "bos") throw new Hata(404, ceviri(`Bulunamadı: ${yol || "."}`, `Not found: ${yol || "."}`));
  return d;
});
rota("GET", "/api/projeler/:pid/fs/liste", ({ q }) => {
  const { alan, yol } = istekKonumu(q);
  if (!klasorler(alan).has(yol)) throw new Hata(404, ceviri(`Bulunamadı: ${yol || "."}`, `Not found: ${yol || "."}`));
  const onek = yol ? `${yol}/` : "";
  const girdiler = new Map();
  for (const k of klasorler(alan)) if (k.startsWith(onek) && k !== yol && !k.slice(onek.length).includes("/")) girdiler.set(k.slice(onek.length), "klasor");
  for (const f of Object.keys(alanDosyalari(alan))) if (f.startsWith(onek) && !f.slice(onek.length).includes("/")) girdiler.set(f.slice(onek.length), "dosya");
  return [...girdiler].map(([ad, tur]) => ({ ad, tur, baglanti: false }));
});
rota("GET", "/api/projeler/:pid/fs/icerik", ({ q }) => {
  const { alan, yol } = istekKonumu(q);
  const icerik = alanDosyalari(alan)[yol];
  if (icerik === undefined) {
    if (q.get("yoksa") === "bos") return { __durum: 204 };
    throw new Hata(404, ceviri(`Bulunamadı: ${yol}`, `Not found: ${yol}`));
  }
  return { __ham: Buffer.from(icerik) };
});
rota("PUT", "/api/projeler/:pid/fs/icerik", ({ p, q, ham }) => {
  const { alan, yol } = istekKonumu(q);
  yazilabilirMi(yol);
  const var_ = yol in alanDosyalari(alan);
  if (!var_ && q.get("olustur") !== "1") throw new Hata(404, ceviri(`Bulunamadı: ${yol}`, `Not found: ${yol}`));
  if (var_ && q.get("ustune") !== "1") throw new Hata(409, ceviri(`Zaten var: ${yol}`, `Already exists: ${yol}`));
  const duz = duzenleyen(alan, yol);
  if (duz) throw new Hata(409, ceviri(`${ajanBul(duz)?.ad ?? "Bir ajan"} bu dosyayı düzenliyor. Önce ajanı duraklatın.`, `${ajanBul(duz)?.ad ?? "An agent"} is editing this file. Pause the agent first.`));
  sahteYaz(alan, yol, (ham ?? Buffer.alloc(0)).toString("utf8"));
  yay({ tur: "dosya.degisti", projeId: p.pid, alan, yol, ajanId: null }, p.pid);
  return fsDurumu(alan, yol);
});
rota("POST", "/api/projeler/:pid/fs/klasor", ({ p, govde }) => {
  const alan = govde?.alan ?? "ana";
  const yol = yolDenetle(temizYol(govde?.yol));
  yazilabilirMi(yol);
  if (fsDurumu(alan, yol)) throw new Hata(409, ceviri(`Zaten var: ${yol}`, `Already exists: ${yol}`));
  if (!bosKlasorler.has(alan)) bosKlasorler.set(alan, new Set());
  bosKlasorler.get(alan).add(yol);
  yay({ tur: "dosya.degisti", projeId: p.pid, alan, yol, ajanId: null }, p.pid);
  return { tamam: true };
});
rota("DELETE", "/api/projeler/:pid/fs", ({ p, q }) => {
  const { alan, yol } = istekKonumu(q);
  yazilabilirMi(yol);
  const d = fsDurumu(alan, yol);
  if (!d) throw new Hata(404, ceviri(`Bulunamadı: ${yol}`, `Not found: ${yol}`));
  if (d.tur === "dosya") {
    if (duzenleyen(alan, yol)) throw new Hata(409, ceviri("Bir ajan bu dosyayı düzenliyor. Önce ajanı duraklatın.", "An agent is editing this file. Pause the agent first."));
    sahteSil(alan, yol);
  } else {
    const icindekiler = Object.keys(alanDosyalari(alan)).filter((f) => f.startsWith(`${yol}/`));
    if (icindekiler.length && q.get("ozyinelemeli") !== "1") throw new Hata(409, ceviri(`Klasör boş değil: ${yol}`, `Folder is not empty: ${yol}`));
    for (const f of icindekiler) sahteSil(alan, f);
    for (const k of [...(bosKlasorler.get(alan) ?? [])]) if (k === yol || k.startsWith(`${yol}/`)) bosKlasorler.get(alan).delete(k);
  }
  yay({ tur: "dosya.degisti", projeId: p.pid, alan, yol, ajanId: null }, p.pid);
  return { tamam: true };
});
rota("POST", "/api/projeler/:pid/fs/tasi", ({ p, govde }) => {
  const alan = govde?.alan ?? "ana";
  const kaynak = yolDenetle(temizYol(govde?.kaynak));
  const hedef = yolDenetle(temizYol(govde?.hedef));
  yazilabilirMi(kaynak);
  yazilabilirMi(hedef);
  const dosyalar = alanDosyalari(alan);
  const tasinacak = kaynak in dosyalar ? [kaynak] : Object.keys(dosyalar).filter((f) => f.startsWith(`${kaynak}/`));
  if (!tasinacak.length) throw new Hata(404, ceviri(`Bulunamadı: ${kaynak}`, `Not found: ${kaynak}`));
  if (fsDurumu(alan, hedef) && !govde?.ustune) throw new Hata(409, ceviri(`Zaten var: ${hedef}`, `Already exists: ${hedef}`));
  for (const f of tasinacak) {
    const yeni = hedef + f.slice(kaynak.length);
    sahteYaz(alan, yeni, dosyalar[f]);
    sahteSil(alan, f);
  }
  yay({ tur: "dosya.degisti", projeId: p.pid, alan, yol: kaynak, ajanId: null }, p.pid);
  yay({ tur: "dosya.degisti", projeId: p.pid, alan, yol: hedef, ajanId: null }, p.pid);
  return { tamam: true };
});
rota("GET", "/api/projeler/:pid/fs/dosyalar", ({ q }) => Object.keys(alanDosyalari(q.get("alan") ?? "ana")).sort());

function globDuzenli(glob) {
  let s = "";
  const g = temizYol(glob).replace(/^\.\//, "");
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") {
      if (g[i + 2] === "/") (s += "(?:[^/]*/)*"), (i += 2);
      else (s += ".*"), (i += 1);
    } else if (c === "*") s += "[^/]*";
    else if (c === "?") s += "[^/]";
    else if (c === "{") s += "(?:";
    else if (c === "}") s += ")";
    else if (c === ",") s += "|";
    else s += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${s}$`);
}
function globUyar(desenler, yol) {
  const parcalar = yol.split("/");
  return desenler.some((r) => parcalar.some((_, i) => r.test(parcalar.slice(0, i + 1).join("/"))));
}
rota("POST", "/api/projeler/:pid/fs/ara", ({ govde }) => {
  const alan = govde?.alan ?? "ana";
  if (!govde?.desen) throw new Hata(400, ceviri("Arama deseni boş olamaz.", "The search pattern can't be empty."));
  const kaynak = govde.regex ? govde.desen : govde.desen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let duzenli;
  try {
    duzenli = new RegExp(govde.tamSozcuk ? `(?<![\\p{L}\\p{N}_])(?:${kaynak})(?![\\p{L}\\p{N}_])` : kaynak, `gmu${govde.harfDuyarli ? "" : "i"}`);
  } catch (h) {
    throw new Hata(400, ceviri(`Geçersiz düzenli ifade: ${h.message}`, h.message));
  }
  const dahil = (govde.dahil ?? []).map(globDuzenli);
  const haric = (govde.haric ?? []).map(globDuzenli);
  const sinir = Math.min(govde.sinir ?? 2000, 20000);
  const sonuc = { dosyalar: [], sinirAsildi: false };
  let toplam = 0;
  for (const [yol, metin] of Object.entries(alanDosyalari(alan)).sort()) {
    if ((dahil.length && !globUyar(dahil, yol)) || globUyar(haric, yol)) continue;
    const satirlar = metin.split("\n");
    const eslesmeler = [];
    satirlar.forEach((satir, i) => {
      for (const e of satir.matchAll(duzenli)) {
        if (toplam >= sinir || !e[0].length) continue;
        eslesmeler.push({ satir: i, sutun: e.index, sonSatir: i, sonSutun: e.index + e[0].length, onizleme: satir.slice(0, 300), onizlemeBaslangic: 0 });
        toplam++;
      }
    });
    if (eslesmeler.length) sonuc.dosyalar.push({ yol, eslesmeler });
    if (toplam >= sinir) {
      sonuc.sinirAsildi = true;
      break;
    }
  }
  return sonuc;
});

/** iki dosya kümesi arası değişiklikler: eski → yeni */
function kumeFarki(eski, yeni, izlenmeyenTuru = "A") {
  const sonuc = [];
  for (const y of new Set([...Object.keys(eski), ...Object.keys(yeni)])) {
    if (!(y in yeni)) sonuc.push({ yol: y, tur: "D" });
    else if (!(y in eski)) sonuc.push({ yol: y, tur: izlenmeyenTuru });
    else if (eski[y] !== yeni[y]) sonuc.push({ yol: y, tur: "M" });
  }
  return sonuc.sort((a, b) => a.yol.localeCompare(b.yol));
}
rota("GET", "/api/projeler/:pid/git/durum", ({ p, q }) => {
  const alan = q.get("alan") ?? "ana";
  const pr = projeGerekli(p.pid);
  const ajan = alan === "ana" ? null : ajanBul(alan);
  const temel = { alan, ana: alan === "ana", repo: true, dal: ajan?.dal ?? pr.varsayilanDal, temelDal: pr.varsayilanDal, hazirlanan: [], degisen: [], cakisan: [], temeleGore: [] };
  if (alan === "ana") {
    temel.hazirlanan = kumeFarki(db.anaHead, db.indeks);
    temel.degisen = kumeFarki(db.indeks, db.ana, "?");
  } else temel.temeleGore = kumeFarki(db.ana, alanDosyalari(alan));
  return temel;
});
rota("GET", "/api/projeler/:pid/git/icerik", ({ q }) => {
  const { alan, yol } = istekKonumu(q);
  const ref = q.get("ref") ?? "HEAD";
  const kume = ref === "indeks" ? db.indeks : ref === "temel" || alan !== "ana" ? db.ana : db.anaHead;
  if (!(yol in kume)) {
    if (q.get("yoksa") === "bos") return { __durum: 204 };
    throw new Hata(404, ceviri(`Bu sürümde dosya yok: ${yol}`, `No such file in this version: ${yol}`));
  }
  return { __ham: Buffer.from(kume[yol]) };
});
const yalnizAna = (alan) => {
  if (alan !== "ana") throw new Hata(403, ceviri("Ajan çalışma alanları kaynak denetiminde salt okunurdur; git işlemleri yalnız ana repoda yapılır.", "Agent workspaces are read-only in source control; git operations only run in the main repo."));
};
const indekseKopyala = (hedef, kaynak, yollar) => {
  for (const y of yollar) {
    if (y in kaynak) hedef[y] = kaynak[y];
    else delete hedef[y];
  }
};
rota("POST", "/api/projeler/:pid/git/hazirla", ({ govde }) => {
  yalnizAna(govde?.alan);
  indekseKopyala(db.indeks, db.ana, govde?.yollar ?? []);
  return { tamam: true };
});
rota("POST", "/api/projeler/:pid/git/hazirlamayi-geri-al", ({ govde }) => {
  yalnizAna(govde?.alan);
  indekseKopyala(db.indeks, db.anaHead, govde?.yollar ?? []);
  return { tamam: true };
});
rota("POST", "/api/projeler/:pid/git/degisiklikleri-at", ({ p, govde }) => {
  yalnizAna(govde?.alan);
  for (const y of govde?.yollar ?? []) {
    if (y in db.indeks) sahteYaz("ana", y, db.indeks[y]);
    else sahteSil("ana", y);
    yay({ tur: "dosya.degisti", projeId: p.pid, alan: "ana", yol: y, ajanId: null }, p.pid);
  }
  return { tamam: true };
});
rota("POST", "/api/projeler/:pid/git/commit", ({ govde }) => {
  yalnizAna(govde?.alan);
  if (!govde?.mesaj?.trim()) throw new Hata(400, ceviri("Commit mesajı boş olamaz.", "The commit message can't be empty."));
  if (govde.tumu) db.indeks = kopya(db.ana);
  if (!kumeFarki(db.anaHead, db.indeks).length) throw new Hata(409, ceviri("Commit'lenecek aşamaya alınmış değişiklik yok.", "There are no staged changes to commit."));
  db.anaHead = kopya(db.indeks);
  return { commit: crypto.randomBytes(20).toString("hex") };
});

rota("POST", "/api/projeler/:pid/terminaller", ({ govde }) => {
  const id = yeniKimlik("t");
  db.terminaller.set(id, { alan: govde?.alan ?? "ana", sutun: govde?.sutun ?? 80 });
  return { id };
});
rota("DELETE", "/api/terminaller/:tid", ({ p }) => {
  db.terminaller.delete(p.tid);
  return { tamam: true };
});

rota("GET", "/api/projeler/:pid/kullanim", ({ p }) => (projeGerekli(p.pid), kullanim(p.pid)));
function sahteRapor(pid) {
  projeGerekli(pid);
  const gun = simdi().slice(0, 10);
  const gorevler = db.gorevler.filter((g) => g.projeId === pid);
  const say = (d) => gorevler.filter((g) => g.durum === d).length;
  const k = kullanim(pid);
  const sayi = (n) => n.toLocaleString(ceviri("tr-TR", "en-US"));
  const pencereler = hesapDurumu.pencereler
    .filter((x) => x.tur === "bes_saat" || x.tur === "haftalik")
    .map((x) => ceviri(`${x.ad} %${Math.round(x.yuzde)}`, `${x.ad} ${Math.round(x.yuzde)}%`))
    .join(" · ");
  const markdown = ceviri(
    `# Durum raporu · ${gun}\n\n## Özet\n\n- Tamamlanan: ${say("tamam")} · süren: ${say("calisiliyor")} · incelemede: ${say("inceleme")}\n- Kullanım: ${sayi(k.toplamToken)} token (bugün ${sayi(k.bugunToken)})\n- Abonelik: ${pencereler}\n`,
    `# Status report · ${gun}\n\n## Summary\n\n- Done: ${say("tamam")} · in progress: ${say("calisiliyor")} · in review: ${say("inceleme")}\n- Usage: ${sayi(k.toplamToken)} tokens (today ${sayi(k.bugunToken)})\n- Subscription: ${pencereler}\n`,
  );
  return { baslik: ceviri(`Durum raporu · ${gun}`, `Status report · ${gun}`), yol: `raporlar/${gun}.md`, baslangic: simdi(), markdown };
}
rota("GET", "/api/projeler/:pid/rapor", ({ p }) => sahteRapor(p.pid));
rota("POST", "/api/projeler/:pid/rapor", ({ p }) => {
  const r = sahteRapor(p.pid);
  (db.notlar[p.pid] ??= {})[r.yol] = r.markdown;
  return r;
});

// ---------------------------------------------------------------------------
// Sahte terminal
// ---------------------------------------------------------------------------

function terminalBagla(ws, id) {
  const t = db.terminaller.get(id);
  if (!t) {
    ws.gonder(ceviri("Terminal bulunamadı.\r\n", "Terminal not found.\r\n"));
    ws.kapat();
    return;
  }
  const a = ajanBul(t.alan);
  const dal = a?.dal ?? "main";
  const istem = () => `\x1b[32m${a ? a.id : "furkan"}@arnorg\x1b[0m \x1b[34m~/${a ? `calisma/${a.id}` : "siparis-paneli"}\x1b[0m \x1b[31m(${dal})\x1b[0m $ `;
  let satir = "";
  ws.gonder(ceviri(`\x1b[2mArnOrg sahte terminali · ${t.alan} · gerçek kabuk değildir\x1b[0m\r\n${istem()}`, `\x1b[2mArnOrg mock terminal · ${t.alan} · not a real shell\x1b[0m\r\n${istem()}`));
  const komutlar = {
    ls: () => [...new Set(Object.keys(alanDosyalari(t.alan)).map((y) => y.split("/")[0]))].sort().join("  "),
    pwd: () => (a?.calismaAlani ?? V.PROJE_KOKU),
    "git status": () => {
      const k = db.katmanlar[t.alan] ?? {};
      const satirlar = Object.keys(k).map((y) => `\t\x1b[31m${degisiklik(t.alan, y) === "A" ? ceviri("yeni dosya:", "new file:") : ceviri("değiştirildi:", "modified:")}   ${y}\x1b[0m`);
      return ceviri(
        `Dal ${dal}\r\n${satirlar.length ? `Commit için hazırlanmamış değişiklikler:\r\n${satirlar.join("\r\n")}` : "çalışma ağacı temiz"}`,
        `On branch ${dal}\r\n${satirlar.length ? `Changes not staged for commit:\r\n${satirlar.join("\r\n")}` : "nothing to commit, working tree clean"}`,
      );
    },
    "git log --oneline": () =>
      ceviri(
        "9f3d7aa T-24: imleçle sayfalama\r\n4be1c02 T-22: ürün kataloğu API\r\n1a07e9d T-16: veritabanı şeması",
        "9f3d7aa T-24: cursor pagination\r\n4be1c02 T-22: product catalog API\r\n1a07e9d T-16: database schema",
      ),
    "npm test": () => "\r\n \x1b[32m✓\x1b[0m tests/api/siparisler.test.ts (2 tests) 41ms\r\n \x1b[32m✓\x1b[0m tests/api/sayfalama.test.ts (2 tests) 12ms\r\n\r\n Test Files  \x1b[32m2 passed\x1b[0m (2)\r\n      Tests  \x1b[32m4 passed\x1b[0m (4)",
    // Teslim testindeki çalıştırma komutu (Test paneli)
    "npm install && npm run dev": () =>
      "\r\nadded 412 packages, and audited 413 packages in 6s\r\n\r\n> siparis-paneli@0.3.0 dev\r\n> vite\r\n\r\n  \x1b[32mVITE\x1b[0m v7.1.4  ready in 412 ms\r\n\r\n  \x1b[32m➜\x1b[0m  Local:   \x1b[36mhttp://localhost:5173/\x1b[0m",
    "npm run dev": () => "\r\n> siparis-paneli@0.3.0 dev\r\n> vite\r\n\r\n  \x1b[32mVITE\x1b[0m v7.1.4  ready in 398 ms\r\n\r\n  \x1b[32m➜\x1b[0m  Local:   \x1b[36mhttp://localhost:5173/\x1b[0m",
    clear: () => "\x1b[2J\x1b[H",
    help: () => ceviri("Sahte komutlar: ls, pwd, git status, git log --oneline, npm test, npm run dev, clear, echo", "Mock commands: ls, pwd, git status, git log --oneline, npm test, npm run dev, clear, echo"),
  };
  ws.mesaj = (ham) => {
    let m;
    try {
      m = JSON.parse(ham);
    } catch {
      return;
    }
    if (m.tur === "boyut") {
      t.sutun = m.sutun;
      return;
    }
    if (m.tur !== "girdi") return;
    for (const ch of m.veri) {
      if (ch === "\r") {
        const komut = satir.trim();
        satir = "";
        let cikti = "";
        if (komut.startsWith("echo ")) cikti = komut.slice(5);
        else if (komut) cikti = komutlar[komut]?.() ?? ceviri(`${komut.split(" ")[0]}: komut bulunamadı (help yazın)`, `${komut.split(" ")[0]}: command not found (type help)`);
        ws.gonder(`\r\n${cikti ? `${cikti}\r\n` : ""}${istem()}`);
      } else if (ch === "\x7f") {
        if (satir.length) {
          satir = satir.slice(0, -1);
          ws.gonder("\b \b");
        }
      } else if (ch === "\x03") {
        satir = "";
        ws.gonder(`^C\r\n${istem()}`);
      } else if (ch >= " ") {
        satir += ch;
        ws.gonder(ch);
      }
    }
  };
  ws.kapandi = () => db.terminaller.delete(id);
}

// ---------------------------------------------------------------------------
// Sunucu
// ---------------------------------------------------------------------------

const TURLER = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};
// Gerçek çekirdekteki gibi çapraz köken yalıtımı (tezgâhtaki TypeScript dil sunucusu SharedArrayBuffer ister)
const YALITIM = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" };

function statikGonder(url, yanit) {
  let yol = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (yol.includes("..")) yol = "";
  let dosya = path.join(DIST, yol || "index.html");
  if (!fs.existsSync(dosya) || fs.statSync(dosya).isDirectory()) dosya = path.join(DIST, "index.html");
  if (!fs.existsSync(dosya)) {
    yanit.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    yanit.end(`<!doctype html><meta charset="utf-8"><title>${ceviri("ArnOrg sahte çekirdek", "ArnOrg mock core")}</title><body style="background:#0a0a0b;color:#f2f0ec;font:14px monospace;padding:2rem">
<p>${ceviri("Stüdyo derlemesi yok. Önce <code>npm run build -w @arnorg/studyo</code> çalıştırın ya da Vite geliştirme sunucusunu kullanın:", "No Studio build found. Run <code>npm run build -w @arnorg/studyo</code> first, or use the Vite dev server:")}</p>
<p><a style="color:#f27a68" href="http://localhost:5173/#anahtar=${ANAHTAR}">http://localhost:5173/#anahtar=${ANAHTAR}</a></p></body>`);
    return;
  }
  yanit.writeHead(200, { ...YALITIM, "Content-Type": TURLER[path.extname(dosya)] ?? "application/octet-stream", "Cache-Control": dosya.endsWith("index.html") ? "no-cache" : "max-age=31536000, immutable" });
  fs.createReadStream(dosya).pipe(yanit);
}

// 0.0.2: kurulum, GitHub, dizinler, proje ayarları, hazırlık, ana yasa, zekâ, sözler, beceriler (surum-002.mjs)
for (const pid of Object.keys(db.kanallar)) if (!db.kanallar[pid].some((k) => k.ad === "yonetim")) db.kanallar[pid].splice(1, 0, { ad: "yonetim", aciklama: "" });
surum002({
  rota,
  db,
  yay,
  herkeseYay,
  yayDinle: (d) => yayDinleyicileri.push(d),
  proje,
  projeAjanlari,
  ajanBul,
  mesajEkle,
  akisEkle,
  Hata,
  simdi,
  sonra,
  yeniKimlik,
  projeOzeti,
  projeGerekli,
  ajanGerekli,
  projeYay,
  MUHENDISLIK,
  projeEkleyici: (f) => (projeEkleyici = f),
  yonetimMesaji: (f) => (yonetimIsleyici = f),
  onaySonucuDinle: (f) => onaySonucuDinleyicileri.push(f),
  istemciSayisi: () => istemciler.size,
});
surum004Kazanim({ rota, db, yay, herkeseYay, Hata, simdi, projeGerekli, ajanBul });
// 0.0.4: kalite kapısı (surum-004-kalite.mjs)
surum004Kalite({ rota, rotalar, db, yay, yayDinle: (d) => yayDinleyicileri.push(d), proje, mesajEkle, Hata, simdi, yeniKimlik, projeGerekli, projeYay });
// 0.0.4: çalışma düzeni ayarları, sıradaki ajan, görev token tavanı onayı, Mesaiyi durdur (surum-004-tavan.mjs)
surum004Tavan({ rota, db, yay, ajanBul, akisEkle, projeYay, onaySonucuDinle: (f) => onaySonucuDinleyicileri.push(f), Hata });
// 0.0.5: kurulun kanalları, üyeler ve serbest konuşma (surum-005-kanallar.mjs)
surum005Kanallar({ rota, rotalar, db, yay, mesajEkle, ajanBul, projeGerekli, Hata });
// 0.0.5: CEO brifingi, günlük brifing ayarı, sürümlü model kataloğu (surum-005-brifing.mjs)
surum005Brifing({ rota, rotalar, db, yay, yayDinle: (d) => yayDinleyicileri.push(d), mesajEkle, akisEkle, ajanBul, projeAjanlari, projeGerekli, Hata, simdi, yeniKimlik });
// 0.0.5: ajan yetenekleri ve yerleşik web araştırması (surum-005-yetenek.mjs)
surum005Yetenek({ rota, rotalar, db, yay, ajanBul, Hata, roller: V.roller });
// 0.0.5: uygulama içi tarayıcının düzeltme notları ve "Hepsini yaptır" (surum-005-tarayici.mjs)
surum005Tarayici({ rota, db, yay, Hata, simdi, yeniKimlik, proje, projeGerekli, projeAjanlari, mesajEkle, akisEkle, projeYay });
// 0.0.5: ofisin canlı gösterisi: araştırma, test, teslim, birleştirme, işe alım (surum-005-ofis.mjs)
surum005Ofis({ db, yay, akisEkle, mesajEkle, ajanBul, projeAjanlari, simdi, yeniKimlik, projeYay });
// 0.0.7: Tanıtım alanı: README.md vitrini, Defne'nin taslağı, güncelleme isteği (surum-007-tanitim.mjs)
surum007Tanitim({ rota, rotalar, db, yay, mesajEkle, akisEkle, ajanBul, projeAjanlari, projeGerekli, projeYay, Hata, simdi, yeniKimlik });
// 0.0.7: karar yetkisi: tam otonomda onaylara CEO karar verir, kurul sonuçları görür (surum-007-otonom.mjs)
surum007Otonom({ rota, rotalar, db, yay, yayDinle: (d) => yayDinleyicileri.push(d), mesajEkle, akisEkle, ajanBul, projeAjanlari, proje, projeGerekli, projeOzeti, projeYay, Hata, simdi, yeniKimlik });
// 0.0.8: ortak çalışma: tek proje, görev kayıtları, dosya kiraları, ekip temposu; birleştirme yok (surum-008-ortak.mjs)
surum008Ortak({ rota, rotalar, db, yay, yayDinle: (d) => yayDinleyicileri.push(d), mesajEkle, akisEkle, ajanBul, projeAjanlari, proje, projeGerekli, projeYay, Hata, simdi, yeniKimlik });
// 0.0.8: skill kütüphanesi: katalog, işe alımda ve çalışan panelinde skill atama (surum-008-skiller.mjs)
surum008Skiller({ rota, rotalar, db, yay, ajanBul, akisEkle, Hata, yeniKimlik });
// 0.0.8: kod zekâsı bağları: grafikte içe aktarma ve anlam kenarları, ilgili dosyalar ucu (surum-008-kodzeka.mjs)
surum008Kodzeka({ rota, rotalar, kodDurumu, alanDosyalari });
// 0.0.8: ad ile karakter uyumu, Tarayıcı'da proje adresleri; 0.0.9: Linkler (surum-008-arayuz.mjs)
surum008Arayuz({ rota, db, yay, akisEkle, ajanBul, projeGerekli, projeAjanlari, mesajEkle, Hata, simdi, yeniKimlik });
// 0.0.8: seçenekli sorular, CEO sohbetinde "Seçerek yanıtla", kurula sorunun seçenekleri (surum-008-secenek.mjs)
surum008Secenek({ rota, db, yay, mesajEkle, akisEkle, ajanBul, projeAjanlari, projeGerekli, projeYay, onaySonucuDinle: (f) => onaySonucuDinleyicileri.push(f), Hata, simdi, sonra, yeniKimlik });
// 0.0.8: ofisin canlılığı: yazma temposu, görev kaydı, geç yanıt, CEO'nun kararını bekleme (surum-008-canli.mjs)
surum008Canli({ rota, db, yay, yayDinle: (d) => yayDinleyicileri.push(d), akisEkle, ajanBul, simdi, yeniKimlik, projeYay });
// 0.0.8: mesaj ekleri: kurulun görsel ve dosyaları, Ada'nın paylaştığı ekran görüntüsü (surum-008-ekler.mjs)
surum008Ekler({ rota, rotalar, db, yay, ajanBul, projeAjanlari, projeGerekli, proje, Hata, simdi, yeniKimlik });
// 0.0.10: kullanım seviyesi ve proje token bütçesi, görev tokenları, en pahalı görevler (surum-010-butce.mjs)
butceEki = surum010Butce({ rota, rotalar, db, yay, yayDinle: (d) => yayDinleyicileri.push(d), projeGerekli, projeAjanlari, mesajEkle, projeYay, Hata });

const sunucu = http.createServer(async (istek, yanit) => {
  const url = new URL(istek.url ?? "/", `http://${istek.headers.host ?? "localhost"}`);
  if (!url.pathname.startsWith("/api/")) return statikGonder(url, yanit);

  const json = (durum, govde) => {
    yanit.writeHead(durum, { "Content-Type": "application/json; charset=utf-8" });
    yanit.end(JSON.stringify(govde));
  };
  if (istek.headers.authorization !== `Bearer ${ANAHTAR}`) return json(401, { hata: ceviri("Erişim anahtarı eksik ya da yanlış.", "The access key is missing or wrong.") });

  let govde;
  let hamGovde;
  if (istek.method !== "GET" && istek.method !== "DELETE") {
    const parcalar = [];
    for await (const p of istek) parcalar.push(p);
    hamGovde = Buffer.concat(parcalar);
    const ham = istek.headers["content-type"] === "application/octet-stream" ? "" : hamGovde.toString("utf8");
    if (ham) {
      try {
        govde = JSON.parse(ham);
      } catch {
        return json(400, { hata: ceviri("Gövde geçerli JSON değil.", "The body is not valid JSON.") });
      }
    }
  }
  for (const r of rotalar) {
    if (r.yontem !== istek.method) continue;
    const m = r.desen.exec(url.pathname);
    if (!m) continue;
    try {
      // Gerçekçi gecikme: yükleme durumları görülebilsin (kod düzenleyicinin sık dosya istekleri hariç)
      const kodIstegi = /\/(fs|git)(\/|$)/.test(url.pathname);
      await new Promise((z) => setTimeout(z, kodIstegi ? 5 : 60 + Math.random() * 140));
      const sonuc = await r.isleyici({ p: m.groups ?? {}, q: url.searchParams, govde, ham: hamGovde });
      // Ham bayt yanıtı (dosya içeriği) ya da gövdesiz durum kodu
      if (sonuc && typeof sonuc === "object" && "__ham" in sonuc) {
        yanit.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" });
        return yanit.end(sonuc.__ham);
      }
      if (sonuc && typeof sonuc === "object" && "__durum" in sonuc) {
        yanit.writeHead(sonuc.__durum);
        return yanit.end();
      }
      return json(200, sonuc);
    } catch (e) {
      if (e instanceof Hata) return json(e.durum, { hata: e.message });
      console.error(e);
      return json(500, { hata: ceviri("Sahte çekirdekte beklenmeyen hata.", "Unexpected error in the mock core.") });
    }
  }
  json(404, { hata: ceviri("Uç nokta bulunamadı.", "Endpoint not found.") });
});

sunucu.on("upgrade", (istek, soket) => {
  const url = new URL(istek.url ?? "/", "http://localhost");
  if (url.searchParams.get("anahtar") !== ANAHTAR) {
    soket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return;
  }
  if (url.pathname === "/ws") {
    const ws = wsKabul(istek, soket);
    const i = { ws, projeId: null };
    istemciler.add(i);
    ws.gonder(JSON.stringify({ tur: "merhaba", surum: SURUM }));
    ws.mesaj = (ham) => {
      try {
        const m = JSON.parse(ham);
        if (m.tur === "abone") i.projeId = m.projeId;
      } catch {
        // yok say
      }
    };
    ws.kapandi = () => istemciler.delete(i);
    return;
  }
  const t = /^\/ws\/terminal\/([^/]+)$/.exec(url.pathname);
  if (t) {
    const ws = wsKabul(istek, soket);
    terminalBagla(ws, decodeURIComponent(t[1]));
    return;
  }
  soket.destroy();
});

sunucu.listen(PORT, "127.0.0.1", () => {
  console.log(`ArnOrg sahte çekirdeği hazır.`);
  console.log(`  Derleme:      http://127.0.0.1:${PORT}/#anahtar=${ANAHTAR}`);
  console.log(`  Vite (dev):   http://localhost:5173/#anahtar=${ANAHTAR}`);
});
