// Yerel ArnOrg eklentisi (tezgâhın ana iş parçacığında çalışır):
// - FY Mürekkep teması
// - hızlı açma ve "Dosyalarda bul" için çekirdeğe giden arama sağlayıcıları
// - ajan farkındalığı: gezgin rozetleri, durum çubuğu "… düzenliyor", "Duraklat ve düzenle"
// - kaynak denetimi: ana repo için git (aşamaya alma, geri alma, commit), ajan alanları için temel dala göre fark
import type { GitBasvurusu, GitDegisikligi, GitDegisiklikTuru, GitDurumu } from "@arnorg/ortak";
import { ExtensionHostKind, registerExtension, type IExtensionManifest } from "@codingame/monaco-vscode-api/extensions";
import type * as vscode from "vscode";
import { olaylariDinle } from "../api/canli";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { useVeri } from "../durum/veri";
import { belirtme, dosyaAdi, ilkHarf, yonelme } from "../yardimcilar/bicim";
import { ajanIzleri } from "./ajanIzleri";
import { adresYolu, GIT_SEMASI, konumCoz, SEMA, type Konum } from "./adres";
import type { ArnorgDosyaSistemi } from "./dosyaSistemi";
import { kodApi } from "./kodApi";
import { fyTemasi, TEMA_ADI } from "./tema";

type Vscode = typeof vscode;

const MANIFEST: IExtensionManifest = {
  name: "kod",
  publisher: "arnorg",
  displayName: "ArnOrg",
  description: "ArnOrg ajanlarıyla birlikte çalışma: tema, arama, ajan rozetleri ve kaynak denetimi",
  version: "1.0.0",
  engines: { vscode: "*" },
  enabledApiProposals: ["fileSearchProvider2", "textSearchProvider2", "scmActionButton"],
  contributes: {
    themes: [{ id: TEMA_ADI, label: TEMA_ADI, uiTheme: "vs-dark", path: "./temalar/fy-murekkep.json" }],
    colors: [
      {
        id: "arnorg.ajanRozeti",
        description: "Ajanın değiştirdiği dosyanın gezgindeki rozet rengi",
        defaults: { dark: "#ff8b7c", light: "#c2410c", highContrast: "#ff8b7c", highContrastLight: "#c2410c" },
      },
    ],
    commands: [
      { command: "arnorg.duraklatVeDuzenle", title: "Duraklat ve düzenle", category: "ArnOrg", icon: "$(debug-pause)" },
      { command: "arnorg.git.yenile", title: "Yenile", category: "ArnOrg Git", icon: "$(refresh)" },
      { command: "arnorg.git.commit", title: "Commit", category: "ArnOrg Git", icon: "$(check)" },
      { command: "arnorg.git.hazirla", title: "Değişiklikleri Aşamaya Al", category: "ArnOrg Git", icon: "$(add)" },
      { command: "arnorg.git.hazirlaHepsi", title: "Tüm Değişiklikleri Aşamaya Al", category: "ArnOrg Git", icon: "$(add)" },
      { command: "arnorg.git.geriAl", title: "Aşamadan Çıkar", category: "ArnOrg Git", icon: "$(remove)" },
      { command: "arnorg.git.geriAlHepsi", title: "Tümünü Aşamadan Çıkar", category: "ArnOrg Git", icon: "$(remove)" },
      { command: "arnorg.git.at", title: "Değişiklikleri At", category: "ArnOrg Git", icon: "$(discard)" },
      { command: "arnorg.git.dosyayiAc", title: "Dosyayı Aç", category: "ArnOrg Git", icon: "$(go-to-file)" },
      { command: "arnorg.git.farkAc", title: "Değişiklikleri Aç", category: "ArnOrg Git" },
    ],
    menus: {
      "editor/title": [{ command: "arnorg.duraklatVeDuzenle", when: "arnorg.ajanDuzenliyor && resourceScheme == arnorg", group: "navigation@-100" }],
      "scm/title": [
        { command: "arnorg.git.commit", when: "scmProvider == arnorg-ana", group: "navigation@1" },
        { command: "arnorg.git.yenile", when: "scmProvider =~ /^arnorg-/", group: "navigation@2" },
      ],
      "scm/resourceGroup/context": [
        { command: "arnorg.git.hazirlaHepsi", when: "scmProvider == arnorg-ana && scmResourceGroup == degisen", group: "inline" },
        { command: "arnorg.git.geriAlHepsi", when: "scmProvider == arnorg-ana && scmResourceGroup == hazirlanan", group: "inline" },
        { command: "arnorg.git.hazirlaHepsi", when: "scmProvider == arnorg-ana && scmResourceGroup == degisen", group: "1_degisiklik" },
        { command: "arnorg.git.geriAlHepsi", when: "scmProvider == arnorg-ana && scmResourceGroup == hazirlanan", group: "1_degisiklik" },
      ],
      "scm/resourceState/context": [
        { command: "arnorg.git.dosyayiAc", when: "scmProvider =~ /^arnorg-/", group: "inline@0" },
        { command: "arnorg.git.at", when: "scmProvider == arnorg-ana && scmResourceGroup == degisen", group: "inline@1" },
        { command: "arnorg.git.hazirla", when: "scmProvider == arnorg-ana && scmResourceGroup == degisen", group: "inline@2" },
        { command: "arnorg.git.geriAl", when: "scmProvider == arnorg-ana && scmResourceGroup == hazirlanan", group: "inline@2" },
        { command: "arnorg.git.farkAc", when: "scmProvider =~ /^arnorg-/", group: "navigation@0" },
        { command: "arnorg.git.dosyayiAc", when: "scmProvider =~ /^arnorg-/", group: "navigation@1" },
        { command: "arnorg.git.hazirla", when: "scmProvider == arnorg-ana && scmResourceGroup == degisen", group: "1_degisiklik@1" },
        { command: "arnorg.git.geriAl", when: "scmProvider == arnorg-ana && scmResourceGroup == hazirlanan", group: "1_degisiklik@1" },
        { command: "arnorg.git.at", when: "scmProvider == arnorg-ana && scmResourceGroup == degisen", group: "1_degisiklik@2" },
      ],
      commandPalette: [
        { command: "arnorg.git.hazirla", when: "false" },
        { command: "arnorg.git.hazirlaHepsi", when: "false" },
        { command: "arnorg.git.geriAl", when: "false" },
        { command: "arnorg.git.geriAlHepsi", when: "false" },
        { command: "arnorg.git.at", when: "false" },
        { command: "arnorg.git.dosyayiAc", when: "false" },
        { command: "arnorg.git.farkAc", when: "false" },
        { command: "arnorg.duraklatVeDuzenle", when: "arnorg.ajanDuzenliyor" },
      ],
    },
  },
};

const DEGISIKLIK_ADLARI: Record<GitDegisiklikTuru, string> = {
  M: "Değiştirildi",
  A: "Eklendi",
  D: "Silindi",
  R: "Yeniden adlandırıldı",
  C: "Kopyalandı",
  U: "Çakışma",
  "?": "İzlenmiyor",
};
const DEGISIKLIK_RENKLERI: Record<GitDegisiklikTuru, string> = {
  M: "gitDecoration.modifiedResourceForeground",
  A: "gitDecoration.addedResourceForeground",
  D: "gitDecoration.deletedResourceForeground",
  R: "gitDecoration.renamedResourceForeground",
  C: "gitDecoration.addedResourceForeground",
  U: "gitDecoration.conflictingResourceForeground",
  "?": "gitDecoration.untrackedResourceForeground",
};

/** Yerel eklentiyi kaydeder; tema dosyası ve API hazır olunca etkinleştirir */
export function arnorgEklentisiniKaydet(dosyaSistemi: ArnorgDosyaSistemi): void {
  const eklenti = registerExtension(MANIFEST, ExtensionHostKind.LocalProcess, { system: true });
  const temaAdresi = URL.createObjectURL(new Blob([JSON.stringify(fyTemasi)], { type: "application/json" }));
  eklenti.registerFileUrl("./temalar/fy-murekkep.json", temaAdresi);
  void eklenti.getApi().then((v) => etkinlestir(v, dosyaSistemi));
}

function etkinlestir(v: Vscode, dosyaSistemi: ArnorgDosyaSistemi) {
  const adres = (yol: string) => v.Uri.from({ scheme: SEMA, path: yol });
  const gitAdresi = (yol: string, ref: GitBasvurusu) => v.Uri.from({ scheme: GIT_SEMASI, path: yol, query: `ref=${ref}` });
  const altAdres = (kok: vscode.Uri, yol: string) => adres(`${kok.path}/${yol}`);

  // ---------------- arama ----------------
  const listeOnbellegi = new WeakMap<object, Map<string, Promise<string[]>>>();
  v.workspace.registerFileSearchProvider2(SEMA, {
    async provideFileSearchResults(desen, s, belirtec) {
      const aranan = desen.replace(/\s+/g, "").toLowerCase();
      const sonuc: vscode.Uri[] = [];
      // Dosya listesi hızlı açma oturumu boyunca bir kez alınır; yazdıkça yalnız süzülür
      let onbellek = listeOnbellegi.get(s.session);
      if (!onbellek) listeOnbellegi.set(s.session, (onbellek = new Map()));
      for (const k of s.folderOptions) {
        const konum = konumCoz(k.folder.path);
        if (!konum) continue;
        let liste = onbellek.get(k.folder.path);
        if (!liste) {
          liste = kodApi.dosyalar(konum.projeId, konum.alan).catch(() => [] as string[]);
          onbellek.set(k.folder.path, liste);
        }
        const yollar = await liste;
        if (belirtec.isCancellationRequested) return [];
        for (const yol of yollar) {
          if (aranan && !bulanikIcerir(yol.toLowerCase(), aranan)) continue;
          sonuc.push(altAdres(k.folder, yol));
          if (sonuc.length >= s.maxResults) return sonuc;
        }
      }
      return sonuc;
    },
  });

  v.workspace.registerTextSearchProvider2(SEMA, {
    async provideTextSearchResults(sorgu, s, ilerleme, belirtec) {
      const iptal = new AbortController();
      belirtec.onCancellationRequested(() => iptal.abort());
      let kalan = s.maxResults;
      let sinirAsildi = false;
      for (const k of s.folderOptions) {
        if (belirtec.isCancellationRequested || kalan <= 0) break;
        const konum = konumCoz(k.folder.path);
        if (!konum) continue;
        const sonuc = await kodApi
          .ara(
          konum.projeId,
          {
            alan: konum.alan,
            desen: sorgu.pattern,
            regex: sorgu.isRegExp,
            harfDuyarli: sorgu.isCaseSensitive,
            tamSozcuk: sorgu.isWordMatch,
            dahil: k.includes,
            haric: k.excludes.map((d) => (typeof d === "string" ? d : d.pattern)),
            sinir: kalan,
            enBuyukBoyut: s.maxFileSize,
          },
          iptal.signal,
          )
          .catch((h: unknown) => {
            // Kullanıcı yazmaya devam edince arama iptal edilir; hata değildir
            if (h instanceof DOMException && h.name === "AbortError") return null;
            throw h;
          });
        if (!sonuc) return { limitHit: false };
        for (const d of sonuc.dosyalar) {
          const uri = altAdres(k.folder, d.yol);
          for (const e of d.eslesmeler) {
            const ilkSatirSonu = e.onizleme.indexOf("\n");
            const ilkUzunluk = ilkSatirSonu < 0 ? e.onizleme.length : ilkSatirSonu;
            const kaynak = new v.Range(e.satir, e.sutun, e.sonSatir, e.sonSutun);
            const onizleme =
              e.sonSatir === e.satir
                ? new v.Range(0, e.sutun - e.onizlemeBaslangic, 0, Math.min(ilkUzunluk, e.sonSutun - e.onizlemeBaslangic))
                : new v.Range(0, e.sutun, e.sonSatir - e.satir, e.sonSutun);
            ilerleme.report(new v.TextSearchMatch2(uri, [{ sourceRange: kaynak, previewRange: onizleme }], e.onizleme));
            kalan--;
          }
        }
        if (sonuc.sinirAsildi) sinirAsildi = true;
      }
      return { limitHit: sinirAsildi };
    },
  });

  // ---------------- git sürümleri (salt okunur belgeler) ----------------
  const gitBelgesiDegisti = new v.EventEmitter<vscode.Uri>();
  v.workspace.registerTextDocumentContentProvider(GIT_SEMASI, {
    onDidChange: gitBelgesiDegisti.event,
    async provideTextDocumentContent(uri) {
      const k = konumCoz(uri.path);
      if (!k) return "";
      const ref = (new URLSearchParams(uri.query).get("ref") ?? "HEAD") as GitBasvurusu;
      const b = await kodApi.gitIcerik(k.projeId, k.alan, k.yol, ref);
      return b ? new TextDecoder().decode(b) : "";
    },
  });
  const gitBelgeleriniTazele = () => {
    for (const b of v.workspace.textDocuments) if (b.uri.scheme === GIT_SEMASI) gitBelgesiDegisti.fire(b.uri);
  };

  // ---------------- ajan rozetleri ----------------
  /** Ajan alanlarında temel dala göre değişen dosyalar → alan sahibi ajan ve değişiklik türü */
  const alanDegisiklikleri = new Map<string, { ajanId: string; tur: GitDegisiklikTuru }>();
  /** Ana repodaki git durumları (gezgin süsleri) */
  const gitDurumlari = new Map<string, GitDegisiklikTuru>();
  const rozetDegisti = new v.EventEmitter<vscode.Uri[]>();
  const gitSusuDegisti = new v.EventEmitter<vscode.Uri[]>();
  ajanIzleri.dinle((yollar) => rozetDegisti.fire(yollar.map(adres)));

  v.window.registerFileDecorationProvider({
    onDidChangeFileDecorations: rozetDegisti.event,
    provideFileDecoration(uri) {
      if (uri.scheme !== SEMA) return undefined;
      const duzenleyen = ajanIzleri.duzenleyen(uri.path);
      const alan = alanDegisiklikleri.get(uri.path);
      const ajanId = duzenleyen ?? ajanIzleri.degistiren(uri.path) ?? alan?.ajanId;
      const ajan = ajanIzleri.ajan(ajanId);
      if (!ajan) return undefined;
      const aciklama = duzenleyen ? `${ajan.ad} düzenliyor` : alan ? `${ajan.ad} · ${DEGISIKLIK_ADLARI[alan.tur].toLocaleLowerCase("tr-TR")}` : `${ajan.ad} değiştirdi`;
      return new v.FileDecoration(ilkHarf(ajan.ad), aciklama, new v.ThemeColor(alan && !duzenleyen ? DEGISIKLIK_RENKLERI[alan.tur] : "arnorg.ajanRozeti"));
    },
  });
  v.window.registerFileDecorationProvider({
    onDidChangeFileDecorations: gitSusuDegisti.event,
    provideFileDecoration(uri) {
      if (uri.scheme !== SEMA) return undefined;
      const tur = gitDurumlari.get(uri.path);
      if (!tur) return undefined;
      const d = new v.FileDecoration(tur === "?" ? "U" : tur, DEGISIKLIK_ADLARI[tur], new v.ThemeColor(DEGISIKLIK_RENKLERI[tur]));
      d.propagate = tur !== "D";
      return d;
    },
  });

  // ---------------- "… düzenliyor" ve "Duraklat ve düzenle" ----------------
  const durumOgesi = v.window.createStatusBarItem("arnorg.duzenleyen", v.StatusBarAlignment.Left, 1000);
  durumOgesi.name = "ArnOrg: dosyayı düzenleyen ajan";
  const etkinYol = () => {
    const u = v.window.activeTextEditor?.document.uri;
    return u?.scheme === SEMA ? u.path : null;
  };
  const durumuGuncelle = () => {
    const yol = etkinYol();
    const ajan = ajanIzleri.ajan(yol ? ajanIzleri.duzenleyen(yol) : null);
    if (ajan) {
      durumOgesi.text = `$(edit) ${ajan.ad} düzenliyor`;
      durumOgesi.tooltip = `${ajan.ad} bu dosyayı düzenliyor; dosya size salt okunur. Tıklayın: ${belirtme(ajan.ad)} duraklatıp düzenlemeyi alın.`;
      durumOgesi.command = "arnorg.duraklatVeDuzenle";
      durumOgesi.backgroundColor = new v.ThemeColor("statusBarItem.warningBackground");
      durumOgesi.show();
    } else durumOgesi.hide();
    void v.commands.executeCommand("setContext", "arnorg.ajanDuzenliyor", Boolean(ajan));
  };
  v.window.onDidChangeActiveTextEditor(durumuGuncelle);
  ajanIzleri.dinle(durumuGuncelle);
  useVeri.subscribe((d, o) => {
    if (d.ajanlar !== o.ajanlar) durumuGuncelle();
  });
  durumuGuncelle();

  v.commands.registerCommand("arnorg.duraklatVeDuzenle", async (hedef?: unknown) => {
    const yol = hedef instanceof v.Uri && hedef.scheme === SEMA ? hedef.path : etkinYol();
    const ajanId = yol ? ajanIzleri.duzenleyen(yol) : null;
    const ajan = ajanIzleri.ajan(ajanId);
    if (!yol || !ajanId) {
      void v.window.showInformationMessage("Bu dosyayı şu an düzenleyen bir ajan yok.");
      return;
    }
    try {
      await api.ajanKes(ajanId);
      dosyaSistemi.yeniden(yol);
      void v.window.showInformationMessage(
        `${belirtme(ajan?.ad ?? "Ajan")} duraklattınız; düzenleme sizde. Kaydettiğinizde dosya 30 saniye ajanlara kilitlenir ve ajana "yeniden oku" notu gider.`,
      );
    } catch (h) {
      void v.window.showErrorMessage(`Ajan duraklatılamadı: ${hataMetni(h)}`);
    }
  });

  // ---------------- kaynak denetimi ----------------
  const denetimler = new Map<string, KokDenetimi>();

  class KokDenetimi {
    readonly konum: Konum;
    readonly ana: boolean;
    readonly sc: vscode.SourceControl;
    private readonly gruplar: Partial<Record<"hazirlanan" | "degisen" | "cakisan" | "temel", vscode.SourceControlResourceGroup>> = {};
    private sonDurum: GitDurumu | null = null;
    private yenileniyor: Promise<void> | null = null;
    private yeniden = false;

    constructor(readonly klasor: vscode.WorkspaceFolder) {
      this.konum = konumCoz(klasor.uri.path)!;
      this.ana = this.konum.alan === "ana";
      this.sc = v.scm.createSourceControl(this.ana ? "arnorg-ana" : "arnorg-alan", klasor.name, klasor.uri);
      this.sc.quickDiffProvider = {
        provideOriginalResource: (uri) => (uri.scheme === SEMA && uri.path.startsWith(`${klasor.uri.path}/`) ? gitAdresi(uri.path, this.ana ? "indeks" : "temel") : undefined),
      };
      if (this.ana) {
        this.sc.inputBox.placeholder = "Commit mesajı (Ctrl+Enter ile commit)";
        this.sc.acceptInputCommand = { command: "arnorg.git.commit", title: "Commit", arguments: [this.sc] };
        this.sc.actionButton = { command: { command: "arnorg.git.commit", title: "$(check) Commit", arguments: [this.sc] }, enabled: true };
        this.gruplar.cakisan = this.sc.createResourceGroup("cakisan", "Birleştirme Değişiklikleri");
        this.gruplar.hazirlanan = this.sc.createResourceGroup("hazirlanan", "Hazırlanan Değişiklikler");
        this.gruplar.degisen = this.sc.createResourceGroup("degisen", "Değişiklikler");
        this.gruplar.cakisan.hideWhenEmpty = true;
        this.gruplar.hazirlanan.hideWhenEmpty = true;
      } else {
        this.sc.inputBox.visible = false;
        this.gruplar.temel = this.sc.createResourceGroup("temel", "Temel dala göre değişiklikler");
      }
    }

    get durum() {
      return this.sonDurum;
    }

    yenile(): Promise<void> {
      if (this.yenileniyor) {
        this.yeniden = true;
        return this.yenileniyor;
      }
      this.yenileniyor = this.durumuAl().finally(() => {
        this.yenileniyor = null;
        if (this.yeniden) {
          this.yeniden = false;
          void this.yenile();
        }
      });
      return this.yenileniyor;
    }

    private async durumuAl() {
      let d: GitDurumu;
      try {
        d = await kodApi.gitDurumu(this.konum.projeId, this.konum.alan);
      } catch {
        return;
      }
      this.sonDurum = d;
      const kok = this.klasor.uri;
      const degisenAdresler: vscode.Uri[] = [];
      if (this.ana) {
        const eski = [...gitDurumlari.keys()].filter((y) => y.startsWith(`${kok.path}/`));
        for (const y of eski) gitDurumlari.delete(y);
        for (const g of [...d.degisen, ...d.hazirlanan, ...d.cakisan]) gitDurumlari.set(`${kok.path}/${g.yol}`, g.tur);
        for (const y of new Set([...eski, ...gitDurumlari.keys()])) if (y.startsWith(`${kok.path}/`)) degisenAdresler.push(adres(y));
        gitSusuDegisti.fire(degisenAdresler);
        this.gruplar.cakisan!.resourceStates = d.cakisan.map((g) => this.kaynak(g, "cakisan"));
        this.gruplar.hazirlanan!.resourceStates = d.hazirlanan.map((g) => this.kaynak(g, "hazirlanan"));
        this.gruplar.degisen!.resourceStates = d.degisen.map((g) => this.kaynak(g, "degisen"));
        this.sc.count = d.cakisan.length + d.hazirlanan.length + d.degisen.length;
        if (d.dal) this.sc.statusBarCommands = [{ command: "arnorg.git.yenile", title: `$(git-branch) ${d.dal}`, tooltip: `${d.dal} dalı · yenile` }];
      } else {
        const eski = [...alanDegisiklikleri.keys()].filter((y) => y.startsWith(`${kok.path}/`));
        for (const y of eski) alanDegisiklikleri.delete(y);
        for (const g of d.temeleGore) alanDegisiklikleri.set(`${kok.path}/${g.yol}`, { ajanId: this.konum.alan, tur: g.tur });
        for (const y of new Set([...eski, ...alanDegisiklikleri.keys()])) if (y.startsWith(`${kok.path}/`)) degisenAdresler.push(adres(y));
        rozetDegisti.fire(degisenAdresler);
        this.gruplar.temel!.label = `${yonelme(d.temelDal)} göre değişiklikler`;
        this.gruplar.temel!.resourceStates = d.temeleGore.map((g) => this.kaynak(g, "temel"));
        this.sc.count = d.temeleGore.length;
      }
      gitBelgeleriniTazele();
    }

    private kaynak(g: GitDegisikligi, grup: "hazirlanan" | "degisen" | "cakisan" | "temel"): vscode.SourceControlResourceState {
      const uri = altAdres(this.klasor.uri, g.yol);
      return {
        resourceUri: uri,
        contextValue: grup,
        command: { command: "arnorg.git.farkAc", title: "Değişiklikleri Aç", arguments: [uri, grup, g] },
        decorations: {
          strikeThrough: g.tur === "D",
          tooltip: `${DEGISIKLIK_ADLARI[g.tur]}${g.eskiYol ? ` (${g.eskiYol})` : ""}`,
          faded: false,
        },
      };
    }

    dispose() {
      this.sc.dispose();
      const kok = this.klasor.uri.path;
      for (const y of [...gitDurumlari.keys()]) if (y.startsWith(`${kok}/`)) gitDurumlari.delete(y);
      for (const y of [...alanDegisiklikleri.keys()]) if (y.startsWith(`${kok}/`)) alanDegisiklikleri.delete(y);
    }
  }

  const denetimleriEsle = () => {
    const klasorler = v.workspace.workspaceFolders ?? [];
    const istenen = new Map(klasorler.filter((k) => k.uri.scheme === SEMA).map((k) => [`${k.uri.toString()}|${k.name}`, k]));
    for (const [anahtar, d] of denetimler) {
      if (!istenen.has(anahtar)) {
        d.dispose();
        denetimler.delete(anahtar);
      }
    }
    for (const [anahtar, k] of istenen) {
      if (denetimler.has(anahtar)) continue;
      const d = new KokDenetimi(k);
      denetimler.set(anahtar, d);
      void d.yenile();
    }
  };
  v.workspace.onDidChangeWorkspaceFolders(denetimleriEsle);
  denetimleriEsle();

  const denetimBul = (uri: vscode.Uri | undefined) => {
    if (!uri) return undefined;
    return [...denetimler.values()].find((d) => uri.path === d.klasor.uri.path || uri.path.startsWith(`${d.klasor.uri.path}/`));
  };
  const anaDenetim = () => [...denetimler.values()].find((d) => d.ana);
  const tumunuYenile = () => {
    for (const d of denetimler.values()) void d.yenile();
  };

  // Dosya değişince ilgili kök yenilenir (aralıklı)
  const bekleyenKokler = new Set<string>();
  let yenilemeZamani: ReturnType<typeof setTimeout> | undefined;
  olaylariDinle((o) => {
    if (o.tur !== "dosya.degisti") return;
    bekleyenKokler.add(adresYolu({ projeId: o.projeId, alan: o.alan, yol: "" }));
    clearTimeout(yenilemeZamani);
    yenilemeZamani = setTimeout(() => {
      for (const d of denetimler.values()) if (bekleyenKokler.has(d.klasor.uri.path)) void d.yenile();
      bekleyenKokler.clear();
    }, 600);
  });
  v.window.onDidChangeWindowState((s) => {
    if (s.focused) tumunuYenile();
  });

  const kaynakYollari = (args: unknown[]): { denetim: KokDenetimi; yollar: string[] } | null => {
    const durumlar = args.flat().filter((a): a is vscode.SourceControlResourceState => !!a && typeof a === "object" && "resourceUri" in a);
    const uri = durumlar[0]?.resourceUri ?? v.window.activeTextEditor?.document.uri;
    const denetim = denetimBul(uri);
    if (!denetim || !uri) return null;
    const kok = denetim.klasor.uri.path;
    const yollar = (durumlar.length ? durumlar.map((d) => d.resourceUri) : [uri]).map((u) => u.path.slice(kok.length + 1)).filter(Boolean);
    return { denetim, yollar: [...new Set(yollar)] };
  };
  const gitIslemi = async (ad: string, is: () => Promise<unknown>, denetim: KokDenetimi | undefined) => {
    try {
      await is();
    } catch (h) {
      void v.window.showErrorMessage(`${ad} başarısız: ${hataMetni(h)}`);
    } finally {
      await denetim?.yenile();
    }
  };

  v.commands.registerCommand("arnorg.git.yenile", () => tumunuYenile());

  v.commands.registerCommand("arnorg.git.hazirla", async (...args: unknown[]) => {
    const s = kaynakYollari(args);
    if (s?.denetim.ana) await gitIslemi("Aşamaya alma", () => kodApi.hazirla(s.denetim.konum.projeId, "ana", s.yollar), s.denetim);
  });
  v.commands.registerCommand("arnorg.git.geriAl", async (...args: unknown[]) => {
    const s = kaynakYollari(args);
    if (s?.denetim.ana) await gitIslemi("Aşamadan çıkarma", () => kodApi.hazirlamayiGeriAl(s.denetim.konum.projeId, "ana", s.yollar), s.denetim);
  });
  v.commands.registerCommand("arnorg.git.hazirlaHepsi", async () => {
    const d = anaDenetim();
    const yollar = d?.durum?.degisen.map((g) => g.yol) ?? [];
    if (d && yollar.length) await gitIslemi("Aşamaya alma", () => kodApi.hazirla(d.konum.projeId, "ana", yollar), d);
  });
  v.commands.registerCommand("arnorg.git.geriAlHepsi", async () => {
    const d = anaDenetim();
    const yollar = d?.durum?.hazirlanan.flatMap((g) => (g.eskiYol ? [g.yol, g.eskiYol] : [g.yol])) ?? [];
    if (d && yollar.length) await gitIslemi("Aşamadan çıkarma", () => kodApi.hazirlamayiGeriAl(d.konum.projeId, "ana", yollar), d);
  });
  v.commands.registerCommand("arnorg.git.at", async (...args: unknown[]) => {
    const s = kaynakYollari(args);
    if (!s?.denetim.ana || !s.yollar.length) return;
    const soru =
      s.yollar.length === 1
        ? `${dosyaAdi(s.yollar[0]!)} dosyasındaki değişiklikler atılsın mı? Bu geri alınamaz; izlenmeyen dosya silinir.`
        : `${s.yollar.length} dosyadaki değişiklikler atılsın mı? Bu geri alınamaz; izlenmeyen dosyalar silinir.`;
    const secim = await v.window.showWarningMessage(soru, { modal: true }, "Değişiklikleri At");
    if (secim !== "Değişiklikleri At") return;
    await gitIslemi("Değişiklikleri atma", () => kodApi.degisiklikleriAt(s.denetim.konum.projeId, "ana", s.yollar), s.denetim);
  });
  v.commands.registerCommand("arnorg.git.commit", async () => {
    const d = anaDenetim();
    if (!d) return;
    const mesaj = d.sc.inputBox.value.trim();
    if (!mesaj) {
      void v.window.showWarningMessage("Commit mesajı yazın.");
      return;
    }
    await d.yenile();
    let tumu = false;
    if (!d.durum?.hazirlanan.length) {
      if (!d.durum?.degisen.length) {
        void v.window.showInformationMessage("Commit'lenecek değişiklik yok.");
        return;
      }
      const secim = await v.window.showWarningMessage(
        "Aşamaya alınmış değişiklik yok. Tüm değişiklikler aşamaya alınıp commit edilsin mi?",
        { modal: true },
        "Evet, hepsini commit et",
      );
      if (!secim) return;
      tumu = true;
    }
    try {
      const sonuc = await kodApi.commit(d.konum.projeId, "ana", mesaj, tumu);
      d.sc.inputBox.value = "";
      void v.window.showInformationMessage(`Commit atıldı: ${sonuc.commit.slice(0, 7)}`);
    } catch (h) {
      void v.window.showErrorMessage(`Commit başarısız: ${hataMetni(h)}`);
    } finally {
      await d.yenile();
    }
  });
  v.commands.registerCommand("arnorg.git.dosyayiAc", async (...args: unknown[]) => {
    const durumlar = args.flat().filter((a): a is vscode.SourceControlResourceState => !!a && typeof a === "object" && "resourceUri" in a);
    for (const d of durumlar.length ? durumlar : []) await v.commands.executeCommand("vscode.open", d.resourceUri, { preview: durumlar.length === 1 });
  });
  v.commands.registerCommand("arnorg.git.farkAc", async (hedef: unknown, grupArg?: string, degisiklik?: GitDegisikligi) => {
    // Bağlam menüsünden kaynak durumu, tıklamadan (uri, grup, değişiklik) gelir
    let uri: vscode.Uri | undefined;
    let grup = grupArg;
    let g = degisiklik;
    if (hedef instanceof v.Uri) uri = hedef;
    else if (hedef && typeof hedef === "object" && "resourceUri" in hedef) {
      const d = hedef as vscode.SourceControlResourceState & { contextValue?: string };
      uri = d.resourceUri;
      grup = d.contextValue;
    }
    const denetim = denetimBul(uri);
    if (!uri || !denetim) return;
    const yol = uri.path.slice(denetim.klasor.uri.path.length + 1);
    const durum = denetim.durum;
    g ??= [...(durum?.degisen ?? []), ...(durum?.hazirlanan ?? []), ...(durum?.temeleGore ?? []), ...(durum?.cakisan ?? [])].find((x) => x.yol === yol);
    const tur = g?.tur ?? "M";
    const ad = dosyaAdi(yol);
    if (grup === "temel") {
      const ajan = ajanIzleri.ajan(denetim.konum.alan)?.ad ?? "ajan";
      const temel = durum?.temelDal ?? "main";
      if (tur === "A") await v.commands.executeCommand("vscode.open", uri);
      else if (tur === "D") await v.commands.executeCommand("vscode.open", gitAdresi(uri.path, "temel"));
      else await v.commands.executeCommand("vscode.diff", gitAdresi(uri.path, "temel"), uri, `${ad} (${temel} ↔ ${ajan})`);
      return;
    }
    if (grup === "hazirlanan") {
      if (tur === "A" || tur === "C") await v.commands.executeCommand("vscode.open", gitAdresi(uri.path, "indeks"));
      else if (tur === "D") await v.commands.executeCommand("vscode.open", gitAdresi(uri.path, "HEAD"));
      else await v.commands.executeCommand("vscode.diff", gitAdresi(g?.eskiYol ? `${denetim.klasor.uri.path}/${g.eskiYol}` : uri.path, "HEAD"), gitAdresi(uri.path, "indeks"), `${ad} (HEAD ↔ İndeks)`);
      return;
    }
    if (tur === "?" || tur === "A" || tur === "U") await v.commands.executeCommand("vscode.open", uri);
    else if (tur === "D") await v.commands.executeCommand("vscode.open", gitAdresi(uri.path, "indeks"));
    else await v.commands.executeCommand("vscode.diff", gitAdresi(uri.path, "indeks"), uri, `${ad} (İndeks ↔ Çalışma Ağacı)`);
  });
}

/** VS Code'un hızlı açma ön süzgeci: arananın harfleri yolda sırasıyla geçiyor mu */
function bulanikIcerir(hedef: string, aranan: string): boolean {
  let i = 0;
  for (const c of aranan) {
    i = hedef.indexOf(c, i);
    if (i < 0) return false;
    i++;
  }
  return true;
}
