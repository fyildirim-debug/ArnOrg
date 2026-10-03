// arnorg: şemalı dosya sistemi sağlayıcısı. Her işlem çekirdeğin /fs uçlarına gider; dosya değişiklikleri
// çekirdeğin canlı olaylarından (dosya.degisti) onDidChangeFile ile yayılır. Böylece bir ajan dosyayı
// değiştirince açık düzenleyici kendiliğinden yenilenir; kaydedilmemiş değişiklik varsa VS Code'un kendi
// "diskteki dosya daha yeni / karşılaştır" akışı çalışır.
import type { FsDurumu, FsTuru } from "@arnorg/ortak";
import { Emitter, Event } from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import { Disposable, type IDisposable } from "@codingame/monaco-vscode-api/vscode/vs/base/common/lifecycle";
import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import {
  createFileSystemProviderError,
  FileChangeType,
  FilePermission,
  FileSystemProviderCapabilities,
  FileSystemProviderErrorCode,
  FileType,
  type IFileChange,
  type IFileDeleteOptions,
  type IFileOverwriteOptions,
  type IFileSystemProviderWithFileReadWriteCapability,
  type IFileWriteOptions,
  type IStat,
} from "@codingame/monaco-vscode-api/vscode/vs/platform/files/common/files";
import { olaylariDinle } from "../api/canli";
import { ApiHatasi } from "../api/istek";
import { ajanIzleri } from "./ajanIzleri";
import { adresYolu, konumCoz, SEMA, type Konum } from "./adres";
import { kodApi } from "./kodApi";

function konum(adres: URI): Konum {
  const k = konumCoz(adres.path);
  if (!k) throw createFileSystemProviderError(`Geçersiz ArnOrg adresi: ${adres.toString()}`, FileSystemProviderErrorCode.FileNotFound);
  return k;
}

function turCevir(tur: FsTuru, baglanti: boolean): FileType {
  const temel = tur === "klasor" ? FileType.Directory : tur === "dosya" ? FileType.File : FileType.Unknown;
  return baglanti ? temel | FileType.SymbolicLink : temel;
}

/** Çekirdek hatasını VS Code dosya sistemi hatasına çevirir (kayıt akışı bu kodlara göre davranır) */
function hataCevir(h: unknown): Error {
  if (!(h instanceof ApiHatasi)) return createFileSystemProviderError(h instanceof Error ? h : String(h), FileSystemProviderErrorCode.Unknown);
  switch (h.durum) {
    case 404:
      return createFileSystemProviderError(h.message, FileSystemProviderErrorCode.FileNotFound);
    case 409:
      return createFileSystemProviderError(
        h.message,
        /zaten var/i.test(h.message) ? FileSystemProviderErrorCode.FileExists : FileSystemProviderErrorCode.NoPermissions,
      );
    case 403:
      return createFileSystemProviderError(h.message, FileSystemProviderErrorCode.NoPermissions);
    case 413:
      return createFileSystemProviderError(h.message, FileSystemProviderErrorCode.FileTooLarge);
    case 400:
      return createFileSystemProviderError(
        h.message,
        /klasör değil/i.test(h.message)
          ? FileSystemProviderErrorCode.FileNotADirectory
          : /klasör/i.test(h.message)
            ? FileSystemProviderErrorCode.FileIsADirectory
            : FileSystemProviderErrorCode.Unknown,
      );
    case 0:
      return createFileSystemProviderError(h.message, FileSystemProviderErrorCode.Unavailable);
    default:
      return createFileSystemProviderError(h.message, FileSystemProviderErrorCode.Unknown);
  }
}

async function sar<T>(is: () => Promise<T>): Promise<T> {
  try {
    return await is();
  } catch (h) {
    throw hataCevir(h);
  }
}

export class ArnorgDosyaSistemi extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {
  readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
  readonly onDidChangeCapabilities: Event<void> = Event.None;
  private readonly degisim = this._register(new Emitter<readonly IFileChange[]>());
  readonly onDidChangeFile = this.degisim.event;
  /** Sağlayıcının var olduğunu bildiği adresler: değişiklik olayında "eklendi" ile "değişti" ayrımı için */
  private readonly bilinen = new Set<string>();
  private bekleyen = new Map<string, FileChangeType>();
  private zamanlayici: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    // Çekirdekteki her dosya değişikliği (ajanın yazması, dışarıdan düzenleme, kurulun kaydı)
    this._register({
      dispose: olaylariDinle((o) => {
        if (o.tur === "dosya.degisti") {
          const yol = adresYolu({ projeId: o.projeId, alan: o.alan, yol: o.yol });
          if (o.ajanId) ajanIzleri.degistirenAyarla(yol, o.ajanId);
          void this.disaridanDegisti(yol);
        } else if (o.tur === "ajan.guncellendi" && o.ajan.durum !== "calisiyor" && o.ajan.durum !== "karar_bekliyor") {
          // Ajan durunca düzenlediği dosyalar yeniden stat edilir; salt okunurluk kalkar
          for (const yol of ajanIzleri.ajaninDuzenledikleri(o.ajan.id)) this.yeniden(yol);
        }
      }),
    });
  }

  /** Dosyanın salt okunurluk durumunu yeniden okutmak için değişiklik olayı yayar */
  yeniden(yol: string) {
    this.kuyruga(yol, FileChangeType.UPDATED);
  }

  private kuyruga(yol: string, tur: FileChangeType) {
    this.bekleyen.set(yol, tur);
    clearTimeout(this.zamanlayici);
    this.zamanlayici = setTimeout(() => {
      const olaylar = [...this.bekleyen].map(([y, t]) => ({ type: t, resource: URI.from({ scheme: SEMA, path: y }) }));
      this.bekleyen = new Map();
      this.degisim.fire(olaylar);
    }, 40);
  }

  private async disaridanDegisti(yol: string) {
    const k = konumCoz(yol);
    if (!k) return;
    try {
      const s = await kodApi.stat(k.projeId, k.alan, k.yol);
      ajanIzleri.duzenleyenAyarla(yol, s.duzenleyenAjanId);
      const bilinen = this.bilinen.has(yol);
      this.bilinen.add(yol);
      this.kuyruga(yol, bilinen ? FileChangeType.UPDATED : FileChangeType.ADDED);
    } catch (h) {
      if (h instanceof ApiHatasi && h.durum === 404) {
        this.bilinen.delete(yol);
        ajanIzleri.duzenleyenAyarla(yol, null);
        this.kuyruga(yol, FileChangeType.DELETED);
      }
    }
  }

  watch(): IDisposable {
    // Çekirdek tüm çalışma alanlarını zaten izler; olaylar canlı kanaldan gelir
    return Disposable.None;
  }

  async stat(adres: URI): Promise<IStat> {
    const k = konum(adres);
    const s: FsDurumu = await sar(() => kodApi.stat(k.projeId, k.alan, k.yol));
    const yol = adresYolu(k);
    this.bilinen.add(yol);
    if (s.tur === "dosya") ajanIzleri.duzenleyenAyarla(yol, s.duzenleyenAjanId);
    return {
      type: turCevir(s.tur, s.baglanti),
      mtime: s.degisme,
      ctime: s.olusturma,
      size: s.boyut,
      permissions: s.saltOkunur ? FilePermission.Readonly : undefined,
    };
  }

  async readdir(adres: URI): Promise<[string, FileType][]> {
    const k = konum(adres);
    const liste = await sar(() => kodApi.liste(k.projeId, k.alan, k.yol));
    for (const g of liste) this.bilinen.add(adresYolu({ ...k, yol: k.yol ? `${k.yol}/${g.ad}` : g.ad }));
    return liste.map((g) => [g.ad, turCevir(g.tur, g.baglanti)]);
  }

  async readFile(adres: URI): Promise<Uint8Array> {
    const k = konum(adres);
    return sar(() => kodApi.oku(k.projeId, k.alan, k.yol));
  }

  async writeFile(adres: URI, icerik: Uint8Array, s: IFileWriteOptions): Promise<void> {
    const k = konum(adres);
    const d = await sar(() => kodApi.yaz(k.projeId, k.alan, k.yol, icerik, { olustur: s.create, ustune: s.overwrite }));
    this.bilinen.add(adresYolu(k));
    ajanIzleri.duzenleyenAyarla(adresYolu(k), d.duzenleyenAjanId);
  }

  async mkdir(adres: URI): Promise<void> {
    const k = konum(adres);
    await sar(() => kodApi.klasor(k.projeId, k.alan, k.yol));
    this.bilinen.add(adresYolu(k));
  }

  async delete(adres: URI, s: IFileDeleteOptions): Promise<void> {
    const k = konum(adres);
    await sar(() => kodApi.sil(k.projeId, k.alan, k.yol, s.recursive));
    this.bilinen.delete(adresYolu(k));
  }

  async rename(kaynak: URI, hedef: URI, s: IFileOverwriteOptions): Promise<void> {
    const a = konum(kaynak);
    const b = konum(hedef);
    if (a.projeId !== b.projeId || a.alan !== b.alan) {
      throw createFileSystemProviderError("Çalışma alanları arasında taşıma yapılamaz; dosyayı kopyalayıp yapıştırın.", FileSystemProviderErrorCode.NoPermissions);
    }
    await sar(() => kodApi.tasi(a.projeId, a.alan, a.yol, b.yol, s.overwrite));
    this.bilinen.delete(adresYolu(a));
    this.bilinen.add(adresYolu(b));
  }
}
