// Proje adresleri araçları (mcp__arnorg__*): adres_bildir, adres_kaldir, adresler; ve talimattaki kuralı.
// Kayıt proje-adresleri.ts'te (sirket.adresler); kurul adresleri Stüdyo'nun Tarayıcı ekranında görüp tek tıkla açar.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { Ajan, Dil, ProjeAdresi } from "@arnorg/ortak";
import { z } from "zod";
import { iki } from "./dil.js";
import type { Sirket } from "./sirket.js";

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

/** Adresin durumu, araç çıktısında */
function durumMetni(a: ProjeAdresi): string {
  if (a.durum === "acik") return iki("açık, bağlantı kabul ediyor", "up, accepting connections");
  if (a.durum === "kapali") return iki("şu an yanıt vermiyor", "not responding right now");
  return a.yoklanir ? iki("henüz yoklanmadı", "not checked yet") : iki("yerel ağ dışında, yoklanmaz", "outside the local network, not checked");
}

function ne(a: ProjeAdresi): string {
  const dk = Math.max(0, Math.round((Date.now() - Date.parse(a.guncelleme)) / 60_000));
  const once = dk < 1 ? iki("az önce", "just now") : dk < 60 ? iki(`${dk} dk önce`, `${dk} min ago`) : iki(`${Math.round(dk / 60)} sa önce`, `${Math.round(dk / 60)} h ago`);
  const kaynak = a.kaynak === "cikti" ? iki("çıktıdan yakalandı", "caught from output") : iki("bildirdi", "reported");
  return `${a.ad} · ${a.adres} · ${durumMetni(a)} · ${a.bildirenAd} ${kaynak}, ${once}`;
}

/** Ajanın proje adresi araçları (arnorg-araclari.ts listesine eklenir) */
export function adresAraclari(sirket: Sirket, ajanId: string) {
  const ben = () => sirket.ajan(ajanId);

  return [
    tool(
      "adres_bildir",
      iki(
        "Başlattığın sunucunun adresini proje adreslerine ekler ya da adını günceller (geliştirme sunucusu, API, önizleme). Kurul Tarayıcı'da görür ve tek tıkla açar. Yerel ve yerel ağ adresleri yoklanır; yanıt adresin şu an açık olup olmadığını söyler.",
        "Adds the address of a server you started to the project addresses, or updates its name (dev server, API, preview). The board sees it in the Browser and opens it with one click. Local and local network addresses are checked; the reply says whether the address is up right now.",
      ),
      {
        adres: z.string().min(1).max(2000).describe(iki("http(s) adresi, ör. http://localhost:5173", "An http(s) address, e.g. http://localhost:5173")),
        ad: z.string().min(1).max(60).describe(iki("Kısa ad, ör. 'Geliştirme sunucusu', 'API', 'Storybook'", "A short name, e.g. 'Dev server', 'API', 'Storybook'")),
      },
      (a) =>
        guvenli(async () => {
          const c = ben();
          const k = await sirket.adresler.bildir(c.projeId, { adres: a.adres, ad: a.ad, bildiren: c, kaynak: "arac" });
          const uyari =
            k.durum === "kapali"
              ? iki(" Sunucunun çalıştığını ve adresin doğru olduğunu denetle; kapalı kalan adres birkaç dakikada listeden düşer.", " Check that the server is running and the address is right; an address that stays down drops off the list in a few minutes.")
              : "";
          return metin(
            iki(
              `Adres kaydedildi: ${k.ad} → ${k.adres} (${durumMetni(k)}). Kurul Tarayıcı'da görür.${uyari} Sunucuyu kapatınca ya da adresi değişince adres_kaldir ile kaldır.`,
              `Address saved: ${k.ad} → ${k.adres} (${durumMetni(k)}). The board sees it in the Browser.${uyari} When you stop the server or its address changes, remove it with adres_kaldir.`,
            ),
          );
        }),
    ),
    tool(
      "adres_kaldir",
      iki(
        "Kapattığın ya da artık kullanılmayan sunucunun adresini proje adreslerinden kaldırır. Adresi ya da adını ver.",
        "Removes the address of a server you stopped, or that is no longer used, from the project addresses. Give the address or its name.",
      ),
      { adres: z.string().min(1).max(2000).describe(iki("Adres ya da adı, ör. http://localhost:5173 ya da 'API'", "The address or its name, e.g. http://localhost:5173 or 'API'")) },
      (a) =>
        guvenli(() => {
          const giden = sirket.adresler.kaldir(ben().projeId, a.adres);
          if (!giden.length) return { ...metin(iki(`"${a.adres}" proje adreslerinde yok; listeyi adresler ile gör.`, `"${a.adres}" is not among the project addresses; see the list with adresler.`)), isError: true };
          return metin(iki(`Kaldırıldı: ${giden.map((x) => `${x.ad} (${x.adres})`).join(", ")}.`, `Removed: ${giden.map((x) => `${x.ad} (${x.adres})`).join(", ")}.`));
        }),
    ),
    tool(
      "adresler",
      iki(
        "Projenin çalışan adreslerini listeler: ad, adres, durum (açık, yanıt vermiyor), kim bildirdi ve ne zaman. Bir sunucuyu yeniden başlatmadan ya da yenisini açmadan önce bak.",
        "Lists the project's running addresses: name, address, status (up, not responding), who reported it and when. Look here before you restart a server or start a new one.",
      ),
      {},
      () =>
        guvenli(() => {
          const liste = sirket.adresler.listele(ben().projeId);
          if (!liste.length) return metin(iki("Kayıtlı proje adresi yok.", "No project addresses are registered."));
          return metin(liste.map(ne).join("\n"));
        }),
    ),
  ];
}

/**
 * Talimatın ortak kurallarına giren satır: sunucuyu başlatan adresini bildirir, kapatınca kaldırır. Sunucu
 * başlatmayan CEO çalışan adresleri teslimin test adımlarında kullanır.
 */
export function adresTalimati(ajan: Pick<Ajan, "rol">, dil: Dil): string[] {
  if (ajan.rol === "ceo") {
    return [
      dil === "en"
        ? "- See the project's running addresses (dev server, API, preview) with mcp__arnorg__adresler and use them in the test steps of teslim_et; whoever starts a server registers its address."
        : "- Projenin çalışan adreslerini (geliştirme sunucusu, API, önizleme) mcp__arnorg__adresler ile gör ve teslim_et'in test adımlarında kullan; sunucuyu başlatan çalışan adresini kendisi bildirir.",
    ];
  }
  return [
    dil === "en"
      ? "- When you start a server (dev server, API, preview), register its address with mcp__arnorg__adres_bildir and a short name (e.g. 'Dev server', 'API'); the board opens it from the Browser with one click. When you stop it or the address changes, remove it with adres_kaldir or register the new one. Check what is already running with adresler before starting another server."
      : "- Bir sunucu başlattığında (geliştirme sunucusu, API, önizleme) adresini kısa bir adla mcp__arnorg__adres_bildir ile bildir (ör. 'Geliştirme sunucusu', 'API'); kurul Tarayıcı'dan tek tıkla açar. Sunucuyu kapatınca ya da adresi değişince adres_kaldir ile kaldır ya da yenisini bildir. Yeni bir sunucu açmadan önce çalışanları adresler ile gör.",
  ];
}
