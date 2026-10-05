// Seçenekli sorular (0.0.8). Ajan kurula seçenek sunarken secenekli_sor ile sorar: soru seçenekleriyle kurulun
// bulunduğu kanala yazılır (CEO için #yonetim; ötekiler için yanıt yazdığı kurul kanalı ya da #genel). Mesajın metni düz
// metin yedeğidir (soru ve numaralı seçenekler; kanal_oku ve uyandırma metinleri bunu okur), seçenekler mesajın secim
// alanındadır. Kurul seçip gönderince (POST /api/mesajlar/:mid/secim) soru kilitlenir (mesaj.guncellendi) ve seçim soran
// ajana kurul mesajı olarak yazılır: "Kurulun seçimi: 1) …; 3) … · Not: …". Mesaj her kurul mesajı gibi yönlenir:
// #yonetim'de CEO'ya gider, öteki kanallarda soran @Ad ile anılır; ajan bu mesajla uyanır.
// Ajanın #yonetim'e düz metinle yazdığı numaralı liste ve soru (metindekiSecenekler) aynı uçla yanıtlanır: seçenekler
// listeden çıkar, çoklu seçimlidir, yanıt mesaja kaynak "metin" olarak yazılır.
// Araç: araclar.ts · uç: uclar.ts · sözleşme: docs/API.md "Seçenekli sorular"
import {
  ARNORG_GONDEREN,
  KURUL,
  SECENEK_SINIRLARI,
  kanalGorunenAdi,
  kanalKimligi,
  metindekiSecenekler,
  type Ajan,
  type Dil,
  type Mesaj,
  type MesajSecimi,
  type SecimYanitIstegi,
  type SecimYanitSonucu,
  type SoruSecenegi,
} from "@arnorg/ortak";
import { iki } from "../dil.js";
import { rolBul } from "../roller.js";
import type { Sirket } from "../sirket.js";
import { ArnorgHatasi, bulunamadi, emojiAyikla, simdi } from "../yardimci.js";

/** secenekli_sor girdisi (araç şemasından geçmiş) */
export interface SecenekliSoru {
  soru: string;
  secenekler: { metin: string; aciklama?: string | null }[];
  /** Varsayılan false */
  coklu?: boolean;
  /** Varsayılan true */
  serbestYanit?: boolean;
  kanal?: string;
}

const tekSatir = (m: string) => emojiAyikla(m).replace(/\s+/g, " ").trim();

/** Kurulun bulunduğu kanal: #yonetim, #genel ve kurulun kurduğu kanallar */
export function kurulKanaliMi(sirket: Sirket, projeId: string, kanal: string): boolean {
  return kanal === "yonetim" || kanal === "genel" || Boolean(sirket.depo.kanal(projeId, kanal)?.ozel);
}

/**
 * Sorunun yazılacağı kanal. Verilen kanal kurulun bulunduğu bir kanal olmalı (#yonetim yalnız CEO'nun). Verilmezse:
 * CEO kurulun kanalında yanıt yazıyorsa orası, değilse #yonetim; ötekiler yanıt yazdığı kurul kanalı, değilse #genel.
 */
export function soruKanali(sirket: Sirket, ajan: Ajan, istenen?: string): string {
  const ceo = rolBul(ajan.rol)?.kimlik === "ceo";
  if (istenen?.trim()) {
    const k = kanalKimligi(istenen);
    if (k === "yonetim" && !ceo) {
      throw new ArnorgHatasi(
        iki(
          "#yonetim kanalı kurul ile CEO arasındadır; kurula seçenekli soruyu kurulun kanalında ya da #genel'de sor.",
          "#ceo is between the board and the CEO; ask the board in its own channel or in #general.",
        ),
      );
    }
    if (!/^[\p{L}\p{N}_-]{1,40}$/u.test(k) || !kurulKanaliMi(sirket, ajan.projeId, k)) {
      throw new ArnorgHatasi(
        iki(
          "Seçenekli soru yalnız kurulun bulunduğu kanallara sorulur: #yonetim (CEO), #genel ve kurulun kanalları. Ekipten görüş için ajana_sor ya da toplanti_yap kullan.",
          "Multiple-choice questions only go to channels the board is in: #ceo (the CEO), #general and the board's channels. For the team's views use ajana_sor or toplanti_yap.",
        ),
      );
    }
    return k;
  }
  const yazdigi = sirket.yazdigiKanal(ajan.id);
  const kurulun = yazdigi && yazdigi !== "yonetim" && yazdigi !== "genel" && kurulKanaliMi(sirket, ajan.projeId, yazdigi) ? yazdigi : null;
  if (ceo) return kurulun ?? "yonetim";
  return kurulun ?? "genel";
}

/** Seçenekler: tek satır, baştaki numara ya da madde işareti atılır, aynı metin bir kez sayılır */
export function secenekleriHazirla(ham: SecenekliSoru["secenekler"]): SoruSecenegi[] {
  const goruldu = new Set<string>();
  const liste: SoruSecenegi[] = [];
  for (const s of ham) {
    const metin = tekSatir(s.metin)
      .replace(/^(?:[-*•]\s+|\(?\d{1,2}\s*[.)\-–]\s+)/u, "")
      .trim();
    const anahtar = metin.toLocaleLowerCase("tr");
    if (!metin || goruldu.has(anahtar)) continue;
    goruldu.add(anahtar);
    const aciklama = s.aciklama ? tekSatir(s.aciklama) : "";
    liste.push({ metin: metin.slice(0, SECENEK_SINIRLARI.metin), aciklama: aciklama ? aciklama.slice(0, SECENEK_SINIRLARI.aciklama) : null });
  }
  if (liste.length < SECENEK_SINIRLARI.enAz) throw new ArnorgHatasi(iki("En az iki farklı seçenek ver.", "Give at least two different options."));
  if (liste.length > SECENEK_SINIRLARI.enCok) throw new ArnorgHatasi(iki("En çok 12 seçenek verilebilir.", "At most 12 options can be given."));
  return liste;
}

/** Mesajın düz metni: soru ve numaralı seçenekler (kanal_oku, uyandırma metinleri ve seçenekleri çizmeyen istemciler için) */
export function soruMetni(soru: string, secenekler: SoruSecenegi[], coklu: boolean): string {
  const satirlar = secenekler.map((s, i) => `${i + 1}. ${s.metin}${s.aciklama ? ` — ${s.aciklama}` : ""}`);
  return [soru, "", ...satirlar, ...(coklu ? ["", iki("Birden çok seçilebilir.", "Several can be chosen.")] : [])].join("\n");
}

/** Kurulun yanıtı: "Kurulun seçimi: 1) …; 3) … · Not: …"; seçenek seçilmediyse "Kurulun yanıtı: …" */
export function secimMetni(secim: MesajSecimi): string {
  const y = secim.yanit;
  if (!y) return "";
  const secilen = y.secilenler.map((n) => `${n}) ${secim.secenekler[n - 1]?.metin ?? "?"}`).join("; ");
  if (!secilen) return iki(`Kurulun yanıtı: ${y.not ?? ""}`, `Board's answer: ${y.not ?? ""}`);
  return y.not ? iki(`Kurulun seçimi: ${secilen} · Not: ${y.not}`, `Board's choice: ${secilen} · Note: ${y.not}`) : iki(`Kurulun seçimi: ${secilen}`, `Board's choice: ${secilen}`);
}

/** Ajanın #yonetim'e düz metinle yazdığı seçenek listesi ("Seçerek yanıtla"): çoklu seçim, yalnız işaretlenerek yanıtlanır */
export function duzMetinSecimi(m: Mesaj): MesajSecimi | null {
  if (m.kanal !== "yonetim" || m.gonderenId === KURUL || m.gonderenId === ARNORG_GONDEREN) return null;
  const maddeler = metindekiSecenekler(m.metin);
  if (!maddeler) return null;
  return { kaynak: "metin", soru: null, secenekler: maddeler.map((metin) => ({ metin, aciklama: null })), coklu: true, serbestYanit: false, yanit: null };
}

/** Ajanın seçenekli sorusunu kanala yazar; aynı soru yanıtsız bekliyorsa yenisi açılmaz (onceki: true) */
export function secenekliSor(sirket: Sirket, ajan: Ajan, girdi: SecenekliSoru): { mesaj: Mesaj; kanal: string; onceki: boolean } {
  const kanal = soruKanali(sirket, ajan, girdi.kanal);
  const soru = emojiAyikla(girdi.soru).trim().slice(0, SECENEK_SINIRLARI.soru);
  if (soru.length < 3) throw new ArnorgHatasi(iki("Soruyu yaz.", "Write the question."));
  const secenekler = secenekleriHazirla(girdi.secenekler);
  const bekleyen = sirket.depo.mesajlar(ajan.projeId, kanal, 50).find((m) => m.gonderenId === ajan.id && m.secim?.kaynak === "arac" && !m.secim.yanit && m.secim.soru === soru);
  if (bekleyen) return { mesaj: bekleyen, kanal, onceki: true };
  // Varsayılanlar: tek seçim, serbest yanıt açık (şemadan geçmeyen çağrıda da)
  const coklu = girdi.coklu === true;
  const secim: MesajSecimi = { kaynak: "arac", soru, secenekler, coklu, serbestYanit: girdi.serbestYanit !== false, yanit: null };
  const mesaj = sirket.kanalMesaji(ajan.projeId, kanal, { id: ajan.id, ad: ajan.ad }, soruMetni(soru, secenekler, coklu), [], secim);
  return { mesaj, kanal, onceki: false };
}

/** Yanıt mesajı soran ajana yönelir: #yonetim'de CEO'ya gider, öteki kanallarda soran @Ad ile anılır */
function yanitMesaji(sirket: Sirket, soru: Mesaj, secim: MesajSecimi): string {
  const govde = secimMetni(secim);
  if (soru.kanal === "yonetim") return govde;
  const soran = sirket.depo.ajan(soru.gonderenId);
  return soran ? `@${soran.ad} ${govde}` : govde;
}

/**
 * Kurulun seçimi: soru kilitlenir (mesaj.guncellendi) ve seçim soran ajana kurul mesajı olarak yazılır; yanıt
 * gönderilemezse soru yeniden açılır. Seçenekli olmayan mesaj, yanıtlanmış soru ve geçersiz seçim reddedilir.
 */
export async function secimYanitla(sirket: Sirket, mesajId: string, istek: SecimYanitIstegi): Promise<SecimYanitSonucu> {
  const m = sirket.depo.mesaj(mesajId);
  if (!m) throw bulunamadi("Mesaj", "Message");
  const secim = m.secim ?? duzMetinSecimi(m);
  if (!secim) throw new ArnorgHatasi(iki("Bu mesajda seçilecek seçenek yok.", "This message has no options to choose from."), 409);
  if (secim.yanit) throw new ArnorgHatasi(iki("Bu soru zaten yanıtlandı.", "This question has already been answered."), 409);
  const secilenler = [...new Set(istek.secilenler)].sort((a, b) => a - b);
  if (secilenler.some((n) => !Number.isInteger(n) || n < 1 || n > secim.secenekler.length)) throw new ArnorgHatasi(iki("Geçersiz seçenek numarası.", "Invalid option number."));
  if (!secim.coklu && secilenler.length > 1) throw new ArnorgHatasi(iki("Bu soruda yalnız bir seçenek seçilebilir.", "Only one option can be chosen for this question."));
  const not = istek.not?.trim() ? istek.not.trim().slice(0, SECENEK_SINIRLARI.not) : null;
  if (!secilenler.length && !(secim.serbestYanit && not)) {
    throw new ArnorgHatasi(
      secim.serbestYanit ? iki("Bir seçenek seçin ya da yanıtınızı yazın.", "Choose an option or write your answer.") : iki("En az bir seçenek seçin.", "Choose at least one option."),
    );
  }
  // Önce kilitlenir: aynı anda gelen ikinci yanıt "zaten yanıtlandı" alır
  const kilitli: MesajSecimi = { ...secim, yanit: { secilenler, not, zaman: simdi() } };
  const soru = sirket.depo.mesajSecimiYaz(m.id, kilitli) ?? m;
  sirket.olaylar.yayinla({ tur: "mesaj.guncellendi", projeId: m.projeId, mesaj: soru });
  try {
    const yanit = await sirket.mesajGonder(m.projeId, m.kanal, KURUL, yanitMesaji(sirket, m, kilitli));
    return { soru, yanit };
  } catch (h) {
    const geri = sirket.depo.mesajSecimiYaz(m.id, m.secim ?? null);
    if (geri) sirket.olaylar.yayinla({ tur: "mesaj.guncellendi", projeId: m.projeId, mesaj: geri });
    throw h;
  }
}

/** Talimat satırı (talimat.ts "Ekiple konuşmak" bölümü): CEO ve kurulla konuşan ajan seçenek sunarken secenekli_sor kullanır */
export function secenekTalimati(ceo: boolean, dil: Dil): string[] {
  const yonetim = `#${kanalGorunenAdi("yonetim", dil)}`;
  if (dil === "en") {
    return [
      ceo
        ? `- Whenever you offer the board choices (scope, approach, priority, technology), don't write a numbered list with mesaj_gonder: ask with mcp__arnorg__secenekli_sor. The question lands in ${yonetim} with its options and the board ticks and sends; set coklu: true when several can be chosen and add a short aciklama where an option needs one. The board's choice comes back to you from ${yonetim} as a board message ("Board's choice: 1) …; 3) … · Note: …"). Don't repeat the question with mesaj_gonder; wait for the answer.`
        : "- When the board talks with you in its channel or in #general and you offer it choices, ask with mcp__arnorg__secenekli_sor (coklu: true when several can be chosen); the board's choice comes back to you as a board message.",
    ];
  }
  return [
    ceo
      ? `- Kurula seçenek sunduğun her soruda (kapsam, yol, öncelik, teknoloji) mesaj_gonder ile numaralı liste yazma; mcp__arnorg__secenekli_sor ile sor. Soru seçenekleriyle ${yonetim} kanalına düşer, kurul işaretleyip gönderir; birden çok seçilebiliyorsa coklu: true ver, gereken seçeneğe kısa açıklama (aciklama) ekle. Kurulun seçimi sana ${yonetim} kanalından kurul mesajı olarak gelir ("Kurulun seçimi: 1) …; 3) … · Not: …"). Aynı soruyu ayrıca mesaj_gonder ile yazma; yanıtı bekle.`
      : "- Kurul seninle kendi kanalında ya da #genel'de konuşurken ona seçenek sunacaksan mcp__arnorg__secenekli_sor ile sor (birden çok seçilebiliyorsa coklu: true); kurulun seçimi sana kurul mesajı olarak gelir.",
  ];
}
