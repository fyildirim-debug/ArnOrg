// Kayıt dosyası: çekirdeğin stdout/stderr çıktısı ve kabuk olayları <userData>/logs/cekirdek.log dosyasına yazılır.
// Son satırlar bellekte de tutulur; çekirdek çökerse hata sayfasında gösterilir.

import { createWriteStream, mkdirSync, renameSync, statSync, type WriteStream } from "node:fs";
import { join } from "node:path";
import { SatirTamponu } from "./denetimler.js";

const AZAMI_BOYUT = 5 * 1024 * 1024;

export class Kayit {
  readonly dosya: string;
  private readonly akis: WriteStream;
  private readonly tampon = new SatirTamponu(200);
  private readonly yarimlar = { out: "", err: "" };

  constructor(
    readonly dizin: string,
    private readonly konsolaYansit: boolean,
  ) {
    mkdirSync(dizin, { recursive: true });
    this.dosya = join(dizin, "cekirdek.log");
    // Basit döndürme: 5 MB'ı aşan kayıt cekirdek.1.log olur (öncekinin üzerine yazılır)
    try {
      if (statSync(this.dosya).size > AZAMI_BOYUT) renameSync(this.dosya, join(dizin, "cekirdek.1.log"));
    } catch {
      // dosya yok
    }
    this.akis = createWriteStream(this.dosya, { flags: "a" });
    this.akis.on("error", () => {
      // Kayıt yazılamıyorsa uygulama yine de çalışmalı
    });
  }

  /** Kabuğun kendi olayı */
  kabuk(mesaj: string): void {
    this.satir(`[kabuk ${new Date().toISOString()}] ${mesaj}`);
  }

  /** Çekirdek sürecinin çıktısı (parça parça gelir, satır satır yazılır) */
  cekirdekCiktisi(kanal: "out" | "err", parca: string): void {
    const metin = this.yarimlar[kanal] + parca;
    const satirlar = metin.split(/\r?\n/);
    this.yarimlar[kanal] = satirlar.pop() ?? "";
    for (const s of satirlar) this.satir(s);
  }

  /** Yarım kalan çıktıları yazar (süreç bittiğinde) */
  bosalt(): void {
    for (const kanal of ["out", "err"] as const) {
      if (this.yarimlar[kanal]) this.satir(this.yarimlar[kanal]);
      this.yarimlar[kanal] = "";
    }
  }

  /** Son satırlar (hata sayfası için) */
  kuyruk(): string {
    return this.tampon.kuyruk();
  }

  /** Kalan çıktıyı yazar ve dosyayı kapatır. */
  kapat(): Promise<void> {
    this.bosalt();
    return new Promise((coz) => this.akis.end(() => coz()));
  }

  private satir(s: string): void {
    this.tampon.satirEkle(s);
    this.akis.write(s + "\n");
    if (this.konsolaYansit) process.stdout.write(s + "\n");
  }
}
