// Kabuk komutlarının ortak çalışmaya etkisi (0.0.8): komutun apaçık yazdığı dosyalar (yönlendirme, tee, sed -i, mv,
// cp, rm, touch, Rename-Item…), ortak projede yasak git komutları ve salt okunur komutlar. Tam bir kabuk ayrıştırıcısı
// değildir: tırnak, kaçış, $(…), `…`, heredoc gövdesi ve 2>&1 gibi tanıtıcı yönlendirmeleri bilir; joker (*, ?, […])
// diskteki eşleşmelere açılır, klasör taşıma ve silme içindeki her dosyayı kapsar; değişkenli hedef atlanır. Atlanan
// ya da bilinmeyen yazmalar komuttan sonra alınan izle sahibine yazılır (index.ts).
import fs from "node:fs";
import path from "node:path";

/** Sözcük: tırnakları açılmış metin; değişken, joker ya da komut yerleştirmesi içeriyorsa belirsiz */
interface Sozcuk {
  metin: string;
  belirsiz: boolean;
}

interface Yonlendirme {
  op: string;
  hedef: Sozcuk | null;
}

interface Parca {
  sozcukler: Sozcuk[];
  yonlendirmeler: Yonlendirme[];
}

/**
 * Bir kabuk satırını parçalara (komutlara) böler; $(…) ve `…` içleri ayrı parça olarak eklenir. ps: PowerShell
 * (ters bölü yol ayracıdır, kaçış karakteri ters tırnaktır)
 */
export function parcala(komut: string, ps = false): Parca[] {
  const parcalar: Parca[] = [];
  const icler: Parca[] = [];
  let parca: Parca = { sozcukler: [], yonlendirmeler: [] };
  let sozcuk: Sozcuk | null = null;
  let bekleyenYon: string | null = null;
  const heredocSonlari: { son: string; girintili: boolean }[] = [];

  const sozcukBitir = () => {
    if (!sozcuk) return;
    if (bekleyenYon !== null) {
      const op = bekleyenYon;
      bekleyenYon = null;
      if (op === "<<" || op === "<<-") heredocSonlari.push({ son: sozcuk.metin, girintili: op === "<<-" });
      parca.yonlendirmeler.push({ op, hedef: sozcuk });
    } else parca.sozcukler.push(sozcuk);
    sozcuk = null;
  };
  const parcaBitir = () => {
    sozcukBitir();
    if (bekleyenYon !== null) {
      parca.yonlendirmeler.push({ op: bekleyenYon, hedef: null });
      bekleyenYon = null;
    }
    if (parca.sozcukler.length || parca.yonlendirmeler.length) parcalar.push(parca);
    parca = { sozcukler: [], yonlendirmeler: [] };
  };
  const ekle = (c: string, belirsiz = false) => {
    sozcuk ??= { metin: "", belirsiz: false };
    sozcuk.metin += c;
    if (belirsiz) sozcuk.belirsiz = true;
  };

  let i = 0;
  const n = komut.length;
  while (i < n) {
    const c = komut[i]!;
    const s = komut[i + 1];
    if (c === "\n") {
      parcaBitir();
      i++;
      // Heredoc gövdeleri komut değildir: bitiş satırına dek atlanır
      while (heredocSonlari.length && i < n) {
        const { son, girintili } = heredocSonlari[0]!;
        const satirSonu = komut.indexOf("\n", i);
        const satir = komut.slice(i, satirSonu === -1 ? n : satirSonu).replace(/\r$/, "");
        i = satirSonu === -1 ? n : satirSonu + 1;
        if ((girintili ? satir.replace(/^\t+/, "") : satir) === son) heredocSonlari.shift();
      }
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      sozcukBitir();
      i++;
      continue;
    }
    if (c === "#" && !sozcuk) {
      const satirSonu = komut.indexOf("\n", i);
      i = satirSonu === -1 ? n : satirSonu;
      continue;
    }
    if (c === (ps ? "`" : "\\")) {
      if (s === "\n") i += 2;
      else {
        if (s !== undefined) ekle(s);
        i += 2;
      }
      continue;
    }
    if (c === "'") {
      const kapanis = komut.indexOf("'", i + 1);
      const son = kapanis === -1 ? n : kapanis;
      ekle(komut.slice(i + 1, son));
      sozcuk ??= { metin: "", belirsiz: false };
      i = son + 1;
      continue;
    }
    if (c === '"') {
      sozcuk ??= { metin: "", belirsiz: false };
      i++;
      while (i < n && komut[i] !== '"') {
        const d = komut[i]!;
        if (d === "\\" && i + 1 < n && '"\\$`\n'.includes(komut[i + 1]!)) {
          if (komut[i + 1] !== "\n") ekle(komut[i + 1]!);
          i += 2;
          continue;
        }
        if (d === "$" && komut[i + 1] === "(") {
          const kapanis = eslesenKapanis(komut, i + 1);
          icler.push(...parcala(komut.slice(i + 2, kapanis), ps));
          ekle("$", true);
          i = kapanis + 1;
          continue;
        }
        if (d === "`" && !ps) {
          const kapanis = komut.indexOf("`", i + 1);
          const son = kapanis === -1 ? n : kapanis;
          icler.push(...parcala(komut.slice(i + 1, son)));
          ekle("`", true);
          i = son + 1;
          continue;
        }
        ekle(d, d === "$");
        i++;
      }
      i++;
      continue;
    }
    if (c === "$" && s === "(") {
      const kapanis = eslesenKapanis(komut, i + 1);
      icler.push(...parcala(komut.slice(i + 2, kapanis), ps));
      ekle("$", true);
      i = kapanis + 1;
      continue;
    }
    if (c === "`" && !ps) {
      const kapanis = komut.indexOf("`", i + 1);
      const son = kapanis === -1 ? n : kapanis;
      icler.push(...parcala(komut.slice(i + 1, son)));
      ekle("`", true);
      i = son + 1;
      continue;
    }
    if (c === "$" || c === "*" || c === "?" || c === "[") {
      ekle(c, true);
      i++;
      continue;
    }
    // Ayraçlar: &&, ||, |, |&, ;, &, alt kabuk ve gruplama parantezleri
    if (c === "&" && s === "&") {
      parcaBitir();
      i += 2;
      continue;
    }
    if (c === "|") {
      parcaBitir();
      i += s === "|" || s === "&" ? 2 : 1;
      continue;
    }
    if (c === ";" || c === "(" || c === ")") {
      parcaBitir();
      i++;
      continue;
    }
    // Yönlendirmeler: [n]> >> >| >& < << <<- <<< <> <& &> &>>
    if (c === ">" || c === "<" || (c === "&" && s === ">")) {
      // Sözcük yalnız rakamsa tanıtıcı numarasıdır (2>, 1>>)
      if (sozcuk && /^\d+$/.test(sozcuk.metin) && !sozcuk.belirsiz) sozcuk = null;
      else sozcukBitir();
      let op = c;
      let j = i + 1;
      if (c === "&") {
        op = "&>";
        j = i + 2;
        if (komut[j] === ">") (op = "&>>"), j++;
      } else if (c === ">") {
        if (komut[j] === ">" || komut[j] === "|" || komut[j] === "&") op += komut[j++];
      } else {
        if (komut[j] === "<") {
          op = "<<";
          j++;
          if (komut[j] === "<") (op = "<<<"), j++;
          else if (komut[j] === "-") (op = "<<-"), j++;
        } else if (komut[j] === ">" || komut[j] === "&") op += komut[j++];
      }
      if (bekleyenYon !== null) parca.yonlendirmeler.push({ op: bekleyenYon, hedef: null });
      bekleyenYon = op;
      i = j;
      continue;
    }
    if (c === "&") {
      parcaBitir();
      i++;
      continue;
    }
    ekle(c);
    i++;
  }
  parcaBitir();
  return [...parcalar, ...icler];
}

function eslesenKapanis(metin: string, acilis: number): number {
  let derinlik = 0;
  let tirnak: string | null = null;
  for (let i = acilis; i < metin.length; i++) {
    const c = metin[i]!;
    if (tirnak) {
      if (c === tirnak) tirnak = null;
      continue;
    }
    if (c === "'" || c === '"') tirnak = c;
    else if (c === "(") derinlik++;
    else if (c === ")" && --derinlik === 0) return i;
  }
  return metin.length;
}

// ---------------------------------------------------------------------------
// Yazma hedefleri
// ---------------------------------------------------------------------------

/** Çıktı atılan yerler: dosya sayılmaz */
const BOS_HEDEFLER = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "/dev/tty", "nul", "nul:", "con", "$null"]);

/** Yazmayan, bilinen okuma komutları (yönlendirme yoksa komuttan sonra iz alınmaz) */
const OKUMA_KOMUTLARI = new Set([
  "ls", "dir", "cat", "head", "tail", "less", "more", "grep", "egrep", "fgrep", "rg", "ag", "fd", "pwd", "cd", "pushd", "popd", "echo", "printf",
  "wc", "diff", "cmp", "tree", "stat", "file", "du", "df", "which", "where", "type", "whoami", "date", "env", "printenv", "uname", "hostname",
  "true", "false", "test", "[", "basename", "dirname", "realpath", "readlink", "sleep", "cut", "tr", "column", "nl", "od", "hexdump",
  "md5sum", "sha1sum", "sha256sum", "ps", "lsof", "id", "groups", "jq", "yq", "awk", "sort", "uniq", "get-content", "gc", "get-childitem", "gci",
  "select-string", "sls", "get-location", "test-path", "get-item", "measure-object", "write-output", "write-host", "set-location", "sl",
]);

/** Kabuğa ön ek olan komutlar: asıl komut arkalarından gelir */
const ONEKLER = new Set(["sudo", "env", "time", "nohup", "nice", "command", "exec", "stdbuf", "timeout", "builtin"]);

export interface Hedef {
  /** Mutlak yol */
  yol: string;
  /** Klasör hedefi (rm -r, Remove-Item -Recurse): içindeki her dosya etkilenir */
  dizin: boolean;
}

/** Git komutunun ortak projedeki sınıfı */
export type GitKarari =
  | { tur: "izin" }
  /** Belirli dosyaları HEAD'deki (ya da verilen commit'teki) hâline döndürür: kendi kirasındaysa ya da kirasızsa serbest */
  | { tur: "geri_al"; dosyalar: string[] }
  /** index: add, commit, rm, mv, reset… · geri_alma: stash, reset --hard, clean, checkout . · dal: switch, merge, rebase, pull… */
  | { tur: "ret"; neden: "index" | "geri_alma" | "dal" | "bilinmeyen"; komut: string };

export interface KomutCozumu {
  hedefler: Hedef[];
  /** Proje içinde çalışan git komutlarının kararları */
  git: GitKarari[];
  /** Bütün parçalar bilinen okuma komutu ve dosyaya yazan yönlendirme yok: komuttan sonra iz alınmaz */
  saltOkunur: boolean;
}

interface Cozumleyici {
  kok: string;
  platform: NodeJS.Platform;
  /** Sonraki parçaların çalıştığı dizin; cd ile değişir, belirsizse null */
  dizin: string | null;
  sonuc: KomutCozumu;
  /** Yol var mı, dosya mı klasör mü (cp hedefi, git checkout <ad>); testlerde verilebilir */
  yolTuru: (yol: string) => YolTuru;
  /** Klasörün girdileri (joker açılımı); testlerde verilebilir */
  dizinListele: (yol: string) => string[];
}

function yolModulu(platform: NodeJS.Platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

/** hedef kökün içinde mi (kökün kendisi de sayılır); Windows'ta büyük/küçük harf duyarsız */
export function kokte(kok: string, hedef: string, platform: NodeJS.Platform = process.platform): boolean {
  const p = yolModulu(platform);
  const goreli = p.relative(p.resolve(kok), p.resolve(hedef));
  return !goreli || (!goreli.startsWith("..") && !p.isAbsolute(goreli));
}

export type YolTuru = "dosya" | "dizin" | null;

/** Yolun diskteki türü; yoksa null */
export function diskteYolTuru(yol: string): YolTuru {
  try {
    const s = fs.statSync(yol);
    return s.isDirectory() ? "dizin" : "dosya";
  } catch {
    return null;
  }
}

/** Joker açılımında en çok bu kadar eşleşme */
const JOKER_SINIRI = 500;

/** Bir yol parçasındaki jokerin düzenli ifadesi: * ve ? ayraç dışında her şey, […] karakter sınıfı */
function jokerDeseni(parca: string, harfDuyarsiz: boolean): RegExp {
  let d = "";
  for (let i = 0; i < parca.length; i++) {
    const k = parca[i]!;
    if (k === "*") d += "[^/\\\\]*";
    else if (k === "?") d += "[^/\\\\]";
    else if (k === "[") {
      const kapanis = parca.indexOf("]", i + 2);
      if (kapanis === -1) d += "\\[";
      else {
        const ic = parca.slice(i + 1, kapanis).replace(/^!/, "^").replace(/\\/g, "\\\\");
        d += `[${ic}]`;
        i = kapanis;
      }
    } else d += k.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp(`^${d}$`, harfDuyarsiz ? "i" : "");
}

/**
 * Joker (*, ?, […]) içeren sözcüğü diskteki eşleşmelere açar (en çok JOKER_SINIRI). Değişken ya da komut içeren,
 * jokersiz ya da dizini belirsiz sözcükte null. Gizli adlar (.ile başlayan) yalnız desen nokta ile başlıyorsa eşleşir.
 */
function jokerAc(c: Cozumleyici, s: Sozcuk, evDizini: string): string[] | null {
  if (!s.belirsiz || /[$`]/.test(s.metin) || !/[*?[]/.test(s.metin)) return null;
  const p = yolModulu(c.platform);
  let metin = s.metin;
  if (metin === "~" || metin.startsWith("~/")) metin = evDizini + metin.slice(1);
  const mutlak = p.isAbsolute(metin) ? p.normalize(metin) : c.dizin !== null ? p.resolve(c.dizin, metin) : null;
  if (!mutlak) return null;
  const parcalar = mutlak.split(c.platform === "win32" ? /[\\/]+/ : /\/+/);
  const harfDuyarsiz = c.platform === "win32" || c.platform === "darwin";
  let adaylar = [parcalar[0] ? `${parcalar[0]}${p.sep}` : p.sep];
  for (const parca of parcalar.slice(1)) {
    if (!parca) continue;
    if (!/[*?[]/.test(parca)) {
      adaylar = adaylar.map((a) => p.join(a, parca));
      continue;
    }
    const desen = jokerDeseni(parca, harfDuyarsiz);
    const yeni: string[] = [];
    for (const a of adaylar) {
      let girdiler: string[];
      try {
        girdiler = c.dizinListele(a);
      } catch {
        continue;
      }
      for (const g of girdiler) if (desen.test(g) && (parca.startsWith(".") || !g.startsWith("."))) yeni.push(p.join(a, g));
      if (yeni.length >= JOKER_SINIRI) break;
    }
    adaylar = yeni.slice(0, JOKER_SINIRI);
    if (!adaylar.length) return [];
  }
  return adaylar;
}

/** Sözcüğün gösterdiği yollar: tek yol, jokerin eşleşmeleri ya da (çözülemezse) boş */
function hedefYollari(c: Cozumleyici, s: Sozcuk, evDizini: string): string[] {
  const joker = jokerAc(c, s, evDizini);
  if (joker) return joker;
  const yol = hedefYolu(c, s, evDizini);
  return yol ? [yol] : [];
}

/** ~ ve $HOME açılır; kalan değişken ya da joker varsa çözülemez (null) */
function hedefYolu(c: Cozumleyici, s: Sozcuk, evDizini: string): string | null {
  let metin = s.metin;
  if (!metin) return null;
  if (BOS_HEDEFLER.has(metin.toLowerCase())) return null;
  if (s.belirsiz) {
    const ev = /^\$(HOME|\{HOME\})(?=$|[\\/])/.exec(metin);
    if (!ev) return null;
    metin = evDizini + metin.slice(ev[0].length);
    if (/[$*?[`]/.test(metin)) return null;
  }
  if (metin === "~" || metin.startsWith("~/")) metin = evDizini + metin.slice(1);
  const p = yolModulu(c.platform);
  if (p.isAbsolute(metin)) return p.normalize(metin);
  if (c.dizin === null) return null;
  return p.resolve(c.dizin, metin);
}

/** Seçenek olmayan argümanlar; "--" sonrası hepsi argümandır. degerli: değer alan seçenekler (değerleri atlanır) */
function konumlular(arg: Sozcuk[], degerli: Set<string> = new Set()): Sozcuk[] {
  const sonuc: Sozcuk[] = [];
  let bitti = false;
  for (let i = 0; i < arg.length; i++) {
    const a = arg[i]!;
    if (bitti) {
      sonuc.push(a);
      continue;
    }
    if (a.metin === "--") {
      bitti = true;
      continue;
    }
    if (a.metin.startsWith("-") && a.metin.length > 1) {
      if (degerli.has(a.metin)) i++;
      continue;
    }
    sonuc.push(a);
  }
  return sonuc;
}

/** Sözcüğün yollarını hedef ekler (joker açılır). dizin: klasör hedefi (rm -r); "kendi": yolun türüne göre */
function hedefEkle(c: Cozumleyici, s: Sozcuk | undefined, dizin: boolean | "kendi" = false, ev = ""): void {
  if (!s) return;
  for (const yol of hedefYollari(c, s, ev)) yolEkle(c, yol, dizin);
}

function yolEkle(c: Cozumleyici, yol: string, dizin: boolean | "kendi"): void {
  if (!kokte(c.kok, yol, c.platform)) return;
  c.sonuc.hedefler.push({ yol, dizin: dizin === "kendi" ? c.yolTuru(yol) === "dizin" : dizin });
}

/**
 * Komutun ortak projeye etkisi: apaçık yazma hedefleri, git kararları ve salt okunurluk. cwd ajanın çalışma dizini,
 * kok projenin kökü; kökün dışındaki hedefler ve kökün dışında çalışan git komutları sayılmaz.
 */
export function komutuCoz(
  komut: string,
  cwd: string,
  kok: string,
  s: { platform?: NodeJS.Platform; evDizini?: string; yolTuru?: (yol: string) => YolTuru; dizinListele?: (yol: string) => string[]; kabuk?: "bash" | "powershell" } = {},
): KomutCozumu {
  const c: Cozumleyici = {
    kok,
    platform: s.platform ?? process.platform,
    dizin: cwd,
    sonuc: { hedefler: [], git: [], saltOkunur: true },
    yolTuru: s.yolTuru ?? diskteYolTuru,
    dizinListele: s.dizinListele ?? ((y) => fs.readdirSync(y)),
  };
  const ev = s.evDizini ?? (process.env.HOME || process.env.USERPROFILE || "");
  for (const p of parcala(komut, s.kabuk === "powershell")) parcaCoz(c, p, ev, 0);
  return c.sonuc;
}

function parcaCoz(c: Cozumleyici, p: Parca, ev: string, derinlik: number): void {
  // Yönlendirmeler: dosyaya yazanlar hedeftir; tanıtıcı kopyalama (2>&1) ve heredoc değildir
  for (const y of p.yonlendirmeler) {
    if (!y.hedef || !/>/.test(y.op)) continue;
    if ((y.op === ">&" || y.op === "<>") && /^(\d+|-)$/.test(y.hedef.metin)) continue;
    const yollar = hedefYollari(c, y.hedef, ev);
    if (!yollar.length) {
      if (!BOS_HEDEFLER.has(y.hedef.metin.toLowerCase())) c.sonuc.saltOkunur = false;
      continue;
    }
    c.sonuc.saltOkunur = false;
    for (const yol of yollar) yolEkle(c, yol, false);
  }
  let sozcukler = p.sozcukler;
  // Ortam atamaları ve ön ekler (sudo, env, time…)
  for (;;) {
    while (sozcukler.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(sozcukler[0]!.metin)) sozcukler = sozcukler.slice(1);
    const ilk = sozcukler[0]?.metin.toLowerCase();
    if (!ilk || !ONEKLER.has(ilk)) break;
    sozcukler = sozcukler.slice(1);
    // Ön ekin kendi seçenekleri ve (timeout, nice) değeri
    while (sozcukler.length && (sozcukler[0]!.metin.startsWith("-") || (ilk === "timeout" && /^\d/.test(sozcukler[0]!.metin)))) {
      const s0 = sozcukler[0]!.metin;
      sozcukler = sozcukler.slice(1);
      if ((ilk === "nice" && s0 === "-n") || (ilk === "sudo" && (s0 === "-u" || s0 === "-g"))) sozcukler = sozcukler.slice(1);
    }
  }
  if (!sozcukler.length) return;
  const ad = komutAdi(sozcukler[0]!.metin);
  const arg = sozcukler.slice(1);

  // Alt kabuk: bash -c "…"
  if (["bash", "sh", "zsh", "dash"].includes(ad) && derinlik < 3) {
    const ci = arg.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a.metin));
    if (ci !== -1 && arg[ci + 1]) {
      for (const ic of parcala(arg[ci + 1]!.metin)) parcaCoz(c, ic, ev, derinlik + 1);
      return;
    }
    c.sonuc.saltOkunur = false;
    return;
  }
  if (ad === "cd" || ad === "pushd" || ad === "set-location" || ad === "sl") {
    const hedef = konumlular(arg)[0];
    if (!hedef) return;
    const yol = hedefYolu(c, hedef, ev);
    c.dizin = yol;
    return;
  }
  if (ad === "git") {
    c.sonuc.git.push(...gitCoz(c, arg));
    return;
  }
  if (!OKUMA_KOMUTLARI.has(ad) || (ad === "sort" && arg.some((a) => a.metin === "-o" || a.metin.startsWith("--output")))) c.sonuc.saltOkunur = false;
  yazanKomut(c, ad, arg, ev);
}

/** Komut adı: yolu ve Windows uzantısı atılmış, küçük harf */
function komutAdi(metin: string): string {
  return metin
    .replace(/^.*[\\/]/, "")
    .replace(/\.(exe|cmd|bat|ps1)$/i, "")
    .toLowerCase();
}

/** PowerShell biçimli argümanlar: -Path X, -LiteralPath X, -Destination X; yoksa ilk konumlu */
function psArg(arg: Sozcuk[], adlar: string[]): Sozcuk | undefined {
  for (let i = 0; i < arg.length; i++) {
    const a = arg[i]!.metin.toLowerCase();
    if (adlar.includes(a)) return arg[i + 1];
  }
  return undefined;
}

function psKonumlular(arg: Sozcuk[]): Sozcuk[] {
  const sonuc: Sozcuk[] = [];
  for (let i = 0; i < arg.length; i++) {
    const a = arg[i]!.metin;
    if (a.startsWith("-")) {
      // Anahtar seçenekler (-Recurse, -Force) değer almaz; değerliler bilinenlerdir
      if (/^-(path|literalpath|filepath|destination|value|encoding|itemtype|name|newname|filter|include|exclude)$/i.test(a)) i++;
      continue;
    }
    sonuc.push(arg[i]!);
  }
  return sonuc;
}

function yazanKomut(c: Cozumleyici, ad: string, arg: Sozcuk[], ev: string): void {
  switch (ad) {
    case "tee":
      for (const a of konumlular(arg)) hedefEkle(c, a, false, ev);
      return;
    case "sed": {
      const yerinde = arg.some((a) => /^-[a-zA-Z]*i/.test(a.metin) || a.metin.startsWith("--in-place"));
      if (!yerinde) return;
      const betikli = arg.some((a) => a.metin === "-e" || a.metin === "-f" || a.metin.startsWith("--expression") || a.metin.startsWith("--file"));
      const k = konumlular(arg, new Set(["-e", "-f", "--expression", "--file", "-l"]));
      for (const a of betikli ? k : k.slice(1)) hedefEkle(c, a, false, ev);
      return;
    }
    case "perl": {
      if (!arg.some((a) => /^-[a-zA-Z]*i/.test(a.metin))) return;
      const k = konumlular(arg, new Set(["-e", "-E", "-M", "-I"]));
      const betikli = arg.some((a) => a.metin === "-e" || a.metin === "-E" || /^-[a-zA-Z]*e$/.test(a.metin));
      for (const a of betikli ? k : k.slice(1)) hedefEkle(c, a, false, ev);
      return;
    }
    case "mv":
    case "move-item":
    case "mi":
    case "move": {
      const ps = ad === "move-item" || ad === "mi";
      const k = ps ? psKonumlular(arg) : konumlular(arg, new Set(["-t", "--target-directory", "-S", "--suffix"]));
      const ti = ps ? -1 : arg.findIndex((a) => a.metin === "-t" || a.metin === "--target-directory");
      const hedefKlasor = ti !== -1 ? arg[ti + 1] : undefined;
      const kaynakSozcukleri = ps ? [psArg(arg, ["-path", "-literalpath"]) ?? k[0]] : hedefKlasor ? k : k.slice(0, -1);
      const hedef = ps ? (psArg(arg, ["-destination"]) ?? k[1]) : (hedefKlasor ?? k.at(-1));
      tasima(c, kaynakSozcukleri, hedef, Boolean(hedefKlasor), ev);
      return;
    }
    case "rename-item":
    case "rni":
    case "ren":
    case "rename": {
      // Rename-Item -Path a -NewName b · ren a b: yeni ad kaynağın klasöründedir
      const kaynak = psArg(arg, ["-path", "-literalpath"]) ?? psKonumlular(arg)[0];
      const yeniAd = psArg(arg, ["-newname"]) ?? psKonumlular(arg)[1];
      if (!kaynak) return;
      for (const ky of hedefYollari(c, kaynak, ev)) {
        yolEkle(c, ky, "kendi");
        if (yeniAd && !yeniAd.belirsiz) {
          const p = yolModulu(c.platform);
          const yeni = p.isAbsolute(yeniAd.metin) ? yeniAd.metin : p.join(p.dirname(ky), yeniAd.metin);
          if (kokte(c.kok, yeni, c.platform)) c.sonuc.hedefler.push({ yol: yeni, dizin: c.yolTuru(ky) === "dizin" });
        }
      }
      return;
    }
    case "cp":
    case "copy-item":
    case "cpi":
    case "copy": {
      const ps = ad === "copy-item" || ad === "cpi";
      const k = ps ? psKonumlular(arg) : konumlular(arg, new Set(["-t", "--target-directory", "-S", "--suffix"]));
      const hedef = ps ? (psArg(arg, ["-destination"]) ?? k[1]) : k.at(-1);
      const kaynaklar = ps ? [psArg(arg, ["-path", "-literalpath"]) ?? k[0]] : k.slice(0, -1);
      if (!hedef) return;
      const hedefYol = hedefYolu(c, hedef, ev);
      if (!hedefYol) return;
      const kaynakYollari = kaynaklar.flatMap((k0) => (k0 ? hedefYollari(c, k0, ev) : []));
      if (kaynakYollari.length > 1 || kaynaklar.length > 1 || c.yolTuru(hedefYol) === "dizin") {
        const p = yolModulu(c.platform);
        for (const ky of kaynakYollari) yolEkle(c, p.join(hedefYol, p.basename(ky)), c.yolTuru(ky) === "dizin");
        return;
      }
      if (kokte(c.kok, hedefYol, c.platform)) c.sonuc.hedefler.push({ yol: hedefYol, dizin: false });
      return;
    }
    case "rm":
    case "unlink":
    case "shred": {
      const ozyinelemeli = arg.some((a) => /^-[a-zA-Z]*[rR]/.test(a.metin) || a.metin === "--recursive");
      for (const a of konumlular(arg)) hedefEkle(c, a, ozyinelemeli ? "kendi" : false, ev);
      return;
    }
    case "remove-item":
    case "ri":
    case "del":
    case "erase":
    case "rd":
    case "rmdir": {
      const ps = !["rmdir"].includes(ad) || arg.some((a) => a.metin.startsWith("-"));
      if (ad === "rmdir" && !ps) return;
      const ozyinelemeli = arg.some((a) => /^-r(ecurse)?$/i.test(a.metin) || /^\/s$/i.test(a.metin));
      const hedefler = psArg(arg, ["-path", "-literalpath"]) ? [psArg(arg, ["-path", "-literalpath"])!] : psKonumlular(arg).filter((a) => !a.metin.startsWith("/"));
      for (const a of hedefler) hedefEkle(c, a, ozyinelemeli, ev);
      return;
    }
    case "touch":
      for (const a of konumlular(arg, new Set(["-d", "-r", "-t", "--date", "--reference"]))) hedefEkle(c, a, false, ev);
      return;
    case "truncate":
      for (const a of konumlular(arg, new Set(["-s", "-r", "--size", "--reference"]))) hedefEkle(c, a, false, ev);
      return;
    case "dd":
      for (const a of arg) if (a.metin.startsWith("of=")) hedefEkle(c, { metin: a.metin.slice(3), belirsiz: a.belirsiz }, false, ev);
      return;
    case "ln": {
      const k = konumlular(arg, new Set(["-t", "--target-directory", "-S", "--suffix"]));
      if (k.length >= 2) hedefEkle(c, k.at(-1), false, ev);
      return;
    }
    case "curl": {
      for (let i = 0; i < arg.length; i++) if (arg[i]!.metin === "-o" || arg[i]!.metin === "--output") hedefEkle(c, arg[i + 1], false, ev);
      return;
    }
    case "wget": {
      for (let i = 0; i < arg.length; i++) if (arg[i]!.metin === "-O" || arg[i]!.metin === "--output-document") hedefEkle(c, arg[i + 1], false, ev);
      return;
    }
    case "set-content":
    case "sc":
    case "add-content":
    case "ac":
    case "out-file":
    case "new-item":
    case "ni":
      hedefEkle(c, psArg(arg, ["-path", "-literalpath", "-filepath"]) ?? psKonumlular(arg)[0], false, ev);
      return;
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

/** Yalnız okuyan git komutları */
const OKUYAN_GIT = new Set([
  "status", "diff", "log", "show", "blame", "annotate", "ls-files", "ls-tree", "ls-remote", "cat-file", "rev-parse", "rev-list", "describe",
  "shortlog", "grep", "help", "version", "whatchanged", "merge-base", "name-rev", "for-each-ref", "show-ref", "show-branch", "check-ignore",
  "check-attr", "check-ref-format", "count-objects", "var", "verify-commit", "verify-tag", "cherry", "range-diff", "diff-tree", "diff-files",
  "diff-index", "fsck", "archive", "clone", "difftool", "instaweb", "bugreport",
]);
/** Index'e (aşamaya) ya da commit'e yazanlar */
const INDEX_GIT = new Set(["add", "commit", "rm", "mv", "update-index", "apply", "am", "read-tree", "write-tree", "commit-tree", "notes", "mktree", "hash-object"]);
/** Çalışma kopyasındaki değişiklikleri silen ya da saklayanlar */
const GERI_ALMA_GIT = new Set(["stash", "clean"]);
/** Dal ve geçmiş */
const DAL_GIT = new Set([
  "switch", "merge", "rebase", "pull", "cherry-pick", "revert", "bisect", "filter-branch", "filter-repo", "replace", "gc", "prune",
  "repack", "maintenance", "update-ref", "init", "submodule", "subtree", "worktree", "branch", "tag", "remote", "config", "reflog",
  "symbolic-ref", "fetch", "checkout", "restore", "reset", "lfs", "sparse-checkout",
]);
/** Değer alan genel seçenekler (git -C <yol> status) */
const GIT_DEGERLI_GENEL = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix", "--config-env"]);

function gitCoz(c: Cozumleyici, arg: Sozcuk[]): GitKarari[] {
  let i = 0;
  let dizin = c.dizin;
  let baskaRepo = false;
  while (i < arg.length && arg[i]!.metin.startsWith("-")) {
    const a = arg[i]!.metin;
    if (a === "-C" && arg[i + 1]) {
      const h = arg[i + 1]!;
      const yol = h.belirsiz ? null : dizin ? yolModulu(c.platform).resolve(dizin, h.metin) : yolModulu(c.platform).isAbsolute(h.metin) ? h.metin : null;
      dizin = yol;
    }
    if (a.startsWith("--git-dir") || a.startsWith("--work-tree")) baskaRepo = true;
    i += GIT_DEGERLI_GENEL.has(a) ? 2 : 1;
  }
  // Proje dışında (başka bir repoda ya da geçici dizinde) çalışan git ortak çalışmayı etkilemez
  if (baskaRepo || (dizin !== null && !kokte(c.kok, dizin, c.platform))) return [{ tur: "izin" }];
  const alt = arg[i]?.metin.toLowerCase();
  const kalan = arg.slice(i + 1);
  const metinler = kalan.map((a) => a.metin);
  const komut = `git ${alt ?? ""}`.trim();
  if (!alt) return [{ tur: "izin" }];
  c.sonuc.saltOkunur &&= alt !== "clone" && alt !== "archive" && (OKUYAN_GIT.has(alt) || okuyanAlt(alt, metinler));
  if (OKUYAN_GIT.has(alt) || okuyanAlt(alt, metinler)) return [{ tur: "izin" }];
  // push çalışma kopyasına ve index'e dokunmaz; uzak depoya gönderim denetimin onay kuralına kalır (zorla push yıkıcıdır)
  if (alt === "push") return [{ tur: "izin" }];
  if (alt === "checkout" || alt === "restore") return [dosyaGeriAlma(c, alt, kalan, dizin)];
  if (alt === "reset") {
    const sert = metinler.some((m) => m === "--hard" || m === "--merge" || m === "--keep");
    return [{ tur: "ret", neden: sert ? "geri_alma" : "index", komut: sert ? "git reset --hard" : komut }];
  }
  if (INDEX_GIT.has(alt)) {
    if (alt === "commit" && metinler.some((m) => m === "--amend")) return [{ tur: "ret", neden: "dal", komut: "git commit --amend" }];
    return [{ tur: "ret", neden: "index", komut }];
  }
  if (GERI_ALMA_GIT.has(alt)) return [{ tur: "ret", neden: "geri_alma", komut }];
  if (DAL_GIT.has(alt)) return [{ tur: "ret", neden: "dal", komut }];
  return [{ tur: "ret", neden: "bilinmeyen", komut }];
}

/** Alt komutların okuyan biçimleri: git branch (liste), git tag -l, git config --get, git stash list… */
function okuyanAlt(alt: string, a: string[]): boolean {
  const k = a.filter((x) => !x.startsWith("-"));
  const varMi = (...s: string[]) => a.some((x) => s.includes(x) || s.some((y) => y.endsWith("=") && x.startsWith(y)));
  switch (alt) {
    case "branch":
      if (varMi("-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy", "-f", "--force", "-u", "--set-upstream-to=", "--set-upstream-to", "--unset-upstream", "--edit-description", "-t", "--track", "--no-track")) return false;
      return !k.length || varMi("--list", "-l", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at");
    case "tag":
      if (varMi("-d", "--delete", "-a", "-s", "-u", "-f", "--force", "-m", "-F", "--annotate", "--sign")) return false;
      return !k.length || varMi("-l", "--list", "-n", "--contains", "--no-contains", "--points-at", "--merged", "--no-merged");
    case "config":
      if (varMi("--get", "--get-all", "--get-regexp", "--list", "-l", "--get-urlmatch", "--get-color", "--get-colorbool")) return true;
      if (k[0] === "get" || k[0] === "list") return true;
      return k.length === 1 && !varMi("--unset", "--unset-all", "--add", "--replace-all", "--rename-section", "--remove-section", "-e", "--edit");
    case "remote":
      return !k.length || k[0] === "show" || k[0] === "get-url";
    case "stash":
      return k[0] === "list" || k[0] === "show";
    case "worktree":
      return k[0] === "list";
    case "reflog":
      return !k.length || k[0] === "show" || k[0] === "exists" || !["expire", "delete"].includes(k[0]!);
    case "notes":
      return k[0] === "list" || k[0] === "show";
    case "submodule":
      return k[0] === "status" || k[0] === "summary";
    case "symbolic-ref":
      return k.length <= 1 && !varMi("-d", "--delete");
    case "fetch":
      // Yerel dalı güncelleyen refspec (main:main) ya da HEAD güncellemesi okuma sayılmaz
      return !a.some((x) => x.includes(":")) && !varMi("--update-head-ok", "-u");
    case "lfs":
      return k[0] === "ls-files" || k[0] === "status" || k[0] === "env" || k[0] === "version";
    case "sparse-checkout":
      return k[0] === "list";
    default:
      return false;
  }
}

/**
 * git checkout / git restore: belirli dosyaları geri almak serbesttir (kira denetimi çağıranda); nokta, klasör ya da
 * joker toplu geri almadır; var olan dosya olmayan ad (dal adı) dal değiştirmedir; --staged index'e yazar.
 */
function dosyaGeriAlma(c: Cozumleyici, alt: string, kalan: Sozcuk[], dizin: string | null): GitKarari {
  const m = kalan.map((a) => a.metin);
  const ayrac = m.indexOf("--");
  if (alt === "checkout") {
    if (m.some((x) => x === "-f" || x === "--force")) return { tur: "ret", neden: "geri_alma", komut: "git checkout -f" };
    if (m.some((x) => ["-b", "-B", "--orphan", "--detach", "-m", "--merge", "-t", "--track", "-p", "--patch"].includes(x))) return { tur: "ret", neden: "dal", komut: "git checkout" };
    if (ayrac !== -1) return geriAlmaDosyalari(c, kalan.slice(ayrac + 1), dizin);
    const k = konumlular(kalan);
    if (k.some((s0) => s0.metin === "." || s0.metin === ":/")) return { tur: "ret", neden: "geri_alma", komut: "git checkout ." };
    // "git checkout x": x proje içinde var olan dosyalarsa dosya geri alma, değilse dal değiştirme
    const dosyalar = k.map((s0) => (s0.belirsiz || dizin === null ? null : yolModulu(c.platform).resolve(dizin, s0.metin)));
    if (k.length && dosyalar.every((y) => y !== null && c.yolTuru(y) === "dosya")) return geriAlmaDosyalari(c, k, dizin);
    if (dosyalar.some((y) => y !== null && c.yolTuru(y) === "dizin")) return { tur: "ret", neden: "geri_alma", komut: "git checkout ." };
    return { tur: "ret", neden: "dal", komut: "git checkout" };
  }
  if (m.some((x) => x === "--staged" || x === "-S")) return { tur: "ret", neden: "index", komut: "git restore --staged" };
  const yollar = ayrac === -1 ? konumlular(kalan, new Set(["-s", "--source"])) : kalan.slice(ayrac + 1);
  return geriAlmaDosyalari(c, yollar, dizin);
}

function geriAlmaDosyalari(c: Cozumleyici, yollar: Sozcuk[], dizin: string | null): GitKarari {
  if (!yollar.length) return { tur: "ret", neden: "geri_alma", komut: "git restore" };
  const dosyalar: string[] = [];
  for (const s0 of yollar) {
    const yol = s0.belirsiz || dizin === null ? null : yolModulu(c.platform).resolve(dizin, s0.metin);
    // Nokta, klasör, joker, pathspec büyüsü ya da kökün dışı toplu geri almadır
    if (!yol || s0.metin === "." || s0.metin.startsWith(":") || c.yolTuru(yol) === "dizin" || !kokte(c.kok, yol, c.platform) || yolModulu(c.platform).resolve(c.kok) === yol) {
      return { tur: "ret", neden: "geri_alma", komut: "git restore ." };
    }
    dosyalar.push(yol);
  }
  return { tur: "geri_al", dosyalar };
}

/**
 * Taşıma (mv, Move-Item): kaynaklar silinir (klasörse içindeki her dosya), hedef yazılır. Hedef var olan bir klasörse
 * ya da birden çok kaynak varsa kaynaklar onun içine adlarıyla girer; değilse hedef kaynağın yeni adıdır.
 */
function tasima(c: Cozumleyici, kaynakSozcukleri: (Sozcuk | undefined)[], hedef: Sozcuk | undefined, hedefKlasor: boolean, ev: string): void {
  const p = yolModulu(c.platform);
  const kaynaklar = kaynakSozcukleri.flatMap((k) => (k ? hedefYollari(c, k, ev) : []));
  for (const k of kaynaklar) yolEkle(c, k, "kendi");
  if (!hedef) return;
  const hedefYollari0 = hedefYollari(c, hedef, ev);
  if (hedefYollari0.length !== 1) return;
  const hedefYol = hedefYollari0[0]!;
  if (hedefKlasor || kaynaklar.length > 1 || c.yolTuru(hedefYol) === "dizin") {
    for (const k of kaynaklar) {
      const yeni = p.join(hedefYol, p.basename(k));
      if (kokte(c.kok, yeni, c.platform)) c.sonuc.hedefler.push({ yol: yeni, dizin: c.yolTuru(k) === "dizin" });
    }
    return;
  }
  if (kokte(c.kok, hedefYol, c.platform)) c.sonuc.hedefler.push({ yol: hedefYol, dizin: kaynaklar.some((k) => c.yolTuru(k) === "dizin") });
}
