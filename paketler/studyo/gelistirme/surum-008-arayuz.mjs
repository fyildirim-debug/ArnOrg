// Sahte çekirdeğin 0.0.8 "arayüz" davranışları:
//
//   - Ad ile karakter uyumu: çekirdekteki karakter-uyumu.ts gibi, adının cinsiyeti bilinen ve karakteri buna ters
//     düşen çalışan açılışta bir kez aynı cinsiyetteki boş bir karaktere geçer (tohumda Kerem: k16 → k02). Karakteri
//     kayıtsız çalışanlara ve yeni işe alımlara Stüdyo adına ve rolüne uyan karakteri kendisi seçer.
//   - Proje adresleri, Tarayıcı'da Linkler (çekirdekte proje-adresleri.ts): GET ve POST /api/projeler/:pid/adresler,
//     DELETE /api/projeler/:pid/adresler/:aid, POST /api/projeler/:pid/adresler/iste ve adresler.guncellendi olayları
//     (tam liste). Sipariş Paneli'nde dört link: CEO Ada'nın kalıcı test ortamı, Ece'nin geliştirme sunucusu, Deniz'in
//     çıktısında yakalanan API ve yanıt vermeyen Storybook. Sahne: ~40 sn sonra Mert önizleme sunucusunu açar
//     (çıktısından yakalanır), ~70 sn sonra kapalı Storybook düşer, ~2,5 dk sonra Mert önizlemeyi kapatıp adresini
//     kaldırır. "CEO'dan iste" #yonetim'e kurul mesajı yazar; birkaç saniye sonra Ada yönetim panelinin linkini ekler.
//     Arnex Web Sitesi'nde link yoktur (Tarayıcı'da bölümün boş hâli).
//   - Toplam token (üst çubuk): kullanım ucu ve kullanim olayları sahte-sunucu.mjs'te; burada ek bir şey yok.
//
//   kur(c): sahte-sunucu.mjs'teki rota, db ve yardımcılarla çağrılır (surum-005-*.mjs deseni)
//
// Ortam:
//   ARNORG_ADRES=yok          Sipariş Paneli linksiz başlar, sahne oynamaz (bölümün boş hâli)
//   ARNORG_ORNEK_ADRES=<url>  geliştirme sunucusunun adresi yerine (çerçevede gerçek bir sayfa görmek için)
// Geliştirme ucu (yalnız sahte çekirdek):
//   POST /api/gelistirme/adres-ornek   Mert önizleme sunucusunu hemen açar (yeni kartın girişi görülür)

import crypto from "node:crypto";
import { ceviri } from "./dil.mjs";

const OFIS = "siparis-paneli";

// ---------------------------------------------------------------------------
// Ad ile karakter uyumu (kurallar @arnorg/ortak: cinsiyet.ts ve karakterler.ts; burada tohum için küçük bir kopya)
// ---------------------------------------------------------------------------

/** Karakterlerin görseldeki cinsiyeti ve önerildiği roller (ortak/karakterler.ts) */
const KARAKTERLER = [
  ["k01", "kadin", ["ceo"]],
  ["k02", "erkek", ["cto"]],
  ["k03", "erkek", ["backend", "fullstack"]],
  ["k04", "kadin", ["frontend", "fullstack"]],
  ["k05", "kadin", ["test"]],
  ["k06", "erkek", ["inceleme"]],
  ["k07", "kadin", ["guvenlik"]],
  ["k08", "erkek", ["devops"]],
  ["k09", "kadin", ["tasarim"]],
  ["k10", "erkek", ["yazar", "tanitim"]],
  ["k11", "kadin", ["arastirmaci"]],
  ["k12", "erkek", ["fullstack", "backend"]],
  ["k13", "kadin", ["frontend", "backend"]],
  ["k14", "erkek", ["backend", "devops"]],
  ["k15", "kadin", ["frontend", "fullstack"]],
  ["k16", "kadin", ["cto", "inceleme", "ceo"]],
  ["k17", "erkek", ["arastirmaci", "backend"]],
  ["k18", "kadin", ["test", "inceleme"]],
  ["k19", "erkek", ["devops", "backend"]],
  ["k20", "kadin", ["guvenlik"]],
  ["k21", "erkek", ["backend", "cto", "inceleme"]],
  ["k22", "erkek", ["tasarim", "frontend"]],
  ["k23", "kadin", ["yazar"]],
  ["k24", "erkek", ["frontend", "fullstack"]],
  ["k25", "kadin", ["frontend"]],
  ["k26", "kadin", ["cto", "ceo"]],
  ["k27", "erkek", ["arastirmaci", "backend"]],
  ["k28", "kadin", ["fullstack", "test"]],
  ["k29", "kadin", ["inceleme", "cto"]],
  ["k30", "erkek", ["backend", "devops"]],
  ["k31", "kadin", ["tasarim", "arastirmaci", "tanitim"]],
  ["k32", "erkek", ["ceo"]],
].map(([id, cinsiyet, roller]) => ({ id, cinsiyet, roller }));

/** Tohumdaki ve sahnedeki adlar (Deniz iki cinsiyette de kullanılır: bilinmiyor) */
const AD_CINSIYETLERI = {
  ada: "kadin", ece: "kadin", selin: "kadin", zeynep: "kadin", lale: "kadin", defne: "kadin", nehir: "kadin", nil: "kadin", mira: "kadin",
  kerem: "erkek", mert: "erkek", onur: "erkek", burak: "erkek", aras: "erkek", arda: "erkek", kaan: "erkek",
};
const adCinsiyeti = (ad) => AD_CINSIYETLERI[String(ad ?? "").trim().split(/[\s._-]+/)[0].toLocaleLowerCase("tr-TR")] ?? null;
const karakterCinsiyeti = (id) => KARAKTERLER.find((k) => k.id === id)?.cinsiyet ?? null;

/** Açılışta bir kez: adla çelişen kayıtlı karakter aynı cinsiyetteki boş karaktere geçer (önce role uyan) */
function karakterUyumuGocu(db) {
  for (const pid of new Set(db.ajanlar.map((a) => a.projeId))) {
    const ajanlar = db.ajanlar.filter((a) => a.projeId === pid).sort((a, b) => a.olusturma.localeCompare(b.olusturma) || a.id.localeCompare(b.id));
    for (const a of ajanlar) {
      const cinsiyet = adCinsiyeti(a.ad);
      const k = karakterCinsiyeti(a.karakter);
      if (!cinsiyet || !k || k === cinsiyet) continue;
      const dolu = new Set(ajanlar.filter((x) => x !== a && x.karakter).map((x) => x.karakter));
      const bos = KARAKTERLER.filter((x) => x.cinsiyet === cinsiyet && !dolu.has(x.id));
      const yeni = bos.find((x) => x.roller.includes(a.rol)) ?? bos[0];
      if (yeni) a.karakter = yeni.id;
    }
  }
}

// ---------------------------------------------------------------------------
// Proje adresleri
// ---------------------------------------------------------------------------

const kimlik = (adres) => crypto.createHash("sha1").update(adres.replace(/\/+$/, "")).digest("hex").slice(0, 12);

export function kur(c) {
  const { rota, db, yay, akisEkle, ajanBul, projeGerekli, projeAjanlari, mesajEkle, Hata, simdi, yeniKimlik } = c;
  karakterUyumuGocu(db);

  const once = (dk) => new Date(Date.now() - dk * 60_000).toISOString();
  const GELISTIRME = process.env.ARNORG_ORNEK_ADRES || "http://localhost:5173/";
  const adressiz = process.env.ARNORG_ADRES === "yok";

  /** Proje → adres listesi (eklenme sırasıyla) */
  const adresler = new Map();
  const liste = (pid) => adresler.get(pid) ?? [];
  const yayinla = (pid) => yay({ tur: "adresler.guncellendi", projeId: pid, adresler: liste(pid) }, pid);

  /** Yerel makine ve yerel ağ adresleri yoklanır (çekirdekteki yerelAdresMi'nin kabası) */
  const yerelMi = (url) => /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(new URL(url).host);

  function adres(pid, { adres: url, ad, bildirenId, kaynak, guncelleme, durum, kalici = false }) {
    const b = ajanBul(bildirenId);
    const yoklanir = yerelMi(url);
    return {
      id: kimlik(url),
      projeId: pid,
      adres: url,
      ad,
      bildirenId,
      bildirenAd: kaynak === "kurul" ? ceviri("Kurul", "Board") : (b?.ad ?? "ArnOrg"),
      kaynak,
      kalici,
      guncelleme,
      durum: durum ?? (yoklanir ? "acik" : "bilinmiyor"),
      denetim: yoklanir ? simdi() : null,
      yoklanir,
    };
  }

  if (!adressiz) {
    adresler.set(OFIS, [
      adres(OFIS, { adres: "https://test.siparis-paneli.ornek.com/", ad: ceviri("Test ortamı", "Staging"), bildirenId: "ada", kaynak: "arac", guncelleme: once(95), kalici: true }),
      adres(OFIS, { adres: GELISTIRME, ad: ceviri("Geliştirme sunucusu", "Dev server"), bildirenId: "ece", kaynak: "arac", guncelleme: once(14) }),
      adres(OFIS, { adres: "http://localhost:4000/", ad: "API", bildirenId: "deniz", kaynak: "cikti", guncelleme: once(32) }),
      adres(OFIS, { adres: "http://localhost:6006/", ad: "Storybook", bildirenId: "selin", kaynak: "arac", guncelleme: once(3), durum: "kapali" }),
    ]);
  }

  rota("GET", "/api/projeler/:pid/adresler", ({ p }) => (projeGerekli(p.pid), liste(p.pid)));

  /** Kurulun eklediği link: kalıcı; aynı adres yeniden eklenince adı güncellenir */
  rota("POST", "/api/projeler/:pid/adresler", ({ p, govde }) => {
    projeGerekli(p.pid);
    let url;
    try {
      url = new URL(String(govde?.adres ?? "").trim()).href;
    } catch {
      throw new Hata(400, ceviri("Geçersiz adres.", "Invalid address."));
    }
    const ad = String(govde?.ad ?? "").trim().slice(0, 60);
    if (!/^https?:/.test(url) || !ad) throw new Hata(400, ceviri("Adres ve ad gerekli.", "An address and a name are required."));
    const yeni = adres(p.pid, { adres: url, ad, bildirenId: null, kaynak: "kurul", guncelleme: simdi(), kalici: true });
    const vardi = liste(p.pid).some((a) => a.id === yeni.id);
    adresler.set(p.pid, vardi ? liste(p.pid).map((a) => (a.id === yeni.id ? yeni : a)) : [...liste(p.pid), yeni]);
    yayinla(p.pid);
    return yeni;
  });

  rota("DELETE", "/api/projeler/:pid/adresler/:aid", ({ p }) => {
    projeGerekli(p.pid);
    if (!liste(p.pid).some((a) => a.id === p.aid)) throw new Hata(404, ceviri("Link bulunamadı.", "Link not found."));
    adresler.set(
      p.pid,
      liste(p.pid).filter((a) => a.id !== p.aid),
    );
    yayinla(p.pid);
    return { tamam: true };
  });

  /** "CEO'dan iste": #yonetim'e kurul mesajı; CEO birkaç saniye sonra yönetim panelinin linkini ekler */
  rota("POST", "/api/projeler/:pid/adresler/iste", ({ p }) => {
    projeGerekli(p.pid);
    const ceo = projeAjanlari(p.pid).find((a) => a.rol === "ceo");
    if (!ceo) throw new Hata(409, ceviri("Projede CEO yok.", "The project has no CEO."));
    const mesaj = mesajEkle(
      p.pid,
      "yonetim",
      "kurul",
      ceviri(
        "Tarayıcı'daki Linkler alanını güncelle: projenin açılabilen adreslerini (geliştirme sunucusu, API ve dokümanı, önizleme, test ya da canlı yayın, yönetim paneli) kısa ve açık bir adla adres_bildir ile ekle, değişenleri güncelle, artık kullanılmayanları adres_kaldir ile kaldır.",
        "Update the Links in the Browser: add the project's openable addresses (dev server, API and its docs, preview, staging or live site, admin panel) with a short, clear name using adres_bildir, update the ones that changed, and remove the ones no longer used with adres_kaldir.",
      ),
    );
    setTimeout(() => {
      const PANEL = "http://localhost:5173/yonetim";
      const ad = ceviri("Yönetim paneli", "Admin panel");
      aracKaydi(ceo.id, "mcp__arnorg__adres_bildir", { adres: PANEL, ad }, ceviri(`Link kaydedildi: ${ad} → ${PANEL} (açık, bağlantı kabul ediyor).`, `Link saved: ${ad} → ${PANEL} (up, accepting connections).`));
      if (!liste(p.pid).some((a) => a.adres === PANEL)) {
        adresler.set(p.pid, [...liste(p.pid), adres(p.pid, { adres: PANEL, ad, bildirenId: ceo.id, kaynak: "arac", guncelleme: simdi(), kalici: true })]);
        yayinla(p.pid);
      }
      mesajEkle(
        p.pid,
        "yonetim",
        ceo.id,
        ceviri("Linkleri güncelledim: yönetim panelini ekledim, test ortamı ve geliştirme sunucusu yerinde. Mert önizlemeyi açınca o da listeye düşecek.", "I've updated the links: I added the admin panel, and staging and the dev server are in place. When Mert starts the preview, it will show up in the list too."),
      );
    }, 3500);
    return { mesaj };
  });

  // -------------------------------------------------------------------------
  // Sahne: Mert önizleme sunucusunu açar (adres çıktısından yakalanır), Storybook düşer, Mert önizlemeyi kapatır
  // -------------------------------------------------------------------------

  const ONIZLEME = "http://localhost:4173/";
  function aracKaydi(ajanId, arac, girdi, sonuc) {
    const k = yeniKimlik("toolu");
    akisEkle(ajanId, { tur: "arac_cagrisi", arac, aracKimligi: k, girdi });
    setTimeout(() => akisEkle(ajanId, { tur: "arac_sonucu", aracKimligi: k, metin: sonuc, hata: false }), 600);
  }

  function onizlemeAc() {
    if (!ajanBul("mert") || liste(OFIS).some((a) => a.adres === ONIZLEME)) return false;
    aracKaydi("mert", "Bash", { command: "npm run preview -- --port 4173", run_in_background: true }, "  ➜  Local:   http://localhost:4173/\n  ➜  Network: use --host to expose");
    setTimeout(() => {
      adresler.set(OFIS, [...liste(OFIS), adres(OFIS, { adres: ONIZLEME, ad: "Vite", bildirenId: "mert", kaynak: "cikti", guncelleme: simdi() })]);
      yayinla(OFIS);
    }, 900);
    return true;
  }

  function storybookDussun() {
    const kalan = liste(OFIS).filter((a) => a.ad !== "Storybook");
    if (kalan.length === liste(OFIS).length) return;
    adresler.set(OFIS, kalan);
    yayinla(OFIS);
  }

  function onizlemeKapat() {
    if (!liste(OFIS).some((a) => a.adres === ONIZLEME)) return;
    aracKaydi("mert", "mcp__arnorg__adres_kaldir", { adres: ONIZLEME }, ceviri(`Kaldırıldı: Vite (${ONIZLEME}).`, `Removed: Vite (${ONIZLEME}).`));
    setTimeout(() => {
      adresler.set(
        OFIS,
        liste(OFIS).filter((a) => a.adres !== ONIZLEME),
      );
      yayinla(OFIS);
    }, 900);
  }

  if (!adressiz) {
    setTimeout(onizlemeAc, 40_000);
    setTimeout(storybookDussun, 70_000);
    setTimeout(onizlemeKapat, 150_000);
  }

  rota("POST", "/api/gelistirme/adres-ornek", () => {
    if (!onizlemeAc()) throw new Hata(409, ceviri("Önizleme sunucusu zaten açık.", "The preview server is already running."));
    return { tamam: true };
  });
}
