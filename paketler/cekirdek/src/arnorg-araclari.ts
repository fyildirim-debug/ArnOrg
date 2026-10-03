// Ajanların ArnOrg ile konuştuğu süreç içi MCP araçları (mcp__arnorg__*)
import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { GOREV_DURUMLARI, type GorevDurumu } from "@arnorg/ortak";
import { z } from "zod";
import { dosyaOku } from "./dosyalar.js";
import { fark } from "./git.js";
import { raporOlustur, tokenMetni } from "./gozetmen.js";
import { sorulardaAra } from "./hatirlatici.js";
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
      "Ekibi, rollerini, durumlarını ve bugünkü kullanımlarını listeler. Rol kataloğunu da gösterir.",
      {},
      () =>
        guvenli(() => {
          const ekip = sirket.depo
            .ajanlar(ben().projeId)
            .map((x) => {
              const kullanim = sirket.abonelik ? `bugün ${tokenMetni(x.bugunToken)} token` : `$${x.bugunHarcananUsd.toFixed(2)}/$${x.gunlukButceUsd.toFixed(2)}`;
              return `${x.ad} · ${x.rolAdi} (${x.rol}) · ${x.model} · ${x.durum}${x.isAciklamasi ? ` · ${x.isAciklamasi}` : ""} · ${kullanim}`;
            })
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
        gunluk_butce_usd: z.number().min(0).max(500).optional().describe("Yalnız API girişinde anlamlı; abonelikte boş bırak"),
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
            gunlukButceUsd: sirket.abonelik ? undefined : a.gunluk_butce_usd,
            talimatEki: a.talimat_eki,
            yoneticiAd: a.yonetici ?? ben().ad,
          };
          sirket.teklifAc(
            ben(),
            "ise_alim",
            `İşe alım: ${a.ad} · ${rol.ad}`,
            `${a.gerekce}\n\nModel: ${a.model ?? rol.varsayilanModel}${sirket.abonelik ? "" : ` · Günlük bütçe: $${a.gunluk_butce_usd ?? 5}`} · Yönetici: ${veri.yoneticiAd}`,
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
      "hafiza_kaydet",
      "Bu projenin kalıcı hafızasına kayıt yazar. Türler: tercih (kurulun isteği, üslup, yasak), karar (alınan karar ve gerekçesi), ogrenilen (hata ve çözümü, püf noktası), olgu (projeye dair doğru bilgi: sürüm, yapı, komut), uzmanlik (kim neyi biliyor), ozet (biten iş, devir notu). Aynı tür ve başlıkta kayıt varsa güncellenir. Bilgi değiştiyse eski kaydın kimliğini yerine_gecen ile ver.",
      {
        tur: z.enum(["tercih", "karar", "ogrenilen", "olgu", "uzmanlik", "ozet"]),
        baslik: z.string().min(3).max(160).describe("Kısa, aranabilir başlık; ör. 'Veritabanı: SQLite'"),
        metin: z.string().min(5).max(4000).describe("Ne, neden, nasıl; tek paragraf yeterli"),
        etiketler: z.array(z.string()).max(8).optional(),
        onem: z.number().int().min(1).max(5).optional().describe("5 her oturumda hatırlanmalı, 1 ayrıntı; varsayılan 3"),
        gorev: z.string().optional().describe("İlgili görev kodu, ör. T-4"),
        yerine_gecen: z.string().optional().describe("Bu kaydın yerine geçtiği eski kaydın kimliği (bağlamdaki kimlik ilk 8 karakteri yeterli)"),
      },
      (a) =>
        guvenli(() => {
          const pid = ben().projeId;
          const gorevId = a.gorev ? (sirket.depo.gorevKoduyla(pid, a.gorev)?.id ?? null) : null;
          let eski: string | null = null;
          if (a.yerine_gecen) {
            const aday = sirket.depo.hafizaKayitlari(pid, { eskilerDahil: true, sinir: 5000 }).filter((k) => k.id.startsWith(a.yerine_gecen!));
            if (aday.length !== 1) return hata("Yerine geçilecek kayıt bulunamadı ya da kimlik belirsiz; hafiza_ara ile kimliği bul.");
            eski = aday[0]!.id;
          }
          const k = sirket.hafizaYaz(pid, { tur: a.tur, baslik: a.baslik, metin: a.metin, etiketler: a.etiketler, onem: a.onem, gorevId, yerineGectigi: eski }, ajanId);
          return metin(`Hafızaya yazıldı (${k.tur}, kimlik ${k.id.slice(0, 8)}): ${k.baslik}`);
        }),
    ),
    tool(
      "hafiza_ara",
      "Bu projenin hafızasında ve notlarında arar. Bir şeyi bilmiyorsan, karar vermeden ya da işe başlamadan önce kullan.",
      { sorgu: z.string().min(2), tur: z.enum(["tercih", "karar", "ogrenilen", "olgu", "uzmanlik", "ozet"]).optional() },
      (a) =>
        guvenli(() => {
          const kayitlar = sirket.hafiza.ara(ben().projeId, a.sorgu, a.tur, 12);
          const notlar = a.tur ? [] : notlardaAra(proje().yol, a.sorgu).slice(0, 12);
          const sorular = a.tur ? [] : sorulardaAra(sirket.depo, ben().projeId, a.sorgu, 5);
          const parcalar: string[] = [];
          if (kayitlar.length)
            parcalar.push(
              "Hafıza:",
              ...kayitlar.map((k) => `- [${k.tur}] ${k.baslik} (${k.kaynakAd}, ${k.guncelleme.slice(0, 10)}, kimlik ${k.id.slice(0, 8)}): ${kisalt(k.metin, 500)}`),
            );
          if (notlar.length) parcalar.push("Notlar:", ...notlar.map((x) => `- ${x.yol}:${x.satir}: ${x.metin}`));
          if (sorular.length)
            parcalar.push("Daha önce sorulup yanıtlananlar:", ...sorular.map((x) => `- ${x.soranAd} → ${x.soruluAd} (${x.olusturma.slice(0, 10)}): ${kisalt(x.soru, 200)} | Yanıt: ${kisalt(x.yanit ?? "", 400)}`));
          return metin(parcalar.length ? parcalar.join("\n") : "Eşleşme yok. Bilen biri varsa ajana_sor ile sor.");
        }),
    ),
    tool(
      "hafiza_listele",
      "Hafızadaki geçerli kayıtları türe göre listeler.",
      { tur: z.enum(["tercih", "karar", "ogrenilen", "olgu", "uzmanlik", "ozet"]) },
      (a) =>
        guvenli(() => {
          const k = sirket.depo.hafizaKayitlari(ben().projeId, { tur: a.tur, sinir: 60 });
          return metin(k.length ? k.map((x) => `- ${x.baslik} (kimlik ${x.id.slice(0, 8)}, ${x.kaynakAd}): ${kisalt(x.metin, 300)}`).join("\n") : "Bu türde kayıt yok.");
        }),
    ),
    tool(
      "hafiza_bakim",
      "Hafızada birbirini tekrar eden kayıt çiftlerini listeler. Tekrar eden bilgi her oturumun bağlamını şişirir; çiftleri hafiza_birlestir ile tek kayda indir.",
      {},
      () =>
        guvenli(() => {
          const c = sirket.hafiza.benzerler(ben().projeId).slice(0, 12);
          if (!c.length) return metin("Tekrar eden kayıt yok.");
          return metin(
            c
              .map((x) => `- %${Math.round(x.benzerlik * 100)} [${x.a.tur}] ${x.a.id.slice(0, 8)} "${x.a.baslik}" (${x.a.kaynakAd}) ↔ ${x.b.id.slice(0, 8)} "${x.b.baslik}" (${x.b.kaynakAd})\n  A: ${kisalt(x.a.metin, 220)}\n  B: ${kisalt(x.b.metin, 220)}`)
              .join("\n"),
          );
        }),
    ),
    tool(
      "hafiza_birlestir",
      "İki kaydı tek kayda indirir: tutulan kalır (metin verilirse birleşik metinle güncellenir), eskiyen onun yerine geçmiş sayılır ve artık hatırlatılmaz. Kimliklerin ilk 8 karakteri yeterli.",
      { tutulan: z.string().min(4), eskiyen: z.string().min(4), metin: z.string().min(5).max(4000).optional().describe("İkisinin bilgisini birleştiren yeni metin") },
      (a) =>
        guvenli(() => {
          const pid = ben().projeId;
          const hepsi = sirket.depo.hafizaKayitlari(pid, { sinir: 5000 });
          const bul = (on: string) => {
            const aday = hepsi.filter((k) => k.id.startsWith(on));
            return aday.length === 1 ? aday[0]! : null;
          };
          const t = bul(a.tutulan);
          const e = bul(a.eskiyen);
          if (!t || !e) return hata("Kayıt bulunamadı ya da kimlik belirsiz; hafiza_bakim ile kimlikleri gör.");
          const k = sirket.hafiza.birlestir(t.id, e.id, a.metin);
          return metin(`Birleştirildi: "${k.baslik}" kaldı, "${e.baslik}" eskidi.`);
        }),
    ),
    tool(
      "defter_yaz",
      "Kendi defterini baştan yazar: açık işlerin, verdiğin sözler, sıradaki adımın, dikkat ettiğin şeyler. Her oturumda sana geri verilir; kısa maddeler kullan, eskiyenleri çıkar.",
      { icerik: z.string().min(5).max(6000) },
      (a) =>
        guvenli(() => {
          sirket.defterYaz(ajanId, a.icerik);
          return metin("Defterin güncellendi.");
        }),
    ),
    tool(
      "defter_oku",
      "Bir çalışanın defterini okur (boşsa kendi defterin). Başkasının işine dokunmadan önce ya da devir alırken kullan.",
      { ajan: z.string().optional() },
      (a) =>
        guvenli(() => {
          const hedef = a.ajan ? ajanBul(a.ajan) : ben();
          const icerik = sirket.hafiza.defter(hedef);
          return metin(icerik ? `${hedef.ad} defteri:\n${icerik}` : `${hedef.ad} henüz defter yazmamış.`);
        }),
    ),
    tool(
      "ajana_sor",
      "Bir çalışana soru sorar ve yanıtını bekler (varsayılan 10, en çok 30 dakika). Uzmanlık, karar gerekçesi ya da onun işine dair bilgi için kullan; kısa ve net sor. Kimin bildiğini bilmiyorsan ajan alanını boş bırak: ArnOrg hafızaya, görevlere, geçmiş yanıtlara ve rollere bakıp uzmanı seçer. Aynı soru yakın zamanda yanıtlandıysa o yanıt hemen döner. Yanıt gelmezse varsayılan ve güvenli yolla devam et.",
      {
        ajan: z.string().optional().describe("Çalışan adı; boşsa ArnOrg uzmanı seçer"),
        soru: z.string().min(5).max(4000),
        bekle_dk: z.number().int().min(1).max(30).optional(),
        yeniden: z.boolean().optional().describe("Önceki yanıt yetmediyse true: aynı soru yine de sorulur"),
      },
      (a) =>
        guvenli(async () => {
          const s = await sirket.ajanaSor(ajanId, a.ajan ?? null, a.soru, a.bekle_dk ?? 10, { yeniden: a.yeniden });
          if (s.onceki)
            return metin(
              `Bu soru ${s.olusturma.slice(0, 10)} tarihinde ${s.soranAd} tarafından ${s.soruluAd}'a soruldu ve şöyle yanıtlandı:\nSoru: ${kisalt(s.soru, 400)}\nYanıt: ${s.yanit}\n\nYeterli değilse ajana_sor'u yeniden: true ile çağır.`,
            );
          const yol = s.yonlendirme ? `ArnOrg soruyu ${s.soruluAd}'a yönlendirdi (${s.yonlendirme}).\n` : "";
          if (s.durum === "yanitlandi") return metin(`${yol}${s.soruluAd} yanıtladı:\n${s.yanit}\n\nYanıt ekibin de bilmesi gereken kalıcı bir bilgiyse hafiza_kaydet ile kaydet.`);
          return metin(`${yol}${s.soruluAd} süre içinde yanıt vermedi. Bildiğin kadarıyla ve güvenli yolla devam et; gerekirse mesaj_gonder ile not bırak.`);
        }),
    ),
    tool(
      "soruyu_yanitla",
      "Sana sorulan bir soruyu yanıtlar. Yanıt soran çalışana hemen iletilir.",
      { soru_id: z.string(), yanit: z.string().min(1).max(6000) },
      (a) =>
        guvenli(() => {
          const s = sirket.soruYanitla(ajanId, a.soru_id, a.yanit);
          return metin(`Yanıtın ${s.soranAd}'a iletildi.`);
        }),
    ),
    tool(
      "rapor_hazirla",
      "Dönem durum raporu hazırlar (tamamlanan, süren, tıkanan görevler; harcama; denetim; bekleyen onaylar) ve notlara raporlar/<tarih>.md olarak kaydeder. Yalnız CEO ve CTO.",
      { gun: z.number().int().min(1).max(90).default(7).describe("Kaç günlük dönem") },
      (a) =>
        guvenli(() => {
          if (!yonetici()) return hata("Raporu yalnız CEO ve CTO hazırlayabilir.");
          const r = raporOlustur(sirket, ben().projeId, a.gun);
          notYaz(proje().yol, r.yol, r.markdown);
          sirket.olaylar.yayinla({ tur: "dosya.degisti", projeId: ben().projeId, alan: "ana", yol: `.arnorg/notlar/${r.yol}`, ajanId });
          return metin(`Rapor kaydedildi: ${r.yol}. Kurula #genel'de kısa bir özet yaz.\n\n${r.markdown}`);
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
