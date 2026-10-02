// Ajanların ArnOrg ile konuştuğu süreç içi MCP araçları (mcp__arnorg__*)
import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { GOREV_DURUMLARI, type GorevDurumu } from "@arnorg/ortak";
import { z } from "zod";
import { dosyaOku } from "./dosyalar.js";
import { fark } from "./git.js";
import { notlardaAra, notlariListele, notOku, notYaz } from "./proje-dosyalari.js";
import { rolBul } from "./roller.js";
import type { Sirket } from "./sirket.js";
import { kisalt } from "./yardimci.js";

type Sonuc = { content: { type: "text"; text: string }[]; isError?: boolean };

function metin(t: string): Sonuc {
  return { content: [{ type: "text", text: t }] };
}

function hata(t: string): Sonuc {
  return { content: [{ type: "text", text: t }], isError: true };
}

/** Aracı çalıştırır; ArnOrg hatalarını ajana okunur metin olarak döndürür */
async function guvenli(f: () => Promise<Sonuc> | Sonuc): Promise<Sonuc> {
  try {
    return await f();
  } catch (h) {
    return hata((h as Error).message);
  }
}

const durumSemasi = z.enum(GOREV_DURUMLARI as [GorevDurumu, ...GorevDurumu[]]);

export function arnorgAraclari(sirket: Sirket, ajanId: string): McpSdkServerConfigWithInstance {
  const ben = () => sirket.ajan(ajanId);
  const proje = () => sirket.proje(ben().projeId);
  const yonetici = () => Boolean(rolBul(ben().rol)?.yonetici);
  const ajanBul = (ad: string) => {
    const a = sirket.depo.ajanAdla(ben().projeId, ad.replace(/^@/, "").trim());
    if (!a) throw new Error(`"${ad}" adında çalışan yok. Ekibi ekip_listele ile gör.`);
    return a;
  };

  const inceleyebilir = () => yonetici() || ["inceleme", "test", "guvenlik"].includes(rolBul(ben().rol)?.kimlik ?? "");

  const araclar = [
    tool(
      "mesaj_gonder",
      "Ekibe ya da bir çalışana mesaj gönderir. Metinde @Ad ile anılan ya da alici olarak verilen çalışan uyarılır. Kurula rapor için kanal 'genel' kullan.",
      {
        metin: z.string().min(1).describe("Mesaj metni"),
        kanal: z.string().optional().describe("Kanal adı (varsayılan: muhendislik; CEO için genel)"),
        alici: z.string().optional().describe("Doğrudan uyarılacak çalışanın adı"),
      },
      (a) =>
        guvenli(async () => {
          const kanal = a.kanal ?? (rolBul(ben().rol)?.kimlik === "ceo" ? "genel" : "muhendislik");
          let govde = a.metin;
          if (a.alici) {
            const alici = ajanBul(a.alici);
            if (!new RegExp(`@${alici.ad}\\b`, "iu").test(govde)) govde = `@${alici.ad} ${govde}`;
          }
          const m = await sirket.mesajGonder(ben().projeId, kanal, ajanId, govde);
          const uyarilanlar = m.anilanlar.map((id) => sirket.depo.ajan(id)?.ad).filter(Boolean);
          return metin(`Mesaj #${m.kanal} kanalına bırakıldı.${uyarilanlar.length ? ` Uyarılan: ${uyarilanlar.join(", ")}.` : ""}`);
        }),
    ),
    tool(
      "kanal_oku",
      "Bir kanalın son mesajlarını okur.",
      { kanal: z.string().default("genel"), sinir: z.number().int().min(1).max(100).default(30) },
      (a) =>
        guvenli(() => {
          const mesajlar = sirket.depo.mesajlar(ben().projeId, a.kanal.replace(/^#/, ""), a.sinir);
          if (!mesajlar.length) return metin(`#${a.kanal} kanalında mesaj yok.`);
          return metin(mesajlar.map((m) => `[${m.zaman.slice(11, 16)}] ${m.gonderenAd}: ${m.metin}`).join("\n"));
        }),
    ),
    tool(
      "gorevleri_listele",
      "Projenin görevlerini listeler.",
      { durum: durumSemasi.optional(), sadece_benim: z.boolean().default(false) },
      (a) =>
        guvenli(() => {
          let liste = sirket.depo.gorevler(ben().projeId);
          if (a.durum) liste = liste.filter((g) => g.durum === a.durum);
          if (a.sadece_benim) liste = liste.filter((g) => g.atananId === ajanId);
          if (!liste.length) return metin("Görev yok.");
          return metin(
            liste
              .map((g) => {
                const kim = g.atananId ? sirket.depo.ajan(g.atananId)?.ad ?? "?" : "atanmadı";
                const bag = g.bagimliliklar.map((b) => sirket.depo.gorev(b)?.kod).filter(Boolean);
                return `${g.kod} [${g.durum}] ${g.baslik} · ${kim}${bag.length ? ` · bağlı: ${bag.join(", ")}` : ""}`;
              })
              .join("\n"),
          );
        }),
    ),
    tool(
      "gorev_detay",
      "Bir görevin açıklamasını ve kabul ölçütünü gösterir.",
      { gorev: z.string().describe("Görev kodu, ör. T-12") },
      (a) =>
        guvenli(() => {
          const g = sirket.depo.gorevKoduyla(ben().projeId, a.gorev);
          if (!g) return hata("Görev bulunamadı.");
          return metin(sirket.gorevMetni(g) + `\nDurum: ${g.durum}`);
        }),
    ),
    tool(
      "gorev_ac",
      "Yeni görev açar. Atanan verilir ve baslat=true ise görev 'calisiliyor' olur ve çalışan hemen başlar.",
      {
        baslik: z.string().min(3),
        aciklama: z.string().default(""),
        kabul_olcutu: z.string().default(""),
        atanan: z.string().optional().describe("Çalışan adı"),
        bagimliliklar: z.array(z.string()).default([]).describe("Görev kodları, ör. [\"T-3\"]"),
        etiket: z.string().default(""),
        baslat: z.boolean().default(false),
      },
      (a) =>
        guvenli(async () => {
          const atanan = a.atanan ? ajanBul(a.atanan) : null;
          const g = sirket.gorevOlustur(
            ben().projeId,
            {
              baslik: a.baslik,
              aciklama: a.aciklama,
              kabulOlcutu: a.kabul_olcutu,
              atananId: atanan?.id ?? null,
              bagimliliklar: a.bagimliliklar,
              etiket: a.etiket,
              durum: atanan ? "planlandi" : "bekleyen",
            },
            ajanId,
          );
          if (a.baslat && atanan) {
            try {
              await sirket.gorevGuncelle(g.id, { durum: "calisiliyor" }, ajanId);
              return metin(`${g.kod} açıldı ve ${atanan.ad} başladı.`);
            } catch (h) {
              return metin(`${g.kod} açıldı ama başlatılamadı: ${(h as Error).message}`);
            }
          }
          return metin(`${g.kod} açıldı (${atanan ? `${atanan.ad}'e atandı, planlandı` : "atanmadı"}).`);
        }),
    ),
    tool(
      "gorev_guncelle",
      "Görevin durumunu, atanan kişisini ya da açıklamasını günceller. İş bitince durum 'inceleme' yapılır; not alanına ne yapıldığını yaz.",
      {
        gorev: z.string().describe("Görev kodu, ör. T-12"),
        durum: durumSemasi.optional(),
        atanan: z.string().optional(),
        not: z.string().optional().describe("Kanala düşülecek kısa not"),
      },
      (a) =>
        guvenli(async () => {
          const g = sirket.depo.gorevKoduyla(ben().projeId, a.gorev);
          if (!g) return hata("Görev bulunamadı.");
          if (!yonetici() && g.atananId && g.atananId !== ajanId && a.atanan === undefined && a.durum && a.durum !== "calisiliyor" && rolBul(ben().rol)?.kimlik !== "inceleme") {
            return hata("Başkasına atanmış görevin durumunu yalnız yöneticiler ve kod inceleyici değiştirebilir.");
          }
          const atanan = a.atanan ? ajanBul(a.atanan) : null;
          const yeni = await sirket.gorevGuncelle(g.id, { durum: a.durum, atananId: atanan?.id }, ajanId);
          if (a.not) await sirket.mesajGonder(ben().projeId, "muhendislik", ajanId, `${yeni.kod} → ${yeni.durum}: ${a.not}`);
          return metin(`${yeni.kod} güncellendi: ${yeni.durum}${yeni.atananId ? ` · ${sirket.depo.ajan(yeni.atananId)?.ad}` : ""}.`);
        }),
    ),
    tool(
      "ekip_listele",
      "Ekibi, rollerini, durumlarını ve günlük bütçe kullanımını listeler. Rol kataloğunu da gösterir.",
      {},
      () =>
        guvenli(() => {
          const ekip = sirket.depo
            .ajanlar(ben().projeId)
            .map((x) => `${x.ad} · ${x.rolAdi} (${x.rol}) · ${x.model} · ${x.durum}${x.isAciklamasi ? ` · ${x.isAciklamasi}` : ""} · $${x.bugunHarcananUsd.toFixed(2)}/$${x.gunlukButceUsd.toFixed(2)}`)
            .join("\n");
          return metin(`Ekip:\n${ekip}\n\nİşe alınabilecek roller: ceo dışındaki roller — cto, backend, frontend, fullstack, test, inceleme, guvenlik, devops, tasarim, yazar, arastirmaci.`);
        }),
    ),
    tool(
      "ise_al_teklif",
      "Yeni çalışan için yönetim kuruluna gerekçeli işe alım teklifi verir (yalnız yöneticiler). Kurul onaylarsa çalışan ekibe katılır ve sana haber verilir.",
      {
        ad: z.string().min(2).max(40).describe("Türkçe bir ad, ör. Deniz"),
        rol: z.string().describe("Rol kimliği: cto, backend, frontend, fullstack, test, inceleme, guvenlik, devops, tasarim, yazar, arastirmaci"),
        gerekce: z.string().min(10),
        model: z.string().optional().describe("opus, sonnet ya da haiku; boşsa rolün varsayılanı"),
        gunluk_butce_usd: z.number().min(0).max(500).optional(),
        yonetici: z.string().optional().describe("Bağlanacağı çalışanın adı"),
        talimat_eki: z.string().optional(),
      },
      (a) =>
        guvenli(() => {
          if (!yonetici()) return hata("İşe alım teklifini yalnız CEO ve CTO verebilir.");
          const rol = rolBul(a.rol);
          if (!rol || rol.kimlik === "ceo") return hata("Geçersiz rol.");
          if (sirket.depo.ajanAdla(ben().projeId, a.ad)) return hata(`${a.ad} adında bir çalışan zaten var; başka bir ad seç.`);
          const bekleyen = sirket.depo.onaylar(ben().projeId, "bekliyor").find((o) => o.tur === "ise_alim" && (o.veri as { ad?: string })?.ad?.toLowerCase() === a.ad.toLowerCase());
          if (bekleyen) return metin(`${a.ad} için teklif zaten kurulda bekliyor.`);
          const veri = {
            ad: a.ad,
            rol: rol.kimlik,
            model: a.model,
            gunlukButceUsd: a.gunluk_butce_usd,
            talimatEki: a.talimat_eki,
            yoneticiAd: a.yonetici ?? ben().ad,
          };
          sirket.teklifAc(
            ben(),
            "ise_alim",
            `İşe alım: ${a.ad} · ${rol.ad}`,
            `${a.gerekce}\n\nModel: ${a.model ?? rol.varsayilanModel} · Günlük bütçe: $${a.gunluk_butce_usd ?? 5} · Yönetici: ${veri.yoneticiAd}`,
            veri,
          );
          return metin(`Teklif yönetim kuruluna sunuldu: ${a.ad} (${rol.ad}). Karar verilince sana haber verilecek; beklerken başka işlerine devam et.`);
        }),
    ),
    tool(
      "notlari_listele",
      "Proje notlarını (.arnorg/notlar) listeler.",
      {},
      () =>
        guvenli(() => {
          const n = notlariListele(proje().yol);
          return metin(n.length ? n.map((x) => `${x.yol} — ${x.baslik}`).join("\n") : "Not yok.");
        }),
    ),
    tool(
      "not_oku",
      "Bir proje notunu okur.",
      { yol: z.string().describe("notlar/ köküne göre yol, ör. kararlar/ADR-002-veritabani.md") },
      (a) => guvenli(() => metin(notOku(proje().yol, a.yol).icerik)),
    ),
    tool(
      "not_yaz",
      "Proje notu yazar ya da günceller (.arnorg/notlar altında). Kararlar için kararlar/ADR-<no>-<konu>.md kullan.",
      { yol: z.string(), icerik: z.string().min(1) },
      (a) =>
        guvenli(() => {
          const n = notYaz(proje().yol, a.yol, a.icerik);
          sirket.olaylar.yayinla({ tur: "dosya.degisti", projeId: ben().projeId, alan: "ana", yol: `.arnorg/notlar/${n.yol}`, ajanId });
          return metin(`Not kaydedildi: ${n.yol}`);
        }),
    ),
    tool(
      "hafiza_ara",
      "Proje notlarında arar.",
      { sorgu: z.string().min(2) },
      (a) =>
        guvenli(() => {
          const s = notlardaAra(proje().yol, a.sorgu);
          return metin(s.length ? s.map((x) => `${x.yol}:${x.satir}: ${x.metin}`).join("\n") : "Eşleşme yok.");
        }),
    ),
    tool(
      "kurula_sor",
      "Yönetim kuruluna soru sorar ve yanıtı bekler (en çok onay süresi kadar). Yanıt gelmezse varsayılan davranışla devam et.",
      { soru: z.string().min(5), secenekler: z.array(z.string()).default([]) },
      (a) =>
        guvenli(async () => {
          const ayrinti = a.secenekler.length ? `${a.soru}\n\nSeçenekler:\n${a.secenekler.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : a.soru;
          const k = await sirket.kararBekle(ben(), "genel", `${ben().ad} soruyor: ${kisalt(a.soru, 80)}`, ayrinti, { soru: a.soru, secenekler: a.secenekler });
          if (k.not === "Süre doldu") return metin("Kurul süre içinde yanıt vermedi. Varsayılan ve güvenli olan yolla devam et.");
          return metin(`Kurul ${k.izin ? "onayladı" : "reddetti"}.${k.not ? ` Yanıt: ${k.not}` : ""}`);
        }),
    ),
    tool(
      "calisma_farki",
      "Bir çalışanın çalışma alanındaki değişiklikleri ana dala göre gösterir (git diff). İnceleme için.",
      { ajan: z.string().describe("Çalışan adı"), yol: z.string().optional().describe("Yalnız bu dosya") },
      (a) =>
        guvenli(async () => {
          if (!inceleyebilir()) return hata("Bu aracı yöneticiler, kod inceleyici, test ve güvenlik rolleri kullanabilir.");
          const hedef = ajanBul(a.ajan);
          if (!hedef.calismaAlani) return hata(`${hedef.ad} için çalışma alanı yok.`);
          const f = await fark(hedef.calismaAlani, proje().varsayilanDal, a.yol);
          const ozet = f.sayilar.map((x) => `${x.yol} +${x.eklenen} -${x.silinen}`).join("\n") || "Değişiklik yok.";
          const govde = f.fark.length > 60_000 ? f.fark.slice(0, 60_000) + "\n… (kısaltıldı; dosya bazında yol ile isteyin)" : f.fark;
          return metin(`Dal: ${hedef.dal} · temel: ${proje().varsayilanDal}\n\nDosyalar:\n${ozet}\n\n${govde}`);
        }),
    ),
    tool(
      "calisma_dosyasi",
      "Bir çalışanın çalışma alanından dosya okur.",
      { ajan: z.string(), yol: z.string().describe("Çalışma alanı köküne göre yol") },
      (a) =>
        guvenli(() => {
          if (!inceleyebilir()) return hata("Bu aracı yöneticiler, kod inceleyici, test ve güvenlik rolleri kullanabilir.");
          const hedef = ajanBul(a.ajan);
          if (!hedef.calismaAlani) return hata(`${hedef.ad} için çalışma alanı yok.`);
          const d = dosyaOku(hedef.calismaAlani, a.yol, null);
          return metin(d.icerik.length > 80_000 ? d.icerik.slice(0, 80_000) + "\n… (kısaltıldı)" : d.icerik);
        }),
    ),
    tool(
      "birlestirme_iste",
      "Bir çalışanın dalını ana dala birleştirmek için kurul onayı ister. İnceleyen (CEO, CTO, kod inceleyici) için ajan alanına dalı birleştirilecek çalışanın adını yaz; boş bırakılırsa incelemedeki tek görevin sahibi seçilir.",
      { ozet: z.string().min(10).describe("Neler değişti, testler"), ajan: z.string().optional().describe("Dalı birleştirilecek çalışanın adı") },
      (a) =>
        guvenli(() => {
          let sahip = a.ajan ? ajanBul(a.ajan) : ben();
          if (!a.ajan && !sahip.dal) {
            const adaylar = sirket.depo
              .gorevler(ben().projeId)
              .filter((g) => g.durum === "inceleme" && g.atananId)
              .map((g) => ({ g, ajan: sirket.depo.ajan(g.atananId!) }))
              .filter((x) => x.ajan?.dal);
            const tekil = [...new Map(adaylar.map((x) => [x.ajan!.id, x])).values()];
            if (tekil.length !== 1) {
              return hata(
                tekil.length
                  ? `Birden çok aday var; ajan alanına birini yaz: ${tekil.map((x) => `${x.ajan!.ad} (${x.g.kod})`).join(", ")}`
                  : "Kendi çalışma dalın yok ve incelemede dalı olan görev yok; ajan alanına çalışan adını yaz.",
              );
            }
            sahip = tekil[0]!.ajan!;
          }
          if (!sahip.dal) return hata(`${sahip.ad} için çalışma dalı yok.`);
          if (sahip.id !== ajanId && !yonetici() && rolBul(ben().rol)?.kimlik !== "inceleme") return hata("Başkasının dalı için birleştirmeyi yalnız kod inceleyici ve yöneticiler isteyebilir.");
          const bekleyen = sirket.depo.onaylar(ben().projeId, "bekliyor").find((o) => o.tur === "birlestirme" && (o.veri as { dal?: string })?.dal === sahip.dal);
          if (bekleyen) return metin(`${sahip.dal} için birleştirme isteği zaten kurulda bekliyor.`);
          const onay = sirket.teklifAc(ben(), "birlestirme", `${sahip.dal} → ${proje().varsayilanDal}`, a.ozet, { ajanId: sahip.id, dal: sahip.dal, ozet: a.ozet, isteyenId: ajanId });
          return metin(`${sahip.ad} çalışanının ${sahip.dal} dalı için birleştirme kurul onayına sunuldu (onay ${onay.id.slice(0, 8)}). Sonuç sana bildirilecek.`);
        }),
    ),
  ];

  return createSdkMcpServer({ name: "arnorg", version: "0.1.0", tools: araclar });
}
