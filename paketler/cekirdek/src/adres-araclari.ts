// Proje adresleri araçları (mcp__arnorg__*): adres_bildir, adres_kaldir, adresler; ve talimattaki kuralı.
// Kayıt proje-adresleri.ts'te (sirket.adresler); kurul adresleri Stüdyo'nun Tarayıcı ekranındaki Linkler alanında görüp
// tek tıkla açar. CEO linkleri verir ve güncel tutar (0.0.9), çalışanlar başlattıkları sunucuların adresini bildirir.
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
  const kaynak = a.kaynak === "cikti" ? iki("çıktıdan yakalandı", "caught from output") : a.kaynak === "kurul" ? iki("ekledi", "added") : iki("bildirdi", "reported");
  const kalici = a.kalici ? iki("kalıcı", "lasting") : iki("geçici", "temporary");
  return `${a.ad} · ${a.adres} · ${durumMetni(a)} · ${kalici} · ${a.bildirenAd} ${kaynak}, ${once}`;
}

/** Ajanın proje adresi araçları (arnorg-araclari.ts listesine eklenir) */
export function adresAraclari(sirket: Sirket, ajanId: string) {
  const ben = () => sirket.ajan(ajanId);

  return [
    tool(
      "adres_bildir",
      iki(
        "Projenin açılabilen bir adresini Tarayıcı'daki Linkler alanına ekler ya da adını günceller: başlattığın sunucu (geliştirme sunucusu, API, önizleme) ya da projenin kalıcı linki (test ya da canlı yayın, yönetim paneli, API dokümanı). Kurul görür ve tek tıkla açar. Yerel ve yerel ağ adresleri yoklanır; yanıt adresin şu an açık olup olmadığını söyler.",
        "Adds one of the project's openable addresses to the Links in the Browser, or updates its name: a server you started (dev server, API, preview) or a lasting project link (staging or live site, admin panel, API docs). The board sees it and opens it with one click. Local and local network addresses are checked; the reply says whether the address is up right now.",
      ),
      {
        adres: z.string().min(1).max(2000).describe(iki("http(s) adresi, ör. http://localhost:5173", "An http(s) address, e.g. http://localhost:5173")),
        ad: z.string().min(1).max(60).describe(iki("Kısa ad, ör. 'Geliştirme sunucusu', 'API', 'Test ortamı'", "A short name, e.g. 'Dev server', 'API', 'Staging'")),
        kalici: z
          .boolean()
          .optional()
          .describe(
            iki(
              "Kalıcı link mi: kaldırılana dek durur, yanıt vermese de düşmez. Verilmezse CEO'nun bildirdiği ve yerel ağ dışındaki adres kalıcı, çalışanın başlattığı yerel sunucu geçicidir (uzun süre kapalı kalınca düşer); var olan linkte değişmez.",
              "Whether it is a lasting link: it stays until removed, even when it does not respond. If omitted, an address reported by the CEO or outside the local network is lasting, and a local server an employee started is temporary (it drops after staying down); an existing link keeps its setting.",
            ),
          ),
      },
      (a) =>
        guvenli(async () => {
          const c = ben();
          const k = await sirket.adresler.bildir(c.projeId, { adres: a.adres, ad: a.ad, bildiren: c, kaynak: "arac", kalici: a.kalici });
          const uyari =
            k.durum !== "kapali"
              ? ""
              : k.kalici
                ? iki(" Şu an yanıt vermiyor; sunucu çalışınca kurul açabilir.", " It is not responding right now; the board can open it once the server runs.")
                : iki(" Sunucunun çalıştığını ve adresin doğru olduğunu denetle; kapalı kalan adres birkaç dakikada listeden düşer.", " Check that the server is running and the address is right; an address that stays down drops off the list in a few minutes.");
          const kalicilik = k.kalici
            ? iki(" Kalıcı link: kaldırılana dek durur; artık kullanılmayınca adres_kaldir ile kaldır.", " Lasting link: it stays until removed; remove it with adres_kaldir once it is no longer used.")
            : iki(" Sunucuyu kapatınca ya da adresi değişince adres_kaldir ile kaldır.", " When you stop the server or its address changes, remove it with adres_kaldir.");
          return metin(
            iki(
              `Link kaydedildi: ${k.ad} → ${k.adres} (${durumMetni(k)}). Kurul Tarayıcı'daki Linkler'de görür.${uyari}${kalicilik}`,
              `Link saved: ${k.ad} → ${k.adres} (${durumMetni(k)}). The board sees it in the Links in the Browser.${uyari}${kalicilik}`,
            ),
          );
        }),
    ),
    tool(
      "adres_kaldir",
      iki(
        "Kapattığın sunucunun ya da artık kullanılmayan linkin adresini Tarayıcı'daki Linkler'den kaldırır. Adresi ya da adını ver.",
        "Removes the address of a server you stopped, or a link that is no longer used, from the Links in the Browser. Give the address or its name.",
      ),
      { adres: z.string().min(1).max(2000).describe(iki("Adres ya da adı, ör. http://localhost:5173 ya da 'API'", "The address or its name, e.g. http://localhost:5173 or 'API'")) },
      (a) =>
        guvenli(() => {
          const giden = sirket.adresler.kaldir(ben().projeId, a.adres);
          if (!giden.length) return { ...metin(iki(`"${a.adres}" Linkler'de yok; listeyi adresler ile gör.`, `"${a.adres}" is not among the Links; see the list with adresler.`)), isError: true };
          return metin(iki(`Kaldırıldı: ${giden.map((x) => `${x.ad} (${x.adres})`).join(", ")}.`, `Removed: ${giden.map((x) => `${x.ad} (${x.adres})`).join(", ")}.`));
        }),
    ),
    tool(
      "adresler",
      iki(
        "Tarayıcı'daki Linkler'i listeler: ad, adres, durum (açık, yanıt vermiyor), kalıcı mı, kim bildirdi ve ne zaman. Bir sunucuyu yeniden başlatmadan ya da yenisini açmadan önce bak.",
        "Lists the Links in the Browser: name, address, status (up, not responding), whether it is lasting, who reported it and when. Look here before you restart a server or start a new one.",
      ),
      {},
      () =>
        guvenli(() => {
          const liste = sirket.adresler.listele(ben().projeId);
          if (!liste.length) return metin(iki("Linkler boş: kayıtlı adres yok.", "The Links are empty: no addresses are registered."));
          return metin(liste.map(ne).join("\n"));
        }),
    ),
  ];
}

/**
 * Talimatın ortak kurallarına giren satır. CEO Tarayıcı'daki Linkler alanını yönetir: projenin açılabilen adreslerini
 * verir, güncel tutar, sunucu gerektiren işte çalışandan adresini bildirmesini ister. Çalışan başlattığı sunucunun ve
 * oluşan kalıcı adresin linkini bildirir, kapatınca kaldırır.
 */
export function adresTalimati(ajan: Pick<Ajan, "rol">, dil: Dil): string[] {
  if (ajan.rol === "ceo") {
    return [
      dil === "en"
        ? "- You run the Links in the board's Browser: whenever the project has an address that can be opened (dev server, API and its docs, preview, staging or live site, admin panel), add it with mcp__arnorg__adres_bildir and a short, clear name so the board opens it with one click. Keep the list current: register the new address when one changes and remove unused ones with adres_kaldir; check the list with adresler. When a task produces a page or server, have the employee register its address. Use these links in the test steps of teslim_et."
        : "- Kurulun Tarayıcı'sındaki Linkler alanını sen yönetirsin: projenin açılabilen her adresini (geliştirme sunucusu, API ve dokümanı, önizleme, test ya da canlı yayın, yönetim paneli) kısa ve açık bir adla mcp__arnorg__adres_bildir ile ekle; kurul tek tıkla açar. Listeyi güncel tut: adres değişince yenisini bildir, kullanılmayanı adres_kaldir ile kaldır; listeyi adresler ile denetle. Bir görev sayfa ya da sunucu üretiyorsa çalışandan adresini bildirmesini iste. Teslimlerin (teslim_et) test adımlarında bu linkleri kullan.",
    ];
  }
  return [
    dil === "en"
      ? "- When you start a server (dev server, API, preview), register its address with mcp__arnorg__adres_bildir and a short name (e.g. 'Dev server', 'API'); the board opens it from the Links in the Browser with one click. When you stop it or the address changes, remove it with adres_kaldir or register the new one. When a lasting address appears (staging or live site, admin panel, docs), register it with kalici: true. Check what is already running with adresler before starting another server."
      : "- Bir sunucu başlattığında (geliştirme sunucusu, API, önizleme) adresini kısa bir adla mcp__arnorg__adres_bildir ile bildir (ör. 'Geliştirme sunucusu', 'API'); kurul Tarayıcı'daki Linkler'den tek tıkla açar. Sunucuyu kapatınca ya da adresi değişince adres_kaldir ile kaldır ya da yenisini bildir. Kalıcı bir adres oluşunca (test ya da canlı yayın, yönetim paneli, doküman) onu kalici: true ile bildir. Yeni bir sunucu açmadan önce çalışanları adresler ile gör.",
  ];
}
