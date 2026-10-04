// Web hizmeti: yerleşik meta arama, sayfa okuyucu, paket bilgisi ve GitHub araştırması tek yerde.
// Şirket bir tane tutar (sirket.web); ajan araçları (web/araclar.ts) ve API uçları (web/uclar.ts) bunu kullanır.
import type { Dil, WebAyarlari, WebDurumu } from "@arnorg/ortak";
import { iki } from "../dil.js";
import { ArnorgHatasi } from "../yardimci.js";
import { WebArama } from "./arama.js";
import { webAyarlari } from "./ayarlar.js";
import { depoSonuclari, ghIstemcisi, githubIstegi, issueSonuclari, kodSonuclari, type GhAramaYaniti, type GhBulucu, type GhDepo, type GhIssue, type GhKod } from "./github-api.js";
import { varsayilanGetirici, type Getirici } from "./http.js";
import { MotorHatasi, type GhIstemcisi, type MotorSonucu } from "./motorlar/ortak.js";
import { SayfaOkuyucu } from "./okuyucu.js";
import { paketBilgisi, type Ekosistem, type PaketBilgisi } from "./paket.js";

export interface WebBaglami {
  ayarlar(): WebAyarlari;
  dil(): Dil;
  /** gh CLI yolu ve ortamı (kurulu değilse null) */
  ghBul: GhBulucu;
  /** Testlerde sahte getirici */
  getir?: Getirici;
  /** Testlerde sahte gh */
  gh?: GhIstemcisi | null;
}

export type GithubAramaTuru = "repo" | "issue" | "kod";

export interface GithubAramaSonucu {
  tur: GithubAramaTuru;
  sorgu: string;
  toplam: number | null;
  sonuclar: MotorSonucu[];
  /** gh: kullanıcının belirteciyle · genel: girişsiz genel API */
  kaynak: "gh" | "genel";
}

export class WebHizmeti {
  readonly getir: Getirici;
  readonly gh: GhIstemcisi | null;
  readonly arama: WebArama;
  readonly okuyucu: SayfaOkuyucu;

  constructor(private readonly b: WebBaglami) {
    this.getir = b.getir ?? varsayilanGetirici;
    this.gh = b.gh !== undefined ? b.gh : ghIstemcisi(b.ghBul);
    const ayarlar = () => webAyarlari(b.ayarlar());
    this.arama = new WebArama({ ayarlar, dil: b.dil, getir: this.getir, gh: () => this.gh });
    this.okuyucu = new SayfaOkuyucu({ ayarlar, dil: b.dil, getir: this.getir });
  }

  durum(): WebDurumu {
    const a = webAyarlari(this.b.ayarlar());
    return { motorlar: this.arama.durum(), searxngAdresi: a.searxngAdresi, disOkuyucu: a.disOkuyucu, onbellek: { arama: this.arama.onbellekBoyutu, sayfa: this.okuyucu.onbellekBoyutu } };
  }

  paketBilgisi(ad: string, ekosistem: Ekosistem): Promise<PaketBilgisi> {
    return paketBilgisi(ad, ekosistem, this.getir);
  }

  /** GitHub'da depo, issue ya da kod araması: gh girişliyse onun belirteciyle, değilse genel API */
  async githubAra(sorgu: string, tur: GithubAramaTuru = "repo", sayfa = 1): Promise<GithubAramaSonucu> {
    const q = sorgu.replace(/\s+/g, " ").trim();
    if (!q) throw new ArnorgHatasi(iki("Arama sorgusu boş olamaz.", "The search query cannot be empty."));
    const p = new URLSearchParams({ q, per_page: "10", page: String(Math.min(Math.max(1, Math.floor(sayfa)), 10)) });
    const o = { gh: this.gh, getir: this.getir, zamanAsimiMs: 10_000 };
    try {
      if (tur === "repo") {
        const { veri, kaynak } = await githubIstegi<GhAramaYaniti<GhDepo>>(`search/repositories?${p}`, o);
        return { tur, sorgu: q, toplam: veri.total_count ?? null, sonuclar: depoSonuclari(veri), kaynak };
      }
      if (tur === "issue") {
        const { veri, kaynak } = await githubIstegi<GhAramaYaniti<GhIssue>>(`search/issues?${p}`, o);
        return { tur, sorgu: q, toplam: veri.total_count ?? null, sonuclar: issueSonuclari(veri), kaynak };
      }
      const { veri, kaynak } = await githubIstegi<GhAramaYaniti<GhKod>>(`search/code?${p}`, o, "application/vnd.github.text-match+json");
      return { tur, sorgu: q, toplam: veri.total_count ?? null, sonuclar: kodSonuclari(veri), kaynak };
    } catch (h) {
      if (h instanceof MotorHatasi) {
        const kod = h.tur === "cok_istek" ? 429 : h.tur === "engel" ? 403 : 502;
        const ek = tur === "kod" && (h.durum === 401 || h.durum === 403) ? iki(" Kod araması GitHub girişi ister: gh auth login.", " Code search needs a GitHub sign-in: gh auth login.") : "";
        throw new ArnorgHatasi(`${h.message}.${ek}`, kod);
      }
      throw h;
    }
  }
}
