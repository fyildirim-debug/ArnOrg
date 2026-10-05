// Mesaj ekleri (0.0.8): kurul CEO sohbetinde ve kanallarda görsel ve dosya gönderir; CEO ve öteki ajanlar dosya_paylas
// ile görsel ve dosya paylaşır.
//
// - Dosya: <proje>/.arnorg/ekler/<id>.<uzantı>. Klasörün kendi .gitignore'u vardır (yalnız kendisi izlenir): ekler .arnorg
//   commit'lerine ve uzak depoya girmez. Tablo: ekler (göç: ekGocu, Depo açılırken); mesajın ekleri mesajlar.ekler
//   sütunundadır (JSON) ve ilk mesaj.yeni olayıyla gelir.
// - Tür içerikten tanınır (tur.ts). Kurulun yüklediği ek gönderilene dek taslaktır; mesaja yalnız gönderenin kendi
//   taslağı bağlanır, bir ek tek mesajda kullanılır. Bir günden eski taslaklar silinir.
// - Ajana giden metin (ekMetni): ad, tür, boyut ve mutlak yol. Satır içi sınırlara uyan görselin yolu ters tırnak içindedir
//   ve mesaj ajana o görselle gider (icerik.ts); PDF, metin ve büyük görsel Read ile açılır.
// Uçlar: uclar.ts · araç: araclar.ts · sözleşme: docs/API.md "Mesaj ekleri"
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { EK_SINIRLARI, KURUL, type MesajEki, type MesajEkiTuru, type Proje } from "@arnorg/ortak";
import type { Depo } from "../depo.js";
import { iki } from "../dil.js";
import { arnorgYolu } from "../proje-dosyalari.js";
import { ArnorgHatasi, bulunamadi, kimlik, simdi } from "../yardimci.js";
import { adTemizle, base64Coz, boyutMetni, cokBuyuk, ekTuru, gizliDosyaMi, gizliIcerikVarMi, uzantisi, type TaninanEk } from "./tur.js";

export { adTemizle, base64Coz, boyutMetni, ekTuru, gizliDosyaMi, gizliIcerikVarMi } from "./tur.js";

/** Yüklenip gönderilmeyen taslağın ömrü */
const TASLAK_OMRU_MS = 24 * 60 * 60_000;
/** Bayat taslak temizliği en çok bu aralıkla */
const TEMIZLIK_ARALIGI_MS = 10 * 60_000;

/**
 * Ajana mesajın içinde görsel olarak giden görselin sınırları. Claude Code'un yapıştırılan görsel sınırının (uzun kenar
 * 2000 px, base64 5 MB) altında kalır; bayt sınırları daha sıkıdır, görseller konuşma geçmişinde birikir. Sınırı aşan
 * görsel yoluyla gider; Claude Code'un Read aracı onu küçülterek açar.
 */
export const SATIR_ICI_GORSEL = { kenar: 2000, bayt: 2.5 * 1024 * 1024, toplamBayt: 6 * 1024 * 1024, adet: EK_SINIRLARI.mesajBasina } as const;

/** Depo açılırken çalışan göç: ekler tablosu, proje silinince kayıtlarını silen tetikleyici, mesajlar.ekler sütunu */
export function ekGocu(db: Database.Database): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS ekler (
  id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  ad TEXT NOT NULL,
  tur TEXT NOT NULL,
  mime TEXT NOT NULL,
  boyut INTEGER NOT NULL,
  genislik INTEGER,
  yukseklik INTEGER,
  yol TEXT NOT NULL,
  yukleyen_id TEXT NOT NULL,
  mesaj_id TEXT,
  zaman TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ekler_taslak ON ekler(mesaj_id, zaman);
CREATE TRIGGER IF NOT EXISTS ekler_proje_silindi AFTER DELETE ON projeler
BEGIN
  DELETE FROM ekler WHERE proje_id = OLD.id;
END;
`);
  const sutunlar = (db.prepare("PRAGMA table_info(mesajlar)").all() as { name: string }[]).map((s) => s.name);
  if (!sutunlar.includes("ekler")) db.exec("ALTER TABLE mesajlar ADD COLUMN ekler TEXT");
}

/** Projenin ek klasörü; ilk yazımda .gitignore'u kurulur (ekler commit'lenmez, yalnız .gitignore izlenir) */
export function ekKlasoru(projeYolu: string): string {
  const dizin = arnorgYolu(projeYolu, "ekler");
  fs.mkdirSync(dizin, { recursive: true });
  const yoksay = path.join(dizin, ".gitignore");
  if (!fs.existsSync(yoksay)) {
    fs.writeFileSync(
      yoksay,
      iki(
        "# ArnOrg mesaj ekleri (kurulun ve ajanların sohbette paylaştığı görseller ve dosyalar): yerelde kalır, commit'lenmez\n*\n!.gitignore\n",
        "# ArnOrg message attachments (images and files shared in chat by the board and the agents): they stay local and are not committed\n*\n!.gitignore\n",
      ),
      "utf8",
    );
  }
  return dizin;
}

/** ArnOrg'un geçici klasörü: ajanların paylaşmak için ekran görüntüsü kaydedebildiği yer (proje dışında, commit'lenmez) */
export function ekGeciciDizini(): string {
  return path.join(os.tmpdir(), "arnorg");
}

type Satir = Record<string, unknown>;

interface EkKaydi extends MesajEki {
  projeId: string;
  yukleyenId: string;
  mesajId: string | null;
  zaman: string;
}

function ekOf(k: EkKaydi): MesajEki {
  return {
    id: k.id,
    ad: k.ad,
    tur: k.tur,
    mime: k.mime,
    boyut: k.boyut,
    ...(k.genislik && k.yukseklik ? { genislik: k.genislik, yukseklik: k.yukseklik } : {}),
    yol: k.yol,
  };
}

/** Dosya sistemi büyük-küçük harf ayırmıyorsa (Windows, macOS) yollar küçük harfle karşılaştırılır */
function karsilastirilir(yol: string): string {
  return process.platform === "win32" || process.platform === "darwin" ? yol.toLowerCase() : yol;
}

/** hedef, kökün içinde mi (kökün kendisi değil) */
export function kokunIcinde(kok: string, hedef: string): boolean {
  const fark = path.relative(karsilastirilir(path.resolve(kok)), karsilastirilir(path.resolve(hedef)));
  return fark !== "" && fark !== ".." && !fark.startsWith(`..${path.sep}`) && !path.isAbsolute(fark);
}

function gercekYol(yol: string): string | null {
  try {
    return fs.realpathSync.native(yol);
  } catch {
    return null;
  }
}

/** Ajanın verdiği yol: ~ ev dizinine açılır, göreli yol çalışma dizinine göre çözülür */
function yolCoz(ham: string, cwd: string): string {
  const y = ham.trim().replace(/^["']|["']$/g, "");
  if (y === "~" || y.startsWith("~/") || y.startsWith("~\\")) return path.join(os.homedir(), y.slice(1));
  return path.resolve(cwd, y);
}

/** Paylaşım kökleri: verilen klasörlerin gerçek yolları; ArnOrg'un geçici klasörü yalnız gerçek bir klasörse (bağlantı değil) */
function kokleriCoz(kokler: readonly string[]): string[] {
  const gecici = ekGeciciDizini();
  const sonuc: string[] = [];
  for (const k of kokler) {
    if (karsilastirilir(path.resolve(k)) === karsilastirilir(gecici)) {
      try {
        if (!fs.lstatSync(k).isDirectory()) continue;
      } catch {
        continue;
      }
    }
    const g = gercekYol(k);
    if (g) sonuc.push(g);
  }
  return sonuc;
}

/** ekler tablosu ve dosyaları: kurulun yüklemesi, ajanın paylaşımı, mesaja bağlama, taslak silme, sunum */
export class MesajEkleri {
  private sonTemizlik = 0;

  constructor(private readonly depo: Pick<Depo, "db">) {}

  private satir(s: Satir): EkKaydi {
    return {
      id: String(s.id),
      projeId: String(s.proje_id),
      ad: String(s.ad),
      tur: String(s.tur) as MesajEkiTuru,
      mime: String(s.mime),
      boyut: Number(s.boyut),
      ...(s.genislik && s.yukseklik ? { genislik: Number(s.genislik), yukseklik: Number(s.yukseklik) } : {}),
      yol: String(s.yol),
      yukleyenId: String(s.yukleyen_id),
      mesajId: (s.mesaj_id as string | null) ?? null,
      zaman: String(s.zaman),
    };
  }

  private kayit(id: string): EkKaydi | null {
    const s = this.depo.db.prepare("SELECT * FROM ekler WHERE id = ?").get(id) as Satir | undefined;
    return s ? this.satir(s) : null;
  }

  /** Kurulun yüklemesi: base64 içerik çözülür, türü içerikten tanınır, .arnorg/ekler'e yazılır; ek mesaja bağlanana dek taslaktır */
  yukle(proje: Pick<Proje, "id" | "yol">, ad: string, veri: string, yukleyenId: string = KURUL): MesajEki {
    this.temizle();
    const icerik = base64Coz(veri);
    const temizAd = adTemizle(ad);
    return this.kaydet(proje, temizAd, ekTuru(icerik, temizAd), yukleyenId);
  }

  /**
   * Ajanın paylaşımı: yol çalışma dizinine göre çözülür; dosya izinli köklerden birinin içinde olmalı (bağlantı izlenip
   * gerçek yola bakılır). Gizli dosya adları ve klasörleri, gizli bilgi taşıyan metin reddedilir. Dosya kopyalanır.
   */
  paylas(proje: Pick<Proje, "id" | "yol">, ajanId: string, ham: string, o: { cwd: string; kokler: readonly string[] }): MesajEki {
    const yol = yolCoz(ham, o.cwd);
    const gizli = () => new ArnorgHatasi(iki("Gizli dosyalar (.env, anahtar ve sertifika dosyaları, kimlik bilgileri) paylaşılamaz.", "Secret files (.env, key and certificate files, credentials) can't be shared."), 403);
    if (gizliDosyaMi(yol)) throw gizli();
    const gercek = gercekYol(yol);
    if (!gercek) throw new ArnorgHatasi(iki(`Dosya bulunamadı: ${yol}`, `File not found: ${yol}`), 404);
    if (gizliDosyaMi(gercek)) throw gizli();
    if (!kokleriCoz(o.kokler).some((k) => kokunIcinde(k, gercek))) {
      throw new ArnorgHatasi(
        iki(
          `Yalnız proje içindeki dosyalar (ya da ${ekGeciciDizini()} altındakiler) paylaşılabilir: ${yol}`,
          `Only files inside the project (or under ${ekGeciciDizini()}) can be shared: ${yol}`,
        ),
        403,
      );
    }
    const st = fs.statSync(gercek);
    if (!st.isFile()) throw new ArnorgHatasi(iki(`Bu bir dosya değil: ${yol}`, `This is not a file: ${yol}`));
    if (st.size > EK_SINIRLARI.boyut) throw cokBuyuk(st.size);
    const ad = adTemizle(path.basename(yol));
    const taninan = ekTuru(fs.readFileSync(gercek), ad);
    if (taninan.tur === "metin" && gizliIcerikVarMi(taninan.icerik.toString("utf8"))) {
      throw new ArnorgHatasi(iki("Dosyada gizli bilgi (özel anahtar ya da erişim anahtarı) var; paylaşılamaz.", "The file contains secrets (a private key or an access token); it can't be shared."), 403);
    }
    return this.kaydet(proje, ad, taninan, ajanId);
  }

  private kaydet(proje: Pick<Proje, "id" | "yol">, ad: string, t: TaninanEk, yukleyenId: string): MesajEki {
    const id = kimlik();
    const yol = path.join(ekKlasoru(proje.yol), `${id}.${t.uzanti}`);
    fs.writeFileSync(yol, t.icerik);
    const ek: EkKaydi = {
      id,
      projeId: proje.id,
      ad,
      tur: t.tur,
      mime: t.mime,
      boyut: t.icerik.length,
      ...(t.genislik && t.yukseklik ? { genislik: t.genislik, yukseklik: t.yukseklik } : {}),
      yol,
      yukleyenId,
      mesajId: null,
      zaman: simdi(),
    };
    try {
      this.depo.db
        .prepare("INSERT INTO ekler (id, proje_id, ad, tur, mime, boyut, genislik, yukseklik, yol, yukleyen_id, zaman) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, proje.id, ad, ek.tur, ek.mime, ek.boyut, ek.genislik ?? null, ek.yukseklik ?? null, yol, yukleyenId, ek.zaman);
    } catch (h) {
      fs.rmSync(yol, { force: true });
      throw h;
    }
    return ekOf(ek);
  }

  /**
   * Mesaja girecek ekler: kimlikler tekilleşir; her biri bu projenin, gönderenin yüklediği, henüz gönderilmemiş ve dosyası
   * duran bir ek olmalı. Bağlama mesaj yazılınca bagla ile yapılır (ikisi aynı eşzamanlı akışta).
   */
  hazirla(projeId: string, gonderenId: string, idler: readonly string[] = []): MesajEki[] {
    const tekil = [...new Set(idler)];
    if (tekil.length > EK_SINIRLARI.mesajBasina) {
      throw new ArnorgHatasi(iki(`Bir mesaja en çok ${EK_SINIRLARI.mesajBasina} ek eklenebilir.`, `A message can have at most ${EK_SINIRLARI.mesajBasina} attachments.`));
    }
    return tekil.map((id) => {
      const k = this.kayit(id);
      if (!k || k.projeId !== projeId) throw bulunamadi("Ek", "Attachment");
      if (k.yukleyenId !== gonderenId) throw new ArnorgHatasi(iki("Bu ek başkasının; yalnız kendi yüklediğiniz ek gönderilir.", "This attachment belongs to someone else; only your own uploads can be sent."), 403);
      if (k.mesajId) throw new ArnorgHatasi(iki(`"${k.ad}" zaten gönderildi; yeniden ekleyin.`, `"${k.ad}" was already sent; attach it again.`), 409);
      if (!fs.existsSync(k.yol)) throw new ArnorgHatasi(iki(`"${k.ad}" dosyası artık yok; yeniden ekleyin.`, `The file of "${k.ad}" is gone; attach it again.`), 404);
      return ekOf(k);
    });
  }

  /** Ekleri yazılan mesaja bağlar (bir ek bir kez) */
  bagla(ekler: readonly MesajEki[], mesajId: string): void {
    if (!ekler.length) return;
    const yaz = this.depo.db.prepare("UPDATE ekler SET mesaj_id = ? WHERE id = ? AND mesaj_id IS NULL");
    this.depo.db.transaction(() => {
      for (const e of ekler) yaz.run(mesajId, e.id);
    })();
  }

  /** Gönderilmemiş taslağı ve dosyasını siler (kurul vazgeçti, paylaşım yarım kaldı); gönderilmiş ek silinmez (409) */
  sil(id: string, isteyenId: string = KURUL): void {
    const k = this.kayit(id);
    if (!k) throw bulunamadi("Ek", "Attachment");
    if (k.yukleyenId !== isteyenId) throw new ArnorgHatasi(iki("Bu ek başkasının.", "This attachment belongs to someone else."), 403);
    if (k.mesajId) throw new ArnorgHatasi(iki("Gönderilmiş ek silinemez.", "An attachment that was already sent can't be deleted."), 409);
    this.depo.db.prepare("DELETE FROM ekler WHERE id = ?").run(id);
    fs.rmSync(k.yol, { force: true });
  }

  /** Sunulacak ek (kaydı ve dosyası); ek ya da dosyası yoksa 404 */
  bul(id: string): MesajEki {
    const k = this.kayit(id);
    if (!k || !fs.existsSync(k.yol)) throw bulunamadi("Ek", "Attachment");
    return ekOf(k);
  }

  /** Bir günden eski, gönderilmemiş taslaklar dosyalarıyla silinir; en çok on dakikada bir çalışır */
  temizle(simdiMs = Date.now()): number {
    if (simdiMs - this.sonTemizlik < TEMIZLIK_ARALIGI_MS) return 0;
    this.sonTemizlik = simdiMs;
    const sinir = new Date(simdiMs - TASLAK_OMRU_MS).toISOString();
    const eskiler = (this.depo.db.prepare("SELECT * FROM ekler WHERE mesaj_id IS NULL AND zaman < ?").all(sinir) as Satir[]).map((s) => this.satir(s));
    const sil = this.depo.db.prepare("DELETE FROM ekler WHERE id = ?");
    for (const k of eskiler) {
      sil.run(k.id);
      fs.rmSync(k.yol, { force: true });
    }
    return eskiler.length;
  }
}

// ===================================================================
// Ajana giden metin
// ===================================================================

/** Ekin ajana anlatılan türü: görsel, PDF, metin (saklandığı uzantıyla) */
function turAdi(e: MesajEki): string {
  if (e.tur === "gorsel") return iki("görsel", "image");
  if (e.tur === "pdf") return "PDF";
  const u = uzantisi(e.yol);
  return u && u !== "txt" ? iki(`metin, .${u}`, `text, .${u}`) : iki("metin", "text");
}

/** Görsel, satır içi sınırlara uyuyor mu (kenar ve bayt); toplam bütçe ve adet ekMetni'nde sayılır */
export function satirIciMi(e: Pick<MesajEki, "tur" | "boyut" | "genislik" | "yukseklik">): boolean {
  return e.tur === "gorsel" && e.boyut > 0 && e.boyut <= SATIR_ICI_GORSEL.bayt && !!e.genislik && !!e.yukseklik && Math.max(e.genislik, e.yukseklik) <= SATIR_ICI_GORSEL.kenar;
}

/**
 * Ajana giden ek listesi (mesaj metninin sonuna eklenir): sıra, ad, tür, piksel boyutu, bayt ve mutlak yol. Satır içi
 * sınırlara uyan görsellerin (sırayla, toplam bütçe ve adet içinde) yolu ters tırnak içindedir: mesaj ajana o görsellerle
 * gider (icerik.ts). Öteki ekler için Read ile açması söylenir. Ek yoksa boş metin.
 */
export function ekMetni(ekler: readonly MesajEki[] | undefined): string {
  if (!ekler?.length) return "";
  let butce: number = SATIR_ICI_GORSEL.toplamBayt;
  let adet = 0;
  const satirlar = ekler.map((e, i) => {
    const bilgi = [turAdi(e), e.genislik && e.yukseklik ? `${e.genislik}×${e.yukseklik}` : null, boyutMetni(e.boyut)].filter(Boolean).join(", ");
    const bas = `${i + 1}) ${e.ad} (${bilgi})`;
    if (satirIciMi(e) && e.boyut <= butce && adet < SATIR_ICI_GORSEL.adet) {
      butce -= e.boyut;
      adet++;
      return `${bas}: ${iki("görsel bu mesajda", "the image is in this message")} · \`${e.yol}\``;
    }
    if (e.tur === "gorsel") return `${bas}: ${iki("büyük görsel, Read ile aç", "large image, open it with Read")}: ${e.yol}`;
    return `${bas}: ${iki("Read ile aç", "open it with Read")}: ${e.yol}`;
  });
  return `\n\n${iki(`Ekler (${ekler.length}):`, `Attachments (${ekler.length}):`)}\n${satirlar.join("\n")}`;
}

/** kanal_oku satırının sonu: eklerin adları ve yolları (Read ile açılır); ek yoksa boş */
export function ekSatiri(ekler: readonly MesajEki[] | undefined): string {
  if (!ekler?.length) return "";
  return ` [${iki("ekler", "attachments")}: ${ekler.map((e) => `${e.ad} → ${e.yol}`).join("; ")}]`;
}

/** Konuşma geçmişi satırının başı: yalnız eklerin adları (yolları ve görselleri en son mesajın ek listesinde) */
export function ekAdlari(ekler: readonly MesajEki[] | undefined): string {
  if (!ekler?.length) return "";
  return `[${iki("ekler", "attachments")}: ${ekler.map((e) => e.ad).join(", ")}] `;
}
