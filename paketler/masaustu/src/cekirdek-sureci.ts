// Çekirdek sürecinin yönetimi: utilityProcess ile başlatma, çıktıyı kayda yazma,
// beklenmedik çıkışı bildirme, kapanışta önce nazikçe kapatma sonra sonlandırma.

import { utilityProcess, type UtilityProcess } from "electron";
import { existsSync } from "node:fs";
import type { Kayit } from "./kayit.js";
import { cekirdekMesajiMi, type AnaMesaji, type BaslatSecenekleri } from "./mesajlar.js";

export interface CekirdekBaglantisi {
  adres: string;
  erisimAnahtari: string;
}

export interface CekirdekAyarlari {
  /** dist/cekirdek-giris.js */
  girisYolu: string;
  /** Çekirdek modülü (baslat() dışa aktarır) */
  cekirdekYolu: string;
  secenekler: BaslatSecenekleri;
  kayit: Kayit;
  /** Çekirdek bağlantı kabul etmeye hazır */
  hazir(baglanti: CekirdekBaglantisi): void;
  /** Çekirdek başlatılamadı ya da beklenmedik biçimde durdu */
  durdu(aciklama: string): void;
}

const BASLATMA_SURESI_MS = 60_000;
const KAPATMA_SURESI_MS = 5_000;

const bekle = (ms: number) => new Promise<void>((coz) => setTimeout(coz, ms));

export class CekirdekSureci {
  private surec: UtilityProcess | null = null;
  private bilerekDurduruluyor = false;
  private hataAciklamasi: string | null = null;
  private zamanlayici: NodeJS.Timeout | null = null;

  constructor(private readonly a: CekirdekAyarlari) {}

  baslat(): void {
    if (this.surec) return;
    const { kayit, cekirdekYolu, secenekler } = this.a;
    if (!existsSync(cekirdekYolu)) {
      kayit.kabuk(`Çekirdek bulunamadı: ${cekirdekYolu}`);
      this.a.durdu(
        `Çekirdek dosyası bulunamadı:\n${cekirdekYolu}\n\nGeliştirmede önce kökte "npm run build" ile çekirdeği derleyin.`,
      );
      return;
    }

    kayit.kabuk(`Çekirdek başlatılıyor: ${cekirdekYolu}`);
    this.bilerekDurduruluyor = false;
    this.hataAciklamasi = null;

    const surec = utilityProcess.fork(this.a.girisYolu, [], {
      serviceName: "ArnOrg Çekirdek",
      stdio: "pipe",
      cwd: secenekler.veriDizini,
      env: { ...process.env },
      execArgv: ["--enable-source-maps"],
    });
    this.surec = surec;

    surec.stdout?.setEncoding("utf8");
    surec.stderr?.setEncoding("utf8");
    surec.stdout?.on("data", (parca: string) => kayit.cekirdekCiktisi("out", parca));
    surec.stderr?.on("data", (parca: string) => kayit.cekirdekCiktisi("err", parca));

    surec.once("spawn", () => {
      kayit.kabuk(`Çekirdek süreci açıldı (pid ${surec.pid ?? "?"})`);
      const mesaj: AnaMesaji = { tur: "baslat", cekirdekYolu, secenekler };
      surec.postMessage(mesaj);
    });

    surec.on("message", (veri: unknown) => {
      if (!cekirdekMesajiMi(veri)) return;
      if (veri.tur === "hazir") {
        this.zamanlayiciyiTemizle();
        kayit.kabuk(`Çekirdek hazır: ${veri.adres}`);
        this.a.hazir({ adres: veri.adres, erisimAnahtari: veri.erisimAnahtari });
      } else if (veri.tur === "hata") {
        this.hataAciklamasi = `Çekirdek başlatılamadı: ${veri.mesaj}`;
      } else {
        kayit.kabuk("Çekirdek kapandığını bildirdi");
      }
    });

    surec.once("exit", (kod: number) => {
      this.zamanlayiciyiTemizle();
      kayit.bosalt();
      kayit.kabuk(`Çekirdek süreci çıktı (çıkış kodu ${kod})`);
      if (this.surec === surec) this.surec = null;
      if (!this.bilerekDurduruluyor) {
        this.a.durdu(this.hataAciklamasi ?? `Çekirdek süreci beklenmedik biçimde durdu (çıkış kodu ${kod}).`);
      }
    });

    this.zamanlayici = setTimeout(() => {
      kayit.kabuk(`Çekirdek ${BASLATMA_SURESI_MS / 1000} sn içinde hazır olmadı; sonlandırılıyor`);
      this.hataAciklamasi = `Çekirdek ${BASLATMA_SURESI_MS / 1000} saniye içinde hazır olmadı.`;
      surec.kill();
    }, BASLATMA_SURESI_MS);
  }

  /** Çekirdeği nazikçe kapatır; 5 sn içinde çıkmazsa sonlandırır. */
  async durdur(): Promise<void> {
    const surec = this.surec;
    if (!surec) return;
    this.bilerekDurduruluyor = true;
    this.zamanlayiciyiTemizle();
    this.a.kayit.kabuk("Çekirdek kapatılıyor");

    const cikti = new Promise<void>((coz) => surec.once("exit", () => coz()));
    try {
      const mesaj: AnaMesaji = { tur: "kapat" };
      surec.postMessage(mesaj);
    } catch {
      // süreç zaten gidiyor
    }
    const sonuc = await Promise.race([cikti.then(() => "cikti" as const), bekle(KAPATMA_SURESI_MS).then(() => "zaman" as const)]);
    if (sonuc === "zaman") {
      this.a.kayit.kabuk(`Çekirdek ${KAPATMA_SURESI_MS / 1000} sn içinde kapanmadı; sonlandırılıyor`);
      surec.kill();
      await Promise.race([cikti, bekle(2_000)]);
    }
    if (this.surec === surec) this.surec = null;
  }

  async yenidenBaslat(): Promise<void> {
    await this.durdur();
    this.baslat();
  }

  private zamanlayiciyiTemizle(): void {
    if (this.zamanlayici) clearTimeout(this.zamanlayici);
    this.zamanlayici = null;
  }
}
