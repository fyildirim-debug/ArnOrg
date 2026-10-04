// Capabilities and web research (English)
import type { WebAramaKategorisi } from "@arnorg/ortak";
import type { yetenek as tr } from "../tr/yetenek";

/** "52 min", "1 h 5 min", "40 s" */
function kalan(ms: number): string {
  const sn = Math.max(0, Math.round(ms / 1000));
  if (sn < 60) return `${sn} s`;
  const dk = Math.round(sn / 60);
  if (dk < 60) return `${dk} min`;
  return dk % 60 ? `${Math.floor(dk / 60)} h ${dk % 60} min` : `${dk / 60} h`;
}

export const yetenek: typeof tr = {
  ajan: {
    baslik: "Capabilities",
    sayac: (acik: number, toplam: number) => `${acik}/${toplam} on`,
    ipucu: "A capability you turn off closes its tools right away; one you turn on arrives in the employee's next session.",
    varsayilan: "Back to role defaults",
    anahtar: (ad: string, acik: boolean) => `${ad}: ${acik ? "on" : "off"}`,
    acildi: (ajan: string, ad: string) => `${ajan}: ${ad} turned on.`,
    kapandi: (ajan: string, ad: string) => `${ajan}: ${ad} turned off.`,
    varsayilanaDondu: (ajan: string) => `${ajan} is back to the role's default capabilities.`,
  },
  web: {
    baslik: "Web and research",
    ozet: (calisan: number, toplam: number) => `${calisan}/${toplam} engines working`,
    aciklama: "Your employees' web search and page reading run inside ArnOrg; no separate server or API key is needed. The engines are queried together and their results are merged and ranked.",
    alinamadi: "Could not load the engine status",
    genel: "Web engines",
    teknik: "Technical sources",
    durum: {
      calisiyor: "Working",
      askida: (ms: number) => `Suspended · ${kalan(ms)}`,
      hatali: "Last attempt failed",
      bekliyor: "Not queried yet",
      kapali: "Off",
    },
    kategoriler: { genel: "general", kod: "code", haber: "news", bilim: "science" } as Record<WebAramaKategorisi, string>,
    motorAnahtari: (ad: string, acik: boolean) => `${ad}: ${acik ? "on" : "off"}`,
    motorAcildi: (ad: string) => `${ad} turned on.`,
    motorKapandi: (ad: string) => `${ad} turned off; searches will skip it.`,
    askiIpucu: "An engine that answers too many requests (429) is skipped for 10 minutes; one that denies access or asks for a CAPTCHA or bot check is skipped for 1 hour. One engine failing never breaks a search.",
    askilariKaldir: "Lift suspensions",
    askilarKalkti: "Suspended engines will be tried again on the next search.",
    dis: "External sources",
    searxng: "External SearXNG address",
    searxngOrnek: "https://searx.example.org",
    searxngIpucu: "Optional. When set, <address>/search?format=json is queried too and its results are merged with the built-in engines. The json format must be enabled in SearXNG's settings.yml.",
    searxngKaydedildi: "SearXNG address saved.",
    searxngKaldirildi: "SearXNG address removed.",
    kaldir: "Remove",
    jina: "Read pages that fail locally with r.jina.ai",
    jinaIpucu: "A page that yields very little text locally (drawn with JS) or hits bot protection is sent to r.jina.ai. localhost and local network addresses are never sent.",
    jinaAcildi: "The r.jina.ai fallback is on.",
    jinaKapandi: "The r.jina.ai fallback is off; pages are read locally only.",
    deneme: "Test search",
    denemeIpucu: "The same search as the employees' web_ara tool. Results stay cached for 10 minutes.",
    denemeOrnek: "e.g. electron-updater private repo",
    kategori: "Category",
    ara: "Search",
    araniyor: "Searching",
    denemeOzet: (veren: number, sorgulanan: number, sure: string) => `${veren}/${sorgulanan} engines answered · ${sure}`,
    sure: (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} s`),
    onbellekten: "from cache",
    yanitVermeyen: "Did not answer",
    askida: "Suspended",
    sonucYok: "No results",
    sonucYokMetin: "No engine returned results. Try other words or another category.",
    dahaFazla: (n: number) => `and ${n} more ${n === 1 ? "result" : "results"}`,
  },
  araclar: {
    web_ara: "Web search",
    web_oku: "Page reading",
    arastirma_kaydet: "Research note",
    paket_bilgisi: "Package info",
    github_ara: "GitHub search",
  } as Record<string, string>,
  githubTurleri: { repo: "repositories", issue: "issues", kod: "code" } as Record<string, string>,
  kaynak: (n: number) => `${n} ${n === 1 ? "source" : "sources"}`,
  parca: (bas: number) => `from character ${bas}`,
};
