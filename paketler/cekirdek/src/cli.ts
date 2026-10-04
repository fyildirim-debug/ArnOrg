#!/usr/bin/env node
// arnorg serve [--port 47820] [--host 127.0.0.1] [--veri <dizin>] [--studyo <dizin>] [--izinli-host <ad>]
import os from "node:os";
import path from "node:path";
import { dilKaynagi, iki } from "./dil.js";
import { baslat } from "./index.js";
import { sistemDili } from "./yapilandirma.js";

// Çekirdek açılana kadar terminal mesajları sistem dilinde (ARNORG_DIL ya da yerel ayar); açılınca ayardaki dil geçerli olur
dilKaynagi(() => sistemDili());

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
    console.log(
      iki(
        "Kullanım: arnorg serve [--port 47820] [--host 127.0.0.1] [--veri <dizin>] [--studyo <dizin>] [--izinli-host <ad>]",
        "Usage: arnorg serve [--port 47820] [--host 127.0.0.1] [--veri <dir>] [--studyo <dir>] [--izinli-host <name>]",
      ),
    );
    process.exit(a.komut === "help" || a.komut === "--help" ? 0 : 1);
  }
  const sunucu = await baslat({
    port: a.port ?? (process.env.ARNORG_PORT ? Number(process.env.ARNORG_PORT) : 47820),
    host: a.host ?? process.env.ARNORG_HOST ?? "127.0.0.1",
    veriDizini: path.resolve(a.veri ?? varsayilanVeriDizini()),
    studyoDizini: a.studyo,
    izinliHostlar: a.izinliHostlar,
  });
  console.log(`${iki("ArnOrg hazır", "ArnOrg is ready")}: ${sunucu.adres}/#anahtar=${sunucu.erisimAnahtari}`);
  console.log(`${iki("Veri dizini", "Data directory")}: ${path.resolve(a.veri ?? varsayilanVeriDizini())}`);
  const kapat = async () => {
    console.log(iki("ArnOrg kapanıyor…", "ArnOrg is shutting down…"));
    await sunucu.kapat();
    process.exit(0);
  };
  process.on("SIGINT", () => void kapat());
  process.on("SIGTERM", () => void kapat());
}

ana().catch((h) => {
  console.error(iki("ArnOrg başlatılamadı:", "ArnOrg could not start:"), h instanceof Error ? h.message : h);
  process.exit(1);
});
