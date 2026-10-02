// Araç çağrılarını kısa ve okunur göstermek için yardımcılar

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
  if (!arac) return "araç";
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
      return { metin: `${n} maddelik yapılacaklar listesi` };
    }
    default: {
      if (typeof girdi === "string") return { metin: girdi };
      // ArnOrg MCP araçları: anlamlı ilk alanlar
      const oncelikli = ["metin", "kanal", "gorev", "gorevId", "baslik", "yol", "sorgu", "durum"];
      const parcalar: string[] = [];
      for (const a of oncelikli) {
        const v = g[a];
        if (typeof v === "string" || typeof v === "number") parcalar.push(a === "kanal" ? `#${v}` : String(v));
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
    return e instanceof Error ? e.message : "Geçersiz düzenli ifade";
  }
}
