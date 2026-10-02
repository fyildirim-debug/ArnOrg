// Denetim politikası: her araç çağrısı için izin / ret / onaya sor kararı.
// Kararlar PreToolUse kancasında uygulanır (bkz. docs/PROTOKOLLER.md bölüm 5).
import path from "node:path";
import os from "node:os";
import type { PolitikaKurali } from "@arnorg/ortak";

export interface PolitikaBaglami {
  /** Ajanın çalışma dizini (worktree) */
  cwd: string;
  /** Projenin ana repo kökü */
  projeKoku: string;
  /** Ajan rolü (ceo, cto, backend…) */
  rol: string;
  /** Platform; testlerde değiştirilebilir */
  platform?: NodeJS.Platform;
}

export interface PolitikaSonucu {
  karar: "izin" | "ret" | "sor";
  kural: string | null;
  neden: string | null;
}

/** Kabuk komutu çalıştıran araçlar; Monitor arka planda komut çalıştırır */
const KOMUT_ARACLARI = new Set(["Bash", "PowerShell", "Monitor"]);
const YAZMA_ARACLARI = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const OKUMA_ARACLARI = new Set(["Read", "Grep", "Glob", "NotebookRead"]);

/** Varsayılan kurallar; proje bazında düzenlenebilir */
export function varsayilanKurallar(): PolitikaKurali[] {
  return [
    {
      id: "yikici-komut",
      ad: "Yıkıcı komutlar",
      aciklama: "Geri alınamaz komutlar: zorla push, sert sıfırlama, disk biçimlendirme, tablo silme.",
      karar: "ret",
      hedef: "komut",
      araclar: [],
      etkin: true,
      desenler: [
        "\\bgit\\s+reset\\s+--hard\\b",
        "\\bgit\\s+clean\\s+-[a-z]*f",
        "\\bgit\\s+push\\b.*(--force\\b|-f\\b|--force-with-lease\\b)",
        "\\bgit\\s+branch\\s+-D\\s+(main|master)\\b",
        "\\bmkfs(\\.\\w+)?\\b",
        "\\bdd\\s+if=",
        "\\bdrop\\s+(table|database|schema)\\b",
        "\\btruncate\\s+table\\b",
        "\\bchmod\\s+-R\\s+0?777\\b",
        ":\\(\\)\\s*\\{\\s*:\\|:&\\s*\\};:",
        "\\b(shutdown|reboot|halt|poweroff)\\b",
        "\\bformat(\\.com)?\\s+[a-z]:",
        "\\bdiskpart\\b",
      ],
    },
    {
      id: "alan-disi-silme",
      ad: "Çalışma alanı dışını silme",
      aciklama: "rm -r / Remove-Item -Recurse çalışma alanı dışını, kökü ya da ev dizinini hedefliyorsa.",
      karar: "ret",
      hedef: "komut",
      araclar: [],
      etkin: true,
      desenler: [],
    },
    {
      id: "boru-ile-calistirma",
      ad: "İndirip çalıştırma",
      aciklama: "İnternetten indirilen betiği doğrudan kabuğa vermek.",
      karar: "ret",
      hedef: "komut",
      araclar: [],
      etkin: true,
      desenler: [
        "\\b(curl|wget)\\b[^|]*\\|\\s*(sudo\\s+)?(ba|z|da|k)?sh\\b",
        "\\b(iwr|irm|invoke-webrequest|invoke-restmethod)\\b.*\\|\\s*iex\\b",
        "\\biex\\s*\\(.*(downloadstring|iwr|irm)",
      ],
    },
    {
      id: "gizli-dosya",
      ad: "Gizli dosyalar",
      aciklama: "Ortam dosyaları, özel anahtarlar ve kimlik bilgileri okunmaz ve yazılmaz.",
      karar: "ret",
      hedef: "yol",
      araclar: [],
      etkin: true,
      desenler: [
        "(^|[\\\\/])\\.env(\\.(?!example\\b|sample\\b|template\\b)[\\w.-]+)?$",
        "\\.(pem|key|p12|pfx|keystore|jks)$",
        "(^|[\\\\/])id_(rsa|dsa|ecdsa|ed25519)(\\.pub)?$",
        "(^|[\\\\/])\\.(npmrc|netrc|pgpass|git-credentials)$",
        "(^|[\\\\/])\\.(aws|ssh|gnupg)([\\\\/]|$)",
        "(^|[\\\\/])\\.claude[\\\\/]\\.credentials\\.json$",
        "(^|[\\\\/])(credentials|secrets?)\\.(json|ya?ml|toml)$",
      ],
    },
    {
      id: "alan-disi-yazma",
      ad: "Çalışma alanı dışına yazma",
      aciklama: "Dosya düzenleme araçları yalnız ajanın kendi çalışma alanına ve geçici dizine yazar.",
      karar: "ret",
      hedef: "yol",
      araclar: [...YAZMA_ARACLARI],
      etkin: true,
      desenler: [],
    },
    {
      id: "disari-gonderim",
      ad: "Dışarı gönderim ve yayın",
      aciklama: "Uzak depoya push, paket yayını, dağıtım ve altyapı değişikliği yönetim kurulu onayı ister.",
      karar: "sor",
      hedef: "komut",
      araclar: [],
      etkin: true,
      desenler: [
        "\\bgit\\s+push\\b",
        "\\b(npm|pnpm|yarn)\\s+publish\\b",
        "\\b(docker|podman)\\s+push\\b",
        "\\bgh\\s+(release\\s+create|pr\\s+merge|repo\\s+delete)\\b",
        "\\b(vercel|netlify|fly|railway)\\b.*\\bdeploy\\b",
        "\\bkubectl\\s+(apply|delete|rollout)\\b",
        "\\bterraform\\s+(apply|destroy)\\b",
        "\\b(scp|rsync)\\b.*\\S+@\\S+:",
        "\\bdokploy\\b",
      ],
    },
    {
      id: "yonetici-yetkisi",
      ad: "Yönetici yetkisi",
      aciklama: "sudo, runas ve sistem geneli paket kurulumu onay ister.",
      karar: "sor",
      hedef: "komut",
      araclar: [],
      etkin: true,
      desenler: ["\\bsudo\\b", "\\brunas\\b", "\\b(npm|pnpm)\\s+(i|install|add)\\b.*\\s(-g|--global)\\b", "\\bapt(-get)?\\s+(install|remove|purge)\\b"],
    },
  ];
}

// ---------------------------------------------------------------------------
// Komut ayrıştırma
// ---------------------------------------------------------------------------

/**
 * Kabuk komutunu tırnakları gözeterek parçalara böler: &&, ||, ;, |, &, satır sonu.
 * $(...) ve `...` içleri de ayrı parça olarak eklenir. Amaç güvenlik denetimidir,
 * tam bir kabuk ayrıştırıcısı değildir; şüpheli durumda daha çok parça üretir.
 */
export function komutuParcala(komut: string): string[] {
  const parcalar: string[] = [];
  const icParcalar: string[] = [];
  let mevcut = "";
  let tirnak: '"' | "'" | null = null;
  for (let i = 0; i < komut.length; i++) {
    const c = komut[i]!;
    const sonraki = komut[i + 1];
    if (tirnak) {
      if (c === "\\" && tirnak === '"' && sonraki !== undefined) {
        mevcut += c + sonraki;
        i++;
        continue;
      }
      if (c === tirnak) tirnak = null;
      mevcut += c;
      continue;
    }
    if (c === "'" || c === '"') {
      tirnak = c;
      mevcut += c;
      continue;
    }
    if (c === "\\" && sonraki !== undefined) {
      mevcut += c + sonraki;
      i++;
      continue;
    }
    if (c === "$" && sonraki === "(") {
      const kapanis = eslesenParantez(komut, i + 1);
      icParcalar.push(...komutuParcala(komut.slice(i + 2, kapanis)));
      mevcut += komut.slice(i, kapanis + 1);
      i = kapanis;
      continue;
    }
    if (c === "`") {
      const kapanis = komut.indexOf("`", i + 1);
      const son = kapanis === -1 ? komut.length : kapanis;
      icParcalar.push(...komutuParcala(komut.slice(i + 1, son)));
      mevcut += komut.slice(i, son + 1);
      i = son;
      continue;
    }
    const ikili = c + (sonraki ?? "");
    if (ikili === "&&" || ikili === "||") {
      parcalar.push(mevcut);
      mevcut = "";
      i++;
      continue;
    }
    if (c === ";" || c === "|" || c === "\n" || c === "&") {
      parcalar.push(mevcut);
      mevcut = "";
      continue;
    }
    mevcut += c;
  }
  parcalar.push(mevcut);
  return [...parcalar, ...icParcalar].map((p) => p.trim()).filter(Boolean);
}

function eslesenParantez(metin: string, acilis: number): number {
  let derinlik = 0;
  for (let i = acilis; i < metin.length; i++) {
    if (metin[i] === "(") derinlik++;
    else if (metin[i] === ")") {
      derinlik--;
      if (derinlik === 0) return i;
    }
  }
  return metin.length - 1;
}

/** Basit argüman bölme (tırnakları kaldırır) */
export function argumanlar(parca: string): string[] {
  const sonuc: string[] = [];
  const desen = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = desen.exec(parca))) sonuc.push(m[1] ?? m[2] ?? m[3] ?? "");
  return sonuc;
}

// ---------------------------------------------------------------------------
// Yol yardımcıları
// ---------------------------------------------------------------------------

function normal(yol: string): string {
  return yol.replace(/\\/g, "/");
}

function evGenislet(yol: string): string {
  if (yol === "~" || yol.startsWith("~/")) return path.join(os.homedir(), yol.slice(1));
  if (/^\$(HOME|env:USERPROFILE)\b/i.test(yol)) return path.join(os.homedir(), yol.replace(/^\$(HOME|env:USERPROFILE)/i, ""));
  return yol;
}

/** hedef, kök dizinin içinde mi (kökün kendisi hariç) */
export function icinde(kok: string, hedef: string, platform: NodeJS.Platform = process.platform): boolean {
  const ayirici = platform === "win32" ? path.win32 : path.posix;
  const k = ayirici.resolve(kok);
  const h = ayirici.resolve(k, hedef);
  const goreli = ayirici.relative(k, h);
  if (!goreli) return false;
  if (platform === "win32") return !goreli.startsWith("..") && !ayirici.isAbsolute(goreli);
  return !goreli.startsWith("..") && !goreli.startsWith("/");
}

function geciciDizinde(hedef: string, platform: NodeJS.Platform): boolean {
  const adaylar = [os.tmpdir(), "/tmp", "/var/tmp"];
  return adaylar.some((t) => icinde(t, hedef, platform));
}

// ---------------------------------------------------------------------------
// Değerlendirme
// ---------------------------------------------------------------------------

function desenEslesir(desenler: string[], metin: string): string | null {
  for (const d of desenler) {
    try {
      if (new RegExp(d, "i").test(metin)) return d;
    } catch {
      // Geçersiz desen sessizce atlanır; kural düzenleme ekranı uyarır
    }
  }
  return null;
}

/** rm -r / Remove-Item -Recurse hedefleri çalışma alanı dışındaysa neden döndürür */
function alanDisiSilme(parca: string, b: PolitikaBaglami): string | null {
  const platform = b.platform ?? process.platform;
  const arg = argumanlar(parca);
  if (!arg.length) return null;
  const komut = (arg[0] ?? "").toLowerCase().replace(/^.*[\\/]/, "");
  let ozyinelemeli = false;
  let hedefler: string[] = [];
  if (komut === "rm" || komut === "rmdir") {
    ozyinelemeli = komut === "rmdir" || arg.some((a) => /^-[a-z]*r/i.test(a) || a === "--recursive");
    hedefler = arg.slice(1).filter((a) => !a.startsWith("-"));
  } else if (["remove-item", "ri", "rd", "del", "erase"].includes(komut)) {
    ozyinelemeli = arg.some((a) => /^-r(ecurse)?$/i.test(a) || /^\/s$/i.test(a));
    hedefler = arg.slice(1).filter((a) => !a.startsWith("-") && !a.startsWith("/"));
  } else {
    return null;
  }
  if (!ozyinelemeli) return null;
  for (const ham of hedefler) {
    // Ev dizininin kendisi genişletmeden önce yakalanır (Windows'ta ~ C:\Users\… olur)
    if (/^(~|\$HOME|\$\{HOME\}|\$env:USERPROFILE|%USERPROFILE%)[\\/]?\*?$/i.test(ham)) return `"${ham}" kök, ev dizini ya da tüm çalışma alanı.`;
    const h = evGenislet(ham);
    if (/^(\/|[a-z]:\\?|\*|\.\.?\/?\*?)$/i.test(h) || path.resolve(h) === path.resolve(os.homedir())) return `"${ham}" kök, ev dizini ya da tüm çalışma alanı.`;
    if (h.includes("*") && !h.includes("/") && !h.includes("\\")) continue;
    const mutlak = (platform === "win32" ? path.win32 : path.posix).resolve(b.cwd, h);
    if (!icinde(b.cwd, mutlak, platform) && !geciciDizinde(mutlak, platform)) return `"${ham}" çalışma alanının dışında.`;
  }
  return null;
}

/** Commit mesajındaki Claude imzası: satır başı trailer'ları ve ayrı -m ile verilenler */
const IMZA_SATIRLARI = [
  /^[ \t]*Co-Authored-By:[^\n]*(?:claude|anthropic)[^\n]*(?:\r?\n|$)/gim,
  /^[ \t]*(?:\u{1F916}[ \t]*)?Generated with \[?Claude Code\]?[^\n]*(?:\r?\n|$)/gimu,
  /^[ \t]*Claude-Session:[^\n]*(?:\r?\n|$)/gim,
];
const IMZA_SECENEGI = /[ \t]+-m[ \t]*(["'])\s*Co-Authored-By:[^"'\n]*(?:claude|anthropic)[^"'\n]*\1/gi;

/**
 * git commit komutundaki Claude imzasını siler; değişiklik yoksa null döner.
 * Claude Code ayarıyla imza zaten kapalıdır; bu, modelin elle yazdığı imzaya karşı yedektir.
 */
export function imzaAyikla(arac: string, girdi: Record<string, unknown>): Record<string, unknown> | null {
  const komut = komutMetni(arac, girdi);
  if (!komut || !/\bgit\b[\s\S]*\bcommit\b/.test(komut) || !/(claude|anthropic)/i.test(komut)) return null;
  let yeni = komut.replace(IMZA_SECENEGI, "");
  for (const d of IMZA_SATIRLARI) yeni = yeni.replace(d, "");
  return yeni === komut ? null : { ...girdi, command: yeni };
}

function komutMetni(arac: string, girdi: Record<string, unknown>): string | null {
  if (!KOMUT_ARACLARI.has(arac)) return null;
  const k = girdi.command;
  return typeof k === "string" ? k : null;
}

function aracYollari(arac: string, girdi: Record<string, unknown>): string[] {
  const yollar: string[] = [];
  for (const anahtar of ["file_path", "notebook_path", "path"]) {
    const v = girdi[anahtar];
    if (typeof v === "string" && v) yollar.push(v);
  }
  if (arac === "Grep" || arac === "Glob") {
    const p = girdi.path;
    if (typeof p === "string") yollar.push(p);
  }
  return [...new Set(yollar)];
}

const ONCELIK: Record<PolitikaSonucu["karar"], number> = { ret: 3, sor: 2, izin: 1 };

/** Araç çağrısını kurallara göre değerlendirir; en sert karar kazanır */
export function degerlendir(kurallar: PolitikaKurali[], arac: string, girdi: Record<string, unknown>, b: PolitikaBaglami): PolitikaSonucu {
  const platform = b.platform ?? process.platform;
  let sonuc: PolitikaSonucu = { karar: "izin", kural: null, neden: null };
  const yukselt = (aday: PolitikaSonucu) => {
    if (ONCELIK[aday.karar] > ONCELIK[sonuc.karar]) sonuc = aday;
  };

  const komut = komutMetni(arac, girdi);
  const parcalar = komut ? komutuParcala(komut) : [];
  const yollar = aracYollari(arac, girdi).map((y) => normal(y));

  for (const kural of kurallar) {
    if (!kural.etkin) continue;
    if (kural.araclar.length && !kural.araclar.includes(arac)) continue;

    if (kural.hedef === "komut" && komut) {
      if (kural.id === "alan-disi-silme") {
        for (const p of parcalar) {
          const neden = alanDisiSilme(p, b);
          if (neden) yukselt({ karar: kural.karar, kural: kural.ad, neden: `${kural.ad}: ${neden}` });
        }
        continue;
      }
      const adaylar = [komut, ...parcalar];
      for (const metin of adaylar) {
        const d = desenEslesir(kural.desenler, metin);
        if (d) {
          yukselt({ karar: kural.karar, kural: kural.ad, neden: `${kural.ad}: "${metin.slice(0, 120)}"` });
          break;
        }
      }
      continue;
    }

    if (kural.hedef === "yol") {
      if (kural.id === "alan-disi-yazma") {
        if (!YAZMA_ARACLARI.has(arac)) continue;
        for (const y of yollar) {
          const mutlak = (platform === "win32" ? path.win32 : path.posix).resolve(b.cwd, y);
          if (!icinde(b.cwd, mutlak, platform) && !geciciDizinde(mutlak, platform)) {
            yukselt({ karar: kural.karar, kural: kural.ad, neden: `${kural.ad}: ${y}` });
          }
        }
        continue;
      }
      // Yol kuralları dosya araçlarına ve komut metnindeki yollara uygulanır
      const metinler = [...yollar];
      if (komut) metinler.push(...parcalar.flatMap((p) => argumanlar(p)).map(normal));
      for (const m of metinler) {
        const d = desenEslesir(kural.desenler, m);
        if (d && (YAZMA_ARACLARI.has(arac) || OKUMA_ARACLARI.has(arac) || komut)) {
          yukselt({ karar: kural.karar, kural: kural.ad, neden: `${kural.ad}: ${m}` });
          break;
        }
      }
      continue;
    }

    if (kural.hedef === "url") {
      const url = typeof girdi.url === "string" ? girdi.url : null;
      if (url && desenEslesir(kural.desenler, url)) yukselt({ karar: kural.karar, kural: kural.ad, neden: `${kural.ad}: ${url}` });
      continue;
    }

    if (kural.hedef === "arac") {
      if (desenEslesir(kural.desenler, arac)) yukselt({ karar: kural.karar, kural: kural.ad, neden: `${kural.ad}: ${arac}` });
    }
  }
  return sonuc;
}

/** Denetim kaydı için araç girdisinin kısa özeti */
export function girdiOzeti(arac: string, girdi: Record<string, unknown>): string {
  const k = komutMetni(arac, girdi);
  if (k) return k.length > 300 ? k.slice(0, 299) + "…" : k;
  const y = aracYollari(arac, girdi);
  if (y.length) return y.join(", ");
  if (typeof girdi.url === "string") return girdi.url;
  if (typeof girdi.pattern === "string") return String(girdi.pattern);
  const json = JSON.stringify(girdi);
  return json.length > 300 ? json.slice(0, 299) + "…" : json;
}
