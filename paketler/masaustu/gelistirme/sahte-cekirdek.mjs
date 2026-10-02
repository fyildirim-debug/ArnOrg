// Sahte çekirdek: gerçek çekirdek (paketler/cekirdek) olmadan masaüstü kabuğunu denemek için.
// Yalnız ARNORG_SAHTE_CEKIRDEK=1 ile kullanılır; paketlenmiş uygulamaya girmez.
//
// Gerçek çekirdeğin sözleşmesini taklit eder:
//   export async function baslat({ port, host, veriDizini, studyoDizini, erisimAnahtari }) → { adres, port, erisimAnahtari, kapat }
//   - Host başlığı yalnız 127.0.0.1:<port> / localhost:<port>
//   - /api/* uçları "Authorization: Bearer <anahtar>" ister; "/" anahtarsızdır
//
// Ayrıca çekirdeğin çalışma zamanı bağımlılıklarını (better-sqlite3, @lydell/node-pty, fastify,
// @anthropic-ai/claude-agent-sdk ve yerel claude ikilisi) yükleyip dener; sonuçlar sayfada ve kayıtta görünür.
// Paketleme denemesinde bu dosya geçici olarak çekirdeğin yerine konur (README: "Sahte çekirdekle paket denemesi").
//
// Ortam değişkenleri:
//   ARNORG_SAHTE_COKME=<sn>        verilen saniye sonra çıkış kodu 3 ile çöker (hata sayfasını denemek için)
//   ARNORG_SAHTE_COKME=baslarken   baslat() hata fırlatır (başlatılamama durumunu denemek için)
//   ARNORG_SAHTE_GECIKME=<sn>      başlatmayı geciktirir (açılış penceresini görmek için)

import { execFile } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const gerektir = createRequire(import.meta.url);

function sure(ms, is) {
  return Promise.race([is, new Promise((_, ret) => setTimeout(() => ret(new Error(`${ms} ms içinde bitmedi`)), ms))]);
}

async function dene(ad, is) {
  try {
    return { ad, tamam: true, ayrinti: await sure(20_000, is()) };
  } catch (hata) {
    return { ad, tamam: false, ayrinti: hata instanceof Error ? hata.message : String(hata) };
  }
}

/** Çekirdeğin çalışma zamanı bağımlılıklarını yükler ve kısaca çalıştırır. */
async function bagimliliklariDene() {
  return Promise.all([
    dene("better-sqlite3", async () => {
      const { default: Database } = await import("better-sqlite3");
      const db = new Database(":memory:");
      const { surum } = db.prepare("select sqlite_version() as surum").get();
      db.close();
      return `SQLite ${surum}`;
    }),
    dene("@lydell/node-pty", async () => {
      const pty = await import("@lydell/node-pty");
      const spawn = pty.spawn ?? pty.default.spawn;
      const [kabuk, argumanlar] =
        process.platform === "win32" ? ["cmd.exe", ["/c", "echo merhaba-pty"]] : ["/bin/sh", ["-c", "echo merhaba-pty"]];
      return new Promise((coz, ret) => {
        let cikti = "";
        const p = spawn(kabuk, argumanlar, { cols: 80, rows: 24 });
        p.onData((d) => (cikti += d));
        p.onExit(({ exitCode }) =>
          cikti.includes("merhaba-pty") ? coz(`pty çıktısı alındı (çıkış ${exitCode})`) : ret(new Error(`beklenen çıktı yok: ${cikti}`)),
        );
      });
    }),
    dene("fastify", async () => {
      const { default: fastify } = await import("fastify");
      const uygulama = fastify();
      await uygulama.ready();
      await uygulama.close();
      return `fastify ${uygulama.version}`;
    }),
    dene("@anthropic-ai/claude-agent-sdk", async () => {
      const sdk = await import("@anthropic-ai/claude-agent-sdk");
      if (typeof sdk.query !== "function") throw new Error("query() yok");
      const paket = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
      const ikili = join(dirname(gerektir.resolve(`${paket}/package.json`)), process.platform === "win32" ? "claude.exe" : "claude");
      if (!existsSync(ikili)) throw new Error(`ikili yok: ${ikili}`);
      const surum = await new Promise((coz, ret) =>
        execFile(ikili, ["--version"], { timeout: 15_000 }, (hata, cikti) => (hata ? ret(hata) : coz(cikti.trim()))),
      );
      return `${surum} · ${ikili}`;
    }),
  ]);
}

function sayfa(bilgi) {
  const satirlar = bilgi.denetimler
    .map(
      (d) =>
        `<tr><td>${d.tamam ? "TAMAM" : "HATA"}</td><td>${kacis(d.ad)}</td><td>${kacis(d.ayrinti)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>ArnOrg · Sahte çekirdek</title>
<style>
body{margin:0;background:#0a0a0b;color:#f2f0ec;font:14px/1.6 "IBM Plex Mono",ui-monospace,Consolas,monospace;padding:40px}
h1{font:400 72px/0.9 Anton,Impact,"Arial Narrow Bold",sans-serif;text-transform:uppercase;margin:0 0 8px}
.etiket{color:oklch(0.72 0.19 25);letter-spacing:.16em;text-transform:uppercase;font-size:12px}
table{border-collapse:collapse;margin-top:24px;width:100%}td{border:1px solid #26262a;padding:6px 10px;vertical-align:top}
td:first-child{width:70px;color:oklch(0.72 0.19 25)}code{color:#8d8a85}
</style></head><body>
<p class="etiket">Sahte çekirdek · geliştirme</p>
<h1>ArnOrg</h1>
<p>Adres <code>${kacis(bilgi.adres)}</code> · Veri <code>${kacis(bilgi.veriDizini)}</code></p>
<p>Anahtar: <code id="anahtar">bekleniyor</code> · Sağlık: <code id="saglik">bekleniyor</code> · Köprü: <code id="kopru">bekleniyor</code></p>
<table>${satirlar}</table>
<script>
const parca = new URLSearchParams(location.hash.slice(1));
if (parca.get("anahtar")) { sessionStorage.setItem("arnorg-anahtar", parca.get("anahtar")); history.replaceState(null, "", location.pathname); }
const anahtar = sessionStorage.getItem("arnorg-anahtar");
document.getElementById("anahtar").textContent = anahtar ? "alındı" : "YOK";
document.getElementById("kopru").textContent = window.arnorg ? window.arnorg.platform + " · v" + window.arnorg.surum : "yok";
fetch("/api/saglik", { headers: { Authorization: "Bearer " + anahtar } })
  .then((y) => y.json()).then((s) => (document.getElementById("saglik").textContent = s.surum ? "tamam" : JSON.stringify(s)))
  .catch((h) => (document.getElementById("saglik").textContent = String(h)));
</script></body></html>`;
}

function kacis(m) {
  return String(m).replace(/[&<>"']/g, (k) => `&#${k.charCodeAt(0)};`);
}

export async function baslat(s) {
  if (process.env.ARNORG_SAHTE_COKME === "baslarken") {
    throw new Error("ARNORG_SAHTE_COKME=baslarken: sahte çekirdek bilerek başlatılamadı");
  }
  const gecikme = Number(process.env.ARNORG_SAHTE_GECIKME);
  if (gecikme > 0) await new Promise((coz) => setTimeout(coz, gecikme * 1000));
  const erisimAnahtari = s.erisimAnahtari ?? randomBytes(24).toString("base64url");
  const denetimler = await bagimliliklariDene();
  for (const d of denetimler) console.log(`[sahte-cekirdek] ${d.tamam ? "TAMAM" : "HATA "} ${d.ad}: ${d.ayrinti}`);

  let port = 0;
  const anahtarDogruMu = (baslik) => {
    const beklenen = Buffer.from(`Bearer ${erisimAnahtari}`);
    const gelen = Buffer.from(baslik ?? "");
    return gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen);
  };

  const sunucu = createServer((istek, yanit) => {
    const izinliHostlar = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!izinliHostlar.includes(istek.headers.host ?? "")) {
      yanit.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ hata: "Geçersiz Host başlığı" }));
      return;
    }
    const yol = new URL(istek.url ?? "/", "http://yerel").pathname;
    if (yol.startsWith("/api/")) {
      if (!anahtarDogruMu(istek.headers.authorization)) {
        yanit.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ hata: "Erişim anahtarı yok ya da yanlış" }));
        return;
      }
      if (yol === "/api/saglik") {
        yanit.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({ surum: "sahte", platform: process.platform, veriDizini: s.veriDizini, denetimler }),
        );
        return;
      }
      yanit.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ hata: "Bulunamadı" }));
      return;
    }
    yanit
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(sayfa({ adres: `http://127.0.0.1:${port}`, veriDizini: s.veriDizini, denetimler }));
  });

  await new Promise((coz, ret) => {
    sunucu.once("error", ret);
    sunucu.listen(s.port ?? 47820, s.host ?? "127.0.0.1", coz);
  });
  port = sunucu.address().port;
  const adres = `http://127.0.0.1:${port}`;
  console.log(`[sahte-cekirdek] dinleniyor: ${adres} (stüdyo: ${s.studyoDizini ?? "yok"})`);

  const cokme = Number(process.env.ARNORG_SAHTE_COKME);
  if (cokme > 0) {
    setTimeout(() => {
      console.error(`[sahte-cekirdek] ARNORG_SAHTE_COKME=${cokme}: bilerek çöküyor`);
      process.exit(3);
    }, cokme * 1000);
  }

  return {
    adres,
    port,
    erisimAnahtari,
    kapat: () =>
      new Promise((coz) => {
        console.log("[sahte-cekirdek] kapanıyor");
        sunucu.closeAllConnections();
        sunucu.close(() => coz());
      }),
  };
}
