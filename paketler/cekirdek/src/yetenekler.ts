// Yetenekler: çalışan başına açılıp kapanan araç kümeleri (katalog @arnorg/ortak YETENEKLER).
// Rolün varsayılanları burada durur; kapalı yeteneğin araçları ajanın araç listesinden çıkar, talimatta anılmaz ve
// açık oturumda çağrılırsa denetim kapısında reddedilir.
import { TEMEL_YETENEKLER, YETENEKLER, type Ajan, type Dil, type YetenekKimligi } from "@arnorg/ortak";
import { z } from "zod";
import { iki } from "./dil.js";
import { ArnorgHatasi } from "./yardimci.js";

const HEPSI = YETENEKLER.map((y) => y.kimlik);

/** PATCH /api/ajanlar/:aid gövdesindeki yetenek listesi */
export const yetenekListesiSemasi = z.array(z.enum(HEPSI as [YetenekKimligi, ...YetenekKimligi[]])).max(HEPSI.length * 2);

/** Rol → varsayılan yetenekler. Herkeste en az web_arama ve web_okuma vardır; listede olmayan rol temel yetenekleri alır */
export const ROL_YETENEKLERI: Record<string, YetenekKimligi[]> = {
  ceo: ["web_arama", "web_okuma", "arastirma", "claude_web"],
  cto: ["web_arama", "web_okuma", "arastirma", "paket_bilgisi", "github_arastirma", "claude_web"],
  backend: ["web_arama", "web_okuma", "paket_bilgisi", "github_arastirma", "claude_web"],
  frontend: ["web_arama", "web_okuma", "paket_bilgisi", "github_arastirma", "claude_web"],
  fullstack: ["web_arama", "web_okuma", "paket_bilgisi", "github_arastirma", "claude_web"],
  test: ["web_arama", "web_okuma", "github_arastirma", "claude_web"],
  inceleme: ["web_arama", "web_okuma", "paket_bilgisi", "github_arastirma", "claude_web"],
  guvenlik: ["web_arama", "web_okuma", "arastirma", "paket_bilgisi", "github_arastirma", "claude_web"],
  devops: ["web_arama", "web_okuma", "paket_bilgisi", "github_arastirma", "claude_web"],
  tasarim: ["web_arama", "web_okuma", "arastirma", "claude_web"],
  yazar: ["web_arama", "web_okuma", "claude_web"],
  arastirmaci: [...HEPSI],
};

/** Katalog sırasına dizilmiş, tekilleştirilmiş liste */
function sirala(liste: Iterable<YetenekKimligi>): YetenekKimligi[] {
  const kume = new Set(liste);
  return HEPSI.filter((k) => kume.has(k));
}

/** Rolün varsayılan yetenekleri (temel yetenekler her zaman içindedir) */
export function rolYetenekleri(rol: string): YetenekKimligi[] {
  return sirala([...TEMEL_YETENEKLER, ...(ROL_YETENEKLERI[rol] ?? ["claude_web"])]);
}

/** Ajanın açık yetenekleri; kayıt yoksa (eski veri) rolün varsayılanları */
export function ajanYetenekleri(ajan: Pick<Ajan, "rol" | "yetenekler">): YetenekKimligi[] {
  return ajan.yetenekler ? sirala(ajan.yetenekler) : rolYetenekleri(ajan.rol);
}

export function yetenekAcik(ajan: Pick<Ajan, "rol" | "yetenekler">, kimlik: YetenekKimligi): boolean {
  return ajanYetenekleri(ajan).includes(kimlik);
}

/** Aracı açan yetenek (Claude Code'un gördüğü adla: mcp__arnorg__web_ara, WebSearch); yeteneğe bağlı değilse null */
export function aracYetenegi(arac: string): YetenekKimligi | null {
  return YETENEKLER.find((y) => y.araclar.includes(arac))?.kimlik ?? null;
}

/** Araç bu ajan için açık mı: yeteneğe bağlı olmayan araçlar her zaman açıktır */
export function aracAcik(ajan: Pick<Ajan, "rol" | "yetenekler">, arac: string): boolean {
  const y = aracYetenegi(arac);
  return !y || yetenekAcik(ajan, y);
}

/** Kapalı yeteneklerin Claude Code araçları (WebSearch, WebFetch): oturum açılırken disallowedTools'a girer */
export function kapaliClaudeAraclari(ajan: Pick<Ajan, "rol" | "yetenekler">): string[] {
  const acik = new Set(ajanYetenekleri(ajan));
  return YETENEKLER.filter((y) => !acik.has(y.kimlik)).flatMap((y) => y.araclar.filter((a) => !a.startsWith("mcp__")));
}

/** API'den gelen listeyi doğrular: bilinmeyen kimlik reddedilir, tekrarlar ayıklanır */
export function yetenekleriDogrula(liste: unknown): YetenekKimligi[] {
  if (!Array.isArray(liste)) throw new ArnorgHatasi(iki("Yetenekler bir liste olmalı.", "Capabilities must be a list."));
  const bilinmeyen = liste.filter((k) => !HEPSI.includes(k as YetenekKimligi));
  if (bilinmeyen.length) throw new ArnorgHatasi(iki(`Bilinmeyen yetenek: ${bilinmeyen.join(", ")}`, `Unknown capability: ${bilinmeyen.join(", ")}`));
  return sirala(liste as YetenekKimligi[]);
}

/** Kapalı yetenek yüzünden reddedilen çağrının ajana okunan nedeni */
export function kapaliYetenekNedeni(arac: string): string {
  const y = YETENEKLER.find((x) => x.araclar.includes(arac));
  const ad = y ? iki(y.ad, y.en.ad) : arac;
  return iki(
    `"${ad}" yeteneğin yönetim kurulunca kapatıldı; ${arac} kullanılamaz. Bu araç olmadan devam et; gerekiyorsa yöneticine ya da kurula bildir.`,
    `Your "${ad}" capability was turned off by the board; ${arac} cannot be used. Carry on without it; tell your manager or the board if you need it.`,
  );
}

/**
 * Talimatın ortak kurallarına giren yetenek satırları (yalnız açık yetenekler anılır).
 * CEO'ya araştırma işini kime vereceği de söylenir.
 */
export function yetenekTalimati(ajan: Pick<Ajan, "rol" | "yetenekler">, dil: Dil): string[] {
  const acik = new Set(ajanYetenekleri(ajan));
  const en = dil === "en";
  const satirlar: string[] = [];
  const ara = acik.has("web_arama");
  const oku = acik.has("web_okuma");
  const claude = acik.has("claude_web");
  if (ara || oku) {
    const okuMetni = en ? "mcp__arnorg__web_oku to read a page, PDF or JSON (long pages come in pieces; continue with baslangic)" : "sayfa, PDF ya da JSON okumak için mcp__arnorg__web_oku kullan (uzun sayfa parça parça gelir; baslangic ile sürdür)";
    const govde = en
      ? ara && oku
        ? `Use mcp__arnorg__web_ara to research on the web and ${okuMetni}`
        : ara
          ? "Use mcp__arnorg__web_ara to research on the web"
          : `Use ${okuMetni}`
      : ara && oku
        ? `Web'de araştırma için mcp__arnorg__web_ara, ${okuMetni}`
        : ara
          ? "Web'de araştırma için mcp__arnorg__web_ara kullan"
          : okuMetni.charAt(0).toUpperCase() + okuMetni.slice(1);
    const yedekAraclar = [ara ? "WebSearch" : "", oku ? "WebFetch" : ""].filter(Boolean).join("/");
    const yedek = claude ? (en ? `; use ${yedekAraclar} only when ${ara && oku ? "these find" : "it finds"} nothing` : `; ${yedekAraclar} aracını yalnız ${ara && oku ? "bunlar" : "o"} sonuç vermezse kullan`) : "";
    satirlar.push(`- ${govde}${yedek}.`);
  }
  if (acik.has("arastirma")) {
    satirlar.push(
      en
        ? "- Save what you find, with its sources, using mcp__arnorg__arastirma_kaydet: it writes a research note under notlar/arastirma/ and a short memory record."
        : "- Bulguları kaynaklarıyla mcp__arnorg__arastirma_kaydet ile kaydet: notlar/arastirma/ altına araştırma notu ve kısa bir hafıza kaydı yazar.",
    );
  }
  if (acik.has("paket_bilgisi")) {
    satirlar.push(
      en
        ? "- Before choosing or upgrading a dependency, check its latest version, license and upkeep with mcp__arnorg__paket_bilgisi (npm, pypi, crates)."
        : "- Bir bağımlılığı seçmeden ya da yükseltmeden önce son sürümünü, lisansını ve bakımını mcp__arnorg__paket_bilgisi ile denetle (npm, pypi, crates).",
    );
  }
  if (acik.has("github_arastirma")) {
    satirlar.push(
      en
        ? "- To find repositories, issues or code examples on GitHub use mcp__arnorg__github_ara (tur: repo, issue or kod)."
        : "- GitHub'da depo, issue ya da kod örneği bulmak için mcp__arnorg__github_ara kullan (tur: repo, issue ya da kod).",
    );
  }
  if (!claude && (ara || oku)) satirlar.push(en ? "- WebSearch and WebFetch are turned off for you." : "- WebSearch ve WebFetch senin için kapalı.");
  if (ajan.rol === "ceo") {
    satirlar.push(
      en
        ? "- Give work that needs research (technology or library comparison, reading docs, market and competitor research) to the Researcher (arastirmaci) or to an employee with web capabilities."
        : "- Araştırma gerektiren işi (teknoloji ya da kütüphane karşılaştırması, belge okuma, pazar ve rakip araştırması) Araştırmacı'ya (arastirmaci) ya da web yetenekleri olan bir çalışana ver.",
    );
  }
  return satirlar;
}
