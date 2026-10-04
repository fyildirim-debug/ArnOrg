// Web ve araştırma araçları (mcp__arnorg__*): web_ara, web_oku, arastirma_kaydet, paket_bilgisi, github_ara.
// Adları sabittir (ofisteki araştırma kütüphanesi bunlara bağlı). Çıktılar kısa ve yapılı, hatalar iki dillidir.
// Kapalı yeteneğin aracı arnorg-araclari.ts'te listeden çıkar (yetenekler.ts).
import fs from "node:fs";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { WEB_ARAMA_KATEGORILERI, type WebAramaKategorisi, type WebAramaYaniti, type WebOkumaSonucu } from "@arnorg/ortak";
import { z } from "zod";
import { iki } from "../dil.js";
import { notYaz, notYoluCoz } from "../proje-dosyalari.js";
import type { Sirket } from "../sirket.js";
import { bugun, kisalt } from "../yardimci.js";
import { alanAdi } from "./adres.js";
import type { GithubAramaSonucu } from "./index.js";
import { EKOSISTEMLER, paketMetni, type Ekosistem } from "./paket.js";

type Sonuc = { content: { type: "text"; text: string }[]; isError?: boolean };

function metin(t: string): Sonuc {
  return { content: [{ type: "text", text: t }] };
}

async function guvenli(f: () => Promise<Sonuc> | Sonuc): Promise<Sonuc> {
  try {
    return await f();
  } catch (h) {
    return { content: [{ type: "text", text: (h as Error).message }], isError: true };
  }
}

const TUR_ADLARI: Record<WebOkumaSonucu["tur"], string> = { html: "HTML", pdf: "PDF", json: "JSON", metin: "Metin", gorsel: "Görsel", diger: "Diğer" };
const TUR_ADLARI_EN: Record<WebOkumaSonucu["tur"], string> = { html: "HTML", pdf: "PDF", json: "JSON", metin: "Text", gorsel: "Image", diger: "Other" };

/** web_ara çıktısı: motor durumu ve sıralı sonuçlar */
export function aramaMetni(y: WebAramaYaniti, sinir = 10): string {
  const toplam = y.yanitVerenler.length + y.hatalar.length;
  const satirlar = [
    iki(`Web araması: "${y.sorgu}" · ${y.kategori} · sayfa ${y.sayfa} · ${y.dil}${y.onbellekten ? " · önbellekten" : ""}`, `Web search: "${y.sorgu}" · ${y.kategori} · page ${y.sayfa} · ${y.dil}${y.onbellekten ? " · from cache" : ""}`),
    iki(`Yanıt veren motorlar (${y.yanitVerenler.length}/${toplam}): ${y.yanitVerenler.join(", ") || "yok"}`, `Engines that answered (${y.yanitVerenler.length}/${toplam}): ${y.yanitVerenler.join(", ") || "none"}`),
  ];
  if (y.hatalar.length) satirlar.push(iki(`Hata: ${y.hatalar.map((h) => `${h.motor} (${kisalt(h.hata, 80)})`).join("; ")}`, `Errors: ${y.hatalar.map((h) => `${h.motor} (${kisalt(h.hata, 80)})`).join("; ")}`));
  if (y.askidakiler.length) satirlar.push(iki(`Askıda (sorgulanmadı): ${y.askidakiler.join(", ")}`, `Suspended (not queried): ${y.askidakiler.join(", ")}`));
  satirlar.push("");
  if (!y.sonuclar.length) {
    satirlar.push(iki("Sonuç yok. Başka sözcüklerle ya da başka bir kategoriyle (genel, kod, haber, bilim) dene.", "No results. Try other words or another category (genel, kod, haber, bilim)."));
    return satirlar.join("\n");
  }
  y.sonuclar.slice(0, sinir).forEach((r, i) => {
    satirlar.push(`${i + 1}. ${r.baslik}`, `   ${r.adres}`);
    if (r.ozet) satirlar.push(`   ${kisalt(r.ozet, 300)}`);
    satirlar.push(`   [${r.motorlar.join(", ")}${r.tarih ? ` · ${r.tarih.slice(0, 10)}` : ""}]`);
  });
  satirlar.push(
    "",
    iki(
      `${Math.min(sinir, y.sonuclar.length)}/${y.sonuclar.length} sonuç gösterildi. Bir sayfayı okumak için web_oku; daha fazlası için sayfa: ${y.sayfa + 1}.`,
      `Showing ${Math.min(sinir, y.sonuclar.length)}/${y.sonuclar.length} results. Read a page with web_oku; for more, sayfa: ${y.sayfa + 1}.`,
    ),
  );
  return satirlar.join("\n");
}

/** web_oku çıktısı: üst bilgi, parça bilgisi, Markdown ve (istenirse) bağlantılar */
export function okumaMetni(s: WebOkumaSonucu): string {
  const tur = iki(TUR_ADLARI[s.tur], TUR_ADLARI_EN[s.tur]);
  const ust = [
    s.baslik ? `# ${s.baslik}` : "",
    `${iki("Adres", "Address")}: ${s.sonAdres}${s.sonAdres !== s.adres ? iki(` (istenen: ${s.adres})`, ` (requested: ${s.adres})`) : ""}`,
    [s.site ? `Site: ${s.site}` : "", s.yazar ? `${iki("Yazar", "Author")}: ${s.yazar}` : "", s.tarih ? `${iki("Tarih", "Date")}: ${s.tarih}` : "", `${iki("Tür", "Type")}: ${tur}`, `${iki("Kaynak", "Source")}: ${s.kaynak === "jina" ? "r.jina.ai" : iki("yerel", "local")}`]
      .filter(Boolean)
      .join(" · "),
    s.toplam > 0
      ? iki(
          `Karakter ${s.baslangic}–${s.baslangic + s.icerik.length} / ${s.toplam}${s.devamVar ? ` · devamı: web_oku adres="${s.adres}" baslangic=${s.sonraki}` : " · belgenin sonu"}`,
          `Characters ${s.baslangic}–${s.baslangic + s.icerik.length} of ${s.toplam}${s.devamVar ? ` · more: web_oku adres="${s.adres}" baslangic=${s.sonraki}` : " · end of document"}`,
        )
      : iki("Belge boş.", "The document is empty."),
    ...s.uyarilar.map((u) => `${iki("Not", "Note")}: ${u}`),
  ].filter(Boolean);
  const parcalar = [ust.join("\n"), "---", s.icerik || iki("(içerik yok)", "(no content)")];
  if (s.baglantilar.length) parcalar.push("---", iki("Bağlantılar:", "Links:"), ...s.baglantilar.map((b) => `- [${b.metin}](${b.adres})`));
  return parcalar.join("\n\n");
}

function githubMetni(g: GithubAramaSonucu): string {
  const turAdi = { repo: iki("depo", "repositories"), issue: "issue", kod: iki("kod", "code") }[g.tur];
  const satirlar = [
    iki(
      `GitHub araması (${turAdi}): "${g.sorgu}"${g.toplam !== null ? ` · ${g.toplam.toLocaleString("tr-TR")} sonuç` : ""} · ${g.kaynak === "gh" ? "gh girişiyle" : "girişsiz genel API"}`,
      `GitHub search (${turAdi}): "${g.sorgu}"${g.toplam !== null ? ` · ${g.toplam.toLocaleString("en-US")} results` : ""} · ${g.kaynak === "gh" ? "with the gh sign-in" : "public API without sign-in"}`,
    ),
    "",
  ];
  if (!g.sonuclar.length) return [...satirlar, iki("Sonuç yok.", "No results.")].join("\n");
  g.sonuclar.forEach((r, i) => {
    satirlar.push(`${i + 1}. ${r.baslik}`, `   ${r.adres}`);
    if (r.ozet) satirlar.push(`   ${kisalt(r.ozet, 300)}`);
    if (r.tarih) satirlar.push(`   ${iki("güncelleme", "updated")}: ${r.tarih.slice(0, 10)}`);
  });
  return satirlar.join("\n");
}

/** Başlıktan dosya adı parçası: Türkçe harfler sadeleşir, en çok 60 karakter */
export function notSlug(baslik: string): string {
  const harita: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
  const s = baslik
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (h) => harita[h] ?? h)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return s || "arastirma";
}

/** Araştırma notunun Markdown'ı */
export function arastirmaNotu(g: { baslik: string; ozet: string; bulgular: string; kaynaklar: { adres: string; baslik: string }[]; yazan: string; tarih: string }): string {
  const kaynaklar = g.kaynaklar.map((k, i) => `${i + 1}. [${k.baslik.replace(/[[\]]/g, "")}](${k.adres}) — ${alanAdi(k.adres)}`);
  return [
    `# ${g.baslik}`,
    "",
    iki(`${g.tarih} · ${g.yazan} · araştırma notu`, `${g.tarih} · ${g.yazan} · research note`),
    "",
    iki("## Özet", "## Summary"),
    "",
    g.ozet.trim(),
    "",
    iki("## Bulgular", "## Findings"),
    "",
    g.bulgular.trim(),
    "",
    iki("## Kaynaklar", "## Sources"),
    "",
    ...kaynaklar,
    "",
  ].join("\n");
}

const kaynakSemasi = z.object({
  adres: z
    .string()
    .min(8)
    .max(2000)
    .regex(/^https?:\/\//i, { error: () => iki("Kaynak adresi http:// ya da https:// ile başlamalı.", "A source address must start with http:// or https://.") }),
  baslik: z.string().min(1).max(300),
});

/** Ajanın web ve araştırma araçları (filtreleme ve girdi onarımı arnorg-araclari.ts'te) */
export function webAraclari(sirket: Sirket, ajanId: string) {
  const ben = () => sirket.ajan(ajanId);
  const proje = () => sirket.proje(ben().projeId);

  return [
    tool(
      "web_ara",
      iki(
        "Web'de arar: birçok arama motoru birlikte sorgulanır, sonuçlar birleştirilip sıralanır (başlık, adres, özet, sonucu bulan motorlar). kategori: genel (web), kod (Stack Overflow, GitHub, npm, MDN, Hacker News ve web), haber, bilim (arXiv, Wikipedia ve web). Bir sonucu okumak için web_oku kullan.",
        "Searches the web: several search engines are queried together and the results are merged and ranked (title, address, snippet, the engines that found it). kategori: genel (web), kod (Stack Overflow, GitHub, npm, MDN, Hacker News and the web), haber (news), bilim (arXiv, Wikipedia and the web). Read a result with web_oku.",
      ),
      {
        sorgu: z.string().min(1).max(500).describe(iki("Arama sorgusu; teknik konuda İngilizce sorgu daha çok sonuç verir", "The search query")),
        kategori: z.enum(WEB_ARAMA_KATEGORILERI as [WebAramaKategorisi, ...WebAramaKategorisi[]]).optional().describe(iki("genel (varsayılan), kod, haber ya da bilim", "genel (default), kod (code), haber (news) or bilim (science)")),
        sayfa: z.number().int().min(1).max(10).optional().describe(iki("Sonuç sayfası (varsayılan 1)", "Result page (default 1)")),
        dil: z.enum(["tr", "en"]).optional().describe(iki("Sonuç dili; varsayılan ArnOrg dili", "Result language; ArnOrg's language by default")),
      },
      (a) => guvenli(async () => metin(aramaMetni(await sirket.web.arama.ara({ sorgu: a.sorgu, kategori: a.kategori, sayfa: a.sayfa, dil: a.dil })))),
    ),
    tool(
      "web_oku",
      iki(
        "Bir web sayfasını, PDF'i, JSON'u ya da düz metni temiz Markdown olarak okur; başlık, site, yazar ve tarihi verir. GitHub dosya bağlantısında ham dosyayı, depo kökünde README'yi, npm paket sayfasında README'yi okur. Uzun belge parça parça gelir (varsayılan 12000 karakter): devamı için çıktıdaki baslangic değeriyle yeniden çağır. localhost ve yerel ağ adresleri de okunur.",
        "Reads a web page, PDF, JSON or plain text as clean Markdown, with title, site, author and date. For a GitHub file link it reads the raw file, for a repository root the README, for an npm package page the README. A long document comes in pieces (12000 characters by default): call again with the baslangic value from the output to continue. localhost and local network addresses can be read too.",
      ),
      {
        adres: z.string().min(1).max(4000).describe(iki("http(s) adresi", "An http(s) address")),
        baslangic: z.number().int().min(0).optional().describe(iki("Okumanın başlayacağı karakter (önceki çıktıdaki devamı değeri)", "The character to start from (the 'more' value from the previous output)")),
        uzunluk: z.number().int().min(500).max(60_000).optional().describe(iki("En çok karakter (varsayılan 12000)", "At most this many characters (default 12000)")),
        baglantilar: z.boolean().optional().describe(iki("Sayfadaki önemli bağlantılar da listelensin", "Also list the important links on the page")),
      },
      (a) => guvenli(async () => metin(okumaMetni(await sirket.web.okuyucu.oku({ adres: a.adres, baslangic: a.baslangic, uzunluk: a.uzunluk, baglantilar: a.baglantilar })))),
    ),
    tool(
      "arastirma_kaydet",
      iki(
        "Araştırmanı kaynaklarıyla kaydeder: notlar/arastirma/<tarih>-<konu>.md araştırma notu yazar ve proje hafızasına kısa bir kayıt ekler. Bulguları Markdown ile yaz; her önemli iddianın kaynağı kaynaklar listesinde olsun.",
        "Saves your research with its sources: writes a research note at notlar/arastirma/<date>-<topic>.md and adds a short record to project memory. Write the findings in Markdown; every important claim should have its source in kaynaklar.",
      ),
      {
        baslik: z.string().min(3).max(160).describe(iki("Konu, ör. 'electron-updater: özel depodan güncelleme'", "Topic, e.g. 'electron-updater: updates from a private repo'")),
        ozet: z.string().min(10).max(2000).describe(iki("Sonuç: iki üç cümle", "The conclusion in two or three sentences")),
        bulgular: z.string().min(10).max(30_000).describe(iki("Ayrıntılı bulgular (Markdown): seçenekler, karşılaştırma, sürümler, riskler", "Detailed findings (Markdown): options, comparison, versions, risks")),
        kaynaklar: z.array(kaynakSemasi).min(1).max(40).describe(iki("Okuduğun kaynaklar: [{adres, baslik}]", "The sources you read: [{adres, baslik}]")),
      },
      (a) =>
        guvenli(() => {
          const a0 = ben();
          const p = proje();
          const tarih = bugun();
          const slug = notSlug(a.baslik);
          let yol = `arastirma/${tarih}-${slug}.md`;
          for (let i = 2; fs.existsSync(notYoluCoz(p.yol, yol)) && i < 100; i++) yol = `arastirma/${tarih}-${slug}-${i}.md`;
          const icerik = arastirmaNotu({ baslik: a.baslik, ozet: a.ozet, bulgular: a.bulgular, kaynaklar: a.kaynaklar, yazan: `${a0.ad} (${a0.rolAdi})`, tarih });
          const n = notYaz(p.yol, yol, icerik);
          sirket.olaylar.yayinla({ tur: "dosya.degisti", projeId: a0.projeId, alan: "ana", yol: `.arnorg/notlar/${n.yol}`, ajanId });
          const k = sirket.hafizaYaz(
            a0.projeId,
            { tur: "olgu", baslik: iki(`Araştırma: ${a.baslik}`, `Research: ${a.baslik}`), metin: `${kisalt(a.ozet, 900)} (${iki("Not", "Note")}: notlar/${n.yol})`, etiketler: ["arastirma"], onem: 2 },
            ajanId,
          );
          return metin(
            iki(
              `Araştırma notu kaydedildi: notlar/${n.yol} (${a.kaynaklar.length} kaynak). Hafıza kaydı: ${k.id.slice(0, 8)}. İsteyene notun yolunu ve kısa özetini ilet.`,
              `Research note saved: notlar/${n.yol} (${a.kaynaklar.length} sources). Memory record: ${k.id.slice(0, 8)}. Send whoever asked the note's path and a short summary.`,
            ),
          );
        }),
    ),
    tool(
      "paket_bilgisi",
      iki(
        "Bir paketin registry bilgisini getirir: son sürüm, lisans, haftalık indirme (npm), depo adresi, son yayın tarihi ve kısa açıklama. Bağımlılık seçerken ya da yükseltirken kullan.",
        "Fetches a package's registry information: latest version, license, weekly downloads (npm), repository, last release date and a short description. Use it when choosing or upgrading a dependency.",
      ),
      {
        ad: z.string().min(1).max(214).describe(iki("Paket adı, ör. electron-updater ya da @scope/ad", "Package name, e.g. electron-updater or @scope/name")),
        ekosistem: z.enum(EKOSISTEMLER as [Ekosistem, ...Ekosistem[]]).default("npm").describe("npm, pypi, crates"),
      },
      (a) => guvenli(async () => metin(paketMetni(await sirket.web.paketBilgisi(a.ad, a.ekosistem)))),
    ),
    tool(
      "github_ara",
      iki(
        "GitHub'da arar: tur repo (depolar, yıldız ve dil ile), issue (issue ve PR'lar) ya da kod (kod araması GitHub girişi ister). GitHub arama sözdizimi geçerlidir (ör. 'electron-updater private in:readme', 'repo:sahip/ad label:bug'). gh girişliyse onun belirteciyle arar.",
        "Searches GitHub: tur repo (repositories, with stars and language), issue (issues and PRs) or kod (code search needs a GitHub sign-in). GitHub search syntax works (e.g. 'electron-updater private in:readme', 'repo:owner/name label:bug'). Uses the gh token when signed in.",
      ),
      {
        sorgu: z.string().min(1).max(500),
        tur: z.enum(["repo", "issue", "kod"]).default("repo").describe(iki("repo, issue ya da kod", "repo, issue or kod (code)")),
        sayfa: z.number().int().min(1).max(10).optional(),
      },
      (a) => guvenli(async () => metin(githubMetni(await sirket.web.githubAra(a.sorgu, a.tur, a.sayfa ?? 1)))),
    ),
  ];
}
