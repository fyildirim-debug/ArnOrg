// Sahte çekirdeğin 0.0.2 uçları: kurulum (Claude Code, git, GitHub CLI), GitHub depoları ve klonlama, dizin gezgini,
// proje ayarları ve dallar, hazırlık görüşmesi (#yonetim'de senaryolu CEO), ana yasa, global zekâ, ajan zekâsı
// (kişisel hafıza, sözler, beceriler), yazıyor göstergesi ve kurula açılır bildirimler.
//
//   ARNORG_KURULUM=yeni  ilk açılış sihirbazı görünür: Claude girişi yok, gh kurulu değil, git kimliği boş

import { ayrilma, ceviri, DIL, VARSAYILAN_OTOMATIK_ONAY_TURLERI, yonelme } from "./dil.mjs";

const YENI = process.env.ARNORG_KURULUM === "yeni";
const EV = "/home/furkan";

export function kur(c) {
  const { rota, db, yay, herkeseYay, yayDinle, proje, projeAjanlari, ajanBul, mesajEkle, akisEkle, Hata, simdi, sonra, yeniKimlik, projeOzeti, projeGerekli, ajanGerekli, projeYay } = c;
  const bekle = (ms) => new Promise((z) => setTimeout(z, ms));
  const once = (dk) => new Date(Date.now() - dk * 60_000).toISOString();

  // -------------------------------------------------------------------------
  // Proje alanları ve ayarlar
  // -------------------------------------------------------------------------

  const projeVarsayilanlari = {
    "siparis-paneli": { uzakAdres: "https://github.com/furkan-y/siparis-paneli.git", github: "furkan-y/siparis-paneli", otomatikGonder: true, hazirlik: "tamam" },
    "arnex-web": { uzakAdres: null, github: null, otomatikGonder: true, hazirlik: "bekliyor" },
  };
  for (const p of db.projeler) Object.assign(p, { uzakAdres: null, github: null, otomatikGonder: true, hazirlik: "tamam", otomatikOnay: { etkin: false, turler: [...VARSAYILAN_OTOMATIK_ONAY_TURLERI] } }, projeVarsayilanlari[p.id] ?? {});
  Object.assign(db.ayarlar, { ghYolu: null, projeKoku: null, kurulumTamam: !YENI });

  // -------------------------------------------------------------------------
  // Kurulum durumu ve işlemler
  // -------------------------------------------------------------------------

  const kurulum = {
    claude: {
      kaynak: "paket",
      yol: "/opt/ArnOrg/resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude",
      surum: "2.1.287",
      sistemde: false,
      girisYapildi: !YENI,
      abonelik: !YENI,
      girisYontemi: YENI ? null : "claude.ai",
      saglayici: "firstParty",
      eposta: YENI ? null : "kurul@ornek.com",
      hata: null,
    },
    git: { kurulu: true, yol: "/usr/bin/git", surum: "2.43.0", kullaniciAdi: YENI ? null : "Furkan YILDIRIM", eposta: YENI ? null : "posta@furkanyildirim.com" },
    github: {
      kurulu: !YENI,
      kaynak: YENI ? null : "arnorg",
      yol: YENI ? null : `${EV}/.config/ArnOrg/araclar/gh/bin/gh`,
      surum: YENI ? null : "2.89.0",
      girisYapildi: !YENI,
      kullanici: YENI ? null : "furkan-y",
      ad: null,
      gitYardimcisi: !YENI,
      hata: null,
    },
    platform: `${process.platform}-${process.arch}`,
    projeKoku: `${EV}/ArnOrg`,
    gitKurulabilir: false,
  };
  const islemler = new Map();
  const durumYay = () => herkeseYay({ tur: "kurulum.durum", durum: kurulum });

  function islemAc(tur, alanlar = {}) {
    const i = { id: yeniKimlik("is"), tur, durum: "calisiyor", cikti: "", adres: null, kod: null, girdiBekliyor: false, hata: null, baslangic: simdi(), bitis: null, sonuc: null, ...alanlar };
    islemler.set(i.id, i);
    herkeseYay({ tur: "kurulum.islem", islem: i });
    return i;
  }
  const islemYay = (i) => herkeseYay({ tur: "kurulum.islem", islem: { ...i } });
  function satir(i, metin) {
    i.cikti = `${i.cikti}${i.cikti && !i.cikti.endsWith("\n") ? "\n" : ""}${metin}\n`.slice(-8000);
    islemYay(i);
  }
  function bitir(i, durum, hata = null, sonuc = null) {
    if (i.durum !== "calisiyor") return;
    Object.assign(i, { durum, hata, sonuc, bitis: simdi(), girdiBekliyor: false });
    islemYay(i);
  }
  const suren = (tur) => [...islemler.values()].find((i) => i.tur === tur && i.durum === "calisiyor");

  rota("GET", "/api/kurulum", () => kurulum);
  rota("GET", "/api/kurulum/islemler", () => [...islemler.values()].reverse());
  rota("GET", "/api/kurulum/islemler/:id", ({ p }) => {
    const i = islemler.get(p.id);
    if (!i) throw new Hata(404, ceviri("İşlem bulunamadı.", "Operation not found."));
    return i;
  });
  rota("POST", "/api/kurulum/islemler/:id/girdi", ({ p, govde }) => {
    const i = islemler.get(p.id);
    if (!i || i.durum !== "calisiyor" || !i.girdiBekliyor) throw new Hata(409, ceviri("Bu işlem girdi beklemiyor.", "This operation is not waiting for input."));
    i.girdiBekliyor = false;
    satir(i, `> ${"•".repeat(Math.min(12, String(govde?.metin ?? "").length))}`);
    setTimeout(() => claudeGirisiBitti(i, String(govde?.metin ?? "").trim().length >= 6), 1200);
    return i;
  });
  rota("DELETE", "/api/kurulum/islemler/:id", ({ p }) => {
    const i = islemler.get(p.id);
    if (!i) throw new Hata(404, ceviri("İşlem bulunamadı.", "Operation not found."));
    if (i.durum === "calisiyor") {
      Object.assign(i, { durum: "iptal", bitis: simdi(), girdiBekliyor: false });
      islemYay(i);
    }
    return i;
  });

  function claudeGirisiBitti(i, basarili) {
    if (i.durum !== "calisiyor") return;
    if (!basarili) {
      satir(i, "Login failed: invalid code");
      bitir(i, "hata", ceviri("Kod geçersiz. Girişi yeniden başlatın.", "The code is invalid. Start the sign-in again."));
      return;
    }
    satir(i, "Login successful.");
    Object.assign(kurulum.claude, { girisYapildi: true, abonelik: true, girisYontemi: "claude.ai", eposta: "kurul@ornek.com" });
    bitir(i, "tamam");
    durumYay();
  }

  rota("POST", "/api/kurulum/claude/giris", () => {
    const var_ = suren("claude_giris");
    if (var_) return var_;
    const adres = "https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&state=ornek";
    const i = islemAc("claude_giris", { cikti: `Opening browser to sign in…\nIf the browser didn't open, visit: ${adres}\nPaste code here if prompted > `, adres });
    setTimeout(() => {
      i.girdiBekliyor = true;
      islemYay(i);
    }, 900);
    // Tarayıcıda tamamlanmış gibi: kod yapıştırılmasa da 20 sn sonra giriş biter
    setTimeout(() => claudeGirisiBitti(i, true), 20_000);
    return i;
  });

  rota("POST", "/api/kurulum/claude/kur", () => {
    const var_ = suren("claude_kur");
    if (var_) return var_;
    const i = islemAc("claude_kur");
    void (async () => {
      for (const s of ["Checking installation status…", "Installing Claude Code native build latest…", "Downloading 2.1.287 (linux-x64)…", "Verifying checksum…", `Claude Code successfully installed! Location: ${EV}/.local/bin/claude`]) {
        await bekle(700);
        satir(i, s);
      }
      Object.assign(kurulum.claude, { kaynak: "sistem", yol: `${EV}/.local/bin/claude`, sistemde: true });
      bitir(i, "tamam");
      durumYay();
    })();
    return i;
  });

  rota("POST", "/api/kurulum/gh/kur", () => {
    const var_ = suren("gh_kur");
    if (var_) return var_;
    const i = islemAc("gh_kur");
    void (async () => {
      satir(i, ceviri("GitHub CLI'ın son sürümü aranıyor…", "Looking up the latest GitHub CLI release…"));
      await bekle(600);
      satir(i, ceviri("İndiriliyor: gh_2.89.0_linux_amd64.tar.gz", "Downloading: gh_2.89.0_linux_amd64.tar.gz"));
      for (const mb of [2.1, 5.8, 9.4, 12.9, 14.6]) {
        await bekle(450);
        i.cikti = `${i.cikti.replace(/\n[\d.]+ \/ 14\.6 MB\n$/, "\n")}${mb.toFixed(1)} / 14.6 MB\n`;
        islemYay(i);
      }
      satir(i, ceviri("Açılıyor…", "Extracting…"));
      await bekle(500);
      satir(i, ceviri("Hazır: gh 2.89.0", "Ready: gh 2.89.0"));
      Object.assign(kurulum.github, { kurulu: true, kaynak: "arnorg", yol: `${EV}/.config/ArnOrg/araclar/gh/bin/gh`, surum: "2.89.0" });
      bitir(i, "tamam");
      durumYay();
    })();
    return i;
  });

  rota("POST", "/api/kurulum/gh/giris", () => {
    if (!kurulum.github.kurulu) throw new Hata(404, ceviri("GitHub CLI (gh) kurulu değil; önce kurun.", "GitHub CLI (gh) is not installed; install it first."));
    const var_ = suren("gh_giris");
    if (var_) return var_;
    const i = islemAc("gh_giris", { cikti: "! First copy your one-time code: 4F2A-91BC\nOpen this URL to continue in your web browser: https://github.com/login/device\n", kod: "4F2A-91BC", adres: "https://github.com/login/device" });
    setTimeout(() => {
      if (i.durum !== "calisiyor") return;
      satir(i, "✓ Authentication complete.\n- gh config set -h github.com git_protocol https\n✓ Configured git protocol\n✓ Logged in as furkan-y");
      satir(i, ceviri("git, GitHub kimliğini gh'den alacak şekilde ayarlandı.", "git now uses gh for GitHub credentials."));
      Object.assign(kurulum.github, { girisYapildi: true, kullanici: "furkan-y", gitYardimcisi: true });
      bitir(i, "tamam");
      durumYay();
    }, 9000);
    return i;
  });
  rota("POST", "/api/kurulum/gh/git-yardimcisi", () => {
    kurulum.github.gitYardimcisi = true;
    durumYay();
    return kurulum.github;
  });
  rota("POST", "/api/kurulum/git/kur", () => {
    throw new Hata(400, ceviri("git'i paket yöneticinizle kurun: sudo apt install git (Debian, Ubuntu), sudo dnf install git (Fedora).", "Install git with your package manager: sudo apt install git (Debian, Ubuntu), sudo dnf install git (Fedora)."));
  });
  rota("PUT", "/api/kurulum/git/kimlik", ({ govde }) => {
    const ad = String(govde?.ad ?? "").trim();
    const eposta = String(govde?.eposta ?? "").trim();
    if (!ad) throw new Hata(400, ceviri("Ad 1–100 karakter olmalı.", "Name must be 1–100 characters."));
    if (!/^[^\s@]+@[^\s@]+$/.test(eposta)) throw new Hata(400, ceviri("Geçerli bir e-posta adresi girin.", "Enter a valid email address."));
    Object.assign(kurulum.git, { kullaniciAdi: ad, eposta });
    durumYay();
    return kurulum.git;
  });

  // -------------------------------------------------------------------------
  // GitHub
  // -------------------------------------------------------------------------

  const depolar = [
    ["furkan-y/siparis-paneli", ceviri("Küçük işletmeler için sipariş, stok ve kargo takibi", "Order, stock and shipping tracking for small businesses"), true, "main", 40],
    ["furkan-y/kargo-entegrasyon", ceviri("Kargo firmalarının API'leri için tek arayüz", "One interface for shipping carriers' APIs"), true, "main", 60 * 5],
    ["arnex-studio/arnex-web", ceviri("Arnex'in tanıtım sitesi (Astro)", "Arnex's marketing site (Astro)"), false, "main", 60 * 26],
    ["arnex-studio/tasarim-sistemi", ceviri("Ortak bileşen kitaplığı ve tasarım belirteçleri", "Shared component library and design tokens"), false, "main", 60 * 24 * 3],
    ["furkan-y/mobil-uygulama", ceviri("Sipariş panelinin mobil eşi (React Native)", "The order panel's mobile companion (React Native)"), true, "gelistirme", 60 * 24 * 6],
    ["furkan-y/blog", ceviri("Kişisel blog", "Personal blog"), false, "main", 60 * 24 * 12],
    ["furkan-y/arnorg-deneme", ceviri("ArnOrg ile denemeler", "Experiments with ArnOrg"), true, null, 60 * 24 * 20],
    ["furkan-y/dotfiles", ceviri("Geliştirme ortamı ayarları", "Development environment settings"), false, "master", 60 * 24 * 40],
  ].map(([tamAd, aciklama, ozel, varsayilanDal, dk]) => ({ ad: tamAd.split("/")[1], tamAd, sahip: tamAd.split("/")[0], aciklama, ozel, varsayilanDal, guncelleme: once(dk), adres: `https://github.com/${tamAd}` }));
  const girisGerekli = () => {
    if (!kurulum.github.kurulu) throw new Hata(412, ceviri("GitHub CLI (gh) kurulu değil. Kurulum adımından kurun.", "GitHub CLI (gh) is not installed. Install it from the setup step."));
    if (!kurulum.github.girisYapildi) throw new Hata(412, ceviri("GitHub'a giriş yapılmamış.", "Not signed in to GitHub."));
  };

  rota("GET", "/api/github/hesap", () => (girisGerekli(), { kullanici: "furkan-y", ad: "Furkan YILDIRIM", eposta: "posta@furkanyildirim.com", kuruluslar: ["arnex-studio"] }));
  rota("GET", "/api/github/depolar", ({ q }) => {
    girisGerekli();
    const s = (q.get("q") ?? "").trim().toLocaleLowerCase();
    return s ? depolar.filter((d) => d.tamAd.toLocaleLowerCase().includes(s) || d.aciklama.toLocaleLowerCase().includes(s)) : depolar;
  });
  rota("GET", "/api/github/dallar", ({ q }) => {
    girisGerekli();
    const d = depolar.find((x) => x.tamAd === q.get("depo"));
    if (!d) throw new Hata(404, ceviri("Depo bulunamadı.", "Repository not found."));
    if (!d.varsayilanDal) return [];
    return [d.varsayilanDal, "gelistirme", "surum-1.2", "ozellik/kargo-takibi"].filter((v, i, l) => l.indexOf(v) === i).map((ad) => ({ ad, korumali: ad === d.varsayilanDal }));
  });

  /** Gerçek çekirdekteki POST /api/projeler'in sahte karşılığı (klonlama sonrasında da kullanılır) */
  function projeEkle(ad, yol, aciklama, dal, uzak) {
    const id = ad.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9ğüşöçı]+/g, "-").replace(/^-|-$/g, "") || yeniKimlik("p");
    const p = { id, ad, yol, aciklama: aciklama ?? "", varsayilanDal: dal || "main", olusturma: simdi(), uzakAdres: uzak ? `https://github.com/${uzak}.git` : null, github: uzak ?? null, otomatikGonder: true, hazirlik: "bekliyor", otomatikOnay: { etkin: false, turler: [...VARSAYILAN_OTOMATIK_ONAY_TURLERI] } };
    db.projeler.push(p);
    db.ajanlar.push({ id: yeniKimlik("ceo"), projeId: id, ad: "Ada", rol: "ceo", rolAdi: "CEO", model: "opus", yoneticiId: null, durum: "kapali", isAciklamasi: ceviri("Hazırlık bekliyor", "Waiting for the kickoff"), gorevId: null, oturumId: null, calismaAlani: null, dal: null, izinModu: "bypassPermissions", bugunToken: 0, toplamToken: 0, talimatEki: "", karakter: "k01", olusturma: simdi() });
    db.kanallar[id] = [{ ad: "genel", aciklama: "" }, { ad: "yonetim", aciklama: "" }, { ad: c.MUHENDISLIK, aciklama: "" }];
    db.notlar[id] = { "vizyon.md": ceviri(`# Vizyon\n\n${aciklama ?? ""}\n`, `# Vision\n\n${aciklama ?? ""}\n`) };
    db.notZamanlari[id] = { "vizyon.md": simdi() };
    db.politika[id] = structuredClone(db.politika["siparis-paneli"] ?? []);
    anayasalar[id] = { surum: 0, guncelleme: null, onaylayan: null, maddeler: [] };
    mesajEkle(id, "genel", "arnorg", ceviri(`${ad} projesi açıldı. Çalışma dalı ${p.varsayilanDal}${uzak ? `, GitHub deposu ${uzak}` : ""}. CEO hazır: hazırlık görüşmesi için #yonetim kanalını kullanın ya da brief'inizi buraya yazın.`, `${ad} is open. Working branch ${p.varsayilanDal}${uzak ? `, GitHub repository ${uzak}` : ""}. The CEO is ready: use #ceo for the kickoff conversation or write your brief here.`));
    yay({ tur: "proje.guncellendi", proje: projeOzeti(p) });
    return p;
  }
  c.projeEkleyici(projeEkle);

  rota("POST", "/api/github/klonla", ({ govde }) => {
    girisGerekli();
    const d = depolar.find((x) => x.tamAd === govde?.depo);
    if (!d) throw new Hata(404, ceviri("Depo bulunamadı.", "Repository not found."));
    const yol = govde?.yol?.trim() || `${EV}/ArnOrg/${d.ad}`;
    if (db.projeler.some((p) => p.yol === yol)) throw new Hata(409, ceviri(`Hedef klasör boş değil: ${yol}`, `The target folder is not empty: ${yol}`));
    const i = islemAc("klonla");
    void (async () => {
      satir(i, `${d.tamAd} → ${yol}`);
      satir(i, `Cloning into '${yol}'...`);
      for (const y of [12, 38, 64, 91, 100]) {
        await bekle(500);
        i.cikti = `${i.cikti.replace(/Receiving objects: .*\n$/, "")}Receiving objects: ${y}% (${Math.round(y * 9.4)}/940)${y === 100 ? ", 2.31 MiB | 4.12 MiB/s, done." : ""}\n`;
        islemYay(i);
      }
      satir(i, "Resolving deltas: 100% (512/512), done.");
      await bekle(400);
      const p = projeEkle(govde?.ad?.trim() || d.ad, yol, govde?.aciklama ?? d.aciklama, govde?.dal || d.varsayilanDal || "main", d.tamAd);
      satir(i, ceviri(`Proje açıldı: ${p.ad} (dal ${p.varsayilanDal})`, `Project opened: ${p.ad} (branch ${p.varsayilanDal})`));
      bitir(i, "tamam", null, { projeId: p.id });
    })();
    return i;
  });

  // -------------------------------------------------------------------------
  // Dizin gezgini
  // -------------------------------------------------------------------------

  const agac = {
    [EV]: ["Desktop", "Documents", "Downloads", "ArnOrg", "projeler"],
    [`${EV}/ArnOrg`]: ["siparis-paneli"],
    [`${EV}/projeler`]: ["arnex-web", "eski-site", "notlar"],
    [`${EV}/Documents`]: ["faturalar", "sunumlar"],
    [`${EV}/Desktop`]: [],
    [`${EV}/Downloads`]: [],
    "/": ["home", "opt", "srv", "tmp"],
    "/home": ["furkan"],
  };
  const repolar = new Set([`${EV}/ArnOrg/siparis-paneli`, `${EV}/projeler/arnex-web`, `${EV}/projeler/eski-site`]);
  const ust = (y) => (y === "/" ? null : y.replace(/\/[^/]+$/, "") || "/");
  rota("GET", "/api/dizinler", ({ q }) => {
    const yol = (q.get("yol") || EV).replace(/\/+$/, "") || "/";
    if (!(yol in agac)) throw new Hata(404, ceviri("Klasör bulunamadı.", "Folder not found."));
    return {
      yol,
      ust: ust(yol),
      kisayollar: [
        { ad: ceviri("Ev", "Home"), yol: EV },
        { ad: ceviri("Masaüstü", "Desktop"), yol: `${EV}/Desktop` },
        { ad: ceviri("Belgeler", "Documents"), yol: `${EV}/Documents` },
        { ad: ceviri("ArnOrg projeleri", "ArnOrg projects"), yol: `${EV}/ArnOrg` },
        { ad: "/", yol: "/" },
      ],
      dizinler: agac[yol].map((ad) => {
        const tam = yol === "/" ? `/${ad}` : `${yol}/${ad}`;
        return { ad, yol: tam, repo: repolar.has(tam) };
      }),
      repo: repolar.has(yol),
    };
  });
  rota("POST", "/api/dizinler", ({ govde }) => {
    const u = String(govde?.ust ?? "");
    const ad = String(govde?.ad ?? "").trim();
    if (!(u in agac)) throw new Hata(404, ceviri("Üst klasör bulunamadı.", "Parent folder not found."));
    if (!ad || /[\\/:*?"<>|]/.test(ad)) throw new Hata(400, ceviri("Geçersiz klasör adı.", "Invalid folder name."));
    if (agac[u].includes(ad)) throw new Hata(409, ceviri("Bu adda bir klasör zaten var.", "A folder with this name already exists."));
    agac[u].push(ad);
    const yol = u === "/" ? `/${ad}` : `${u}/${ad}`;
    agac[yol] = [];
    return { yol };
  });

  // -------------------------------------------------------------------------
  // Proje ayarları, dallar, eşitleme, GitHub'da depo açma, hazırlık
  // -------------------------------------------------------------------------

  rota("PATCH", "/api/projeler/:pid", ({ p, govde }) => {
    const pr = projeGerekli(p.pid);
    for (const k of ["ad", "aciklama", "otomatikGonder", "hazirlik"]) if (govde?.[k] !== undefined) pr[k] = govde[k];
    if (govde?.varsayilanDal && govde.varsayilanDal !== pr.varsayilanDal) {
      pr.varsayilanDal = govde.varsayilanDal;
      mesajEkle(pr.id, "genel", "arnorg", ceviri(`Çalışma dalı ${pr.varsayilanDal} oldu. Yeni işler bu daldan açılır, onaylı birleştirmeler bu dala girer.`, `The working branch is now ${pr.varsayilanDal}. New work branches off it and approved merges go into it.`));
    }
    if (govde?.otomatikOnay) {
      const acildi = govde.otomatikOnay.etkin && !pr.otomatikOnay.etkin;
      pr.otomatikOnay = { etkin: Boolean(govde.otomatikOnay.etkin), turler: govde.otomatikOnay.turler ?? [] };
      mesajEkle(pr.id, "genel", "arnorg", pr.otomatikOnay.etkin ? ceviri("Kurul otomatik onayı açtı; seçili türdeki onaylar kendiliğinden verilecek.", "The board turned on auto-approval; approvals of the selected types will be granted automatically.") : ceviri("Kurul otomatik onayı kapattı.", "The board turned off auto-approval."));
      if (pr.otomatikOnay.etkin) for (const o of db.onaylar) if (o.projeId === pr.id && o.durum === "bekliyor" && pr.otomatikOnay.turler.includes(o.tur)) otomatikOnayla(o);
    }
    projeYay(pr.id);
    return projeOzeti(pr);
  });
  function otomatikOnayla(o) {
    Object.assign(o, { durum: "onaylandi", sonuclanma: simdi(), not: ceviri("Otomatik onay", "Auto-approved") });
    yay({ tur: "onay.sonuc", onay: o }, o.projeId);
    projeYay(o.projeId);
  }
  rota("GET", "/api/projeler/:pid/dallar", ({ p }) => {
    const pr = projeGerekli(p.pid);
    const yerel = [...new Set([pr.varsayilanDal, "main", "gelistirme"])];
    return { mevcut: pr.varsayilanDal, calisma: pr.varsayilanDal, yerel, uzak: pr.github ? ["surum-1.2", "ozellik/kargo-takibi"] : [] };
  });
  let ilkEsitleme = true;
  rota("POST", "/api/projeler/:pid/esitle", ({ p }) => {
    const pr = projeGerekli(p.pid);
    if (!pr.uzakAdres) return { durum: "uzak_yok", mesaj: ceviri("Projenin uzak deposu yok.", "The project has no remote."), onde: 0, geride: 0 };
    if (ilkEsitleme && pr.id === "siparis-paneli") {
      ilkEsitleme = false;
      mesajEkle(pr.id, "genel", "arnorg", ceviri("Uzaktan 2 commit çekildi.", "Pulled 2 commit(s) from the remote."));
      return { durum: "cekildi", mesaj: ceviri("Uzaktan 2 commit çekildi.", "Pulled 2 commit(s) from the remote."), onde: 0, geride: 0 };
    }
    return { durum: "guncel", mesaj: ceviri("Uzak depoyla aynı.", "Up to date with the remote."), onde: 0, geride: 0 };
  });
  rota("POST", "/api/projeler/:pid/github", ({ p, govde }) => {
    const pr = projeGerekli(p.pid);
    if (pr.uzakAdres) throw new Hata(409, ceviri("Projenin zaten bir uzak deposu (origin) var.", "The project already has a remote (origin)."));
    const sahip = govde?.sahip || "furkan-y";
    const ad = pr.ad.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-|-$/g, "");
    pr.github = `${sahip}/${ad}`;
    pr.uzakAdres = `https://github.com/${pr.github}.git`;
    mesajEkle(pr.id, "genel", "arnorg", ceviri(`GitHub deposu açıldı: ${pr.github}. Onaylı birleştirmeler ${pr.varsayilanDal} dalıyla oraya gönderilecek.`, `GitHub repository created: ${pr.github}. Approved merges will be pushed there on ${pr.varsayilanDal}.`));
    projeYay(pr.id);
    return projeOzeti(pr);
  });

  // ---------------- hazırlık görüşmesi: #yonetim'de senaryolu CEO ----------------

  const HAZIRLIK = ceviri(
    [
      "Merhaba, ben Ada, şirketin CEO'suyum. Hazırlığı birlikte yapalım; her seferinde tek konu soracağım. İlk soru: bu projeyle kimin hangi sorununu çözüyoruz, ilk sürümde mutlaka ne olmalı?",
      "Anladım. Teknoloji ve kalite tarafında tercihleriniz neler? Örneğin dil, çatı, test beklentisi, tasarım dili. Söylediklerinizi kurul tercihi olarak hafızaya yazıyorum.",
      "Kaydettim. Şimdi ana yasa taslağı:\n1. Gizli bilgi (.env, anahtarlar) okunmaz, commit'lenmez.\n2. Test geçmeden iş incelemeye alınmaz.\n3. Commit mesajları Türkçe ve ne değiştiğini söyler.\n4. Yayın ve uzak depoya gönderim yalnız kurul onayıyla.\n5. Erişilebilirlik ve dar ekran her ekranda denenir.\nEklemek ya da çıkarmak istediğiniz var mı?",
      "Taslağı onayınıza sundum; Onaylar'da göreceksiniz. İlk ekip için bir backend ve bir frontend geliştirici öneriyorum; tekliflerini de sundum.",
      "Tamam. İlk planı panoya yazdım: altyapı, giriş ekranı ve ilk uçtan uca akış. Hazırlığı tamamlandı olarak işaretliyorum; ekip işe başlıyor.",
    ],
    [
      "Hi, I'm Ada, the company's CEO. Let's do the kickoff together; I'll ask one thing at a time. First question: whose problem are we solving with this project, and what must the first release have?",
      "Got it. What are your technology and quality preferences? For example language, framework, testing expectations, design language. I'm saving what you say as board preferences.",
      "Saved. Now the constitution draft:\n1. Secrets (.env, keys) are never read or committed.\n2. Work does not move to review until the tests pass.\n3. Commit messages say what changed.\n4. Releases and pushes to the remote only with the board's approval.\n5. Accessibility and narrow screens are tested on every screen.\nAnything to add or remove?",
      "I've submitted the draft for your approval; you'll see it in Approvals. For the first team I suggest a backend and a frontend developer; I've submitted those proposals too.",
      "Done. I've written the first plan on the board: infrastructure, the sign-in screen and the first end-to-end flow. I'm marking the kickoff complete; the team is getting started.",
    ],
  );
  const hazirlikAdimi = {};
  const ceo = (pid) => projeAjanlari(pid).find((a) => a.rol === "ceo");

  function yaziyor(pid, kanal, a, yaziyor_) {
    yay({ tur: "kanal.yaziyor", projeId: pid, kanal, ajanId: a.id, ad: a.ad, yaziyor: yaziyor_ }, pid);
  }

  /** CEO kanalda yanıt yazar: önce yazıyor göstergesi, sonra mesaj */
  function ceoYazar(pid, kanal, metin, gecikme = 2200) {
    const a = ceo(pid);
    if (!a) return;
    yaziyor(pid, kanal, a, true);
    setTimeout(() => {
      yaziyor(pid, kanal, a, false);
      mesajEkle(pid, kanal, a.id, metin);
      akisEkle(a.id, { tur: "asistan", metin });
    }, gecikme);
  }

  function hazirlikIlerle(pid) {
    const pr = proje(pid);
    const adim = hazirlikAdimi[pid] ?? 0;
    if (!pr || pr.hazirlik !== "suruyor" || adim >= HAZIRLIK.length) return false;
    hazirlikAdimi[pid] = adim + 1;
    const a = ceo(pid);
    ceoYazar(pid, "yonetim", HAZIRLIK[adim].replace(/\bAda\b/, a?.ad ?? "Ada"), 2400);
    if (adim === 2 && a) {
      // Ana yasa önerisi kurula gider
      setTimeout(() => {
        const maddeler = ceviri(
          [
            ["Gizli bilgi", ".env dosyaları ve anahtarlar okunmaz, commit'lenmez."],
            ["Testsiz iş yok", "Test geçmeden iş incelemeye alınmaz."],
            ["Türkçe commit", "Commit mesajları Türkçe ve ne değiştiğini söyler."],
            ["Kurul onayıyla yayın", "Yayın ve uzak depoya gönderim yalnız kurul onayıyla."],
            ["Erişilebilirlik", "Her ekran klavyeyle ve dar ekranda denenir."],
          ],
          [
            ["Secrets", ".env files and keys are never read or committed."],
            ["No untested work", "Work does not move to review until the tests pass."],
            ["Clear commits", "Commit messages say what changed."],
            ["Releases need the board", "Releases and pushes to the remote only with the board's approval."],
            ["Accessibility", "Every screen is tested with the keyboard and on narrow screens."],
          ],
        ).map(([baslik, metin], i) => ({ no: i + 1, baslik, metin, kural: i === 0 ? { hedef: "yol", desenler: ["(^|/)\\.env(\\.|$)"], karar: "ret" } : null }));
        onayAc(pid, a.id, "anayasa", ceviri(`Ana yasa önerisi · ${maddeler.length} madde`, `Constitution proposal · ${maddeler.length} articles`), [ceviri("Hazırlık görüşmesinde kurulla konuşuldu.", "Discussed with the board in the kickoff."), "", ...maddeler.map((m) => `${m.no}. ${m.baslik} — ${m.metin}`)].join("\n"), { maddeler, gerekce: "" });
      }, 9000);
    }
    if (adim === 3 && a) {
      // CEO'nun söylediği ilk ekip teklifleri kurula gider
      setTimeout(() => {
        for (const [ad, rol, rolAd, gerekce] of ceviri(
          [
            ["Deniz", "backend", "Backend geliştirici", "API, veritabanı ve testler için bir backend geliştirici; ilk uçtan uca akışın arka yüzü ona ait."],
            ["Ece", "frontend", "Frontend geliştirici", "Giriş ekranı ve ilk akışın arayüzü için bir frontend geliştirici."],
          ],
          [
            ["Deniz", "backend", "Backend developer", "A backend developer for the API, the database and the tests; the back end of the first end-to-end flow is theirs."],
            ["Ece", "frontend", "Frontend developer", "A frontend developer for the sign-in screen and the first flow's interface."],
          ],
        )) {
          if (projeAjanlari(pid).some((x) => x.ad === ad)) continue;
          onayAc(pid, a.id, "ise_alim", ceviri(`İşe alım: ${ad} · ${rolAd}`, `Hiring: ${ad} · ${rolAd}`), `${gerekce}\n\n${ceviri("Model", "Model")}: sonnet · ${ceviri("Yönetici", "Manager")}: ${a.ad}`, { ad, rol, model: "sonnet", yoneticiAd: a.ad, gerekce });
        }
      }, 5000);
    }
    if (adim === HAZIRLIK.length - 1) {
      setTimeout(() => {
        pr.hazirlik = "tamam";
        mesajEkle(pid, "genel", "arnorg", ceviri("Hazırlık tamamlandı. Amaç, tercihler, ana yasa ve ilk ekip konuşuldu; ilk plan panoda.", "Kickoff complete. Goal, preferences, constitution and first team discussed; the first plan is on the board."));
        kurulBildirimi(pid, a, "bilgi", ceviri("Hazırlık tamamlandı", "Kickoff complete"), ceviri("Amaç, tercihler, ana yasa ve ilk ekip konuşuldu; ilk plan panoda.", "Goal, preferences, constitution and first team discussed; the first plan is on the board."));
        projeYay(pid);
      }, 4000);
    }
    return true;
  }

  rota("POST", "/api/projeler/:pid/hazirlik", ({ p, govde }) => {
    const pr = projeGerekli(p.pid);
    if (govde?.islem === "atla") {
      pr.hazirlik = "atlandi";
    } else {
      pr.hazirlik = "suruyor";
      hazirlikAdimi[pr.id] = 0;
      mesajEkle(pr.id, "genel", "arnorg", ceviri(`Hazırlık başladı: ${ceo(pr.id)?.ad ?? "CEO"} (CEO) kurulla #yonetim kanalında projenin amacını, kurallarını ve ekibini konuşuyor.`, `Kickoff started: ${ceo(pr.id)?.ad ?? "the CEO"} is discussing the project's goal, rules and team with the board in #ceo.`));
      hazirlikIlerle(pr.id);
    }
    projeYay(pr.id);
    return projeOzeti(pr);
  });

  /** Kurulun #yonetim mesajı: hazırlık sürüyorsa sıradaki adım, yoksa CEO'nun kısa yanıtı */
  c.yonetimMesaji((pid, metin) => {
    if (hazirlikIlerle(pid)) return;
    ceoYazar(
      pid,
      "yonetim",
      metin.length > 80
        ? ceviri("Not aldım. Ekiple konuşup bugün içinde sana kısa bir plan ve tahmin döneceğim.", "Noted. I'll talk to the team and get back to you today with a short plan and an estimate.")
        : ceviri(`Anladım: "${metin}". Hemen ilgileniyorum; ilerlemeyi #genel'de görebilirsin.`, `Understood: "${metin}". I'm on it; you can follow the progress in #general.`),
    );
  });

  // -------------------------------------------------------------------------
  // Kurula açılır bildirimler ve onaylar
  // -------------------------------------------------------------------------

  function kurulBildirimi(pid, ajan, tur, baslik, metin, onayId = null) {
    yay({ tur: "kurul.bildirimi", projeId: pid, bildirim: { id: yeniKimlik("kb"), projeId: pid, ajanId: ajan?.id ?? null, ajanAd: ajan?.ad ?? "ArnOrg", tur, baslik, metin, zaman: simdi(), onayId } }, pid);
  }

  function onayAc(pid, ajanId, tur, baslik, ayrinti, veri) {
    const o = { id: yeniKimlik("o"), projeId: pid, ajanId, tur, baslik, ayrinti, veri, durum: "bekliyor", olusturma: simdi(), sonGecerlilik: null, sonuclanma: null, not: null };
    db.onaylar.unshift(o);
    yay({ tur: "onay.yeni", onay: o }, pid);
    projeYay(pid);
    return o;
  }

  // Var olan döngülerin açtığı onaylar da otomatik onaya ve açılır pencereye düşer
  yayDinle((olay) => {
    if (olay.tur !== "onay.yeni" || olay.onay.durum !== "bekliyor") return;
    const o = olay.onay;
    const pr = proje(o.projeId);
    if (pr?.otomatikOnay?.etkin && pr.otomatikOnay.turler.includes(o.tur)) {
      setTimeout(() => otomatikOnayla(o), 300);
      return;
    }
    const tur = o.tur === "teslim" ? "teslim" : o.tur === "arac" ? "yetki" : o.tur === "genel" ? "istek" : "onay";
    kurulBildirimi(o.projeId, ajanBul(o.ajanId), tur, o.baslik, o.ayrinti.slice(0, 800), o.id);
  });

  // Tohum: kurulun test edeceği bir teslim
  const ofis = "siparis-paneli";
  if (proje(ofis)) {
    const teslimAdimlari = ceviri(
      ["npm install && npm run dev ile paneli aç", "Yeni sipariş oluştur, ürün ve adet seç", "Siparişi kargoya ver; durumun 'Kargoda' olduğunu gör", "Sipariş listesini duruma göre süz"],
      ["Open the panel with npm install && npm run dev", "Create a new order, pick a product and quantity", "Ship the order; check its status is 'Shipped'", "Filter the order list by status"],
    );
    db.onaylar.unshift({
      id: "o-teslim-1",
      projeId: ofis,
      ajanId: "ada",
      tur: "teslim",
      baslik: ceviri("Teslim: Sipariş akışı uçtan uca", "Delivery: End-to-end order flow"),
      ayrinti: [ceviri("Sipariş oluşturma, kargoya verme ve listede süzme uçtan uca çalışıyor; testler yeşil.", "Creating, shipping and filtering orders works end to end; tests are green."), "", ceviri("Test adımları:", "Test steps:"), ...teslimAdimlari.map((x, i) => `${i + 1}. ${x}`), "", `${ceviri("Çalıştır", "Run")}: npm install && npm run dev`, `${ceviri("Adres", "Address")}: http://localhost:5173`].join("\n"),
      veri: { baslik: ceviri("Sipariş akışı uçtan uca", "End-to-end order flow"), ozet: ceviri("Sipariş oluşturma, kargoya verme ve listede süzme uçtan uca çalışıyor; testler yeşil.", "Creating, shipping and filtering orders works end to end; tests are green."), testAdimlari: teslimAdimlari, calistir: "npm install && npm run dev", adres: "http://localhost:5173", dal: "main" },
      durum: "bekliyor",
      olusturma: once(14),
      sonGecerlilik: null,
      sonuclanma: null,
      not: null,
    });
  }

  // Ara sıra CEO'dan öneri ya da istek (önemli an)
  const ONERILER = ceviri(
    [
      ["oneri", "Ödeme altyapısı için öneri", "Sipariş akışı oturdu; sıradaki büyük iş ödeme. iyzico ile başlamayı öneriyorum, entegrasyon iki gün sürer. Uygun görürseniz bir backend geliştirici daha almak istiyorum."],
      ["istek", "Kargo firması anahtarı gerekiyor", "Kargo takibi için Yurtiçi Kargo test anahtarına ihtiyacımız var. Ana yasa gereği anahtarı depoya koymuyoruz; ortam değişkeni olarak tanımlar mısınız?"],
      ["bilgi", "Haftalık durum", "Bu hafta 7 görev bitti, 2'si incelemede. Risk: kargo API'sinin test ortamı yavaş; testleri önbellekli çalıştırıyoruz."],
    ],
    [
      ["oneri", "Suggestion for payments", "The order flow is settled; payments are the next big piece. I suggest starting with iyzico; the integration takes two days. If you agree I'd like to hire another backend developer."],
      ["istek", "We need a shipping carrier key", "We need the carrier's test key for shipment tracking. Per the constitution we don't put keys in the repo; could you set it as an environment variable?"],
      ["bilgi", "Weekly status", "7 tasks done this week, 2 in review. Risk: the shipping API's test environment is slow; we run the tests with caching."],
    ],
  );
  let oneriNo = 0;
  setInterval(() => {
    const pr = proje(ofis);
    if (!pr) return;
    const [tur, baslik, metin] = ONERILER[oneriNo++ % ONERILER.length];
    const a = ceo(ofis);
    kurulBildirimi(ofis, a, tur, baslik, metin);
    mesajEkle(ofis, "yonetim", a?.id ?? "ada", `${baslik}\n\n${metin}`);
  }, 75_000).unref();

  // -------------------------------------------------------------------------
  // Ana yasa
  // -------------------------------------------------------------------------

  const anayasalar = {
    "siparis-paneli": {
      surum: 2,
      guncelleme: once(60 * 24 * 3),
      onaylayan: ceviri("Yönetim kurulu", "The board"),
      maddeler: ceviri(
        [
          ["Gizli bilgi", ".env dosyaları, anahtarlar ve müşteri verisi okunmaz, commit'lenmez, kanala yazılmaz.", { hedef: "yol", desenler: ["(^|/)\\.env(\\.|$)", "(^|/)secrets?/"], karar: "ret" }],
          ["Testsiz iş yok", "Test geçmeden hiçbir iş incelemeye alınmaz; yeni davranışa test yazılır.", null],
          ["Türkçe commit", "Commit mesajları Türkçe ve ne değiştiğini söyler; Claude imzası eklenmez.", null],
          ["Kurul onayıyla yayın", "Uzak depoya gönderim, yayın ve dağıtım yalnız kurul onayıyla yapılır.", { hedef: "komut", desenler: ["\\bgit\\s+push\\b", "\\bnpm\\s+publish\\b"], karar: "sor" }],
          ["Erişilebilirlik", "Her ekran klavyeyle ve 390 px genişlikte denenir; boş, yükleniyor ve hata hâli olmadan ekran bitmiş sayılmaz.", null],
          ["Veri silme", "Üretim verisini silen ya da toplu değiştiren komut çalıştırılmaz; göç dosyasıyla yapılır.", { hedef: "komut", desenler: ["\\bdrop\\s+table\\b", "\\btruncate\\b"], karar: "ret" }],
        ],
        [
          ["Secrets", ".env files, keys and customer data are never read, committed or posted to channels.", { hedef: "yol", desenler: ["(^|/)\\.env(\\.|$)", "(^|/)secrets?/"], karar: "ret" }],
          ["No untested work", "No work moves to review until the tests pass; new behaviour gets a test.", null],
          ["Clear commits", "Commit messages say what changed; no Claude signature is added.", null],
          ["Releases need the board", "Pushing to the remote, releasing and deploying happen only with the board's approval.", { hedef: "komut", desenler: ["\\bgit\\s+push\\b", "\\bnpm\\s+publish\\b"], karar: "sor" }],
          ["Accessibility", "Every screen is tried with the keyboard and at 390 px; a screen is not done without empty, loading and error states.", null],
          ["Deleting data", "No command that deletes or bulk-changes production data runs; it goes through a migration.", { hedef: "komut", desenler: ["\\bdrop\\s+table\\b", "\\btruncate\\b"], karar: "ret" }],
        ],
      ).map(([baslik, metin, kural], i) => ({ no: i + 1, baslik, metin, kural })),
    },
    "arnex-web": { surum: 0, guncelleme: null, onaylayan: null, maddeler: [] },
  };
  rota("GET", "/api/projeler/:pid/anayasa", ({ p }) => (projeGerekli(p.pid), anayasalar[p.pid] ?? { surum: 0, guncelleme: null, onaylayan: null, maddeler: [] }));
  rota("PUT", "/api/projeler/:pid/anayasa", ({ p, govde }) => {
    projeGerekli(p.pid);
    const maddeler = (govde?.maddeler ?? []).map((m, i) => {
      if (!m?.baslik?.trim() || !m?.metin?.trim()) throw new Hata(400, ceviri("Madde başlığı ve metni gerekli.", "Each article needs a title and text."));
      return { no: i + 1, baslik: m.baslik.trim(), metin: m.metin.trim(), kural: m.kural ?? null };
    });
    const eski = anayasalar[p.pid] ?? { surum: 0 };
    const yeni = { surum: eski.surum + 1, guncelleme: simdi(), onaylayan: ceviri("Yönetim kurulu", "The board"), maddeler };
    anayasalar[p.pid] = yeni;
    yay({ tur: "anayasa.guncellendi", projeId: p.pid, anayasa: yeni }, p.pid);
    mesajEkle(p.pid, "genel", "arnorg", ceviri(`Ana yasa güncellendi (sürüm ${yeni.surum}, ${maddeler.length} madde, onaylayan: Yönetim kurulu). Herkes uyar; ayrıntı .arnorg/anayasa.md.`, `The constitution was updated (version ${yeni.surum}, ${maddeler.length} articles, approved by: the board). Everyone follows it; details in .arnorg/anayasa.md.`));
    return yeni;
  });
  // Onaylanan ana yasa önerisi yürürlüğe girer
  c.onaySonucuDinle((o) => {
    if (o.tur !== "anayasa" || o.durum !== "onaylandi" || !o.veri?.maddeler) return;
    const eski = anayasalar[o.projeId] ?? { surum: 0 };
    const yeni = { surum: eski.surum + 1, guncelleme: simdi(), onaylayan: o.not === ceviri("Otomatik onay", "Auto-approved") ? ceviri("Otomatik onay", "Auto-approval") : ceviri("Yönetim kurulu", "The board"), maddeler: o.veri.maddeler };
    anayasalar[o.projeId] = yeni;
    yay({ tur: "anayasa.guncellendi", projeId: o.projeId, anayasa: yeni }, o.projeId);
  });

  // -------------------------------------------------------------------------
  // Global zekâ
  // -------------------------------------------------------------------------

  const kural = (metin, kapsam, kaynak, guven, durum, kanitSayisi, kullanim, yarar, ihlal, dk) => ({
    id: yeniKimlik("kr"),
    metin,
    kapsam,
    kaynak,
    kanitlar: Array.from({ length: kanitSayisi }, (_, i) => ({ projeId: i % 2 ? "arnex-web" : "siparis-paneli", projeAd: i % 2 ? "Arnex Web" : ceviri("Sipariş Paneli", "Order Panel"), metin, zaman: once(dk + i * 600) })),
    guven,
    kullanim,
    yarar,
    ihlal,
    durum,
    olusturma: once(dk + 2000),
    guncelleme: once(dk),
  });
  const zeka = {
    kurallar: ceviri(
      [
        ["Commit mesajlarında ve kodda emoji kullanma.", [], "kurul", 0.94, "etkin", 3, 212, 9, 0, 300],
        ["Gizli anahtarları asla depoya commit'leme; ortam değişkeni kullan.", [], "tercih", 0.91, "etkin", 2, 180, 6, 1, 900],
        ["Arayüzde her ekran için boş, yükleniyor ve hata hâli yaz.", ["frontend", "fullstack"], "kurul", 0.88, "etkin", 2, 96, 4, 2, 1400],
        ["Veritabanı şemasını yalnız göç dosyasıyla değiştir; elle ALTER çalıştırma.", ["backend", "fullstack"], "ogrenilen", 0.81, "etkin", 2, 74, 3, 0, 2600],
        ["Windows'ta yolları karşılaştırırken harf duyarsız karşılaştır, ters eğik çizgiyi düzelt.", ["gelistirici"], "ogrenilen", 0.72, "etkin", 2, 40, 2, 0, 4000],
        ["Görev açarken kabul ölçütünü ölçülebilir yaz.", ["yonetici"], "duzeltme", 0.77, "etkin", 2, 58, 2, 0, 3000],
        ["Bağımlılık eklemeden önce lisansını ve son güncellemesini kontrol et.", [], "ajan", 0.55, "aday", 1, 0, 0, 0, 700],
        ["API yanıtlarında tarihleri her zaman ISO 8601 ve UTC döndür.", ["backend"], "ogrenilen", 0.5, "aday", 1, 0, 0, 0, 1800],
        ["Her fonksiyona uzun açıklama yorumu yaz.", [], "ajan", 0.18, "emekli", 1, 30, 0, 0, 9000],
      ],
      [
        ["Don't use emoji in commit messages or code.", [], "kurul", 0.94, "etkin", 3, 212, 9, 0, 300],
        ["Never commit secret keys to the repository; use environment variables.", [], "tercih", 0.91, "etkin", 2, 180, 6, 1, 900],
        ["Write empty, loading and error states for every screen in the UI.", ["frontend", "fullstack"], "kurul", 0.88, "etkin", 2, 96, 4, 2, 1400],
        ["Change the database schema only through migration files; never run ALTER by hand.", ["backend", "fullstack"], "ogrenilen", 0.81, "etkin", 2, 74, 3, 0, 2600],
        ["On Windows, compare paths case-insensitively and normalise backslashes.", ["gelistirici"], "ogrenilen", 0.72, "etkin", 2, 40, 2, 0, 4000],
        ["Write measurable acceptance criteria when opening a task.", ["yonetici"], "duzeltme", 0.77, "etkin", 2, 58, 2, 0, 3000],
        ["Check a dependency's license and last update before adding it.", [], "ajan", 0.55, "aday", 1, 0, 0, 0, 700],
        ["Always return dates in API responses as ISO 8601 in UTC.", ["backend"], "ogrenilen", 0.5, "aday", 1, 0, 0, 0, 1800],
        ["Write a long explanatory comment on every function.", [], "ajan", 0.18, "emekli", 1, 30, 0, 0, 9000],
      ],
    ).map((x) => kural(...x)),
    gunluk: [],
  };
  const gunluk = (tur, metin, kuralId, dk = 0) => {
    const g = { id: yeniKimlik("zg"), zaman: once(dk), tur, metin, kuralId };
    zeka.gunluk.unshift(g);
    zeka.gunluk = zeka.gunluk.slice(0, 200);
    return g;
  };
  const kr = zeka.kurallar;
  gunluk("emekli", ceviri(`Emekliye ayrıldı: ${kr[8].metin}`, `Retired: ${kr[8].metin}`), kr[8].id, 6000);
  gunluk("ogrendi", ceviri(`Aday kural (Sipariş Paneli): ${kr[7].metin}`, `Candidate rule (Order Panel): ${kr[7].metin}`), kr[7].id, 1800);
  gunluk("etkinlesti", ceviri(`Standart oldu: ${kr[4].metin}`, `Became a standard: ${kr[4].metin}`), kr[4].id, 1500);
  gunluk("guclendi", ceviri(`Güçlendi (91%): ${kr[1].metin}`, `Strengthened (91%): ${kr[1].metin}`), kr[1].id, 900);
  gunluk("geri_bildirim", ceviri(`Ece: işe yaradı — ${kr[2].metin}`, `Ece: helped — ${kr[2].metin}`), kr[2].id, 400);
  gunluk("ogrendi", ceviri(`Aday kural (Sipariş Paneli): ${kr[6].metin}`, `Candidate rule (Order Panel): ${kr[6].metin}`), kr[6].id, 700);
  gunluk("guclendi", ceviri(`Güçlendi (94%): ${kr[0].metin}`, `Strengthened (94%): ${kr[0].metin}`), kr[0].id, 300);

  const zekaDurumu = () => {
    const sayilar = { aday: 0, etkin: 0, emekli: 0 };
    for (const k of zeka.kurallar) sayilar[k.durum]++;
    const sira = { etkin: 0, aday: 1, emekli: 2 };
    return { kurallar: [...zeka.kurallar].sort((a, b) => sira[a.durum] - sira[b.durum] || b.guven - a.guven), gunluk: zeka.gunluk, sayilar };
  };
  const zekaYay = (k, g, silinenId) => herkeseYay({ tur: "zeka.guncellendi", kural: k, gunluk: g, ...(silinenId ? { silinenId } : {}) });
  const kuralGerekli = (id) => {
    const k = zeka.kurallar.find((x) => x.id === id);
    if (!k) throw new Hata(404, ceviri("Kural bulunamadı.", "Rule not found."));
    return k;
  };
  rota("GET", "/api/zeka", () => zekaDurumu());
  rota("POST", "/api/zeka/kurallar", ({ govde }) => {
    const metin = String(govde?.metin ?? "").trim();
    if (metin.length < 5) throw new Hata(400, ceviri("Kural 5–600 karakter olmalı.", "A rule must be 5–600 characters."));
    const k = kural(metin, govde?.kapsam ?? [], "kurul", 0.9, "etkin", 1, 0, 0, 0, 0);
    k.kanitlar = [{ projeId: null, projeAd: null, metin, zaman: simdi() }];
    zeka.kurallar.unshift(k);
    zekaYay(k, gunluk("duzenlendi", ceviri(`Kurul ekledi: ${metin}`, `Added by the board: ${metin}`), k.id));
    return k;
  });
  rota("PATCH", "/api/zeka/kurallar/:id", ({ p, govde }) => {
    const k = kuralGerekli(p.id);
    if (govde?.metin) k.metin = String(govde.metin).trim();
    if (govde?.kapsam) k.kapsam = govde.kapsam;
    if (govde?.durum) {
      k.durum = govde.durum;
      if (govde.durum === "etkin" && k.guven < 0.7) k.guven = 0.7;
    }
    k.guncelleme = simdi();
    zekaYay(k, gunluk("duzenlendi", ceviri(`Kurul düzenledi: ${k.metin}`, `Edited by the board: ${k.metin}`), k.id));
    return k;
  });
  rota("POST", "/api/zeka/kurallar/:id/geri-bildirim", ({ p, govde }) => {
    const k = kuralGerekli(p.id);
    if (govde?.sonuc === "ise_yaradi") Object.assign(k, { yarar: k.yarar + 1, guven: Math.min(0.97, k.guven + 0.04) });
    else if (govde?.sonuc === "ihlal") k.ihlal += 1;
    else {
      k.guven = Math.max(0, k.guven - 0.2);
      if (k.guven < 0.3) k.durum = "emekli";
    }
    k.guncelleme = simdi();
    const sonucAdi = govde?.sonuc === "ise_yaradi" ? ceviri("işe yaradı", "helped") : govde?.sonuc === "ihlal" ? ceviri("çiğnendi", "was broken") : ceviri("yanlış bulundu", "was found wrong");
    zekaYay(k, gunluk("geri_bildirim", `${ceviri("Yönetim kurulu", "The board")}: ${sonucAdi} — ${k.metin}`, k.id));
    return k;
  });
  rota("DELETE", "/api/zeka/kurallar/:id", ({ p }) => {
    const k = kuralGerekli(p.id);
    zeka.kurallar = zeka.kurallar.filter((x) => x.id !== k.id);
    zekaYay(null, gunluk("duzenlendi", ceviri(`Kurul sildi: ${k.metin}`, `Deleted by the board: ${k.metin}`), null), k.id);
    return { tamam: true };
  });
  // Ara sıra öğrenme: aday kurala kanıt gelir, güven artar, gerekirse standart olur
  setInterval(() => {
    const aday = zeka.kurallar.find((k) => k.durum === "aday");
    if (!aday) return;
    aday.kanitlar.push({ projeId: "arnex-web", projeAd: "Arnex Web", metin: aday.metin, zaman: simdi() });
    aday.guven = Math.min(0.97, aday.guven + 0.15);
    let g;
    if (aday.guven >= 0.65) {
      aday.durum = "etkin";
      g = gunluk("etkinlesti", ceviri(`Standart oldu: ${aday.metin}`, `Became a standard: ${aday.metin}`), aday.id);
      yay({ tur: "bildirim", seviye: "bilgi", metin: ceviri(`Global zekâ yeni bir standart öğrendi: ${aday.metin}`, `Global intelligence learned a new standard: ${aday.metin}`) });
    } else {
      g = gunluk("guclendi", ceviri(`Güçlendi (${Math.round(aday.guven * 100)}%): ${aday.metin}`, `Strengthened (${Math.round(aday.guven * 100)}%): ${aday.metin}`), aday.id);
    }
    aday.guncelleme = simdi();
    zekaYay(aday, g);
  }, 95_000).unref();

  // -------------------------------------------------------------------------
  // Ajan zekâsı: kişisel hafıza, sözler, beceriler
  // -------------------------------------------------------------------------

  const kisisel = ceviri(
    {
      ada: ["Kurul kısa rapor seviyor: biten, süren, risk, karar bekleyen.", "Kerem teknik tahminlerde iyimser; tahmini 1,5 ile çarp.", "Cuma akşamları dönem raporu yaz."],
      kerem: ["Göç dosyaları paketler/sunucu/goc altında; sıra numarası ver.", "Kargo API'si test ortamında 30 sn'ye kadar gecikiyor; zaman aşımını uzun tut."],
      deniz: ["Testleri vitest --run ile çalıştır; izleme kipi oturumu kilitler.", "Sipariş durum geçişleri tek yerde: siparis/durum.ts."],
      ece: ["Tasarım belirteçleri stiller/tokenlar.css içinde; yeni renk ekleme.", "Dar ekranı 390 px'te dene."],
    },
    {
      ada: ["The board likes short reports: done, in progress, risks, decisions pending.", "Kerem is optimistic with estimates; multiply by 1.5.", "Write the period report on Friday evenings."],
      kerem: ["Migrations live in paketler/sunucu/goc; give them a sequence number.", "The shipping API's test environment can lag up to 30 s; keep timeouts long."],
      deniz: ["Run tests with vitest --run; watch mode locks the session.", "Order status transitions live in one place: siparis/durum.ts."],
      ece: ["Design tokens are in stiller/tokenlar.css; don't add new colours.", "Check narrow screens at 390 px."],
    },
  );
  const sozler = [
    ["deniz", "Deniz", "ece", "Ece", ceviri("Sipariş durum API'sini yarın öğlene kadar bitireceğim.", "I'll finish the order status API by noon tomorrow."), sonra(60 * 60 * 20), "acik", 120],
    ["ece", "Ece", null, ceviri("Yönetim kurulu", "The board"), ceviri("Sipariş listesinin dar ekran hâlini bu hafta göstereceğim.", "I'll show the narrow-screen order list this week."), null, "acik", 300],
    ["kerem", "Kerem", "deniz", "Deniz", ceviri("Göç dosyası şablonunu yazacağım.", "I'll write the migration file template."), null, "tutuldu", 900],
    ["ada", "Ada", null, ceviri("Yönetim kurulu", "The board"), ceviri("Cuma akşamı dönem raporunu yazacağım.", "I'll write the period report on Friday evening."), sonra(60 * 60 * 30), "acik", 60],
  ].map(([verenId, verenAd, aliciId, aliciAd, metin, sonTarih, durum, dk]) => ({ id: yeniKimlik("sz"), projeId: ofis, verenId, verenAd, aliciId, aliciAd, metin, sonTarih, durum, not: durum === "tutuldu" ? ceviri("Şablon notlarda.", "The template is in the notes.") : null, olusturma: once(dk), kapanis: durum === "tutuldu" ? once(dk - 200) : null }));
  const beceriler = ceviri(
    [
      ["Veritabanı göçü", "Şema değişince göç dosyası yazmak için", "Kerem", "1. `npm run goc:yeni -- <ad>` ile dosyayı aç.\n2. Yukarı ve aşağı adımlarını yaz; veri kaybı olacaksa önce kopyala.\n3. `npm run goc` ile yerelde dene, testleri çalıştır.\n4. Göç numarasını görev açıklamasına yaz.", 9],
      ["Kargo API'sini sahtelemek", "Kargo firmasına gitmeden test yazmak için", "Deniz", "Testlerde `kargo/sahte.ts` istemcisini kullan; gerçek API'ye yalnız uçtan uca testte git. Zaman aşımı 30 sn.", 5],
      ["Dar ekran denemesi", "Bir ekranı bitirmeden önce", "Ece", "Playwright ile 390×844'te aç, yatay taşmaya bak, klavyeyle bütün kontrollere ulaş.", 4],
    ],
    [
      ["Database migration", "To write a migration when the schema changes", "Kerem", "1. Create the file with `npm run goc:yeni -- <name>`.\n2. Write the up and down steps; copy the data first if anything could be lost.\n3. Try it locally with `npm run goc` and run the tests.\n4. Put the migration number in the task description.", 9],
      ["Mocking the shipping API", "To write tests without calling the carrier", "Deniz", "Use the `kargo/sahte.ts` client in tests; hit the real API only in end-to-end tests. Timeout 30 s.", 5],
      ["Narrow-screen check", "Before finishing a screen", "Ece", "Open it at 390×844 with Playwright, look for horizontal overflow and reach every control with the keyboard.", 4],
    ],
  ).map(([ad, aciklama, yazan, icerik, kullanim], i) => ({ ad, aciklama, yazan, guncelleme: once(600 + i * 900), kullanim, icerik }));

  rota("GET", "/api/projeler/:pid/sozler", ({ p, q }) => {
    projeGerekli(p.pid);
    const d = q.get("durum");
    return sozler.filter((s) => s.projeId === p.pid && (!d || s.durum === d));
  });
  rota("GET", "/api/projeler/:pid/beceriler", ({ p }) => (projeGerekli(p.pid), p.pid === ofis ? beceriler.map(({ icerik, ...b }) => b) : []));
  rota("GET", "/api/projeler/:pid/beceriler/:ad", ({ p }) => {
    const b = beceriler.find((x) => x.ad === decodeURIComponent(p.ad));
    if (!b || p.pid !== ofis) throw new Hata(404, ceviri("Beceri bulunamadı.", "Skill not found."));
    return b;
  });
  rota("GET", "/api/ajanlar/:aid/zeka", ({ p }) => {
    const a = ajanGerekli(p.aid);
    const k = kisisel[a.id] ?? [];
    const ekip = projeAjanlari(a.projeId);
    const yonetici = ekip.find((x) => x.id === a.yoneticiId);
    const bagli = ekip.filter((x) => x.yoneticiId === a.id);
    const verdigi = sozler.filter((s) => s.verenId === a.id);
    const aldigi = sozler.filter((s) => s.aliciId === a.id && s.durum === "acik");
    const baglar = [
      `- ${ceviri("Yöneticin", "Your manager")}: ${yonetici ? `${yonetici.ad} (${yonetici.rolAdi})` : ceviri("Yönetim kurulu", "the board")}`,
      bagli.length ? `- ${ceviri("Sana bağlı", "Reporting to you")}: ${bagli.map((x) => x.ad).join(", ")}` : "",
      verdigi.some((s) => s.durum === "acik") ? `- ${ceviri("Açık sözlerin", "Your open promises")}: ${verdigi.filter((s) => s.durum === "acik").map((s) => `${s.aliciAd}: ${s.metin}`).join("; ")}` : "",
      aldigi.length ? `- ${ceviri("Sana verilen sözler", "Promises made to you")}: ${aldigi.map((s) => `${s.verenAd}: ${s.metin}`).join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      kisisel: k,
      kisiselSinir: 2200,
      kisiselKullanim: k.join("\n").length,
      defter: db.defterler[a.id]?.icerik ?? db.defterler[a.id] ?? "",
      sozler: verdigi,
      alinanSozler: aldigi,
      beceriler: a.projeId === ofis ? beceriler.map(({ icerik, ...b }) => b) : [],
      baglar,
    };
  });
  rota("POST", "/api/ajanlar/:aid/aktar", ({ p, govde }) => {
    const veren = ajanGerekli(p.aid);
    const alan = ajanGerekli(String(govde?.kime ?? ""));
    if (veren.id === alan.id) throw new Hata(400, ceviri("Kendine aktarım yapamazsın.", "You cannot transfer to yourself."));
    const verenin = kisisel[veren.id] ?? [];
    const tarih = simdi().slice(0, 10);
    const not = String(govde?.not ?? "").trim();
    // Alanın kişisel hafızasına devir notu, defterine devir bölümü
    kisisel[alan.id] = [...(kisisel[alan.id] ?? []).filter((m) => !m.includes(`(${tarih})`) || !m.includes(veren.ad)), ceviri(`${ayrilma(veren.ad)} devir aldım (${tarih}): defterimde "Devir" bölümüne bak.${not ? ` ${not}` : ""}`, `I took over from ${veren.ad} (${tarih}): see the "Handover" section in my journal.${not ? ` ${not}` : ""}`)];
    const onceki = db.defterler[alan.id]?.icerik ?? db.defterler[alan.id] ?? "";
    const bolum = [ceviri(`## Devir: ${veren.ad} → ${alan.ad}, ${tarih}`, `## Handover: ${veren.ad} → ${alan.ad}, ${tarih}`), ...verenin.map((m) => `- ${m}`)].join("\n");
    db.defterler[alan.id] = { icerik: `${onceki ? `${onceki}\n\n` : ""}${bolum}`, guncelleme: simdi() };
    return { mesaj: ceviri(`${yonelme(alan.ad)} aktarıldı: ${verenin.length} kişisel madde, defter.`, `Transferred to ${alan.ad}: ${verenin.length} personal entries, journal.`) };
  });

  return { kurulBildirimi, ceoYazar, yaziyor, dil: DIL };
}
