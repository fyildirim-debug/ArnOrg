// Araç çağrılarını kısa ve okunur göstermek için yardımcılar; metin parçaları geçerli sözlükten
import { kanalGorunenAdi, kanalKimligi } from "@arnorg/ortak";
import { sozluk, useDilDurumu } from "../dil";

export type AracSinifi = "yaz" | "kabuk" | "oku" | "mcp" | "alt" | "diger";

export function aracSinifi(arac: string | undefined): AracSinifi {
  if (!arac) return "diger";
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(arac)) return "yaz";
  if (/^(Bash|BashOutput|KillShell|KillBash|PowerShell)$/.test(arac)) return "kabuk";
  if (/^(Read|Grep|Glob|LS|WebFetch|WebSearch)$/.test(arac)) return "oku";
  if (/^(Task|Agent)$/.test(arac)) return "alt";
  if (arac.startsWith("mcp__")) return "mcp";
  return "diger";
}

/** mcp__arnorg__mesaj_gonder → mesaj_gonder */
export function aracAdi(arac: string | undefined): string {
  if (!arac) return sozluk().bilesenler.arac.arac;
  const m = /^mcp__[^_]+(?:_[^_]+)*?__(.+)$/.exec(arac);
  return m?.[1] ?? arac;
}

function kayit(girdi: unknown): Record<string, unknown> {
  return girdi && typeof girdi === "object" && !Array.isArray(girdi) ? (girdi as Record<string, unknown>) : {};
}

function dize(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Çalışma alanı önekini atarak göreli yol gösterir */
export function goreliYol(yol: string, kok?: string | null): string {
  if (kok && yol.startsWith(kok)) return yol.slice(kok.length).replace(/^[/\\]+/, "") || yol;
  return yol;
}

export interface GirdiOzeti {
  /** Tek satırlık özet */
  metin: string;
  /** Kabuk komutu gibi kod olarak gösterilecek içerik */
  kod?: string;
}

/** Araç girdisinden insanca bir özet çıkarır */
export function girdiOzeti(arac: string | undefined, girdi: unknown, kok?: string | null): GirdiOzeti {
  const g = kayit(girdi);
  const yol = dize(g.file_path) ?? dize(g.notebook_path) ?? dize(g.path);
  switch (arac) {
    case "Bash":
    case "PowerShell": {
      const komut = dize(g.command) ?? "";
      return { metin: dize(g.description) ?? komut, kod: komut };
    }
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "Read":
    case "NotebookEdit":
      return { metin: yol ? goreliYol(yol, kok) : "" };
    case "Grep": {
      const desen = dize(g.pattern) ?? "";
      return { metin: `"${desen}"${yol ? ` ${goreliYol(yol, kok)}` : ""}` };
    }
    case "Glob":
      return { metin: dize(g.pattern) ?? "" };
    case "WebFetch":
      return { metin: dize(g.url) ?? "" };
    case "WebSearch":
      return { metin: dize(g.query) ?? "" };
    case "Task":
    case "Agent":
      return { metin: dize(g.description) ?? dize(g.prompt) ?? "" };
    case "TodoWrite": {
      const n = Array.isArray(g.todos) ? g.todos.length : 0;
      return { metin: sozluk().bilesenler.arac.yapilacaklar(n) };
    }
    case "mcp__arnorg__ajana_sor":
      return { metin: `→ ${dize(g.ajan) ?? sozluk().bilesenler.arac.uzman}: ${dize(g.soru) ?? ""}` };
    case "mcp__arnorg__soruyu_yanitla":
      return { metin: dize(g.yanit) ?? "" };
    case "mcp__arnorg__hafiza_kaydet": {
      // Kayıt türü arayüz dilindeki adıyla (karar → Karar / Decision)
      const tur = dize(g.tur);
      const turAdi = tur ? ((sozluk().genel.hafizaTuru as Record<string, string>)[tur] ?? tur) : null;
      return { metin: [turAdi, dize(g.baslik)].filter(Boolean).join(" · ") };
    }
    case "mcp__arnorg__hafiza_ara":
      return { metin: `"${dize(g.sorgu) ?? ""}"` };
    case "mcp__arnorg__defter_yaz":
      return { metin: sozluk().bilesenler.arac.defterGuncellendi };
    case "mcp__arnorg__defter_oku": {
      const ajan = dize(g.ajan);
      return { metin: ajan ? sozluk().bilesenler.arac.defteri(ajan) : sozluk().bilesenler.arac.kendiDefteri };
    }
    default: {
      if (typeof girdi === "string") return { metin: girdi };
      // ArnOrg MCP araçları: anlamlı ilk alanlar
      const oncelikli = ["metin", "kanal", "gorev", "gorevId", "baslik", "yol", "sorgu", "durum"];
      const parcalar: string[] = [];
      for (const a of oncelikli) {
        const v = g[a];
        // Sistem kanalı arayüz dilindeki adıyla: #genel → #general
        if (typeof v === "string" || typeof v === "number")
          parcalar.push(a === "kanal" ? `#${kanalGorunenAdi(kanalKimligi(String(v)), useDilDurumu.getState().dil)}` : String(v));
      }
      if (parcalar.length) return { metin: parcalar.join(" · ") };
      const json = JSON.stringify(girdi ?? {});
      return { metin: json === "{}" ? "" : json };
    }
  }
}

/** Düzenli ifadeyi doğrular; geçersizse hata metni döner */
export function desenHatasi(desen: string): string | null {
  try {
    new RegExp(desen, "i");
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : sozluk().bilesenler.arac.gecersizDesen;
  }
}
