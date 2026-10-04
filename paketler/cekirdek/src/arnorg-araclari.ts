// Ajanların ArnOrg ile konuştuğu süreç içi MCP araçları (mcp__arnorg__*)
import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { ARNORG_SURUMU, GOREV_DURUMLARI, KOD_SEMBOL_TURU_ADLARI, kanalGorunenAdi, kanalKimligi, rolMetni, type GorevDurumu, type KodSembolTuru } from "@arnorg/ortak";
import { z } from "zod";
import { dosyaOku } from "./dosyalar.js";
import { fark } from "./git.js";
import { raporOlustur, tokenMetni } from "./gozetmen.js";
import { sorulardaAra } from "./hatirlatici.js";
import { aramaMetni, bagimlilikMetni, durumNotu, sembolMetni } from "./kod-zekasi/index.js";
import { notlardaAra, notlariListele, notOku, notYaz } from "./proje-dosyalari.js";
import { maddeleriDenetle } from "./anayasa.js";
import { aracGirdisiniOnar } from "./arac-girdisi.js";
import { dil, iki } from "./dil.js";
import { rolAdiDilde, rolBul } from "./roller.js";
import type { Sirket } from "./sirket.js";
import { kisalt, yonelme } from "./yardimci.js";
import { KISISEL_SINIR } from "./zeka.js";

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

/** Şemada metin olan alanlar (isteğe bağlı, varsayılanlı ya da boş geçilebilir sarmalar açılır) */
function metinAlanlari(sema: Record<string, unknown>): string[] {
  return Object.entries(sema)
    .filter(([, t0]) => {
      let t = t0 as { _zod?: { def?: { innerType?: unknown } } } | undefined;
      while (t?._zod?.def?.innerType) t = t._zod.def.innerType as typeof t;
      return t instanceof z.ZodString;
    })
    .map(([ad]) => ad);
}

/** Mesajda bir taahhüt var mı: "I'll…", "I will…", "yapacağım", "bakacağım" */
const SOZ_KALIBI = /\b(?:I'll|I will|I'm going to)\b|\p{L}+(?:acağım|eceğim)(?![\p{L}])/iu;

type AracTanimi = { inputSchema: Record<string, unknown>; handler: (args: never, extra: unknown) => Promise<unknown> };

/** İşleyiciyi girdi onarıcısıyla sarar: küçük modellerin bir metin alanına sızdırdığı çağrı biçimi ayıklanır */
function onarimli<T extends AracTanimi>(t: T): T {
  const alanlar = metinAlanlari(t.inputSchema);
  const isleyici = t.handler as unknown as (a: Record<string, unknown>, e: unknown) => Promise<unknown>;
  return { ...t, handler: (a: Record<string, unknown>, e: unknown) => isleyici(aracGirdisiniOnar(a, alanlar), e) } as T;
}

const durumSemasi = z.enum(GOREV_DURUMLARI as [GorevDurumu, ...GorevDurumu[]]);
const sembolTuruSemasi = z.enum(Object.keys(KOD_SEMBOL_TURU_ADLARI) as [KodSembolTuru, ...KodSembolTuru[]]);

export function arnorgAraclari(sirket: Sirket, ajanId: string): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({ name: "arnorg", version: ARNORG_SURUMU, tools: arnorgAracListesi(sirket, ajanId) });
}

/** Ajanın araç tanımları (testler işleyicileri doğrudan çağırabilsin diye ayrı) */
export function arnorgAracListesi(sirket: Sirket, ajanId: string) {
  const ben = () => sirket.ajan(ajanId);
  const proje = () => sirket.proje(ben().projeId);
  const yonetici = () => Boolean(rolBul(ben().rol)?.yonetici);
  const ajanBul = (ad: string) => {
    const a = sirket.depo.ajanAdla(ben().projeId, ad.replace(/^@/, "").trim());
    if (!a) throw new Error(iki(`"${ad}" adında çalışan yok. Ekibi ekip_listele ile gör.`, `No employee named "${ad}". See the team with ekip_listele.`));
    return a;
  };

  const inceleyebilir = () => yonetici() || ["inceleme", "test", "guvenlik"].includes(rolBul(ben().rol)?.kimlik ?? "");
  /** Kalite kapısının test komutu (araç açıklamasında anılır) */
  const testKomutu = sirket.depo.proje(sirket.depo.ajan(ajanId)?.projeId ?? "")?.testKomutu ?? null;

  const araclar = [
    tool(
      "mesaj_gonder",
      iki(
        "Ekibe ya da bir çalışana mesaj gönderir. Metinde @Ad ile anılan ya da alici olarak verilen çalışan uyarılır. Kurula rapor için kanal 'genel' kullan.",
        "Sends a message to the team or to an employee. Employees @mentioned in the text or given as alici are notified. For reports to the board use kanal 'general'.",
      ),
      {
        metin: z.string().min(1).describe(iki("Mesaj metni", "Message text")),
        kanal: z.string().optional().describe(iki("Kanal adı (varsayılan: muhendislik; CEO için genel)", "Channel name (default: engineering; general for the CEO)")),
        alici: z.string().optional().describe(iki("Doğrudan uyarılacak çalışanın adı", "Name of the employee to notify directly")),
      },
      (a) =>
        guvenli(async () => {
          // Varsayılan: seslenildiği kanal (yanıt oraya gider), yoksa CEO için #genel, diğerleri için #muhendislik
          const kanal = a.kanal ?? sirket.yazdigiKanal(ajanId) ?? (rolBul(ben().rol)?.kimlik === "ceo" ? "genel" : "muhendislik");
          let govde = a.metin;
          if (a.alici) {
            const alici = ajanBul(a.alici);
            if (!new RegExp(`@${alici.ad}\\b`, "iu").test(govde)) govde = `@${alici.ad} ${govde}`;
          }
          const m = await sirket.mesajGonder(ben().projeId, kanal, ajanId, govde);
          const uyarilanlar = m.anilanlar.map((id) => sirket.depo.ajan(id)?.ad).filter(Boolean);
          // Taahhüt içeren mesajda son 10 dakikada söz kaydedilmediyse soz_ver hatırlatılır
          const onDakika = new Date(Date.now() - 10 * 60_000).toISOString();
          const sozHatirlat = SOZ_KALIBI.test(govde) && !sirket.depo.sozler(ben().projeId, { verenId: ajanId, sinir: 5 }).some((x) => x.olusturma >= onDakika);
          return metin(
            iki(
              `Mesaj #${m.kanal} kanalına bırakıldı.${uyarilanlar.length ? ` Uyarılan: ${uyarilanlar.join(", ")}.` : ""}${sozHatirlat ? " Bu mesajda bir şey yapacağını söyledin; taahhütse soz_ver ile kaydet." : ""}`,
              `Message posted to #${kanalGorunenAdi(m.kanal, "en")}.${uyarilanlar.length ? ` Notified: ${uyarilanlar.join(", ")}.` : ""}${sozHatirlat ? " You said you will do something; if it is a commitment, record it with soz_ver." : ""}`,
            ),
          );
        }),
    ),
    tool(
      "kanal_oku",
      iki("Bir kanalın son mesajlarını okur.", "Reads the latest messages in a channel."),
      { kanal: z.string().default("genel"), sinir: z.number().int().min(1).max(100).default(30) },
      (a) =>
        guvenli(() => {
          const mesajlar = sirket.depo.mesajlar(ben().projeId, kanalKimligi(a.kanal), a.sinir);
          if (!mesajlar.length) return metin(iki(`#${a.kanal} kanalında mesaj yok.`, `No messages in #${kanalGorunenAdi(kanalKimligi(a.kanal), "en")}.`));
          return metin(mesajlar.map((m) => `[${m.zaman.slice(11, 16)}] ${m.gonderenAd}: ${m.metin}`).join("\n"));
        }),
    ),
    tool(
      "gorevleri_listele",
      iki("Projenin görevlerini listeler.", "Lists the project's tasks."),
      { durum: durumSemasi.optional(), sadece_benim: z.boolean().default(false) },
      (a) =>
        guvenli(() => {
          let liste = sirket.depo.gorevler(ben().projeId);
          if (a.durum) liste = liste.filter((g) => g.durum === a.durum);
          if (a.sadece_benim) liste = liste.filter((g) => g.atananId === ajanId);
          if (!liste.length) return metin(iki("Görev yok.", "No tasks."));
          return metin(
            liste
              .map((g) => {
                const kim = g.atananId ? sirket.depo.ajan(g.atananId)?.ad ?? "?" : iki("atanmadı", "unassigned");
                const bag = g.bagimliliklar.map((b) => sirket.depo.gorev(b)?.kod).filter(Boolean);
                return `${g.kod} [${g.durum}] ${g.baslik} · ${kim}${bag.length ? ` · ${iki("bağlı", "depends on")}: ${bag.join(", ")}` : ""}`;
              })
              .join("\n"),
          );
        }),
    ),
    tool(
      "gorev_detay",
      iki("Bir görevin açıklamasını ve kabul ölçütünü gösterir.", "Shows a task's description and acceptance criteria."),
      { gorev: z.string().describe(iki("Görev kodu, ör. T-12", "Task code, e.g. T-12")) },
      (a) =>
        guvenli(() => {
          const g = sirket.depo.gorevKoduyla(ben().projeId, a.gorev);
          if (!g) return hata(iki("Görev bulunamadı.", "Task not found."));
          return metin(sirket.gorevMetni(g) + `\n${iki("Durum", "Status")}: ${g.durum}`);
        }),
    ),
    tool(
      "gorev_ac",
      iki(
        "Yeni görev açar. Atanan verilir ve baslat=true ise görev 'calisiliyor' olur ve çalışan hemen başlar.",
        "Opens a new task. If atanan is given and baslat=true, the task becomes 'calisiliyor' (in progress) and the employee starts right away.",
      ),
      {
        baslik: z.string().min(3),
        aciklama: z.string().default(""),
        kabul_olcutu: z.string().default(""),
        atanan: z.string().optional().describe(iki("Çalışan adı", "Employee name")),
        bagimliliklar: z.array(z.string()).default([]).describe(iki("Görev kodları, ör. [\"T-3\"]", "Task codes, e.g. [\"T-3\"]")),
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
              return metin(iki(`${g.kod} açıldı ve ${atanan.ad} başladı.`, `${g.kod} opened and ${atanan.ad} started.`));
            } catch (h) {
              return metin(iki(`${g.kod} açıldı ama başlatılamadı: ${(h as Error).message}`, `${g.kod} opened but could not be started: ${(h as Error).message}`));
            }
          }
          return metin(iki(`${g.kod} açıldı (${atanan ? `${yonelme(atanan.ad)} atandı, planlandı` : "atanmadı"}).`, `${g.kod} opened (${atanan ? `assigned to ${atanan.ad}, planned` : "unassigned"}).`));
        }),
    ),
    tool(
      "gorev_guncelle",
      iki(
        "Görevin durumunu, atanan kişisini ya da açıklamasını günceller. İş bitince durum 'inceleme' yapılır; not alanına ne yapıldığını yaz.",
        "Updates a task's status, assignee or description. When the work is done, set durum to 'inceleme' (review); write what you did in not.",
      ),
      {
        gorev: z.string().describe(iki("Görev kodu, ör. T-12", "Task code, e.g. T-12")),
        durum: durumSemasi.optional(),
        atanan: z.string().optional(),
        not: z.string().optional().describe(iki("Kanala düşülecek kısa not", "A short note to post to the channel")),
      },
      (a) =>
        guvenli(async () => {
          const g = sirket.depo.gorevKoduyla(ben().projeId, a.gorev);
          if (!g) return hata(iki("Görev bulunamadı.", "Task not found."));
          if (!yonetici() && g.atananId && g.atananId !== ajanId && a.atanan === undefined && a.durum && a.durum !== "calisiliyor" && rolBul(ben().rol)?.kimlik !== "inceleme") {
            return hata(iki("Başkasına atanmış görevin durumunu yalnız yöneticiler ve kod inceleyici değiştirebilir.", "Only managers and the code reviewer can change the status of a task assigned to someone else."));
          }
          const atanan = a.atanan ? ajanBul(a.atanan) : null;
          const yeni = await sirket.gorevGuncelle(g.id, { durum: a.durum, atananId: atanan?.id }, ajanId);
          if (a.not) await sirket.mesajGonder(ben().projeId, "muhendislik", ajanId, `${yeni.kod} → ${yeni.durum}: ${a.not}`);
          const kim = yeni.atananId ? ` · ${sirket.depo.ajan(yeni.atananId)?.ad}` : "";
          const kendiIsiBitti = yeni.atananId === ajanId && (yeni.durum === "inceleme" || yeni.durum === "tamam") && yeni.durum !== g.durum;
          const ders = kendiIsiBitti
            ? iki(
                " Devam etmeden: bu iş sana burada çalışmaya dair bir şey öğrettiyse kendime_not ile bir satır yaz; yeniden kullanılacak bir yöntem çözdüysen beceri_yaz ile kaydet.",
                " Before you move on: if this work taught you something about working here, add one line with kendime_not; if you worked out a reusable method, save it with beceri_yaz.",
              )
            : "";
          return metin(iki(`${yeni.kod} güncellendi: ${yeni.durum}${kim}.${ders}`, `${yeni.kod} updated: ${yeni.durum}${kim}.${ders}`));
        }),
    ),
    tool(
      "ekip_listele",
      iki("Ekibi, rollerini, durumlarını ve bugünkü kullanımlarını listeler. Rol kataloğunu da gösterir.", "Lists the team with their roles, status and today's usage. Also shows the role catalog."),
      {},
      () =>
        guvenli(() => {
          const ekip = sirket.depo
            .ajanlar(ben().projeId)
            .map((x) => {
              const kullanim = iki(`bugün ${tokenMetni(x.bugunToken)} token`, `today ${tokenMetni(x.bugunToken)} tokens`);
              return `${x.ad} · ${rolAdiDilde(x)} (${x.rol}) · ${x.model} · ${x.durum}${x.isAciklamasi ? ` · ${x.isAciklamasi}` : ""} · ${kullanim}`;
            })
            .join("\n");
          return metin(
            iki(
              `Ekip:\n${ekip}\n\nİşe alınabilecek roller: ceo dışındaki roller — cto, backend, frontend, fullstack, test, inceleme, guvenlik, devops, tasarim, yazar, arastirmaci.`,
              `Team:\n${ekip}\n\nRoles you can hire: every role except ceo — cto, backend, frontend, fullstack, test, inceleme, guvenlik, devops, tasarim, yazar, arastirmaci.`,
            ),
          );
        }),
    ),
    tool(
      "ise_al_teklif",
      iki(
        "Yeni çalışan için yönetim kuruluna gerekçeli işe alım teklifi verir (yalnız yöneticiler). Kurul onaylarsa çalışan ekibe katılır ve sana haber verilir.",
        "Proposes hiring a new employee to the board, with reasons (managers only). If the board approves, the employee joins the team and you are told.",
      ),
      {
        ad: z.string().min(2).max(40).describe(iki("Türkçe bir ad, ör. Deniz", "A first name, e.g. Ada")),
        rol: z.string().describe(iki("Rol kimliği: cto, backend, frontend, fullstack, test, inceleme, guvenlik, devops, tasarim, yazar, arastirmaci", "Role id: cto, backend, frontend, fullstack, test, inceleme, guvenlik, devops, tasarim, yazar, arastirmaci")),
        gerekce: z.string().min(10),
        model: z.string().optional().describe(iki("fable, opus, sonnet ya da haiku; boşsa rolün varsayılanı", "fable, opus, sonnet or haiku; the role's default if empty")),
        yonetici: z.string().optional().describe(iki("Bağlanacağı çalışanın adı", "Name of the employee they will report to")),
        talimat_eki: z.string().optional(),
      },
      (a) =>
        guvenli(() => {
          if (!yonetici()) return hata(iki("İşe alım teklifini yalnız CEO ve CTO verebilir.", "Only the CEO and CTO can propose a hire."));
          const rol = rolBul(a.rol);
          if (!rol || rol.kimlik === "ceo") return hata(iki("Geçersiz rol.", "Invalid role."));
          if (sirket.depo.ajanAdla(ben().projeId, a.ad)) return hata(iki(`${a.ad} adında bir çalışan zaten var; başka bir ad seç.`, `There is already an employee named ${a.ad}; pick another name.`));
          const bekleyen = sirket.depo.onaylar(ben().projeId, "bekliyor").find((o) => o.tur === "ise_alim" && (o.veri as { ad?: string })?.ad?.toLowerCase() === a.ad.toLowerCase());
          if (bekleyen) return metin(iki(`${a.ad} için teklif zaten kurulda bekliyor.`, `A proposal for ${a.ad} is already waiting for the board.`));
          const rolAdi = rolMetni(rol, dil()).ad;
          const veri = {
            ad: a.ad,
            rol: rol.kimlik,
            model: a.model,
            talimatEki: a.talimat_eki,
            yoneticiAd: a.yonetici ?? ben().ad,
          };
          sirket.teklifAc(
            ben(),
            "ise_alim",
            iki(`İşe alım: ${a.ad} · ${rolAdi}`, `Hiring: ${a.ad} · ${rolAdi}`),
            `${a.gerekce}\n\nModel: ${a.model ?? sirket.modelKatalogu.rolModeli(rol.varsayilanModel)} · ${iki("Yönetici", "Manager")}: ${veri.yoneticiAd}`,
            veri,
          );
          return metin(
            iki(
              `Teklif yönetim kuruluna sunuldu: ${a.ad} (${rolAdi}). Karar verilince sana haber verilecek; beklerken başka işlerine devam et.`,
              `The proposal went to the board: ${a.ad} (${rolAdi}). You will be told the decision; carry on with other work meanwhile.`,
            ),
          );
        }),
    ),
    tool(
      "notlari_listele",
      iki("Proje notlarını (.arnorg/notlar) listeler.", "Lists the project notes (.arnorg/notlar)."),
      {},
      () =>
        guvenli(() => {
          const n = notlariListele(proje().yol);
          return metin(n.length ? n.map((x) => `${x.yol} — ${x.baslik}`).join("\n") : iki("Not yok.", "No notes."));
        }),
    ),
    tool(
      "not_oku",
      iki("Bir proje notunu okur.", "Reads a project note."),
      { yol: z.string().describe(iki("notlar/ köküne göre yol, ör. kararlar/ADR-002-veritabani.md", "Path relative to notlar/, e.g. kararlar/ADR-002-database.md")) },
      (a) => guvenli(() => metin(notOku(proje().yol, a.yol).icerik)),
    ),
    tool(
      "not_yaz",
      iki("Proje notu yazar ya da günceller (.arnorg/notlar altında). Kararlar için kararlar/ADR-<no>-<konu>.md kullan.", "Writes or updates a project note (under .arnorg/notlar). Use kararlar/ADR-<no>-<topic>.md for decisions."),
      { yol: z.string(), icerik: z.string().min(1) },
      (a) =>
        guvenli(() => {
          const n = notYaz(proje().yol, a.yol, a.icerik);
          sirket.olaylar.yayinla({ tur: "dosya.degisti", projeId: ben().projeId, alan: "ana", yol: `.arnorg/notlar/${n.yol}`, ajanId });
          return metin(iki(`Not kaydedildi: ${n.yol}`, `Note saved: ${n.yol}`));
        }),
    ),
    tool(
      "hafiza_kaydet",
      iki(
        "Bu projenin kalıcı hafızasına kayıt yazar. Türler: tercih (kurulun isteği, üslup, yasak), karar (alınan karar ve gerekçesi), ogrenilen (hata ve çözümü, püf noktası), olgu (projeye dair doğru bilgi: sürüm, yapı, komut), uzmanlik (kim neyi biliyor), ozet (biten iş, devir notu). Aynı tür ve başlıkta kayıt varsa güncellenir. Bilgi değiştiyse eski kaydın kimliğini yerine_gecen ile ver.",
        "Writes a record to this project's lasting memory. Types: tercih (what the board wants: style, prohibitions), karar (a decision and its reason), ogrenilen (an error and its fix, a tip), olgu (a true fact about the project: version, structure, command), uzmanlik (who knows what), ozet (finished work, handover note). A record with the same type and title is updated. If the information changed, give the old record's id in yerine_gecen.",
      ),
      {
        tur: z.enum(["tercih", "karar", "ogrenilen", "olgu", "uzmanlik", "ozet"]),
        baslik: z.string().min(3).max(160).describe(iki("Kısa, aranabilir başlık; ör. 'Veritabanı: SQLite'", "Short, searchable title, e.g. 'Database: SQLite'")),
        metin: z.string().min(5).max(4000).describe(iki("Ne, neden, nasıl; tek paragraf yeterli", "What, why, how; one paragraph is enough")),
        etiketler: z.array(z.string()).max(8).optional(),
        onem: z.number().int().min(1).max(5).optional().describe(iki("5 her oturumda hatırlanmalı, 1 ayrıntı; varsayılan 3", "5 must be remembered every session, 1 is a detail; default 3")),
        gorev: z.string().optional().describe(iki("İlgili görev kodu, ör. T-4", "Related task code, e.g. T-4")),
        yerine_gecen: z.string().optional().describe(iki("Bu kaydın yerine geçtiği eski kaydın kimliği (bağlamdaki kimlik ilk 8 karakteri yeterli)", "Id of the old record this one replaces (the first 8 characters of the id shown in context are enough)")),
      },
      (a) =>
        guvenli(() => {
          const pid = ben().projeId;
          const gorevId = a.gorev ? (sirket.depo.gorevKoduyla(pid, a.gorev)?.id ?? null) : null;
          let eski: string | null = null;
          if (a.yerine_gecen) {
            const aday = sirket.depo.hafizaKayitlari(pid, { eskilerDahil: true, sinir: 5000 }).filter((k) => k.id.startsWith(a.yerine_gecen!));
            if (aday.length !== 1) return hata(iki("Yerine geçilecek kayıt bulunamadı ya da kimlik belirsiz; hafiza_ara ile kimliği bul.", "The record to replace was not found or the id is ambiguous; find the id with hafiza_ara."));
            eski = aday[0]!.id;
          }
          const k = sirket.hafizaYaz(pid, { tur: a.tur, baslik: a.baslik, metin: a.metin, etiketler: a.etiketler, onem: a.onem, gorevId, yerineGectigi: eski }, ajanId);
          return metin(iki(`Hafızaya yazıldı (${k.tur}, kimlik ${k.id.slice(0, 8)}): ${k.baslik}`, `Saved to memory (${k.tur}, id ${k.id.slice(0, 8)}): ${k.baslik}`));
        }),
    ),
    tool(
      "hafiza_ara",
      iki("Bu projenin hafızasında ve notlarında arar. Bir şeyi bilmiyorsan, karar vermeden ya da işe başlamadan önce kullan.", "Searches this project's memory and notes. Use it when you don't know something, before deciding or starting work."),
      { sorgu: z.string().min(2), tur: z.enum(["tercih", "karar", "ogrenilen", "olgu", "uzmanlik", "ozet"]).optional() },
      (a) =>
        guvenli(() => {
          const kayitlar = sirket.hafiza.ara(ben().projeId, a.sorgu, a.tur, 12);
          const notlar = a.tur ? [] : notlardaAra(proje().yol, a.sorgu).slice(0, 12);
          const sorular = a.tur ? [] : sorulardaAra(sirket.depo, ben().projeId, a.sorgu, 5);
          const parcalar: string[] = [];
          if (kayitlar.length)
            parcalar.push(
              iki("Hafıza:", "Memory:"),
              ...kayitlar.map((k) => `- [${k.tur}] ${k.baslik} (${k.kaynakAd}, ${k.guncelleme.slice(0, 10)}, ${iki("kimlik", "id")} ${k.id.slice(0, 8)}): ${kisalt(k.metin, 500)}`),
            );
          if (notlar.length) parcalar.push(iki("Notlar:", "Notes:"), ...notlar.map((x) => `- ${x.yol}:${x.satir}: ${x.metin}`));
          if (sorular.length)
            parcalar.push(
              iki("Daha önce sorulup yanıtlananlar:", "Asked and answered before:"),
              ...sorular.map((x) => `- ${x.soranAd} → ${x.soruluAd} (${x.olusturma.slice(0, 10)}): ${kisalt(x.soru, 200)} | ${iki("Yanıt", "Answer")}: ${kisalt(x.yanit ?? "", 400)}`),
            );
          return metin(parcalar.length ? parcalar.join("\n") : iki("Eşleşme yok. Bilen biri varsa ajana_sor ile sor.", "No matches. If someone knows, ask with ajana_sor."));
        }),
    ),
    tool(
      "hafiza_listele",
      iki("Hafızadaki geçerli kayıtları türe göre listeler.", "Lists the current memory records of a type."),
      { tur: z.enum(["tercih", "karar", "ogrenilen", "olgu", "uzmanlik", "ozet"]) },
      (a) =>
        guvenli(() => {
          const k = sirket.depo.hafizaKayitlari(ben().projeId, { tur: a.tur, sinir: 60 });
          return metin(k.length ? k.map((x) => `- ${x.baslik} (${iki("kimlik", "id")} ${x.id.slice(0, 8)}, ${x.kaynakAd}): ${kisalt(x.metin, 300)}`).join("\n") : iki("Bu türde kayıt yok.", "No records of this type."));
        }),
    ),
    tool(
      "hafiza_bakim",
      iki(
        "Hafızada birbirini tekrar eden kayıt çiftlerini listeler. Tekrar eden bilgi her oturumun bağlamını şişirir; çiftleri hafiza_birlestir ile tek kayda indir.",
        "Lists pairs of memory records that repeat each other. Repeated information bloats every session's context; merge each pair into one record with hafiza_birlestir.",
      ),
      {},
      () =>
        guvenli(() => {
          const c = sirket.hafiza.benzerler(ben().projeId).slice(0, 12);
          if (!c.length) return metin(iki("Tekrar eden kayıt yok.", "No duplicate records."));
          return metin(
            c
              .map((x) => `- %${Math.round(x.benzerlik * 100)} [${x.a.tur}] ${x.a.id.slice(0, 8)} "${x.a.baslik}" (${x.a.kaynakAd}) ↔ ${x.b.id.slice(0, 8)} "${x.b.baslik}" (${x.b.kaynakAd})\n  A: ${kisalt(x.a.metin, 220)}\n  B: ${kisalt(x.b.metin, 220)}`)
              .join("\n"),
          );
        }),
    ),
    tool(
      "hafiza_birlestir",
      iki(
        "İki kaydı tek kayda indirir: tutulan kalır (metin verilirse birleşik metinle güncellenir), eskiyen onun yerine geçmiş sayılır ve artık hatırlatılmaz. Kimliklerin ilk 8 karakteri yeterli.",
        "Merges two records into one: tutulan stays (updated with the merged text if metin is given), eskiyen counts as replaced by it and is no longer recalled. The first 8 characters of the ids are enough.",
      ),
      { tutulan: z.string().min(4), eskiyen: z.string().min(4), metin: z.string().min(5).max(4000).optional().describe(iki("İkisinin bilgisini birleştiren yeni metin", "New text combining what both say")) },
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
          if (!t || !e) return hata(iki("Kayıt bulunamadı ya da kimlik belirsiz; hafiza_bakim ile kimlikleri gör.", "Record not found or the id is ambiguous; see the ids with hafiza_bakim."));
          const k = sirket.hafiza.birlestir(t.id, e.id, a.metin);
          return metin(iki(`Birleştirildi: "${k.baslik}" kaldı, "${e.baslik}" eskidi.`, `Merged: "${k.baslik}" stays, "${e.baslik}" is retired.`));
        }),
    ),
    tool(
      "defter_yaz",
      iki(
        "Kendi defterini baştan yazar: açık işlerin, verdiğin sözler, sıradaki adımın, dikkat ettiğin şeyler. Her oturumda sana geri verilir; kısa maddeler kullan, eskiyenleri çıkar.",
        "Rewrites your journal from scratch: your open work, the promises you made, your next step, things to watch out for. It is given back to you every session; use short bullet points and drop stale ones.",
      ),
      { icerik: z.string().min(5).max(6000) },
      (a) =>
        guvenli(() => {
          sirket.defterYaz(ajanId, a.icerik);
          return metin(iki("Defterin güncellendi.", "Your journal was updated."));
        }),
    ),
    tool(
      "defter_oku",
      iki("Bir çalışanın defterini okur (boşsa kendi defterin). Başkasının işine dokunmadan önce ya da devir alırken kullan.", "Reads an employee's journal (yours if empty). Use it before touching someone else's work or when taking over."),
      { ajan: z.string().optional() },
      (a) =>
        guvenli(() => {
          const hedef = a.ajan ? ajanBul(a.ajan) : ben();
          const icerik = sirket.hafiza.defter(hedef);
          return metin(icerik ? iki(`${hedef.ad} defteri:\n${icerik}`, `${hedef.ad}'s journal:\n${icerik}`) : iki(`${hedef.ad} henüz defter yazmamış.`, `${hedef.ad} has not written a journal yet.`));
        }),
    ),
    tool(
      "ajana_sor",
      iki(
        "Bir çalışana soru sorar ve yanıtını bekler (varsayılan 10, en çok 30 dakika). Uzmanlık, karar gerekçesi ya da onun işine dair bilgi için kullan; kısa ve net sor. Kimin bildiğini bilmiyorsan ajan alanını boş bırak: ArnOrg hafızaya, görevlere, geçmiş yanıtlara ve rollere bakıp uzmanı seçer. Aynı soru yakın zamanda yanıtlandıysa o yanıt hemen döner. Yanıt gelmezse varsayılan ve güvenli yolla devam et.",
        "Asks an employee a question and waits for the answer (default 10, at most 30 minutes). Use it for expertise, the reason behind a decision or details of their work; ask briefly and clearly. If you don't know who knows, leave ajan empty: ArnOrg picks the expert from memory, tasks, past answers and roles. If the same question was answered recently, that answer comes back right away. If no answer comes, carry on the default, safe way.",
      ),
      {
        ajan: z.string().optional().describe(iki("Çalışan adı; boşsa ArnOrg uzmanı seçer", "Employee name; if empty, ArnOrg picks the expert")),
        soru: z.string().min(5).max(4000),
        bekle_dk: z.number().int().min(1).max(30).optional(),
        yeniden: z.boolean().optional().describe(iki("Önceki yanıt yetmediyse true: aynı soru yine de sorulur", "true if the earlier answer was not enough: the question is asked again anyway")),
      },
      (a) =>
        guvenli(async () => {
          const s = await sirket.ajanaSor(ajanId, a.ajan ?? null, a.soru, a.bekle_dk ?? 10, { yeniden: a.yeniden });
          if (s.onceki)
            return metin(
              iki(
                `Bu soru ${s.olusturma.slice(0, 10)} tarihinde ${s.soranAd} tarafından ${yonelme(s.soruluAd)} soruldu ve şöyle yanıtlandı:\nSoru: ${kisalt(s.soru, 400)}\nYanıt: ${s.yanit}\n\nYeterli değilse ajana_sor'u yeniden: true ile çağır.`,
                `${s.soranAd} asked ${s.soruluAd} this question on ${s.olusturma.slice(0, 10)}, and the answer was:\nQuestion: ${kisalt(s.soru, 400)}\nAnswer: ${s.yanit}\n\nIf that is not enough, call ajana_sor again with yeniden: true.`,
              ),
            );
          const yol = s.yonlendirme ? iki(`ArnOrg soruyu ${yonelme(s.soruluAd)} yönlendirdi (${s.yonlendirme}).\n`, `ArnOrg routed the question to ${s.soruluAd} (${s.yonlendirme}).\n`) : "";
          if (s.durum === "yanitlandi")
            return metin(
              iki(
                `${yol}${s.soruluAd} yanıtladı:\n${s.yanit}\n\nYanıt ekibin de bilmesi gereken kalıcı bir bilgiyse hafiza_kaydet ile kaydet.`,
                `${yol}${s.soruluAd} answered:\n${s.yanit}\n\nIf the answer is lasting knowledge the team should have too, save it with hafiza_kaydet.`,
              ),
            );
          return metin(
            iki(
              `${yol}${s.soruluAd} süre içinde yanıt vermedi. Bildiğin kadarıyla ve güvenli yolla devam et; gerekirse mesaj_gonder ile not bırak.`,
              `${yol}${s.soruluAd} did not answer in time. Carry on as best you know, the safe way; leave a note with mesaj_gonder if needed.`,
            ),
          );
        }),
    ),
    tool(
      "toplanti_yap",
      iki(
        "Birden çok çalışanın görüşü gereken bir konuda toplantı yapar: gündemi verirsin, katılımcıların görüşü paralel toplanır (en çok bekle_dk dakika), konuşma #toplanti kanalına yazılır, özet hafızaya düşer. Katılımcı vermezsen ArnOrg konuya en yakın en çok üç çalışanı seçer. Kararı sen verirsin.",
        "Holds a meeting on a topic that needs several employees' views: you give the agenda, the participants' views are gathered in parallel (at most bekle_dk minutes), the conversation is posted to #meetings and a summary goes to memory. If you give no participants, ArnOrg picks up to three employees closest to the topic. You make the decision.",
      ),
      {
        gundem: z.string().min(10).max(3000).describe(iki("Karar verilecek konu ve seçenekler", "The topic to decide and the options")),
        katilimcilar: z.array(z.string()).max(6).optional().describe(iki("Çalışan adları; boşsa ArnOrg seçer", "Employee names; if empty, ArnOrg picks")),
        bekle_dk: z.number().int().min(1).max(30).optional(),
      },
      (a) =>
        guvenli(async () => {
          const t = await sirket.toplantiYap(ajanId, a.gundem, a.katilimcilar ?? null, a.bekle_dk ?? 8);
          const satirlar = t.gorusler.map((g) =>
            iki(
              `- ${g.ad} (${g.rolAdi}${g.neden ? `; seçilme nedeni: ${g.neden}` : ""}): ${g.gorus ?? (g.durum === "zaman_asimi" ? "süre içinde yanıt vermedi" : `katılamadı: ${g.hata ?? ""}`)}`,
              `- ${g.ad} (${g.rolAdi}${g.neden ? `; picked because: ${g.neden}` : ""}): ${g.gorus ?? (g.durum === "zaman_asimi" ? "did not answer in time" : `could not take part: ${g.hata ?? ""}`)}`,
            ),
          );
          return metin(
            iki(
              `Toplantı tamam. Görüşler:\n${satirlar.join("\n")}\n\nŞimdi kararı ver: hafiza_kaydet ile tur: karar olarak kaydet (gerekçesiyle), gerekiyorsa not_yaz ile ADR yaz ve kararı mesaj_gonder ile #toplanti kanalına bildir.`,
              `Meeting done. Views:\n${satirlar.join("\n")}\n\nNow decide: save the decision with hafiza_kaydet as tur: karar (with the reason), write an ADR with not_yaz if needed and announce the decision in #meetings with mesaj_gonder.`,
            ),
          );
        }),
    ),
    tool(
      "soruyu_yanitla",
      iki("Sana sorulan bir soruyu yanıtlar. Yanıt soran çalışana hemen iletilir.", "Answers a question you were asked. The answer goes to the asker right away."),
      { soru_id: z.string(), yanit: z.string().min(1).max(6000) },
      (a) =>
        guvenli(() => {
          const s = sirket.soruYanitla(ajanId, a.soru_id, a.yanit);
          return metin(iki(`Yanıtın ${yonelme(s.soranAd)} iletildi.`, `Your answer was sent to ${s.soranAd}.`));
        }),
    ),
    tool(
      "rapor_hazirla",
      iki(
        "Dönem durum raporu hazırlar (tamamlanan, süren, tıkanan görevler; token ve abonelik kullanımı; denetim; bekleyen onaylar) ve notlara raporlar/<tarih>.md olarak kaydeder. Yalnız CEO ve CTO.",
        "Prepares a period status report (done, in-progress and blocked tasks; token and subscription usage; audit; pending approvals) and saves it to the notes as raporlar/<date>.md. CEO and CTO only.",
      ),
      { gun: z.number().int().min(1).max(90).default(7).describe(iki("Kaç günlük dönem", "Length of the period in days")) },
      (a) =>
        guvenli(() => {
          if (!yonetici()) return hata(iki("Raporu yalnız CEO ve CTO hazırlayabilir.", "Only the CEO and CTO can prepare the report."));
          const r = raporOlustur(sirket, ben().projeId, a.gun);
          notYaz(proje().yol, r.yol, r.markdown);
          sirket.olaylar.yayinla({ tur: "dosya.degisti", projeId: ben().projeId, alan: "ana", yol: `.arnorg/notlar/${r.yol}`, ajanId });
          return metin(iki(`Rapor kaydedildi: ${r.yol}. Kurula #genel'de kısa bir özet yaz.\n\n${r.markdown}`, `Report saved: ${r.yol}. Write a short summary for the board in #general.\n\n${r.markdown}`));
        }),
    ),
    tool(
      "kurula_sor",
      iki(
        "Yönetim kuruluna soru sorar ve yanıtı bekler (en çok onay süresi kadar). Yanıt gelmezse varsayılan davranışla devam et.",
        "Asks the board a question and waits for the answer (at most the approval timeout). If no answer comes, carry on with the default behavior.",
      ),
      { soru: z.string().min(5), secenekler: z.array(z.string()).default([]) },
      (a) =>
        guvenli(async () => {
          const ayrinti = a.secenekler.length ? `${a.soru}\n\n${iki("Seçenekler", "Options")}:\n${a.secenekler.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : a.soru;
          const k = await sirket.kararBekle(ben(), "genel", iki(`${ben().ad} soruyor: ${kisalt(a.soru, 80)}`, `${ben().ad} asks: ${kisalt(a.soru, 80)}`), ayrinti, { soru: a.soru, secenekler: a.secenekler });
          // Süre dolması metinden değil kararın kendisinden anlaşılır (not, onayın açıldığı dilde yazılır)
          if (k.zamanAsimi) return metin(iki("Kurul süre içinde yanıt vermedi. Varsayılan ve güvenli olan yolla devam et.", "The board did not answer in time. Carry on the default, safe way."));
          return metin(iki(`Kurul ${k.izin ? "onayladı" : "reddetti"}.${k.not ? ` Yanıt: ${k.not}` : ""}`, `The board ${k.izin ? "approved" : "rejected"}.${k.not ? ` Answer: ${k.not}` : ""}`));
        }),
    ),
    // ---------------- kod zekâsı (ajanın kendi çalışma alanında) ----------------
    tool(
      "kod_ara",
      iki(
        "Kod tabanında arar: anlamsal (gömme) + anahtar sözcük + sembol adı. Türkçe ya da İngilizce doğal dille (\"ajanlar arası soru nasıl yönlendiriliyor\") ya da tanımlayıcıyla sorabilirsin. Sonuçlar dosya:başlangıç-bitiş, sembol ve satır numaralı kısa kesittir; kendi çalışma alanında arar. Yeri kesin bilmiyorsan Grep yerine bunu kullan.",
        "Searches the codebase: semantic (embeddings) + keyword + symbol name. Ask in plain English or Turkish (\"how are questions between agents routed\") or with an identifier. Results are file:start-end, the symbol and a short line-numbered excerpt; it searches your own workspace. Use this instead of Grep when you don't know exactly where to look.",
      ),
      {
        sorgu: z.string().min(2).max(2000).describe(iki("Ne arıyorsun: doğal dil ya da tanımlayıcı", "What you are looking for: plain language or an identifier")),
        sinir: z.number().int().min(1).max(30).optional().describe(iki("Sonuç sayısı (varsayılan 8)", "Number of results (default 8)")),
        yol: z.string().max(500).optional().describe(iki("Yalnız bu klasör ya da glob altında (ör. paketler/cekirdek ya da **/*.tsx)", "Only under this folder or glob (e.g. src/server or **/*.tsx)")),
      },
      (a) =>
        guvenli(async () => {
          const y = await sirket.kodZekasi.ara(ben().projeId, sirket.ajanAlani(ben()), a.sorgu, { sinir: a.sinir ?? 8, yol: a.yol });
          return metin(aramaMetni(y));
        }),
    ),
    tool(
      "sembol_bul",
      iki(
        "Tanım yerlerini bulur: fonksiyon, sınıf, metot, arayüz, tür, sabit, başlık… Tam ad ve önek eşleşmesi önce gelir; türü, dışa açıklığı ve imzayı gösterir.",
        "Finds definitions: functions, classes, methods, interfaces, types, constants, headings… Exact and prefix matches come first; shows the kind, whether it is exported and the signature.",
      ),
      {
        ad: z.string().min(1).max(200).describe(iki("Sembol adı ya da başı (ör. ajanaSor, Depo, hafiza)", "Symbol name or its beginning (e.g. handleRequest, Store, parse)")),
        tur: sembolTuruSemasi
          .optional()
          .describe(
            iki(
              "Yalnız bu tür",
              "Only this kind: fonksiyon (function), metod (method), sinif (class), arayuz (interface), tur (type), enum, sabit (constant), degisken (variable), yapi (struct), modul (module), baslik (heading), secici (selector), tablo (table)",
            ),
          ),
        sinir: z.number().int().min(1).max(50).optional(),
      },
      (a) =>
        guvenli(async () => {
          const alan = sirket.ajanAlani(ben());
          const liste = await sirket.kodZekasi.semboller(ben().projeId, alan, a.ad, { tur: a.tur, sinir: a.sinir ?? 15 });
          return metin(sembolMetni(a.ad, liste, sirket.kodZekasi.durum(ben().projeId, alan)));
        }),
    ),
    tool(
      "kod_haritasi",
      iki(
        "Deponun kısa haritası (~4000 karakter): klasörler, dosyalar (satır sayısıyla) ve en önemli sembolleri; çok kullanılan dosyalar önce. Projeyi ya da bir klasörü tanımak için ilk adım.",
        "A short map of the repository (~4000 characters): folders, files (with line counts) and their most important symbols; most-used files first. The first step to get to know the project or a folder.",
      ),
      { yol: z.string().max(500).optional().describe(iki("Yalnız bu klasör (ör. paketler/studyo/src)", "Only this folder (e.g. src/components)")) },
      (a) =>
        guvenli(async () => {
          const alan = sirket.ajanAlani(ben());
          const harita = await sirket.kodZekasi.haritaMetni(ben().projeId, alan, { yol: a.yol, sinir: 4000 });
          const not = durumNotu(sirket.kodZekasi.durum(ben().projeId, alan));
          return metin(not ? `${not}\n${harita}` : harita);
        }),
    ),
    tool(
      "bagimliliklar",
      iki("Bir dosyanın içe aktardıkları ve onu içe aktaran dosyalar. Bir değişikliğin kimi etkileyeceğini görmek için.", "What a file imports and which files import it. To see who a change will affect."),
      { dosya: z.string().min(1).max(500).describe(iki("Çalışma alanı köküne göre yol (ör. src/depo.ts)", "Path relative to the workspace root (e.g. src/store.ts)")) },
      (a) =>
        guvenli(async () => {
          const b = await sirket.kodZekasi.bagimliliklar(ben().projeId, sirket.ajanAlani(ben()), a.dosya);
          return metin(bagimlilikMetni(b));
        }),
    ),
    tool(
      "benzer_kod",
      iki(
        "Verilen satırı içeren koda en çok benzeyen yerleri bulur: tekrar eden kodu birleştirmeden ya da bir kalıbın diğer örneklerini düzeltmeden önce kullan.",
        "Finds the places most similar to the code containing the given line: use it before merging duplicated code or fixing other instances of a pattern.",
      ),
      {
        dosya: z.string().min(1).max(500).describe(iki("Çalışma alanı köküne göre yol", "Path relative to the workspace root")),
        satir: z.number().int().min(1).describe(iki("Bu satırı içeren kod parçası", "The code chunk containing this line")),
        sinir: z.number().int().min(1).max(20).optional(),
      },
      (a) =>
        guvenli(async () => {
          const y = await sirket.kodZekasi.benzer(ben().projeId, sirket.ajanAlani(ben()), a.dosya, a.satir, a.sinir ?? 6);
          return metin(aramaMetni(y, { baslik: iki(`${a.dosya}:${a.satir} koduna benzeyen ${y.sonuclar.length} yer`, `${y.sonuclar.length} places similar to ${a.dosya}:${a.satir}`) }));
        }),
    ),
    tool(
      "calisma_farki",
      iki("Bir çalışanın çalışma alanındaki değişiklikleri ana dala göre gösterir (git diff). İnceleme için.", "Shows the changes in an employee's workspace against the main branch (git diff). For review."),
      { ajan: z.string().describe(iki("Çalışan adı", "Employee name")), yol: z.string().optional().describe(iki("Yalnız bu dosya", "Only this file")) },
      (a) =>
        guvenli(async () => {
          if (!inceleyebilir()) return hata(iki("Bu aracı yöneticiler, kod inceleyici, test ve güvenlik rolleri kullanabilir.", "This tool is for managers and the code review, test and security roles."));
          const hedef = ajanBul(a.ajan);
          if (!hedef.calismaAlani) return hata(iki(`${hedef.ad} için çalışma alanı yok.`, `${hedef.ad} has no workspace.`));
          const f = await fark(hedef.calismaAlani, proje().varsayilanDal, a.yol);
          const ozet = f.sayilar.map((x) => `${x.yol} +${x.eklenen} -${x.silinen}`).join("\n") || iki("Değişiklik yok.", "No changes.");
          const govde = f.fark.length > 60_000 ? f.fark.slice(0, 60_000) + iki("\n… (kısaltıldı; dosya bazında yol ile isteyin)", "\n… (truncated; ask per file with yol)") : f.fark;
          return metin(iki(`Dal: ${hedef.dal} · temel: ${proje().varsayilanDal}\n\nDosyalar:\n${ozet}\n\n${govde}`, `Branch: ${hedef.dal} · base: ${proje().varsayilanDal}\n\nFiles:\n${ozet}\n\n${govde}`));
        }),
    ),
    tool(
      "calisma_dosyasi",
      iki("Bir çalışanın çalışma alanından dosya okur.", "Reads a file from an employee's workspace."),
      { ajan: z.string(), yol: z.string().describe(iki("Çalışma alanı köküne göre yol", "Path relative to the workspace root")) },
      (a) =>
        guvenli(() => {
          if (!inceleyebilir()) return hata(iki("Bu aracı yöneticiler, kod inceleyici, test ve güvenlik rolleri kullanabilir.", "This tool is for managers and the code review, test and security roles."));
          const hedef = ajanBul(a.ajan);
          if (!hedef.calismaAlani) return hata(iki(`${hedef.ad} için çalışma alanı yok.`, `${hedef.ad} has no workspace.`));
          const d = dosyaOku(hedef.calismaAlani, a.yol, null);
          return metin(d.icerik.length > 80_000 ? d.icerik.slice(0, 80_000) + iki("\n… (kısaltıldı)", "\n… (truncated)") : d.icerik);
        }),
    ),
    tool(
      "birlestirme_iste",
      iki(
        `Bir çalışanın dalını ana dala birleştirmek için kurul onayı ister. İnceleyen (CEO, CTO, kod inceleyici) için ajan alanına dalı birleştirilecek çalışanın adını yaz; boş bırakılırsa incelemedeki tek görevin sahibi seçilir.${testKomutu ? ` Onaylanınca kalite kapısında ${testKomutu} koşar, geçmezse birleşmez; önce aynı komutu kendi çalışma alanında koş.` : ""}`,
        `Asks the board to approve merging an employee's branch into the main branch. As a reviewer (CEO, CTO, code reviewer), put the name of the employee whose branch should be merged in ajan; if empty, the owner of the only task in review is picked.${testKomutu ? ` Once approved, the quality gate runs ${testKomutu} and the branch is not merged if it fails; run the same command in your working directory first.` : ""}`,
      ),
      {
        ozet: z.string().min(10).describe(iki("Neler değişti, testler", "What changed, tests")),
        ajan: z.string().optional().describe(iki("Dalı birleştirilecek çalışanın adı", "Name of the employee whose branch will be merged")),
      },
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
                  ? iki(
                      `Birden çok aday var; ajan alanına birini yaz: ${tekil.map((x) => `${x.ajan!.ad} (${x.g.kod})`).join(", ")}`,
                      `There are several candidates; put one of them in ajan: ${tekil.map((x) => `${x.ajan!.ad} (${x.g.kod})`).join(", ")}`,
                    )
                  : iki(
                      "Kendi çalışma dalın yok ve incelemede dalı olan görev yok; ajan alanına çalışan adını yaz.",
                      "You have no working branch and no task in review has a branch; put an employee's name in ajan.",
                    ),
              );
            }
            sahip = tekil[0]!.ajan!;
          }
          if (!sahip.dal) return hata(iki(`${sahip.ad} için çalışma dalı yok.`, `${sahip.ad} has no working branch.`));
          if (sahip.id !== ajanId && !yonetici() && rolBul(ben().rol)?.kimlik !== "inceleme")
            return hata(iki("Başkasının dalı için birleştirmeyi yalnız kod inceleyici ve yöneticiler isteyebilir.", "Only the code reviewer and managers can request a merge for someone else's branch."));
          const bekleyen = sirket.depo.onaylar(ben().projeId, "bekliyor").find((o) => o.tur === "birlestirme" && (o.veri as { dal?: string })?.dal === sahip.dal);
          if (bekleyen) return metin(iki(`${sahip.dal} için birleştirme isteği zaten kurulda bekliyor.`, `A merge request for ${sahip.dal} is already waiting for the board.`));
          if (sirket.birlestirmeKuyrugu.suruyorMu(ben().projeId, sahip.dal))
            return metin(iki(`${sahip.dal} onaylandı ve kalite kapısında (kuyrukta ya da testte); sonuç sana bildirilecek.`, `${sahip.dal} was approved and is at the quality gate (queued or testing); you will be told the result.`));
          const onay = sirket.teklifAc(ben(), "birlestirme", `${sahip.dal} → ${proje().varsayilanDal}`, a.ozet, { ajanId: sahip.id, dal: sahip.dal, ozet: a.ozet, isteyenId: ajanId });
          return metin(
            iki(
              `${sahip.ad} çalışanının ${sahip.dal} dalı için birleştirme kurul onayına sunuldu (onay ${onay.id.slice(0, 8)}). Sonuç sana bildirilecek.`,
              `The merge of ${sahip.ad}'s branch ${sahip.dal} went to the board for approval (approval ${onay.id.slice(0, 8)}). You will be told the result.`,
            ),
          );
        }),
    ),
    // ---------------- kendi zekâsı: kişisel hafıza, sözler, beceriler, geçmiş, aktarım ----------------
    tool(
      "kendime_not",
      iki(
        `Kişisel hafızana yazar (yalnız sana ait, kalıcı, ${KISISEL_SINIR} karakterle sınırlı). ekle: yeni madde; degistir: 'eski' parçasını içeren maddeyi 'metin' ile değiştirir; sil: 'eski' parçasını içeren maddeyi siler. Değişiklik bir sonraki oturumunda talimatına girer.`,
        `Writes to your personal memory (yours only, lasting, limited to ${KISISEL_SINIR} characters). ekle: add an entry; degistir: replace the entry containing 'eski' with 'metin'; sil: remove the entry containing 'eski'. Changes appear in your next session's instructions.`,
      ),
      {
        islem: z.enum(["ekle", "degistir", "sil"]),
        metin: z.string().max(600).optional().describe(iki("Yeni madde ya da yeni hâli", "The new entry or its new text")),
        eski: z.string().max(200).optional().describe(iki("Değiştirilecek ya da silinecek maddeden bir parça", "A fragment of the entry to replace or remove")),
      },
      (a) =>
        guvenli(() => {
          const s = sirket.zeka.kisiselYaz(ben(), a.islem, a.metin, a.eski);
          return metin(iki(`Kişisel hafızan: ${s.maddeler.length} madde, ${s.kullanim}/${KISISEL_SINIR} karakter.`, `Your personal memory: ${s.maddeler.length} entries, ${s.kullanim}/${KISISEL_SINIR} characters.`));
        }),
    ),
    tool(
      "soz_ver",
      iki(
        "Bir ekip arkadaşına ya da kurula verdiğin sözü kaydeder. Söz tutulana kadar her turda sana, söz verdiğin kişiye de hatırlatılır.",
        "Records a promise you made to a teammate or the board. It is shown to you every turn, and to the person you promised, until you keep it.",
      ),
      {
        metin: z.string().min(5).max(500).describe(iki("Ne yapacaksın", "What you will do")),
        kime: z.string().optional().describe(iki("Çalışanın adı; kurula söz verdiysen boş bırak ya da 'kurul' yaz", "The employee's name; leave empty or write 'kurul' for the board")),
        son_tarih: z.string().optional().describe(iki("İsteğe bağlı bitiş zamanı (ISO, ör. 2026-10-05T17:00)", "Optional deadline (ISO, e.g. 2026-10-05T17:00)")),
      },
      (a) =>
        guvenli(() => {
          const kime = a.kime?.trim();
          const alici = kime && !/^(kurul|board|yönetim kurulu)$/i.test(kime) ? ajanBul(kime) : null;
          const soz = sirket.zeka.sozVer(ben(), alici, a.metin, a.son_tarih ?? null);
          return metin(iki(`Söz kaydedildi (söz ${soz.id.slice(0, 8)}). Tutunca soz_tut ile kapat.`, `Promise recorded (promise ${soz.id.slice(0, 8)}). Close it with soz_tut when kept.`));
        }),
    ),
    tool(
      "soz_tut",
      iki("Verdiğin sözü kapatır: tutuldu ya da iptal (gerekçesiyle). Söz verdiğin kişiye haber verilir.", "Closes a promise you made: kept (tutuldu) or withdrawn (iptal, with a reason). The person you promised is told."),
      {
        soz_id: z.string().min(4).describe(iki("Söz kimliği ya da ilk 8 karakteri", "The promise id or its first 8 characters")),
        durum: z.enum(["tutuldu", "iptal"]).default("tutuldu"),
        not: z.string().max(500).optional(),
      },
      (a) =>
        guvenli(() => {
          const acik = sirket.depo.sozler(ben().projeId, { verenId: ajanId, durum: "acik" });
          const soz = acik.find((x) => x.id === a.soz_id || x.id.startsWith(a.soz_id));
          if (!soz) return hata(iki(`Açık sözlerin arasında ${a.soz_id} yok. Açık sözlerin: ${acik.map((x) => `${x.id.slice(0, 8)} ${kisalt(x.metin, 40)}`).join("; ") || "yok"}`, `No open promise ${a.soz_id}. Your open promises: ${acik.map((x) => `${x.id.slice(0, 8)} ${kisalt(x.metin, 40)}`).join("; ") || "none"}`));
          sirket.zeka.sozKapat(ben(), soz.id, a.durum, a.not ?? null);
          return metin(iki(`Söz kapandı (${a.durum}).`, `Promise closed (${a.durum}).`));
        }),
    ),
    tool(
      "beceri_listele",
      iki("Ekibin öğrendiği becerileri (yöntemleri) listeler.", "Lists the skills (methods) the team has learned."),
      {},
      () =>
        guvenli(() => {
          const l = sirket.zeka.beceriler(proje());
          return metin(l.length ? l.map((b) => `${b.ad} — ${b.aciklama} (${b.yazan}, ${b.kullanim}×)`).join("\n") : iki("Henüz beceri yok. Zor bir işi çözünce yöntemini beceri_yaz ile kaydet.", "No skills yet. When you solve something hard, save the method with beceri_yaz."));
        }),
    ),
    tool(
      "beceri_oku",
      iki("Bir becerinin tam metnini okur.", "Reads a skill in full."),
      { ad: z.string().min(1).max(80) },
      (a) =>
        guvenli(() => {
          const b = sirket.zeka.beceriOku(proje(), a.ad);
          return metin(`# ${b.ad}\n${b.aciklama}\n(${b.yazan}, ${b.guncelleme.slice(0, 10)})\n\n${b.icerik}`);
        }),
    ),
    tool(
      "beceri_yaz",
      iki(
        "Bu projede bir işin nasıl yapılacağını beceri olarak kaydeder ya da günceller (.arnorg/beceriler). İçerik: ne zaman kullanılır, adımlar, dikkat edilecekler, doğrulama. Yanlış çıkan beceriyi aynı adla düzelt.",
        "Saves or updates how to do something in this project as a skill (.arnorg/beceriler). Content: when to use it, steps, pitfalls, how to verify. Fix a skill that turns out wrong by writing it again under the same name.",
      ),
      {
        ad: z.string().min(1).max(80).describe(iki("Kısa ad, ör. veritabani-gocu", "Short name, e.g. database-migration")),
        aciklama: z.string().min(1).max(300).describe(iki("Ne zaman kullanılır (bir cümle)", "When to use it (one sentence)")),
        icerik: z.string().min(1).max(12_000),
      },
      (a) =>
        guvenli(() => {
          const b = sirket.zeka.beceriYaz(proje(), ben().ad, a.ad, a.aciklama, a.icerik);
          return metin(iki(`Beceri kaydedildi: ${b.ad}. Ekip bundan sonra talimatında görür.`, `Skill saved: ${b.ad}. The team will see it in their instructions.`));
        }),
    ),
    tool(
      "gecmiste_ara",
      iki(
        "Geçmiş konuşmalarda ve kanal mesajlarında arar: daha önce ne konuşuldu, ne yapıldı, hangi hata nasıl çözüldü. kapsam 'ben' kendi geçmişin, 'ekip' bütün ekibin geçmişi.",
        "Searches past conversations and channel messages: what was discussed, what was done, how an error was solved. kapsam 'ben' is your own history, 'ekip' the whole team's.",
      ),
      { sorgu: z.string().min(2).max(300), kapsam: z.enum(["ben", "ekip"]).default("ben"), sinir: z.number().int().min(1).max(20).default(8) },
      (a) => guvenli(() => metin(sirket.zeka.gecmisteAra(ben(), a.sorgu, a.kapsam, a.sinir))),
    ),
    tool(
      "hafiza_aktar",
      iki(
        "Bildiklerini bir ekip arkadaşına aktarır: kişisel hafızan ve defterin onun defterine devir bölümü olarak yazılır; istersen açık sözlerin de ona geçer. İşi birine bırakırken kullan.",
        "Transfers what you know to a teammate: your personal memory and journal are written into their journal as a handover section; optionally your open promises move to them. Use it when handing work over.",
      ),
      { kime: z.string().min(1), not: z.string().max(1000).optional(), sozler: z.boolean().default(false).describe(iki("Açık sözlerin de devredilsin mi", "Hand over your open promises too")) },
      (a) =>
        guvenli(() => {
          const alan = ajanBul(a.kime);
          const sonuc = sirket.zeka.aktar(ben(), alan, { sozler: a.sozler, not: a.not, defter: sirket.hafiza.defter(ben()), defterYaz: (x, icerik) => sirket.defterYaz(x.id, icerik) });
          return metin(sonuc);
        }),
    ),
    // ---------------- ana yasa ----------------
    tool(
      "anayasa_oku",
      iki("Projenin ana yasasını (kesin kurallar) okur.", "Reads the project's constitution (binding rules)."),
      {},
      () =>
        guvenli(() => {
          const a = sirket.anayasa(ben().projeId);
          if (!a.maddeler.length) return metin(iki("Ana yasa henüz yazılmadı.", "The constitution has not been written yet."));
          return metin(
            [iki(`Ana yasa · sürüm ${a.surum}`, `Constitution · version ${a.surum}`), ...a.maddeler.map((m) => `${m.no}. ${m.baslik}\n${m.metin}${m.kural ? `\n(${m.kural.hedef} · ${m.kural.karar} · ${m.kural.desenler.join(", ")})` : ""}`)].join("\n\n"),
          );
        }),
    ),
    tool(
      "anayasa_oner",
      iki(
        "Ana yasanın yeni hâlini kurul onayına sunar (yalnız yöneticiler). Bütün maddeleri ver: var olanları da koruyarak. Makineyle denetlenebilecek maddeye kural ekle (hedef: komut, yol, url ya da arac; desenler: düzenli ifadeler; karar: ret ya da sor).",
        "Submits the new version of the constitution for the board's approval (managers only). Give all articles, keeping existing ones. Add a rule to articles a machine can check (hedef: komut, yol, url or arac; desenler: regular expressions; karar: ret or sor).",
      ),
      {
        maddeler: z
          .array(
            z.object({
              baslik: z.string().min(1).max(120),
              metin: z.string().min(1).max(2000),
              kural: z.object({ hedef: z.enum(["komut", "yol", "url", "arac"]), desenler: z.array(z.string().min(1)).min(1).max(20), karar: z.enum(["ret", "sor"]) }).optional(),
            }),
          )
          .min(1)
          .max(40),
        gerekce: z.string().min(5).max(2000),
      },
      (a) =>
        guvenli(() => {
          if (!yonetici()) return hata(iki("Ana yasayı yalnız yöneticiler önerebilir; önerini yöneticine ilet.", "Only managers can propose the constitution; pass your suggestion to your manager."));
          const maddeler = maddeleriDenetle(a.maddeler.map((m) => ({ ...m, kural: m.kural ?? null })));
          const bekleyen = sirket.depo.onaylar(ben().projeId, "bekliyor").find((o) => o.tur === "anayasa");
          if (bekleyen) return hata(iki("Kurulda bekleyen bir ana yasa önerisi zaten var; sonucunu bekle.", "A constitution proposal is already waiting for the board; wait for the decision."));
          const ayrinti = [a.gerekce, "", ...maddeler.map((m) => `${m.no}. ${m.baslik} — ${m.metin}${m.kural ? ` [${m.kural.hedef}: ${m.kural.desenler.join(", ")} → ${m.kural.karar}]` : ""}`)].join("\n");
          const onay = sirket.teklifAc(ben(), "anayasa", iki(`Ana yasa önerisi · ${maddeler.length} madde`, `Constitution proposal · ${maddeler.length} articles`), ayrinti, { maddeler, gerekce: a.gerekce });
          return metin(iki(`Ana yasa önerisi kurula sunuldu (onay ${onay.id.slice(0, 8)}). Sonuç sana bildirilecek.`, `The constitution proposal went to the board (approval ${onay.id.slice(0, 8)}). You will be told the result.`));
        }),
    ),
    // ---------------- global zekâ ----------------
    tool(
      "kuresel_kural_oner",
      iki(
        "Bütün projelere yarayacak bir standart kural önerir (projeye özgü olmamalı). Benzer kural varsa kanıt olarak eklenir ve güçlenir; yeni kural aday olarak başlar, başka projelerde de görülünce standart olur.",
        "Proposes a standard rule useful to every project (not project-specific). If a similar rule exists it is added as evidence and strengthened; a new rule starts as a candidate and becomes a standard when seen in other projects too.",
      ),
      {
        metin: z.string().min(8).max(600),
        kapsam: z.array(z.string().max(20)).max(8).optional().describe(iki("Kimlere: boş = herkes; yonetici, gelistirici ya da rol kimlikleri (backend, frontend…)", "Who: empty = everyone; yonetici, gelistirici or role ids (backend, frontend…)")),
        gerekce: z.string().min(5).max(1000),
      },
      (a) =>
        guvenli(async () => {
          // Öneri de damıtılır: genelleştirilir ya da projeye özgüyse elenir
          const k = await sirket.kuresel.gozlemDamit({ metin: a.metin, kaynak: "ajan", projeId: ben().projeId, projeAd: proje().ad, kapsam: a.kapsam });
          if (!k) return hata(iki("Bu kural projeye özgü görünüyor; proje hafızasına hafiza_kaydet ile yaz.", "This rule looks project-specific; save it to project memory with hafiza_kaydet."));
          return metin(
            iki(
              `Global zekâya işlendi: ${k.durum === "etkin" ? "standart" : "aday"}, güven %${Math.round(k.guven * 100)}. Kural: ${k.metin}`,
              `Recorded in global intelligence: ${k.durum === "etkin" ? "standard" : "candidate"}, confidence ${Math.round(k.guven * 100)}%. Rule: ${k.metin}`,
            ),
          );
        }),
    ),
    tool(
      "kuresel_kural_degerlendir",
      iki("Bir standart kural için geri bildirim verir: ise_yaradi (güçlenir) ya da yanlis (zayıflar, yeterince zayıflarsa emekliye ayrılır).", "Gives feedback on a standard rule: ise_yaradi (strengthens it) or yanlis (weakens it; retired when weak enough)."),
      { kural_id: z.string().min(4).describe(iki("Talimattaki köşeli parantez içindeki kimlik", "The id in square brackets in your instructions")), sonuc: z.enum(["ise_yaradi", "yanlis"]), not: z.string().max(500).optional() },
      (a) =>
        guvenli(() => {
          const k = sirket.kuresel.geriBildirim(a.kural_id, a.sonuc, a.not ?? null, ben().ad);
          return metin(iki(`Kaydedildi: güven %${Math.round(k.guven * 100)}, durum ${k.durum}.`, `Recorded: confidence ${Math.round(k.guven * 100)}%, status ${k.durum}.`));
        }),
    ),
    // ---------------- kurul: bildirim, teslim, ekip ----------------
    tool(
      "kurula_bildir",
      iki(
        "Kurula önemli bir şey bildirir (yalnız yöneticiler): öneri, istek, yetki ihtiyacı, bilgi ya da uyarı. Kurul hangi ekranda olursa olsun açılır pencereyle görür; #yonetim kanalına da yazılır. Karar gerekiyorsa kurula_sor kullan.",
        "Notifies the board about something important (managers only): a suggestion, a request, a need for permission, information or a warning. The board sees it as a popup on any screen; it is also posted to #ceo. If a decision is needed, use kurula_sor.",
      ),
      { tur: z.enum(["oneri", "istek", "yetki", "bilgi", "uyari"]), baslik: z.string().min(3).max(160), metin: z.string().min(3).max(4000) },
      (a) =>
        guvenli(() => {
          if (!yonetici()) return hata(iki("Kurula doğrudan bildirimi yöneticiler yapar; yöneticine ilet.", "Managers notify the board directly; tell your manager."));
          sirket.kurulaBildir(ben(), ben().projeId, a.tur, a.baslik, a.metin);
          return metin(iki("Kurula bildirildi.", "The board has been notified."));
        }),
    ),
    tool(
      "teslim_et",
      iki(
        "Kurulun deneyebileceği bir sonucu teslim eder (yalnız yöneticiler): ne bitti, nasıl test edilir, çalıştırma komutu ya da adres. Kurul dener, kabul eder ya da geri bildirim verir; geri bildirim sana iş olarak döner.",
        "Delivers a result the board can try (managers only): what is done, how to test it, a run command or address. The board tries it and accepts or gives feedback; feedback comes back to you as work.",
      ),
      {
        baslik: z.string().min(3).max(160),
        ozet: z.string().min(10).max(4000).describe(iki("Ne bitti, neler değişti", "What is done, what changed")),
        test_adimlari: z.array(z.string().min(2).max(500)).min(1).max(20),
        calistir: z.string().max(500).optional().describe(iki("Ana repoda çalıştırılacak komut, ör. npm install && npm run dev", "A command to run in the main repo, e.g. npm install && npm run dev")),
        adres: z.string().max(500).optional().describe(iki("Açılacak adres, ör. http://localhost:5173", "An address to open, e.g. http://localhost:5173")),
      },
      (a) =>
        guvenli(() => {
          if (!yonetici()) return hata(iki("Teslimi yöneticiler yapar; işin bittiğini yöneticine bildir.", "Managers make deliveries; tell your manager the work is done."));
          if (a.adres && !/^https?:\/\//i.test(a.adres)) return hata(iki("Adres http:// ya da https:// ile başlamalı.", "The address must start with http:// or https://."));
          const ayrinti = [a.ozet, "", iki("Test adımları:", "Test steps:"), ...a.test_adimlari.map((x, i) => `${i + 1}. ${x}`), a.calistir ? `\n${iki("Çalıştır", "Run")}: ${a.calistir}` : "", a.adres ? `${iki("Adres", "Address")}: ${a.adres}` : ""].filter(Boolean).join("\n");
          const onay = sirket.teklifAc(ben(), "teslim", iki(`Teslim: ${a.baslik}`, `Delivery: ${a.baslik}`), ayrinti, { baslik: a.baslik, ozet: a.ozet, testAdimlari: a.test_adimlari, calistir: a.calistir ?? null, adres: a.adres ?? null, dal: proje().varsayilanDal });
          sirket.duyur(ben().projeId, iki(`Teslim hazır: ${a.baslik}. Kurul test edip geri bildirim verecek.`, `Delivery ready: ${a.baslik}. The board will test it and give feedback.`));
          return metin(iki(`Teslim kurula sunuldu (onay ${onay.id.slice(0, 8)}). Kurul test edince sonucu sana bildirilecek.`, `The delivery went to the board (approval ${onay.id.slice(0, 8)}). You will be told once the board has tested it.`));
        }),
    ),
    tool(
      "isten_cikar_teklif",
      iki(
        "Artık gerek kalmayan bir çalışan için kurula gerekçeli işten çıkarma teklifi verir (yalnız yöneticiler). Onaylanırsa açık işleri ve bildikleri devralana (verilmezse yöneticisine) geçer.",
        "Proposes letting go of an employee who is no longer needed, with reasons (managers only). If approved, their open work and knowledge go to the successor (or their manager).",
      ),
      { ad: z.string().min(1), gerekce: z.string().min(10).max(2000), devralan: z.string().optional().describe(iki("İşleri devralacak çalışan", "Who takes over the work")) },
      (a) =>
        guvenli(() => {
          if (!yonetici()) return hata(iki("İşten çıkarma teklifini yalnız yöneticiler verebilir.", "Only managers can propose a dismissal."));
          const hedef = ajanBul(a.ad);
          if (hedef.rol === "ceo") return hata(iki("CEO işten çıkarılamaz.", "The CEO cannot be dismissed."));
          if (hedef.id === ajanId) return hata(iki("Kendin için teklif veremezsin.", "You cannot propose your own dismissal."));
          const devralan = a.devralan ? ajanBul(a.devralan) : null;
          if (devralan?.id === hedef.id) return hata(iki("Devralan, çıkarılan kişi olamaz.", "The successor cannot be the person being let go."));
          const bekleyen = sirket.depo.onaylar(ben().projeId, "bekliyor").find((o) => o.tur === "isten_cikarma" && (o.veri as { ajanId?: string })?.ajanId === hedef.id);
          if (bekleyen) return metin(iki(`${hedef.ad} için teklif zaten kurulda bekliyor.`, `A proposal for ${hedef.ad} is already waiting for the board.`));
          const acikIs = sirket.depo.gorevler(ben().projeId).filter((g) => g.atananId === hedef.id && g.durum !== "tamam" && g.durum !== "iptal").length;
          sirket.teklifAc(
            ben(),
            "isten_cikarma",
            iki(`İşten çıkarma: ${hedef.ad} · ${hedef.rolAdi}`, `Dismissal: ${hedef.ad} · ${hedef.rolAdi}`),
            `${a.gerekce}\n\n${iki("Açık iş", "Open tasks")}: ${acikIs} · ${iki("Devralan", "Successor")}: ${devralan?.ad ?? iki("yöneticisi", "their manager")}`,
            { ajanId: hedef.id, ad: hedef.ad, devralanId: devralan?.id ?? null, gerekce: a.gerekce },
          );
          return metin(iki(`Teklif kurula sunuldu: ${hedef.ad}. Karar verilince haber verilecek.`, `The proposal went to the board: ${hedef.ad}. You will be told the decision.`));
        }),
    ),
    tool(
      "hazirlik_tamam",
      iki("Kurulla hazırlık görüşmesi bitince özetini yazar (CEO).", "Writes the summary when the kickoff conversation with the board is done (CEO)."),
      { ozet: z.string().min(10).max(3000).describe(iki("Amaç, alınan kararlar, ana yasa, ekip ve ilk plan", "Goal, decisions, constitution, team and first plan")) },
      (a) =>
        guvenli(() => {
          if (rolBul(ben().rol)?.kimlik !== "ceo") return hata(iki("Hazırlığı CEO tamamlar.", "The CEO completes the kickoff."));
          sirket.hazirlikBitir(ben().projeId, a.ozet, ben());
          return metin(iki("Hazırlık tamamlandı olarak işaretlendi.", "The kickoff was marked complete."));
        }),
    ),
  ];

  return araclar.map(onarimli);
}
