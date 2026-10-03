// Kod düzenleyici uçları (docs/API.md, "Kod düzenleyici"): ham bayt okuma/yazma, arama, git
import type {
  FsDurumu,
  FsGirdisi,
  GitBasvurusu,
  GitCommitSonucu,
  GitDurumu,
  MetinAramaIstegi,
  MetinAramaSonucu,
} from "@arnorg/ortak";
import { anahtar, anahtarAyarla } from "../api/anahtar";
import { ApiHatasi, istek, sorgu } from "../api/istek";

const k = encodeURIComponent;
const fs = (pid: string) => `/api/projeler/${k(pid)}/fs`;
const gitYolu = (pid: string) => `/api/projeler/${k(pid)}/git`;

/** Ham gövdeli istek; hata gövdesindeki Türkçe metni ApiHatasi olarak taşır */
async function hamIstek(yol: string, s: { method?: "GET" | "PUT"; govde?: Uint8Array; sinyal?: AbortSignal } = {}): Promise<Response> {
  const basliklar: Record<string, string> = {};
  const a = anahtar();
  if (a) basliklar.Authorization = `Bearer ${a}`;
  if (s.govde) basliklar["Content-Type"] = "application/octet-stream";
  let yanit: Response;
  try {
    yanit = await fetch(yol, { method: s.method ?? "GET", headers: basliklar, body: s.govde as BodyInit | undefined, signal: s.sinyal, cache: "no-store" });
  } catch (h) {
    if (h instanceof DOMException && h.name === "AbortError") throw h;
    throw new ApiHatasi("Çekirdeğe ulaşılamadı.", 0);
  }
  if (!yanit.ok) {
    let mesaj = `Beklenmeyen yanıt (${yanit.status}).`;
    try {
      const j = (await yanit.json()) as { hata?: string };
      if (j?.hata) mesaj = j.hata;
    } catch {
      // gövde JSON değil
    }
    if (yanit.status === 401) anahtarAyarla(null);
    throw new ApiHatasi(mesaj, yanit.status);
  }
  return yanit;
}

/** Olmayan dosya: yoksa=bos ile istenir, konsolda 404 hatası birikmesin */
const yok = (yol: string) => new ApiHatasi(`Bulunamadı: ${yol}`, 404);

export const kodApi = {
  stat: async (pid: string, alan: string, yol: string) => {
    const s = await istek<FsDurumu | null>(`${fs(pid)}/stat${sorgu({ alan, yol, yoksa: "bos" })}`);
    if (!s) throw yok(yol);
    return s;
  },
  liste: (pid: string, alan: string, yol: string) => istek<FsGirdisi[]>(`${fs(pid)}/liste${sorgu({ alan, yol })}`),
  oku: async (pid: string, alan: string, yol: string) => {
    const y = await hamIstek(`${fs(pid)}/icerik${sorgu({ alan, yol, yoksa: "bos" })}`);
    if (y.status === 204) throw yok(yol);
    return new Uint8Array(await y.arrayBuffer());
  },
  yaz: async (pid: string, alan: string, yol: string, icerik: Uint8Array, s: { olustur: boolean; ustune: boolean }) =>
    (await (
      await hamIstek(`${fs(pid)}/icerik${sorgu({ alan, yol, olustur: s.olustur ? 1 : null, ustune: s.ustune ? 1 : null })}`, { method: "PUT", govde: icerik })
    ).json()) as FsDurumu,
  klasor: (pid: string, alan: string, yol: string) => istek(`${fs(pid)}/klasor`, { method: "POST", govde: { alan, yol } }),
  sil: (pid: string, alan: string, yol: string, ozyinelemeli: boolean) =>
    istek(`${fs(pid)}${sorgu({ alan, yol, ozyinelemeli: ozyinelemeli ? 1 : null })}`, { method: "DELETE" }),
  tasi: (pid: string, alan: string, kaynak: string, hedef: string, ustune: boolean) =>
    istek(`${fs(pid)}/tasi`, { method: "POST", govde: { alan, kaynak, hedef, ustune } }),
  dosyalar: (pid: string, alan: string, sinyal?: AbortSignal) => istek<string[]>(`${fs(pid)}/dosyalar${sorgu({ alan })}`, { sinyal }),
  ara: (pid: string, i: MetinAramaIstegi, sinyal?: AbortSignal) => istek<MetinAramaSonucu>(`${fs(pid)}/ara`, { method: "POST", govde: i, sinyal }),

  gitDurumu: (pid: string, alan: string) => istek<GitDurumu>(`${gitYolu(pid)}/durum${sorgu({ alan })}`),
  /** Dosyanın git'teki sürümü; o sürümde yoksa null */
  gitIcerik: async (pid: string, alan: string, yol: string, ref: GitBasvurusu): Promise<Uint8Array | null> => {
    const y = await hamIstek(`${gitYolu(pid)}/icerik${sorgu({ alan, yol, ref, yoksa: "bos" })}`);
    return y.status === 204 ? null : new Uint8Array(await y.arrayBuffer());
  },
  hazirla: (pid: string, alan: string, yollar: string[]) => istek(`${gitYolu(pid)}/hazirla`, { method: "POST", govde: { alan, yollar } }),
  hazirlamayiGeriAl: (pid: string, alan: string, yollar: string[]) =>
    istek(`${gitYolu(pid)}/hazirlamayi-geri-al`, { method: "POST", govde: { alan, yollar } }),
  degisiklikleriAt: (pid: string, alan: string, yollar: string[]) =>
    istek(`${gitYolu(pid)}/degisiklikleri-at`, { method: "POST", govde: { alan, yollar } }),
  commit: (pid: string, alan: string, mesaj: string, tumu: boolean) =>
    istek<GitCommitSonucu>(`${gitYolu(pid)}/commit`, { method: "POST", govde: { alan, mesaj, tumu } }),
};
