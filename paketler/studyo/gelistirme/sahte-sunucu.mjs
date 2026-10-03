#!/usr/bin/env node
// ArnOrg sahte çekirdeği: Stüdyo geliştirmesi için docs/API.md uçlarını bellekte uygular.
// Bağımlılık yok: node:http ve en küçük WebSocket el sıkışması burada yazılıdır.
//
//   node paketler/studyo/gelistirme/sahte-sunucu.mjs
//   PORT=47820 ARNORG_ANAHTAR=gelistirme  (varsayılanlar)

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ana, dilBul, katmanlar, listeSurumleri } from "./dosyalar.mjs";
import * as V from "./veri.mjs";

const PORT = Number(process.env.PORT ?? 47820);
const ANAHTAR = process.env.ARNORG_ANAHTAR ?? "gelistirme";
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const SURUM = "0.1.0";

const simdi = () => new Date().toISOString();
const sonra = (sn) => new Date(Date.now() + sn * 1000).toISOString();
let sayac = 100;
const yeniKimlik = (on) => `${on}-${(sayac++).toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const kopya = (x) => structuredClone(x);

// ---------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------

const db = {
  ayarlar: { claudeYolu: null, varsayilanIzinModu: "bypassPermissions", onaySuresiSn: 600, gunlukButceUsd: 40, disEditor: "codium", tikanmaDakika: 20 },
  projeler: kopya(V.projeler),
  ajanlar: kopya(V.ajanlar),
  gorevler: kopya(V.gorevler),
  kanallar: kopya(V.kanallar),
  mesajlar: kopya(V.mesajlar),
  notlar: { "siparis-paneli": kopya(V.notlar), "arnex-web": { "vizyon.md": "# Vizyon\n\nArnex'i anlatan, hızlı ve sade bir site.\n", "mimari.md": "# Mimari\n\nAstro, içerik koleksiyonları.\n" } },
  notZamanlari: { "siparis-paneli": kopya(V.notZamanlari), "arnex-web": { "vizyon.md": V.once(60 * 24 * 2), "mimari.md": V.once(60 * 24 * 2) } },
  politika: { "siparis-paneli": kopya(V.politika), "arnex-web": kopya(V.politika).slice(0, 3) },
  denetim: kopya(V.denetim),
  onaylar: kopya(V.onaylar),
  akislar: kopya(V.akislar),
  ana: kopya(ana),
  katmanlar: kopya(katmanlar),
  terminaller: new Map(),
};

const proje = (pid) => db.projeler.find((p) => p.id === pid);
const ajanBul = (aid) => db.ajanlar.find((a) => a.id === aid);
const projeAjanlari = (pid) => db.ajanlar.filter((a) => a.projeId === pid);

function projeOzeti(p) {
  const ajanlar = projeAjanlari(p.id);
  const gorevSayilari = { bekleyen: 0, planlandi: 0, calisiliyor: 0, inceleme: 0, tamam: 0, iptal: 0 };
  for (const g of db.gorevler) if (g.projeId === p.id) gorevSayilari[g.durum] += 1;
  return {
    ...p,
    ajanSayisi: ajanlar.length,
    aktifAjanSayisi: ajanlar.filter((a) => a.durum === "calisiyor" || a.durum === "karar_bekliyor").length,
    gorevSayilari,
    bekleyenOnay: db.onaylar.filter((o) => o.projeId === p.id && o.durum === "bekliyor").length,
    bugunMaliyetUsd: Math.round(ajanlar.reduce((t, a) => t + a.bugunHarcananUsd, 0) * 100) / 100,
  };
}

function maliyet(pid) {
  const ajanlar = projeAjanlari(pid);
  return {
    bugunUsd: ajanlar.reduce((t, a) => t + a.bugunHarcananUsd, 0),
    toplamUsd: ajanlar.reduce((t, a) => t + a.toplamHarcananUsd, 0),
    gunlukButceUsd: db.ayarlar.gunlukButceUsd,
    ajanlar: ajanlar.map((a) => ({ ajanId: a.id, ad: a.ad, bugunUsd: a.bugunHarcananUsd, toplamUsd: a.toplamHarcananUsd })),
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

function yay(olay, projeId = null) {
  const metin = JSON.stringify(olay);
  for (const i of istemciler) {
    const herkese = olay.tur === "proje.guncellendi" || olay.tur === "bildirim";
    if (herkese || (projeId && i.projeId === projeId)) i.ws.gonder(metin);
  }
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

function harca(ajanId, usd) {
  const a = ajanBul(ajanId);
  if (!a) return;
  a.bugunHarcananUsd = Math.round((a.bugunHarcananUsd + usd) * 1000) / 1000;
  a.toplamHarcananUsd = Math.round((a.toplamHarcananUsd + usd) * 1000) / 1000;
  yay({ tur: "maliyet", projeId: a.projeId, ajanId, bugunUsd: a.bugunHarcananUsd, toplamUsd: a.toplamHarcananUsd }, a.projeId);
}

function mesajEkle(pid, kanal, gonderenId, metin) {
  const ajanlar = projeAjanlari(pid);
  const gonderenAd = gonderenId === "kurul" ? "Yönetim kurulu" : (ajanBul(gonderenId)?.ad ?? gonderenId);
  const anilanlar = ajanlar.filter((a) => new RegExp(`@${a.ad}\\b`, "iu").test(metin)).map((a) => a.id);
  const m = { id: yeniKimlik("m"), projeId: pid, kanal, gonderenId, gonderenAd, metin, anilanlar, zaman: simdi() };
  db.mesajlar.push(m);
  yay({ tur: "mesaj.yeni", mesaj: m }, pid);
  return m;
}

/** Araç çağrısı + sonuç + denetim kaydı + maliyet */
function aracCalistir(ajanId, arac, girdi, sonuc, { ozet, hata = false, karar = "izin", kural = null, usd = 0.02 } = {}) {
  const kimlik = yeniKimlik("toolu");
  akisEkle(ajanId, { tur: "arac_cagrisi", arac, aracKimligi: kimlik, girdi });
  denetimEkle(ajanId, arac, ozet ?? JSON.stringify(girdi).slice(0, 80), karar, kural, karar === "ret" ? "Politika" : null);
  setTimeout(() => {
    akisEkle(ajanId, { tur: "arac_sonucu", aracKimligi: kimlik, metin: sonuc, hata });
    harca(ajanId, usd);
  }, 700);
}

// ---------------------------------------------------------------------------
// Sahne: ajanlar kendi kendine çalışır
// ---------------------------------------------------------------------------

let listeAdimi = 1;
const K = V.CALISMA_KOKU;

const sahne = [
  () => calisiyorsa("kerem", () => aracCalistir("kerem", "Read", { file_path: `${K}/kerem/src/auth/jetonDeposu.ts` }, "// Erişim ve yenileme jetonlarını bellekte… (14 satır)", { ozet: "src/auth/jetonDeposu.ts" })),
  () => calisiyorsa("ece", eceDuzenler),
  () => calisiyorsa("kerem", () => aracCalistir("kerem", "mcp__arnorg__not_yaz", { yol: "kararlar/ADR-004-jeton-yenileme.md", metin: "…" }, "Not güncellendi.", { ozet: "kararlar/ADR-004-jeton-yenileme.md", usd: 0.04 })),
  () => calisiyorsa("ece", () => aracCalistir("ece", "Bash", { command: "npm run test -- liste", description: "Liste testlerini çalıştır" }, " ✓ tests/liste.test.tsx (4 tests) 88ms\n\n Test Files  1 passed (1)\n      Tests  4 passed (4)", { ozet: "npm run test -- liste", kural: "Test komutları" })),
  () =>
    calisiyorsa("ada", () => {
      akisEkle("ada", { tur: "dusunce", metin: "T-26 incelemeye yaklaşıyor; Onur'un oturumu kapalı. İnceleme sırası için Kerem'e yazmalıyım." });
      aracCalistir("ada", "mcp__arnorg__mesaj_gonder", { kanal: "muhendislik", metin: "@Kerem T-26 bugün incelemeye girebilir; Onur'u uyandıralım mı?" }, "Mesaj #muhendislik kanalına yazıldı.", { ozet: "#muhendislik · T-26 incelemesi", usd: 0.03 });
      setTimeout(() => mesajEkle("siparis-paneli", "muhendislik", "ada", "@Kerem T-26 bugün incelemeye girebilir; Onur'u uyandıralım mı?"), 800);
    }),
  () => calisiyorsa("kerem", () => aracCalistir("kerem", "Grep", { pattern: "yenileniyor", path: `${K}/kerem/src` }, "src/auth/oturum.ts:6:let yenileniyor: Promise<void> | null = null;", { ozet: "\"yenileniyor\" src/" })),
  () =>
    calisiyorsa("ece", () => {
      aracCalistir("ece", "WebFetch", { url: "https://cdn.example.com/ikonlar.json" }, "ArnOrg politikası reddetti: Ağ erişimi (izinli alan adı değil)", { ozet: "https://cdn.example.com/ikonlar.json", hata: true, karar: "ret", kural: "Ağ erişimi" });
    }),
  () =>
    calisiyorsa("kerem", () => {
      mesajEkle("siparis-paneli", "muhendislik", "kerem", "Evet, Onur'u T-26 için uyandırıyorum. @Ece incelemeye geçince haber ver.");
      harca("kerem", 0.02);
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
  akisEkle("ece", { tur: "arac_cagrisi", arac: "Edit", aracKimligi: kimlik, girdi: { file_path: `${K}/ece/${yol}`, old_string: onceki.slice(-80), new_string: yeni.slice(-80) } });
  denetimEkle("ece", "Edit", yol, "izin");
  setTimeout(() => {
    db.katmanlar.ece[yol] = yeni;
    zamanlar.set(`ece\0${yol}`, Date.now());
    yay({ tur: "dosya.degisti", projeId: "siparis-paneli", alan: "ece", yol, ajanId: "ece" }, "siparis-paneli");
    akisEkle("ece", { tur: "arac_sonucu", aracKimligi: kimlik, metin: "Dosya güncellendi." });
    harca("ece", 0.03);
  }, 600);
}

let sahneAdimi = 0;
setInterval(() => {
  sahne[sahneAdimi % sahne.length]();
  sahneAdimi++;
}, 4200);

// Bekleyen araç çağrıları: süre dolunca reddedilir; karar verilince bir süre sonra yenisi gelir
const sorulacaklar = [
  { ajanId: "deniz", arac: "Bash", girdi: { command: "git push origin arnorg/deniz/T-24 --force", description: "Dalı zorla gönder" }, kural: "Dışarı push ve yayın → onaya sor" },
  { ajanId: "kerem", arac: "WebFetch", girdi: { url: "https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation" }, kural: "Ağ erişimi → onaya sor" },
  { ajanId: "ece", arac: "Bash", girdi: { command: "npm publish --access public", description: "Bileşen paketini yayınla" }, kural: "Dışarı push ve yayın → onaya sor" },
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
      akisEkle(a.id, { tur: "arac_sonucu", aracKimligi: o.veri.aracKimligi, metin: "Karar süresi doldu; çağrı reddedildi.", hata: true });
      denetimEkle(a.id, o.veri.arac, o.baslik, "ret", null, "Süre doldu");
      a.durum = "calisiyor";
      ajanYay(a);
    }
    projeYay(o.projeId);
    setTimeout(yeniSoru, 40_000);
  }
}, 1000);

setTimeout(() => yay({ tur: "bildirim", seviye: "uyari", metin: "Deniz günlük bütçesinin %85'ine ulaştı.", projeId: "siparis-paneli" }), 25_000);

// ---------------------------------------------------------------------------
// Ajan tepkileri
// ---------------------------------------------------------------------------

function cevapla(ajanId, metin, gecikme = 1400) {
  setTimeout(() => {
    const a = ajanBul(ajanId);
    if (!a || a.durum === "kapali") return;
    akisEkle(ajanId, { tur: "asistan", metin });
    akisEkle(ajanId, { tur: "sonuc", maliyetUsd: 0.04 });
    harca(ajanId, 0.04);
  }, gecikme);
}

function oturumAc(a) {
  if (a.durum === "kapali" || a.durum === "duraklatildi" || a.durum === "hata") {
    a.durum = "calisiyor";
    a.oturumId ??= `oturum-${a.id}-${crypto.randomBytes(2).toString("hex")}`;
    akisEkle(a.id, { tur: "sistem", metin: `Oturum açıldı · ${a.dal ?? "ana"} · ${a.model}` });
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
const DURUM_ADLARI = { bekleyen: "Bekleyen", planlandi: "Planlandı", calisiliyor: "Çalışılıyor", inceleme: "İncelemede", tamam: "Tamam", iptal: "İptal" };

const rotalar = [];
const rota = (yontem, desen, isleyici) => rotalar.push({ yontem, desen: new RegExp(`^${desen.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`), isleyici });

rota("GET", "/api/saglik", () => ({
  surum: SURUM,
  platform: `${process.platform}-${process.arch}`,
  claudeBulundu: true,
  claudeYolu: "/home/furkan/.local/bin/claude",
  claudeSurumu: "2.1.287",
  sdkSurumu: "0.3.287",
  veriDizini: "/home/furkan/.local/share/arnorg",
}));
rota("GET", "/api/ayarlar", () => db.ayarlar);
rota("PUT", "/api/ayarlar", ({ govde }) => Object.assign(db.ayarlar, govde));
rota("GET", "/api/roller", () => V.roller);

rota("GET", "/api/projeler", () => db.projeler.map(projeOzeti));
rota("POST", "/api/projeler", ({ govde }) => {
  if (!govde?.ad || !govde?.yol) throw new Hata(400, "Ad ve yol gerekli.");
  if (!govde.yol.startsWith("/")) throw new Hata(400, "Yol mutlak olmalı.");
  if (db.projeler.some((p) => p.yol === govde.yol)) throw new Hata(400, "Bu klasör zaten bir proje olarak bağlı.");
  const id = govde.ad.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9ğüşöçı]+/g, "-").replace(/^-|-$/g, "") || yeniKimlik("p");
  const p = { id, ad: govde.ad, yol: govde.yol, aciklama: govde.aciklama ?? "", varsayilanDal: "main", olusturma: simdi() };
  db.projeler.push(p);
  db.ajanlar.push({ id: yeniKimlik("ceo"), projeId: id, ad: "Ada", rol: "ceo", rolAdi: "CEO", model: "opus", yoneticiId: null, durum: "kapali", isAciklamasi: "Brief bekliyor", gorevId: null, oturumId: null, calismaAlani: null, dal: null, izinModu: "default", gunlukButceUsd: 10, bugunHarcananUsd: 0, toplamHarcananUsd: 0, talimatEki: "", olusturma: simdi() });
  db.kanallar[id] = [{ ad: "genel", aciklama: "" }, { ad: "muhendislik", aciklama: "" }];
  db.notlar[id] = { "vizyon.md": `# Vizyon\n\n${govde.aciklama ?? ""}\n`, "mimari.md": "# Mimari\n\n" };
  db.notZamanlari[id] = { "vizyon.md": simdi(), "mimari.md": simdi() };
  db.politika[id] = kopya(V.politika);
  const ozet = projeOzeti(p);
  yay({ tur: "proje.guncellendi", proje: ozet });
  return ozet;
});
rota("GET", "/api/projeler/:pid", ({ p }) => projeOzeti(projeGerekli(p.pid)));
rota("DELETE", "/api/projeler/:pid", ({ p }) => {
  projeGerekli(p.pid);
  db.projeler = db.projeler.filter((x) => x.id !== p.pid);
  return { tamam: true };
});

function projeGerekli(pid) {
  const p = proje(pid);
  if (!p) throw new Hata(404, "Proje bulunamadı.");
  return p;
}
function ajanGerekli(aid) {
  const a = ajanBul(aid);
  if (!a) throw new Hata(404, "Ajan bulunamadı.");
  return a;
}

rota("GET", "/api/projeler/:pid/ajanlar", ({ p }) => (projeGerekli(p.pid), projeAjanlari(p.pid)));
rota("POST", "/api/projeler/:pid/ajanlar", ({ p, govde }) => {
  const pr = projeGerekli(p.pid);
  const rol = V.roller.find((r) => r.kimlik === govde?.rol);
  if (!govde?.ad || !rol) throw new Hata(400, "Ad ve geçerli bir rol gerekli.");
  if (projeAjanlari(p.pid).some((a) => a.ad.toLocaleLowerCase("tr-TR") === govde.ad.toLocaleLowerCase("tr-TR"))) throw new Hata(400, "Bu adda bir çalışan zaten var.");
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
    isAciklamasi: "Yeni işe alındı",
    gorevId: null,
    oturumId: null,
    calismaAlani: rol.yonetici ? null : `${pr.id === "siparis-paneli" ? V.CALISMA_KOKU : pr.yol + "/.arnorg/calisma"}/${id}`,
    dal: `arnorg/${id}`,
    izinModu: db.ayarlar.varsayilanIzinModu,
    gunlukButceUsd: govde.gunlukButceUsd ?? 5,
    bugunHarcananUsd: 0,
    toplamHarcananUsd: 0,
    talimatEki: govde.talimatEki ?? "",
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
  for (const k of ["model", "gunlukButceUsd", "izinModu", "yoneticiId", "talimatEki"]) if (govde && k in govde) a[k] = govde[k];
  ajanYay(a);
  return a;
});
rota("DELETE", "/api/ajanlar/:aid", ({ p }) => {
  const a = ajanGerekli(p.aid);
  db.ajanlar = db.ajanlar.filter((x) => x.id !== a.id);
  for (const g of db.gorevler) if (g.atananId === a.id) g.atananId = null;
  yay({ tur: "ajan.silindi", projeId: a.projeId, ajanId: a.id }, a.projeId);
  projeYay(a.projeId);
  return { tamam: true };
});
rota("POST", "/api/ajanlar/:aid/baslat", ({ p, govde }) => {
  const a = ajanGerekli(p.aid);
  oturumAc(a);
  const g = db.gorevler.find((x) => x.id === (govde?.gorevId ?? a.gorevId));
  const talimat = govde?.talimat || (g ? `${g.kod} üzerinde çalış: ${g.baslik}.` : "Kaldığın yerden devam et.");
  akisEkle(a.id, { tur: "kullanici", metin: talimat });
  if (g) a.isAciklamasi = `${g.kod} ${g.baslik}`;
  ajanYay(a);
  cevapla(a.id, `Başlıyorum. Önce ${g ? `${g.kod} kabul ölçütünü` : "son durumu"} okuyup bir plan çıkaracağım.`);
  return a;
});
rota("POST", "/api/ajanlar/:aid/mesaj", ({ p, govde }) => {
  const a = ajanGerekli(p.aid);
  if (!govde?.metin) throw new Hata(400, "Mesaj boş olamaz.");
  const calisiyordu = a.durum === "calisiyor";
  oturumAc(a);
  if (govde.oncelik === "now" && calisiyordu) akisEkle(a.id, { tur: "sonuc", hata: true, metin: "Kurul mesajı için kesildi" });
  akisEkle(a.id, { tur: "kullanici", metin: govde.metin });
  cevapla(a.id, `Not aldım: "${govde.metin.slice(0, 80)}". Buna göre devam ediyorum.`, govde.oncelik === "now" ? 900 : 2200);
  return { tamam: true };
});
rota("POST", "/api/ajanlar/:aid/kes", ({ p }) => {
  const a = ajanGerekli(p.aid);
  if (a.durum === "calisiyor" || a.durum === "karar_bekliyor") {
    akisEkle(a.id, { tur: "sonuc", hata: true, metin: "Kurul tarafından kesildi" });
    a.durum = "duraklatildi";
    a.isAciklamasi = "Kurul tarafından duraklatıldı";
    ajanYay(a);
    projeYay(a.projeId);
  }
  return { tamam: true };
});
rota("POST", "/api/ajanlar/:aid/durdur", ({ p }) => {
  const a = ajanGerekli(p.aid);
  if (a.durum !== "kapali") {
    akisEkle(a.id, { tur: "sistem", metin: "Oturum kapatıldı · oturum kimliği saklandı" });
    a.durum = "kapali";
    ajanYay(a);
    projeYay(a.projeId);
  }
  return a;
});
rota("POST", "/api/ajanlar/:aid/mod", ({ p, govde }) => {
  const a = ajanGerekli(p.aid);
  a.izinModu = govde?.mod ?? a.izinModu;
  if (a.durum !== "kapali") akisEkle(a.id, { tur: "sistem", metin: `İzin modu: ${a.izinModu}` });
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
  if (!govde?.baslik) throw new Hata(400, "Başlık gerekli.");
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
  if (!g) throw new Hata(404, "Görev bulunamadı.");
  if (govde?.durum && govde.durum !== g.durum) {
    if (!GECISLER[g.durum].includes(govde.durum))
      throw new Hata(409, `${g.kod}: ${DURUM_ADLARI[g.durum]} → ${DURUM_ADLARI[govde.durum]} geçişine izin yok. İzin verilenler: ${GECISLER[g.durum].map((d) => DURUM_ADLARI[d]).join(", ")}.`);
    if (govde.durum === "calisiliyor") {
      const acik = (govde.bagimliliklar ?? g.bagimliliklar).map((id) => db.gorevler.find((x) => x.id === id)).filter((x) => x && x.durum !== "tamam");
      if (acik.length) throw new Hata(409, `${g.kod} başlayamaz: bağımlılıklar bitmedi (${acik.map((x) => x.kod).join(", ")}).`);
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
  if (!govde?.metin?.trim()) throw new Hata(400, "Mesaj boş olamaz.");
  const m = mesajEkle(p.pid, kanal, "kurul", govde.metin.trim());
  const hedefler = m.anilanlar.length ? m.anilanlar : kanal === "genel" ? projeAjanlari(p.pid).filter((a) => a.rol === "ceo").map((a) => a.id) : [];
  for (const aid of hedefler) {
    const a = ajanBul(aid);
    if (!a) continue;
    oturumAc(a);
    akisEkle(aid, { tur: "kullanici", metin: `Kurul (#${kanal}): ${m.metin}` });
    setTimeout(() => {
      const yanit =
        a.rol === "ceo"
          ? `Not aldım. Kapsamını Kerem'le netleştirip panoya ekliyorum; tahmini maliyet $2–4. Planı bu akşamki raporda paylaşırım.`
          : `Aldım, ${m.metin.length > 60 ? "bu notu" : `"${m.metin}"`} hesaba katarak devam ediyorum.`;
      mesajEkle(p.pid, kanal, aid, yanit);
      akisEkle(aid, { tur: "asistan", metin: yanit });
      harca(aid, 0.03);
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
  if (yol.includes("..")) throw new Hata(400, "Yol .. içeremez.");
  const icerik = db.notlar[p.pid]?.[yol];
  if (icerik === undefined) throw new Hata(404, "Not bulunamadı.");
  return { yol, icerik };
});
rota("PUT", "/api/projeler/:pid/not", ({ p, govde }) => {
  if (!govde?.yol || govde.yol.includes("..")) throw new Hata(400, "Geçersiz yol.");
  (db.notlar[p.pid] ??= {})[govde.yol] = govde.icerik ?? "";
  (db.notZamanlari[p.pid] ??= {})[govde.yol] = simdi();
  return { yol: govde.yol, baslik: (/^#\s+(.+)$/m.exec(govde.icerik ?? "")?.[1] ?? govde.yol).trim(), guncelleme: simdi() };
});

rota("GET", "/api/projeler/:pid/denetim", ({ p, q }) => db.denetim.filter((k) => k.projeId === p.pid).slice(0, Number(q.get("sinir") ?? 300)));
rota("GET", "/api/projeler/:pid/politika", ({ p }) => db.politika[p.pid] ?? []);
rota("PUT", "/api/projeler/:pid/politika", ({ p, govde }) => {
  if (!Array.isArray(govde)) throw new Hata(400, "Kural listesi bekleniyor.");
  for (const k of govde) for (const d of k.desenler ?? []) {
    try {
      new RegExp(d, "i");
    } catch {
      throw new Hata(400, `Geçersiz desen: ${d}`);
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
  if (!o) throw new Hata(404, "Onay bulunamadı.");
  if (o.durum !== "bekliyor") throw new Hata(409, `Bu karar zaten verilmiş (${o.durum}).`);
  const kabul = govde?.karar === "onayla";
  o.durum = kabul ? "onaylandi" : "reddedildi";
  o.sonuclanma = simdi();
  o.not = govde?.not ?? null;
  const a = ajanBul(o.ajanId);
  if (o.tur === "arac" && a) {
    const komut = o.veri?.girdi?.command ?? o.veri?.girdi?.url ?? o.baslik;
    denetimEkle(a.id, o.veri?.arac ?? "Bash", komut, kabul ? "izin" : "ret", kabul ? "Yönetim kurulu onayı" : "Yönetim kurulu reddi", o.not);
    akisEkle(a.id, {
      tur: "arac_sonucu",
      aracKimligi: o.veri?.aracKimligi,
      metin: kabul ? "To github.com:arnex/siparis-paneli.git\n   4be1c02..9f3d7aa  main -> main" : `Kurul reddetti${o.not ? `: ${o.not}` : "."}`,
      hata: !kabul,
    });
    a.durum = "calisiyor";
    a.isAciklamasi = a.gorevId ? `${db.gorevler.find((g) => g.id === a.gorevId)?.kod ?? ""} ${db.gorevler.find((g) => g.id === a.gorevId)?.baslik ?? ""}`.trim() : a.isAciklamasi;
    ajanYay(a);
    cevapla(a.id, kabul ? "Gönderildi. Görevi incelemeye alıyorum." : `Anlaşıldı${o.not ? `: ${o.not}` : ""}. Dalımı itip PR açıyorum.`);
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
      isAciklamasi: "İlk görevi bekliyor",
      gorevId: null,
      oturumId: `oturum-${v.ad}-1`,
      calismaAlani: `${V.CALISMA_KOKU}/${v.ad.toLocaleLowerCase("tr-TR")}`,
      dal: `arnorg/${v.ad.toLocaleLowerCase("tr-TR")}`,
      izinModu: db.ayarlar.varsayilanIzinModu,
      gunlukButceUsd: v.gunlukButceUsd ?? 5,
      bugunHarcananUsd: 0,
      toplamHarcananUsd: 0,
      talimatEki: v.talimatEki ?? "",
      olusturma: simdi(),
    };
    db.ajanlar.push(yeni);
    db.katmanlar[yeni.id] = {};
    db.akislar[yeni.id] = [];
    akisEkle(yeni.id, { tur: "sistem", metin: `Oturum açıldı · ${yeni.dal} · ${yeni.model}` });
    ajanYay(yeni);
    setTimeout(() => mesajEkle(o.projeId, "genel", "ada", `${yeni.ad} ekibe katıldı. @Kerem ilk görevini sen ata; ödeme işine geçmeden oturum ve jeton akışlarını denetlesin.`), 1200);
  }
  if (o.tur === "butce" && kabul && o.veri?.ajanId) {
    const h = ajanBul(o.veri.ajanId);
    if (h) {
      h.gunlukButceUsd = o.veri.istenenUsd ?? h.gunlukButceUsd + 3;
      ajanYay(h);
    }
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
  return o;
});

rota("GET", "/api/projeler/:pid/calisma-alanlari", ({ p }) => (projeGerekli(p.pid), calismaAlanlari(p.pid)));
rota("GET", "/api/projeler/:pid/dosyalar", ({ q }) => agacKur(q.get("alan") ?? "ana"));
rota("GET", "/api/projeler/:pid/dosya", ({ q }) => {
  const alan = q.get("alan") ?? "ana";
  const yol = q.get("yol") ?? "";
  const icerik = alanDosyalari(alan)[yol];
  if (icerik === undefined) throw new Hata(404, "Dosya bulunamadı.");
  const duz = duzenleyen(alan, yol);
  return { yol, icerik, dil: dilBul(yol), saltOkunur: duz !== null, duzenleyenAjanId: duz };
});
rota("PUT", "/api/projeler/:pid/dosya", ({ p, govde }) => {
  const { alan, yol, icerik } = govde ?? {};
  if (!alan || !yol) throw new Hata(400, "Alan ve yol gerekli.");
  const duz = duzenleyen(alan, yol);
  if (duz) throw new Hata(409, `${ajanBul(duz)?.ad ?? "Bir ajan"} bu dosyayı düzenliyor. Önce duraklatın.`);
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
  if (yol.split("/").some((p) => p === "..")) throw new Hata(400, "Geçersiz dosya yolu.");
  return yol;
}
function yazilabilirMi(yol) {
  if (!yol) throw new Hata(403, "Çalışma alanının kökü değiştirilemez.");
  if (yol.split("/").includes(".git")) throw new Hata(403, ".git içindeki dosyalar düzenleyiciden değiştirilemez.");
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
  if (!d && q.get("yoksa") !== "bos") throw new Hata(404, `Bulunamadı: ${yol || "."}`);
  return d;
});
rota("GET", "/api/projeler/:pid/fs/liste", ({ q }) => {
  const { alan, yol } = istekKonumu(q);
  if (!klasorler(alan).has(yol)) throw new Hata(404, `Bulunamadı: ${yol || "."}`);
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
    throw new Hata(404, `Bulunamadı: ${yol}`);
  }
  return { __ham: Buffer.from(icerik) };
});
rota("PUT", "/api/projeler/:pid/fs/icerik", ({ p, q, ham }) => {
  const { alan, yol } = istekKonumu(q);
  yazilabilirMi(yol);
  const var_ = yol in alanDosyalari(alan);
  if (!var_ && q.get("olustur") !== "1") throw new Hata(404, `Bulunamadı: ${yol}`);
  if (var_ && q.get("ustune") !== "1") throw new Hata(409, `Zaten var: ${yol}`);
  const duz = duzenleyen(alan, yol);
  if (duz) throw new Hata(409, `${ajanBul(duz)?.ad ?? "Bir ajan"} bu dosyayı düzenliyor. Önce ajanı duraklatın.`);
  sahteYaz(alan, yol, (ham ?? Buffer.alloc(0)).toString("utf8"));
  yay({ tur: "dosya.degisti", projeId: p.pid, alan, yol, ajanId: null }, p.pid);
  return fsDurumu(alan, yol);
});
rota("POST", "/api/projeler/:pid/fs/klasor", ({ p, govde }) => {
  const alan = govde?.alan ?? "ana";
  const yol = yolDenetle(temizYol(govde?.yol));
  yazilabilirMi(yol);
  if (fsDurumu(alan, yol)) throw new Hata(409, `Zaten var: ${yol}`);
  if (!bosKlasorler.has(alan)) bosKlasorler.set(alan, new Set());
  bosKlasorler.get(alan).add(yol);
  yay({ tur: "dosya.degisti", projeId: p.pid, alan, yol, ajanId: null }, p.pid);
  return { tamam: true };
});
rota("DELETE", "/api/projeler/:pid/fs", ({ p, q }) => {
  const { alan, yol } = istekKonumu(q);
  yazilabilirMi(yol);
  const d = fsDurumu(alan, yol);
  if (!d) throw new Hata(404, `Bulunamadı: ${yol}`);
  if (d.tur === "dosya") {
    if (duzenleyen(alan, yol)) throw new Hata(409, "Bir ajan bu dosyayı düzenliyor. Önce ajanı duraklatın.");
    sahteSil(alan, yol);
  } else {
    const icindekiler = Object.keys(alanDosyalari(alan)).filter((f) => f.startsWith(`${yol}/`));
    if (icindekiler.length && q.get("ozyinelemeli") !== "1") throw new Hata(409, `Klasör boş değil: ${yol}`);
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
  if (!tasinacak.length) throw new Hata(404, `Bulunamadı: ${kaynak}`);
  if (fsDurumu(alan, hedef) && !govde?.ustune) throw new Hata(409, `Zaten var: ${hedef}`);
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
  if (!govde?.desen) throw new Hata(400, "Arama deseni boş olamaz.");
  const kaynak = govde.regex ? govde.desen : govde.desen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let duzenli;
  try {
    duzenli = new RegExp(govde.tamSozcuk ? `(?<![\\p{L}\\p{N}_])(?:${kaynak})(?![\\p{L}\\p{N}_])` : kaynak, `gmu${govde.harfDuyarli ? "" : "i"}`);
  } catch (h) {
    throw new Hata(400, `Geçersiz düzenli ifade: ${h.message}`);
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
    throw new Hata(404, `Bu sürümde dosya yok: ${yol}`);
  }
  return { __ham: Buffer.from(kume[yol]) };
});
const yalnizAna = (alan) => {
  if (alan !== "ana") throw new Hata(403, "Ajan çalışma alanları kaynak denetiminde salt okunurdur; git işlemleri yalnız ana repoda yapılır.");
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
  if (!govde?.mesaj?.trim()) throw new Hata(400, "Commit mesajı boş olamaz.");
  if (govde.tumu) db.indeks = kopya(db.ana);
  if (!kumeFarki(db.anaHead, db.indeks).length) throw new Hata(409, "Commit'lenecek aşamaya alınmış değişiklik yok.");
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

rota("GET", "/api/projeler/:pid/maliyet", ({ p }) => (projeGerekli(p.pid), maliyet(p.pid)));
function sahteRapor(pid) {
  projeGerekli(pid);
  const gun = simdi().slice(0, 10);
  const gorevler = db.gorevler.filter((g) => g.projeId === pid);
  const say = (d) => gorevler.filter((g) => g.durum === d).length;
  const markdown = `# Durum raporu · ${gun}\n\n## Özet\n\n- Tamamlanan: ${say("tamam")} · süren: ${say("calisiliyor")} · incelemede: ${say("inceleme")}\n- Harcama: $${maliyet(pid).bugunUsd.toFixed(2)}\n`;
  return { baslik: `Durum raporu · ${gun}`, yol: `raporlar/${gun}.md`, baslangic: simdi(), markdown };
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
    ws.gonder("Terminal bulunamadı.\r\n");
    ws.kapat();
    return;
  }
  const a = ajanBul(t.alan);
  const dal = a?.dal ?? "main";
  const istem = () => `\x1b[32m${a ? a.id : "furkan"}@arnorg\x1b[0m \x1b[34m~/${a ? `calisma/${a.id}` : "siparis-paneli"}\x1b[0m \x1b[31m(${dal})\x1b[0m $ `;
  let satir = "";
  ws.gonder(`\x1b[2mArnOrg sahte terminali · ${t.alan} · gerçek kabuk değildir\x1b[0m\r\n${istem()}`);
  const komutlar = {
    ls: () => [...new Set(Object.keys(alanDosyalari(t.alan)).map((y) => y.split("/")[0]))].sort().join("  "),
    pwd: () => (a?.calismaAlani ?? V.PROJE_KOKU),
    "git status": () => {
      const k = db.katmanlar[t.alan] ?? {};
      const satirlar = Object.keys(k).map((y) => `\t\x1b[31m${degisiklik(t.alan, y) === "A" ? "yeni dosya:" : "değiştirildi:"}   ${y}\x1b[0m`);
      return `Dal ${dal}\r\n${satirlar.length ? `Commit için hazırlanmamış değişiklikler:\r\n${satirlar.join("\r\n")}` : "çalışma ağacı temiz"}`;
    },
    "git log --oneline": () => "9f3d7aa T-24: imleçle sayfalama\r\n4be1c02 T-22: ürün kataloğu API\r\n1a07e9d T-16: veritabanı şeması",
    "npm test": () => "\r\n \x1b[32m✓\x1b[0m tests/api/siparisler.test.ts (2 tests) 41ms\r\n \x1b[32m✓\x1b[0m tests/api/sayfalama.test.ts (2 tests) 12ms\r\n\r\n Test Files  \x1b[32m2 passed\x1b[0m (2)\r\n      Tests  \x1b[32m4 passed\x1b[0m (4)",
    clear: () => "\x1b[2J\x1b[H",
    help: () => "Sahte komutlar: ls, pwd, git status, git log --oneline, npm test, clear, echo",
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
        else if (komut) cikti = komutlar[komut]?.() ?? `${komut.split(" ")[0]}: komut bulunamadı (help yazın)`;
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
    yanit.end(`<!doctype html><meta charset="utf-8"><title>ArnOrg sahte çekirdek</title><body style="background:#0a0a0b;color:#f2f0ec;font:14px monospace;padding:2rem">
<p>Stüdyo derlemesi yok. Önce <code>npm run build -w @arnorg/studyo</code> çalıştırın ya da Vite geliştirme sunucusunu kullanın:</p>
<p><a style="color:#f27a68" href="http://localhost:5173/#anahtar=${ANAHTAR}">http://localhost:5173/#anahtar=${ANAHTAR}</a></p></body>`);
    return;
  }
  yanit.writeHead(200, { ...YALITIM, "Content-Type": TURLER[path.extname(dosya)] ?? "application/octet-stream", "Cache-Control": dosya.endsWith("index.html") ? "no-cache" : "max-age=31536000, immutable" });
  fs.createReadStream(dosya).pipe(yanit);
}

const sunucu = http.createServer(async (istek, yanit) => {
  const url = new URL(istek.url ?? "/", `http://${istek.headers.host ?? "localhost"}`);
  if (!url.pathname.startsWith("/api/")) return statikGonder(url, yanit);

  const json = (durum, govde) => {
    yanit.writeHead(durum, { "Content-Type": "application/json; charset=utf-8" });
    yanit.end(JSON.stringify(govde));
  };
  if (istek.headers.authorization !== `Bearer ${ANAHTAR}`) return json(401, { hata: "Erişim anahtarı eksik ya da yanlış." });

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
        return json(400, { hata: "Gövde geçerli JSON değil." });
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
      return json(500, { hata: "Sahte çekirdekte beklenmeyen hata." });
    }
  }
  json(404, { hata: "Uç nokta bulunamadı." });
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
