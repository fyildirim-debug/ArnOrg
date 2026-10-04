// Çok köklü çalışma alanı: her kök bir ArnOrg çalışma alanıdır ("main · ana repo", "Emre · arnorg/emre").
// Liste çekirdekten gelir ve canlı güncellenir (ajan işe alınınca/çıkarılınca, proje değişince).
// Proje değişince eski projenin açık düzenleyicileri hatırlanıp kapatılır, yeni projeninkiler açılır.
import type { Ajan, CalismaAlani } from "@arnorg/ortak";
import {
  IEditorService,
  IWorkspaceContextService,
  IWorkspaceEditingService,
  StandaloneServices,
} from "@codingame/monaco-vscode-api";
import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import { EditorResourceAccessor, EditorsOrder, SideBySideEditor } from "@codingame/monaco-vscode-api/vscode/vs/workbench/common/editor";
import { olaylariDinle } from "../api/canli";
import { api } from "../api/uclar";
import { sozluk } from "../dil";
import { useVeri } from "../durum/veri";
import { ajanIzleri } from "./ajanIzleri";
import { GIT_SEMASI, konumCoz, SEMA } from "./adres";

/** Çalışma alanı dosyası bellekte tutulur; kökler her açılışta çekirdekten yeniden yazılır */
export const CALISMA_ALANI_DOSYASI = URI.from({ scheme: "tmp", path: "/arnorg.code-workspace" });

const EDITOR_DEPOSU = "arnorg.tezgah.duzenleyiciler.";
const EN_COK_DUZENLEYICI = 16;

interface Kok {
  uri: URI;
  name: string;
}

export function kokAdi(a: CalismaAlani, ajanlar: Ajan[]): string {
  const s = sozluk().kod;
  if (a.ana) return s.anaRepo(a.dal || "main");
  const ajan = ajanlar.find((x) => x.id === a.ajanId);
  return s.ajanAlani(ajan?.ad ?? s.ajan, a.dal);
}

function kokler(pid: string | null, alanlar: CalismaAlani[]): Kok[] {
  if (!pid) return [];
  const ajanlar = useVeri.getState().ajanlar;
  return alanlar.map((a) => ({ uri: URI.from({ scheme: SEMA, path: `/${pid}/${a.kimlik}` }), name: kokAdi(a, ajanlar) }));
}

async function alanlariGetir(pid: string | null): Promise<CalismaAlani[]> {
  if (!pid) return [];
  try {
    return await api.calismaAlanlari(pid);
  } catch {
    // Çekirdek geçici olarak ulaşılmazsa en azından ana repo gösterilir
    return [{ kimlik: "ana", yol: "", dal: "main", ajanId: null, ana: true }];
  }
}

/** Servisler başlamadan önce yazılacak çalışma alanı dosyasının içeriği */
export async function calismaAlaniIcerigi(): Promise<string> {
  const pid = useVeri.getState().aktifProjeId;
  const liste = kokler(pid, await alanlariGetir(pid));
  return JSON.stringify({ folders: liste.map((k) => ({ uri: k.uri.toString(), name: k.name })) }, null, 2);
}

function oku(anahtar: string): string[] {
  try {
    const d = JSON.parse(localStorage.getItem(anahtar) ?? "[]") as unknown;
    return Array.isArray(d) ? d.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function yaz(anahtar: string, deger: string[]) {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger));
  } catch {
    // depolama kapalı
  }
}

/** Düzenleyicinin ait olduğu proje (fark düzenleyicide değiştirilen taraf) */
function duzenleyiciProjesi(editor: Parameters<typeof EditorResourceAccessor.getCanonicalUri>[0]): { proje: string | null; acilabilir: URI | null } {
  const u = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
  if (!u || (u.scheme !== SEMA && u.scheme !== GIT_SEMASI)) return { proje: null, acilabilir: null };
  const yalin = EditorResourceAccessor.getOriginalUri(editor);
  return { proje: konumCoz(u.path)?.projeId ?? null, acilabilir: yalin && yalin.scheme === SEMA ? yalin : null };
}

/** Başka projeye ait düzenleyicileri hatırlar ve kapatır (kaydedilmemişler açık kalır) */
async function digerProjeleriKapat(pid: string | null) {
  const editorler = StandaloneServices.get(IEditorService);
  const projeye: Map<string, string[]> = new Map();
  const kapatilacak = [];
  for (const kimlik of editorler.getEditors(EditorsOrder.SEQUENTIAL)) {
    const { proje, acilabilir } = duzenleyiciProjesi(kimlik.editor);
    if (!proje || proje === pid) continue;
    if (acilabilir) projeye.set(proje, [...(projeye.get(proje) ?? []), acilabilir.toString()]);
    if (!kimlik.editor.isDirty()) kapatilacak.push(kimlik);
  }
  for (const [p, liste] of projeye) yaz(EDITOR_DEPOSU + p, [...new Set(liste)].slice(0, EN_COK_DUZENLEYICI));
  if (kapatilacak.length) await editorler.closeEditors(kapatilacak, { preserveFocus: true });
}

/** Projenin hatırlanan düzenleyicilerini açar (projeden hiçbiri açık değilse) */
async function projeDuzenleyicileriniAc(pid: string | null) {
  if (!pid) return;
  const editorler = StandaloneServices.get(IEditorService);
  const acik = editorler.getEditors(EditorsOrder.SEQUENTIAL).some((k) => duzenleyiciProjesi(k.editor).proje === pid);
  if (acik) return;
  const liste = oku(EDITOR_DEPOSU + pid);
  if (!liste.length) return;
  await editorler
    .openEditors(liste.map((u, i) => ({ resource: URI.parse(u), options: { pinned: true, preserveFocus: true, inactive: i > 0 } })))
    .catch(() => undefined);
}

/** Etkin projenin açık düzenleyicilerini hatırlar (sayfa kapanırken ve proje değişirken) */
export function duzenleyicileriHatirla() {
  const pid = useVeri.getState().aktifProjeId;
  if (!pid) return;
  const liste: string[] = [];
  for (const k of StandaloneServices.get(IEditorService).getEditors(EditorsOrder.SEQUENTIAL)) {
    const { proje, acilabilir } = duzenleyiciProjesi(k.editor);
    if (proje === pid && acilabilir) liste.push(acilabilir.toString());
  }
  yaz(EDITOR_DEPOSU + pid, [...new Set(liste)].slice(0, EN_COK_DUZENLEYICI));
}

/** Kökleri etkin projeye ve ajan listesine göre canlı tutar */
export function calismaAlaniniIzle(): () => void {
  let sonProje = useVeri.getState().aktifProjeId;
  let kuyruk: Promise<void> = Promise.resolve();
  let zamanlayici: ReturnType<typeof setTimeout> | undefined;

  const esle = async () => {
    const pid = useVeri.getState().aktifProjeId;
    const projeDegisti = pid !== sonProje;
    if (projeDegisti) {
      // Eski projenin düzenleyicileri hatırlanır; izler temizlenir
      const eski = sonProje;
      if (eski) {
        const liste: string[] = [];
        for (const k of StandaloneServices.get(IEditorService).getEditors(EditorsOrder.SEQUENTIAL)) {
          const { proje, acilabilir } = duzenleyiciProjesi(k.editor);
          if (proje === eski && acilabilir) liste.push(acilabilir.toString());
        }
        yaz(EDITOR_DEPOSU + eski, [...new Set(liste)].slice(0, EN_COK_DUZENLEYICI));
      }
      ajanIzleri.temizle();
    }
    const hedef = kokler(pid, await alanlariGetir(pid));
    if (useVeri.getState().aktifProjeId !== pid) return; // bu arada yine değişti; sonraki eşleme halleder
    const baglam = StandaloneServices.get(IWorkspaceContextService);
    const duzenleme = StandaloneServices.get(IWorkspaceEditingService);
    const mevcut = baglam.getWorkspace().folders.map((k) => ({ uri: k.uri, name: k.name }));
    const anahtar = (k: Kok) => `${k.uri.toString()}|${k.name}`;
    const ayni = mevcut.length === hedef.length && mevcut.every((k, i) => anahtar(k) === anahtar(hedef[i]!));
    if (!ayni) {
      if (projeDegisti || mevcut.length === 0 || anahtar(mevcut[0]!) !== anahtar(hedef[0] ?? { uri: URI.parse("x:/"), name: "" })) {
        await duzenleme.updateFolders(0, mevcut.length, hedef, true);
      } else {
        const hedefAnahtarlari = new Set(hedef.map(anahtar));
        const mevcutAnahtarlari = new Set(mevcut.map(anahtar));
        const silinecek = mevcut.filter((k) => !hedefAnahtarlari.has(anahtar(k))).map((k) => k.uri);
        const eklenecek = hedef.filter((k) => !mevcutAnahtarlari.has(anahtar(k)));
        if (silinecek.length) await duzenleme.removeFolders(silinecek, true);
        if (eklenecek.length) await duzenleme.addFolders(eklenecek, true);
      }
    }
    if (projeDegisti) {
      sonProje = pid;
      await digerProjeleriKapat(pid);
      await projeDuzenleyicileriniAc(pid);
    }
  };

  const planla = () => {
    clearTimeout(zamanlayici);
    zamanlayici = setTimeout(() => {
      kuyruk = kuyruk.then(esle).catch((h: unknown) => console.warn("[tezgah] çalışma alanı eşlenemedi", h));
    }, 150);
  };

  // Ajan listesinde kök oluşturan alanlar (kimlik, ad, worktree) değişince
  const imza = (ajanlar: Ajan[]) =>
    ajanlar
      .map((a) => `${a.id}:${a.ad}:${a.calismaAlani ?? ""}:${a.dal ?? ""}`)
      .sort()
      .join("|");
  const birak = useVeri.subscribe((d, o) => {
    if (d.aktifProjeId !== o.aktifProjeId || imza(d.ajanlar) !== imza(o.ajanlar)) planla();
  });
  const olaylariBirak = olaylariDinle((o) => {
    if (o.tur === "proje.guncellendi" && o.proje.id === useVeri.getState().aktifProjeId) planla();
  });

  // Açılışta: önceki oturumdan kalan başka projenin düzenleyicileri kapatılır, bu projeninkiler açılır
  kuyruk = kuyruk.then(async () => {
    await digerProjeleriKapat(sonProje);
    await projeDuzenleyicileriniAc(sonProje);
  });
  planla();

  const sayfaKapanirken = () => duzenleyicileriHatirla();
  window.addEventListener("pagehide", sayfaKapanirken);
  return () => {
    birak();
    olaylariBirak();
    window.removeEventListener("pagehide", sayfaKapanirken);
    clearTimeout(zamanlayici);
  };
}
