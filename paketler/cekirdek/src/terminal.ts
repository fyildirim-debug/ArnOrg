// Kod editörünün terminalleri (node-pty; Windows'ta ConPTY)
import os from "node:os";
import { spawn, type IPty } from "@lydell/node-pty";
import { iki } from "./dil.js";
import { temizOrtam } from "./ortam.js";
import { ArnorgHatasi, kimlik } from "./yardimci.js";

interface Terminal {
  id: string;
  projeId: string;
  pty: IPty;
  tampon: string;
  dinleyiciler: Set<(veri: string) => void>;
  kapanis: Set<() => void>;
}

const TAMPON_SINIRI = 64 * 1024;

function kabuk(): { komut: string; argumanlar: string[] } {
  if (process.platform === "win32") {
    return { komut: process.env.COMSPEC?.toLowerCase().includes("powershell") ? process.env.COMSPEC : "powershell.exe", argumanlar: ["-NoLogo"] };
  }
  return { komut: process.env.SHELL || "/bin/bash", argumanlar: ["-l"] };
}

export class TerminalYoneticisi {
  private terminaller = new Map<string, Terminal>();

  ac(projeId: string, cwd: string, sutun = 100, satir = 30): string {
    if (this.terminaller.size >= 32) throw new ArnorgHatasi(iki("Çok fazla açık terminal var; bazılarını kapatın.", "Too many terminals are open; close some of them."), 429);
    const { komut, argumanlar } = kabuk();
    const pty = spawn(komut, argumanlar, {
      name: "xterm-256color",
      cols: Math.max(20, sutun),
      rows: Math.max(5, satir),
      cwd,
      env: temizOrtam({ TERM: "xterm-256color", COLORTERM: "truecolor", HOME: os.homedir() }),
    });
    const t: Terminal = { id: kimlik(), projeId, pty, tampon: "", dinleyiciler: new Set(), kapanis: new Set() };
    pty.onData((veri) => {
      t.tampon += veri;
      if (t.tampon.length > TAMPON_SINIRI) t.tampon = t.tampon.slice(-TAMPON_SINIRI);
      for (const d of t.dinleyiciler) d(veri);
    });
    pty.onExit(() => {
      for (const k of t.kapanis) k();
      this.terminaller.delete(t.id);
    });
    this.terminaller.set(t.id, t);
    return t.id;
  }

  bagla(id: string, veriDinleyici: (veri: string) => void, kapanisDinleyici: () => void): () => void {
    const t = this.terminaller.get(id);
    if (!t) throw new ArnorgHatasi(iki("Terminal bulunamadı.", "Terminal not found."), 404);
    if (t.tampon) veriDinleyici(t.tampon);
    t.dinleyiciler.add(veriDinleyici);
    t.kapanis.add(kapanisDinleyici);
    return () => {
      t.dinleyiciler.delete(veriDinleyici);
      t.kapanis.delete(kapanisDinleyici);
    };
  }

  yaz(id: string, veri: string): void {
    this.terminaller.get(id)?.pty.write(veri);
  }

  boyutla(id: string, sutun: number, satir: number): void {
    const t = this.terminaller.get(id);
    if (t && sutun > 0 && satir > 0) t.pty.resize(Math.floor(sutun), Math.floor(satir));
  }

  kapat(id: string): void {
    const t = this.terminaller.get(id);
    if (!t) return;
    try {
      t.pty.kill();
    } catch {
      // zaten kapanmış
    }
    this.terminaller.delete(id);
  }

  projeTerminali(id: string): string | null {
    return this.terminaller.get(id)?.projeId ?? null;
  }

  hepsiniKapat(): void {
    for (const id of [...this.terminaller.keys()]) this.kapat(id);
  }
}
