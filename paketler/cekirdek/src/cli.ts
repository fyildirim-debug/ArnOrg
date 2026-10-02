#!/usr/bin/env node
// arnorg serve [--port 47820] [--host 127.0.0.1] [--veri <dizin>] [--studyo <dizin>] [--izinli-host <ad>]
import os from "node:os";
import path from "node:path";
import { baslat } from "./index.js";

function varsayilanVeriDizini(): string {
  if (process.env.ARNORG_VERI) return process.env.ARNORG_VERI;
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "ArnOrg", "veri");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "ArnOrg", "veri");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "arnorg", "veri");
}

function argumanlariOku(argv: string[]) {
  const sonuc: { komut: string; port?: number; host?: string; veri?: string; studyo?: string; izinliHostlar: string[] } = { komut: argv[0] ?? "serve", izinliHostlar: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const deger = argv[i + 1];
    if (a === "--port" && deger) (sonuc.port = Number(deger)), i++;
    else if (a === "--host" && deger) (sonuc.host = deger), i++;
    else if (a === "--veri" && deger) (sonuc.veri = deger), i++;
    else if (a === "--studyo" && deger) (sonuc.studyo = deger), i++;
    else if (a === "--izinli-host" && deger) sonuc.izinliHostlar.push(deger), i++;
  }
  return sonuc;
}

async function ana(): Promise<void> {
  const a = argumanlariOku(process.argv.slice(2));
  if (a.komut !== "serve") {
    console.log("Kullanım: arnorg serve [--port 47820] [--host 127.0.0.1] [--veri <dizin>] [--studyo <dizin>] [--izinli-host <ad>]");
    process.exit(a.komut === "help" || a.komut === "--help" ? 0 : 1);
  }
  const sunucu = await baslat({
    port: a.port ?? (process.env.ARNORG_PORT ? Number(process.env.ARNORG_PORT) : 47820),
    host: a.host ?? process.env.ARNORG_HOST ?? "127.0.0.1",
    veriDizini: path.resolve(a.veri ?? varsayilanVeriDizini()),
    studyoDizini: a.studyo,
    izinliHostlar: a.izinliHostlar,
  });
  console.log(`ArnOrg hazır: ${sunucu.adres}/#anahtar=${sunucu.erisimAnahtari}`);
  console.log(`Veri dizini: ${path.resolve(a.veri ?? varsayilanVeriDizini())}`);
  const kapat = async () => {
    console.log("ArnOrg kapanıyor…");
    await sunucu.kapat();
    process.exit(0);
  };
  process.on("SIGINT", () => void kapat());
  process.on("SIGTERM", () => void kapat());
}

ana().catch((h) => {
  console.error("ArnOrg başlatılamadı:", h instanceof Error ? h.message : h);
  process.exit(1);
});
