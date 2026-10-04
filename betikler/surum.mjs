#!/usr/bin/env node
// ArnOrg sürüm betiği.
//
//   npm run surum -- 0.0.2             Kök ve tüm çalışma alanı paketlerini, kilit dosyasını ve
//                                      ARNORG_SURUMU sabitini verilen sürüme çeker.
//   npm run surum -- --denetle v0.0.2  Etiket, paket sürümleri ve docs/surumler/v0.0.2.md sürüm notları
//                                      uyuşuyor mu (sürüm iş akışı her pakette bunu çalıştırır).
//
// Sürüm çıkarma: sürümü çek, docs/surumler/v<sürüm>.md dosyasına notları yaz, commit et,
// `git tag -a v<sürüm> -m "ArnOrg <sürüm>"` ve `git push origin v<sürüm>`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORTAK = "paketler/ortak/src/index.ts";
const SURUM_DESENI = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SABIT_DESENI = /export const ARNORG_SURUMU = "([^"]*)";/;

const oku = (yol) => fs.readFileSync(path.join(KOK, yol), "utf8");
const yaz = (yol, icerik) => fs.writeFileSync(path.join(KOK, yol), icerik, "utf8");
const paketDosyalari = () => ["package.json", ...JSON.parse(oku("package.json")).workspaces.map((w) => `${w}/package.json`)];
const notDosyasi = (surum) => `docs/surumler/v${surum}.md`;

function hata(mesaj) {
  console.error(`Sürüm: ${mesaj}`);
  process.exit(1);
}

/** Paketlerin, kilit dosyasının ve ortak sabitin taşıdığı sürümler (dosya → sürüm) */
function surumler() {
  const sonuc = new Map();
  for (const dosya of paketDosyalari()) sonuc.set(dosya, JSON.parse(oku(dosya)).version);
  const kilit = JSON.parse(oku("package-lock.json"));
  sonuc.set("package-lock.json", kilit.version);
  for (const [yol, p] of Object.entries(kilit.packages ?? {})) {
    if (yol === "" || (yol.startsWith("paketler/") && !yol.includes("node_modules"))) sonuc.set(`package-lock.json → ${yol || "kök"}`, p.version);
  }
  sonuc.set(ORTAK, SABIT_DESENI.exec(oku(ORTAK))?.[1]);
  return sonuc;
}

function ayarla(surum) {
  if (!SURUM_DESENI.test(surum)) hata(`"${surum}" geçerli bir sürüm değil (ör. 0.0.2).`);
  // Biçimi bozmamak için yalnız "version" satırı değiştirilir
  for (const dosya of paketDosyalari()) {
    const icerik = oku(dosya);
    if (!/^ {2}"version": "[^"]*",$/m.test(icerik)) hata(`${dosya} içinde "version" satırı bulunamadı.`);
    yaz(dosya, icerik.replace(/^( {2}"version": )"[^"]*",$/m, `$1"${surum}",`));
  }
  const kilit = JSON.parse(oku("package-lock.json"));
  kilit.version = surum;
  for (const [yol, p] of Object.entries(kilit.packages ?? {})) {
    if (yol === "" || (yol.startsWith("paketler/") && !yol.includes("node_modules"))) p.version = surum;
  }
  yaz("package-lock.json", `${JSON.stringify(kilit, null, 2)}\n`);
  const ortak = oku(ORTAK);
  if (!SABIT_DESENI.test(ortak)) hata(`${ORTAK} içinde ARNORG_SURUMU bulunamadı.`);
  yaz(ORTAK, ortak.replace(SABIT_DESENI, `export const ARNORG_SURUMU = "${surum}";`));

  console.log(`Sürüm ${surum} olarak ayarlandı: ${[...surumler().keys()].length} kayıt.`);
  const notlar = notDosyasi(surum);
  console.log(
    fs.existsSync(path.join(KOK, notlar))
      ? `Sürüm notları: ${notlar}`
      : `Sırada: ${notlar} dosyasına sürüm notlarını yazın; iş akışı bu dosya olmadan sürüm açmaz.`,
  );
}

function denetle(etiket) {
  if (!etiket) hata("denetlenecek etiket verilmedi (ör. --denetle v0.0.2).");
  const surum = etiket.replace(/^v/, "");
  if (!SURUM_DESENI.test(surum)) hata(`"${etiket}" bir sürüm etiketi değil (ör. v0.0.2).`);
  const uyusmayan = [...surumler()].filter(([, v]) => v !== surum);
  if (uyusmayan.length) {
    hata(
      `${etiket} etiketi paket sürümleriyle uyuşmuyor:\n` +
        uyusmayan.map(([d, v]) => `  ${d}: ${v ?? "yok"}`).join("\n") +
        `\nÖnce "npm run surum -- ${surum}" çalıştırıp commit edin, etiketi o commit'e koyun.`,
    );
  }
  const notlar = notDosyasi(surum);
  const notYolu = path.join(KOK, notlar);
  if (!fs.existsSync(notYolu) || fs.readFileSync(notYolu, "utf8").trim().length < 40) {
    hata(`${notlar} sürüm notları yok ya da boş.`);
  }
  console.log(`Sürüm ${surum}: etiket, ${surumler().size} sürüm kaydı ve ${notlar} uyuşuyor.`);
}

const [ilk, ikinci] = process.argv.slice(2);
if (ilk === "--denetle") denetle(ikinci);
else if (ilk && !ilk.startsWith("-")) ayarla(ilk);
else {
  console.log("Kullanım: npm run surum -- <sürüm>   |   npm run surum -- --denetle v<sürüm>");
  process.exit(ilk ? 1 : 0);
}
