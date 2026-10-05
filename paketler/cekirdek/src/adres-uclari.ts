// Proje adreslerinin (Tarayıcı'da "Linkler") HTTP uçları: Stüdyo listeyi buradan alır, sonra adresler.guncellendi
// olaylarıyla güncel tutar. Kurul link ekler ve kaldırır (0.0.9); "CEO'dan iste" CEO'ya linkleri güncellemesini
// #yonetim'den kurul mesajıyla söyler. Sözleşme: docs/API.md "Proje adresleri".
import { KURUL } from "@arnorg/ortak";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { iki } from "./dil.js";
import type { ProjeAdresleri } from "./proje-adresleri.js";
import type { Sirket } from "./sirket.js";
import { ArnorgHatasi, bulunamadi } from "./yardimci.js";

const semalar = {
  ekle: z.object({
    adres: z.string().trim().min(1).max(2000),
    ad: z.string().trim().min(1).max(60),
  }),
};

/** CEO'ya giden kurul mesajı: Linkler alanını doldurması ve güncel tutması (listede ne olduğu da yazılır) */
export function linkIstemeMetni(adresler: { ad: string; adres: string }[]): string {
  const listede = adresler.length
    ? iki(` Şu an listede: ${adresler.map((a) => `${a.ad} (${a.adres})`).join(", ")}.`, ` Currently listed: ${adresler.map((a) => `${a.ad} (${a.adres})`).join(", ")}.`)
    : iki(" Şu an liste boş.", " The list is empty right now.");
  return iki(
    `Tarayıcı'daki Linkler alanını güncelle: projenin açılabilen adreslerini (geliştirme sunucusu, API ve dokümanı, önizleme, test ya da canlı yayın, yönetim paneli) kısa ve açık bir adla adres_bildir ile ekle, değişenleri güncelle, artık kullanılmayanları adres_kaldir ile kaldır.${listede} Çalışmayan bir sunucu varsa ilgili çalışana başlatıp adresini bildirmesini söyle.`,
    `Update the Links in the Browser: add the project's openable addresses (dev server, API and its docs, preview, staging or live site, admin panel) with a short, clear name using adres_bildir, update the ones that changed, and remove the ones no longer used with adres_kaldir.${listede} If a server is not running, tell the employee responsible to start it and register its address.`,
  );
}

/** Uçları kurar; izinli sunucular (--izinli-host) yerel ağ dışında olsa da yoklanır. Sunucu kapanınca yoklama durur */
export function adresUclariniKur(app: FastifyInstance, sirket: Sirket, izinliHostlar: string[] = []): ProjeAdresleri {
  const adresler = sirket.adresler;
  adresler.izinliHostlariAyarla(izinliHostlar);
  const param = (i: FastifyRequest, ad: string): string => String((i.params as Record<string, string>)[ad] ?? "");

  app.get("/api/projeler/:pid/adresler", async (i) => adresler.listele(sirket.proje(param(i, "pid")).id));
  // Kurulun eklediği link kalıcıdır; aynı adres yeniden eklenirse adı güncellenir
  app.post("/api/projeler/:pid/adresler", async (i) => {
    const pid = sirket.proje(param(i, "pid")).id;
    const g = semalar.ekle.parse(i.body ?? {});
    return adresler.bildir(pid, { adres: g.adres, ad: g.ad, bildiren: null, kaynak: "kurul", kalici: true }, false);
  });
  app.delete("/api/projeler/:pid/adresler/:aid", async (i) => {
    const pid = sirket.proje(param(i, "pid")).id;
    const giden = adresler.kaldir(pid, param(i, "aid"));
    if (!giden.length) throw bulunamadi("Link", "Link");
    return { tamam: true };
  });
  // "CEO'dan iste": CEO'ya kurul mesajı (#yonetim); CEO uyanır, mesaj Karargâh'taki CEO sohbetinde görünür
  app.post("/api/projeler/:pid/adresler/iste", async (i) => {
    const pid = sirket.proje(param(i, "pid")).id;
    if (!sirket.depo.ajanlar(pid).some((a) => a.rol === "ceo")) throw new ArnorgHatasi(iki("Projede CEO yok.", "The project has no CEO."), 409);
    const mesaj = await sirket.mesajGonder(pid, "yonetim", KURUL, linkIstemeMetni(adresler.listele(pid)));
    return { mesaj };
  });
  app.addHook("onClose", async () => adresler.durdur());
  return adresler;
}
