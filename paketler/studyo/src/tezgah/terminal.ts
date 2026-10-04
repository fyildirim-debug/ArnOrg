// VS Code terminal paneli → çekirdeğin pty'si (POST /terminaller + WS /ws/terminal/:id).
// Yeni terminalin çalışma dizini: VS Code bir kök seçtirdiyse o kök, yoksa etkin dosyanın kökü, o da yoksa ana repo.
import { Emitter } from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import {
  ProcessPropertyType,
  type IShellLaunchConfig,
  type ITerminalLaunchError,
} from "@codingame/monaco-vscode-api/vscode/vs/platform/terminal/common/terminal";
import {
  SimpleTerminalBackend,
  SimpleTerminalProcess,
  type ITerminalChildProcess,
} from "@codingame/monaco-vscode-terminal-service-override";
import { hataMetni } from "../api/istek";
import { sozluk } from "../dil";
import { terminalAc, type TerminalOturumu } from "../api/terminal";
import { api } from "../api/uclar";
import { useVeri } from "../durum/veri";
import { yoldanKonum, type Konum } from "./adres";

let sayac = 0;

/** Etkin düzenleyicinin konumu (kurulumda bağlanır) */
let etkinKonum: () => Konum | null = () => null;
export function etkinKonumBagla(f: () => Konum | null) {
  etkinKonum = f;
}

function kabukAdi(): string {
  const platform = useVeri.getState().saglik?.platform ?? "";
  return platform.startsWith("win32") ? "powershell" : "bash";
}

class ArnorgTerminalSureci extends SimpleTerminalProcess {
  private oturum: TerminalOturumu | null = null;
  private readonly cikis = new Emitter<number | undefined>();
  private boyut: { sutun: number; satir: number };
  private kapatildi = false;

  constructor(
    id: number,
    private readonly projeId: string,
    private readonly alan: string,
    /** Alanın diskteki yolu: sekmede klasör adı olarak görünür */
    cwd: string,
    sutun: number,
    satir: number,
    private readonly veri: Emitter<string>,
  ) {
    // Süreç kimliği sıfır olmamalı: VS Code sıfırı "süreç henüz hazır değil" sayıp girdiyi bekletir
    super(id, id, cwd, veri.event);
    this.onProcessExit = this.cikis.event;
    this.boyut = { sutun, satir };
    this.refreshProperty = (async (tur: ProcessPropertyType) =>
      tur === ProcessPropertyType.Cwd || tur === ProcessPropertyType.InitialCwd ? this.cwd : undefined) as typeof this.refreshProperty;
  }

  async start(): Promise<ITerminalLaunchError | undefined> {
    try {
      this.oturum = await terminalAc({
        projeId: this.projeId,
        alan: this.alan,
        sutun: this.boyut.sutun,
        satir: this.boyut.satir,
        veri: (metin) => this.veri.fire(metin),
        kapandi: () => {
          if (!this.kapatildi) this.cikis.fire(0);
        },
      });
      for (const g of this.bekleyenGirdi.splice(0)) this.oturum.gonder(g);
      return undefined;
    } catch (h) {
      return { message: sozluk().kod.terminalAcilamadi(hataMetni(h)) };
    }
  }

  override shutdown(): void {
    this.kapatildi = true;
    this.oturum?.kapat();
    this.oturum = null;
    this.cikis.fire(undefined);
  }

  /** Bağlantı kurulmadan yazılanlar bekletilir */
  private bekleyenGirdi: string[] = [];

  override input(veri: string): void {
    if (this.oturum) this.oturum.gonder(veri);
    else if (!this.kapatildi) this.bekleyenGirdi.push(veri);
  }

  resize(sutun: number, satir: number): void {
    this.boyut = { sutun, satir };
    this.oturum?.boyut(sutun, satir);
  }

  override clearBuffer(): void {}

  override sendSignal(): void {}
}

export class ArnorgTerminalArkaUcu extends SimpleTerminalBackend {
  override getDefaultSystemShell = async (): Promise<string> => kabukAdi();

  override createProcess = async (kabuk: IShellLaunchConfig, cwd: string, sutun: number, satir: number): Promise<ITerminalChildProcess> => {
    const projeId = useVeri.getState().aktifProjeId ?? "";
    const istenen = yoldanKonum(typeof kabuk.cwd === "object" ? kabuk.cwd.path : (kabuk.cwd ?? cwd), projeId);
    const etkin = etkinKonum();
    const alan = istenen?.alan ?? (etkin && etkin.projeId === projeId ? etkin.alan : "ana");
    const yol = await api
      .calismaAlanlari(projeId)
      .then((l) => l.find((a) => a.kimlik === alan)?.yol)
      .catch(() => undefined);
    return new ArnorgTerminalSureci(++sayac, projeId, alan, yol || `/${projeId}/${alan}`, sutun, satir, new Emitter<string>());
  };
}
