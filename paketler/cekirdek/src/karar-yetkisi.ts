// Karar yetkisi (0.0.7): projede onaylara CEO (tam otonom, varsayılan) ya da kurul karar verir. Yönlendirme ve kararın
// kendisi sirket.ts'te; burada kipten bağımsız metinler durur: kararı verenin etiketi, sonuç mesajlarındaki özne ve not,
// CEO'ya giden onay mesajı ve talimatın karar yetkisi bölümü.
import { AD_HARITALARI_EN, GOREV_TAVANI_ALT_TURU, ONAY_TURU_ADLARI, type Ajan, type Dil, type KararKaynagi, type KararVeren, type Onay, type OnayTuru } from "@arnorg/ortak";
import { iki } from "./dil.js";
import { rolAdiDilde } from "./roller.js";
import { ilgi, kisalt, yonelme } from "./yardimci.js";

/** Onayı karara bağlayan: kaynak ve görünen ad (CEO'da ajanın adı) */
export interface KararSahibi {
  kaynak: KararKaynagi;
  ad?: string;
}

/** Stüdyo'dan (POST /api/onaylar/:oid) gelen karar */
export const KURUL_KARARI: KararSahibi = { kaynak: "kurul" };

export function ceoKarari(ceo: Pick<Ajan, "ad">): KararSahibi {
  return { kaynak: "ceo", ad: ceo.ad };
}

/** Onay kimliğinin ajanlara gösterilen kısa hâli (onay_karari bununla da bulur) */
export function kisaKimlik(id: string): string {
  return id.slice(0, 8);
}

export function onayTuruAdi(tur: OnayTuru): string {
  return iki(ONAY_TURU_ADLARI[tur], AD_HARITALARI_EN.onayTuru[tur]);
}

/** Kararı verenin görünen etiketi (denetim kaydı, ana yasa onaylayanı): "Yönetim kurulu", "Otomatik onay", "Ada (CEO)" */
export function kararSahibiEtiketi(kaynak: KararKaynagi | null | undefined, ad?: string | null): string {
  if (kaynak === "ceo") return ad ? `${ad} (CEO)` : "CEO";
  if (kaynak === "otomatik") return iki("Otomatik onay", "Auto-approval");
  return iki("Yönetim kurulu", "The board");
}

/** Kararı veren, izin cümlesinin başında: "Yönetim kurulu", "CEO Ada" ("The board", "CEO Ada") */
export function kararVerenAdi(kaynak: KararKaynagi | null | undefined, ad?: string | null): string {
  if (kaynak === "ceo") return ad ? `CEO ${ad}` : "CEO";
  if (kaynak === "otomatik") return iki("Otomatik onay", "Auto-approval");
  return iki("Yönetim kurulu", "The board");
}

/** Kararı veren, cümle öznesi olarak: "Kurul", "CEO Ada" ("The board", "CEO Ada"); otomatik onay kurulun kararı sayılır */
export function kararOznesi(kaynak: KararKaynagi | null | undefined, ad?: string | null): string {
  if (kaynak === "ceo") return ad ? `CEO ${ad}` : "CEO";
  return iki("Kurul", "The board");
}

/** Sonuç mesajına eklenen not cümlesi (başında boşluk); otomatik onayın kendi notu yazılmaz */
export function notCumlesi(sahip: KararSahibi, not: string | null): string {
  if (!not || sahip.kaynak === "otomatik") return "";
  if (sahip.kaynak === "ceo") return sahip.ad ? iki(` CEO ${ilgi(sahip.ad)} notu: ${not}`, ` CEO ${sahip.ad}'s note: ${not}`) : iki(` CEO'nun notu: ${not}`, ` The CEO's note: ${not}`);
  return iki(` Kurulun notu: ${not}`, ` The board's note: ${not}`);
}

/** Onayı kendi kararıyla açan CEO'nun notu: kararı veren CEO'dur, gerekçe teklifin içindedir */
export function ceoKendiNotu(): string {
  return iki("CEO kararı (tam otonom)", "CEO decision (fully autonomous)");
}

function isteyenMetni(isteyen: Ajan | null): string {
  return isteyen ? `${isteyen.ad} (${rolAdiDilde(isteyen)})` : "ArnOrg";
}

/** Türe göre CEO'ya karar rehberi */
function rehber(onay: Onay, ajanAdi: (id: string) => string | null): string {
  switch (onay.tur) {
    case "birlestirme": {
      // 0.0.7'den kalan istek: 0.0.8'de birleştirme yok, iş ortak projede görev kaydıyla girer
      const v = onay.veri as { ajanId?: string } | null;
      const sahip = v?.ajanId ? ajanAdi(v.ajanId) : null;
      return iki(
        `Bu 0.0.7'den kalan bir birleştirme isteği; artık birleştirme yok. Reddet ve ${sahip ? yonelme(sahip) : "isteyene"} işini ortak projede görevini 'inceleme'ye alarak kaydetmesini söyle.`,
        `This is a merge request left over from 0.0.7; there are no merges any more. Reject it and tell ${sahip ?? "the requester"} to save the work in the shared project by moving the task to 'inceleme'.`,
      );
    }
    case "arac":
      return iki(
        "Komutun ne yaptığını ve ana yasaya uyup uymadığını tart; geri alınamaz ya da dışa etkili bir işse (yayın, dağıtım, sistem paketi, silme) gerekçeni ona göre yaz. Çalışma dalını uzak depoya ArnOrg kendisi gönderir; ortak projede çalışanın git push'u zaten reddedilir. Çalışan kararını bekliyor; süre dolarsa reddedilmiş sayılır.",
        "Judge what the command does and whether it respects the constitution; if it is irreversible or affects the outside world (publishing, deploying, system packages, deleting), write your reasoning accordingly. ArnOrg pushes the working branch to the remote itself; an employee's git push is denied in the shared project anyway. The employee is waiting for your decision; if time runs out it counts as rejected.",
      );
    case "genel":
      return (onay.veri as { altTur?: unknown } | null)?.altTur === GOREV_TAVANI_ALT_TURU
        ? iki(
            "Görev token tavanını aştı: iş bu harcamaya değiyorsa onayla (tavan bir kat artar); değmiyorsa reddet ve görevi böl ya da yeniden planla.",
            "The task went over its token ceiling: approve if the work is worth it (the ceiling goes up one step); otherwise reject and split or re-plan the task.",
          )
        : iki(
            "Bu bir soru: gerekce metni soran çalışana yanıt olarak gider. Yalnız insanın verebileceği bir şey gerekiyorsa (giriş bilgisi, ödeme, dış hesap) önce kurula_sor ile kurula sor, yanıtı sonra gerekce olarak ilet.",
            "This is a question: your gerekce text goes back to the employee as the answer. If it needs something only a human can provide (credentials, payment, an external account), ask the board with kurula_sor first, then pass the answer on as gerekce.",
          );
    case "ise_alim":
      return iki("Ekip bu role gerçekten ihtiyaç duyuyor mu, iş var olan ekiple yapılabilir mi tart.", "Judge whether the team really needs this role or whether the existing team can do the work.");
    case "isten_cikarma":
      return iki("Açık işleri ve devralanı tart; onaylarsan çalışan ayrılır, işleri ve bildikleri devredilir.", "Weigh the open work and the successor; if you approve, the employee leaves and their work and knowledge are handed over.");
    case "anayasa":
      return iki("Maddeleri oku; onaylarsan herkes için kesin kural olur.", "Read the articles; if you approve, they become binding rules for everyone.");
    case "teslim":
      return iki(
        "Sonucu değerlendir; kabul edersen kurula sonuç olarak iletilir, reddedersen gerekçen teslim edene iş olarak döner.",
        "Assess the result; if you accept, it goes to the board as a result; if you reject, your reasoning goes back to whoever delivered it as work.",
      );
  }
}

/** Başkasının açtığı onay CEO'ya yönelince giden mesaj: kimlik, tür, isteyen, başlık, kısaltılmış ayrıntı ve rehber */
export function ceoOnayMesaji(onay: Onay, isteyen: Ajan | null, ajanAdi: (id: string) => string | null): string {
  const kimlik = kisaKimlik(onay.id);
  const ayrinti = kisalt(onay.ayrinti.trim(), 1500);
  const satirlar = [
    iki(`Kararını bekleyen onay ${kimlik} · ${onayTuruAdi(onay.tur)}`, `Approval ${kimlik} is waiting for your decision · ${onayTuruAdi(onay.tur)}`),
    `${iki("İsteyen", "Requested by")}: ${isteyenMetni(isteyen)}`,
    `${iki("Başlık", "Title")}: ${onay.baslik}`,
  ];
  if (ayrinti) satirlar.push(`${iki("Ayrıntı", "Details")}:\n${ayrinti}`);
  satirlar.push(
    "",
    iki(
      `Karar yetkisi sende. mcp__arnorg__onay_karari ile karar ver: onay "${kimlik}", karar "onayla" ya da "reddet", gerekce (kısa ve somut; isteyene iletilir). ${rehber(onay, ajanAdi)}`,
      `You have the decision authority. Decide with mcp__arnorg__onay_karari: onay "${kimlik}", karar "onayla" or "reddet", gerekce (short and concrete; it is passed on to the requester). ${rehber(onay, ajanAdi)}`,
    ),
  );
  return satirlar.join("\n");
}

/** Bekleyen onayların topluca CEO'ya giden listesi: karar yetkisi CEO'ya geçince ya da (hatirlatma) CEO boşa çıkınca */
export function ceoOnayListesi(onaylar: Onay[], isteyenBul: (id: string | null) => Ajan | null, hatirlatma = false): string {
  const satirlar = onaylar.map((o) => {
    const ayrinti = kisalt(o.ayrinti.replace(/\s+/g, " ").trim(), 300);
    return `- ${kisaKimlik(o.id)} · ${onayTuruAdi(o.tur)} · ${isteyenMetni(isteyenBul(o.ajanId))} · ${o.baslik}${ayrinti ? `\n  ${ayrinti}` : ""}`;
  });
  const n = onaylar.length;
  return [
    hatirlatma
      ? iki(`Kararını bekleyen ${n} onay var; isteyenler bekliyor:`, `${n === 1 ? "1 approval is" : `${n} approvals are`} still waiting for your decision; the requesters are waiting:`)
      : iki(`Bekleyen ${n} onay artık senin kararını bekliyor:`, `${n === 1 ? "1 pending approval is" : `${n} pending approvals are`} now waiting for your decision:`),
    ...satirlar,
    "",
    iki(
      "Her birine mcp__arnorg__onay_karari ile karar ver ve gerekçesini yaz. Ayrıntıyı bekleyen_onaylar ile görebilirsin.",
      "Decide each one with mcp__arnorg__onay_karari and write your reasoning. You can see them again with bekleyen_onaylar.",
    ),
  ].join("\n");
}

/** Kip değişince CEO'ya giden mesaj: yetkisi ve sınırları */
export function kipMesaji(kip: KararVeren): string {
  return kip === "ceo"
    ? iki(
        "Kurul karar yetkisini sana bıraktı: şirket artık tam otonom. Çalışanların onay istekleri (araç izni, işe alım, soru) sana mesaj olarak gelecek; onay_karari ile gerekçeli karar ver. Kendi tekliflerin (işe alım, işten çıkarma, ana yasa) hemen geçerli olur; teslimlerin kurula sonuç olarak gider, kabul bekleme. Aynı anda kaç çalışanın çalışacağını ekip_temposu ile sen belirlersin. Kurula yalnız insanın yapabileceği şeyler için kurula_sor ile sor (giriş bilgisi, ödeme, dış hesap, geri alınamaz dış etkiler). Ana yasa ve kayıtların kalite denetimi yine geçerli.",
        "The board has handed decision authority to you: the company is now fully autonomous. Employees' approval requests (tool permissions, hires, questions) will come to you as messages; decide them with reasons using onay_karari. Your own proposals (hire, dismissal, constitution) take effect immediately; your deliveries go to the board as results, so don't wait for acceptance. You decide how many employees work at once with ekip_temposu. Ask the board with kurula_sor only for what only a human can do (credentials, payments, external accounts, irreversible external effects). The constitution and the quality checks of saves still apply.",
      )
    : iki(
        "Kurul karar yetkisini geri aldı: tekliflerin ve çalışanların onay istekleri artık kurulun kararına gider; onay_karari kullanılamaz. Teklifini gerekçesiyle ver ve sonucu bekle.",
        "The board has taken decision authority back: your proposals and the employees' approval requests now go to the board for a decision; onay_karari can no longer be used. Make proposals with reasons and wait for the decision.",
      );
}

/** Talimatın karar yetkisi bölümü (oturum başındaki kipe göre); boş dizi bölüm yok demektir */
export function kararYetkisiTalimati(b: { kip: KararVeren; ceo: boolean; yonetici: boolean; ceoAdi: string | null }, dil: Dil): string[] {
  const en = dil === "en";
  if (b.ceo) {
    if (b.kip === "kurul") {
      return en
        ? [
            "## Decision authority: the board",
            "- Hiring, dismissals, the constitution and deliveries go to the board for approval; tool permissions are asked of the board too. Make each proposal with its reasons and wait for the decision.",
          ]
        : [
            "## Karar yetkisi: kurulda",
            "- İşe alım, işten çıkarma, ana yasa ve teslim kurulun onayına gider; araç izinleri de kurula sorulur. Her teklifi gerekçesiyle ver ve sonucu bekle.",
          ];
    }
    return en
      ? [
          "## Decision authority: yours (fully autonomous)",
          "- The board has left decisions to you: permissions, hires, the team pace and the other approvals go through you; the board sees the results.",
          "- Employees' approval requests (tool permissions, hires, questions, token ceilings) come to you as messages. Decide with mcp__arnorg__onay_karari and write your reasons; list what is waiting with bekleyen_onaylar. For a tool permission judge what the command does and whether it respects the constitution; for a question your gerekce is the answer sent back to the asker.",
          "- Your own proposals (ise_al_teklif, isten_cikar_teklif, anayasa_oner) take effect immediately: be careful and still give your reasons.",
          "- What you deliver with teslim_et goes to the board as a result: don't wait for acceptance, move on to the next goal. Board feedback comes back to you as work through the CEO chat.",
          "- Bother the board (kurula_sor) only for what only a human can do: credentials or logins, payments, external accounts, legal or irreversible external effects such as deleting production data.",
          "- The constitution and the quality checks still apply: work the policy denies stays denied, and a task whose save fails the tests goes back to its owner.",
        ]
      : [
          "## Karar yetkisi: sende (tam otonom)",
          "- Kurul kararları sana bıraktı: izinler, işe alımlar, ekip temposu ve öteki onaylar senden geçer; kurul sonuçları görür.",
          "- Çalışanların onay istekleri (araç izni, işe alım, soru, token tavanı) sana mesaj olarak gelir. mcp__arnorg__onay_karari ile karar ver ve gerekçeni yaz; bekleyenleri bekleyen_onaylar ile gör. Araç izninde komutun ne yaptığını ve ana yasaya uyup uymadığını tart; soruda gerekce metni soran çalışana yanıt olarak gider.",
          "- Kendi tekliflerin (ise_al_teklif, isten_cikar_teklif, anayasa_oner) hemen geçerli olur: dikkatli ol, gerekçeni yine yaz.",
          "- teslim_et ile sunduğun iş kurula sonuç olarak gider: kabul bekleme, sıradaki hedefe geç. Kurulun geri bildirimi CEO sohbetinden sana iş olarak gelir.",
          "- Kurulu yalnız insanın yapabileceği şeyler için rahatsız et (kurula_sor): giriş bilgisi ya da oturum açma, ödeme, dış hesaplar, hukuki ya da geri alınamaz dış etkiler (canlı veriyi silmek gibi).",
          "- Ana yasa ve kalite denetimi yine geçerli: politikanın reddettiği iş reddedilir, kaydı testten geçmeyen görev sahibine döner.",
        ];
  }
  if (b.kip === "kurul") return [];
  const ceo = b.ceoAdi ? `${b.ceoAdi} (CEO)` : "CEO";
  return en
    ? [
        "## Decision authority: the CEO (fully autonomous)",
        `- Requests that need approval (tool permissions, kurula_sor questions${b.yonetici ? ", hiring and dismissal proposals" : ""}) go to ${ceo}, who decides with reasons; they do not go to the board directly. The tool result tells you where your request went.`,
      ]
    : [
        "## Karar yetkisi: CEO'da (tam otonom)",
        `- Onay gerektiren isteklerin (araç izni, kurula_sor soruları${b.yonetici ? ", işe alım ve işten çıkarma teklifleri" : ""}) ${b.ceoAdi ? `CEO ${yonelme(b.ceoAdi)}` : "CEO'ya"} gider; CEO gerekçesiyle karar verir, kurula doğrudan gitmez. İsteğinin nereye gittiğini aracın sonucu söyler.`,
      ];
}
