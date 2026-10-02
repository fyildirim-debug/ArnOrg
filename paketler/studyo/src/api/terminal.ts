// Terminal oturumu: POST ile açılır, WS /ws/terminal/:id ile konuşulur
import type { TerminalIstemciMesaji } from "@arnorg/ortak";
import { wsAdresi } from "./canli";
import { api } from "./uclar";

export interface TerminalOturumu {
  id: string;
  gonder: (veri: string) => void;
  boyut: (sutun: number, satir: number) => void;
  kapat: () => void;
}

interface Secenekler {
  projeId: string;
  alan: string;
  sutun: number;
  satir: number;
  /** Sunucudan gelen ham metin */
  veri: (metin: string) => void;
  kapandi: (neden: string) => void;
}

export async function terminalAc(s: Secenekler): Promise<TerminalOturumu> {
  const { id } = await api.terminalAc(s.projeId, { alan: s.alan, sutun: s.sutun, satir: s.satir });
  const ws = new WebSocket(wsAdresi(`/ws/terminal/${encodeURIComponent(id)}`));
  let bitti = false;
  const kuyruk: string[] = [];

  const yolla = (m: TerminalIstemciMesaji) => {
    const j = JSON.stringify(m);
    if (ws.readyState === WebSocket.OPEN) ws.send(j);
    else if (ws.readyState === WebSocket.CONNECTING) kuyruk.push(j);
  };

  ws.onopen = () => {
    for (const j of kuyruk.splice(0)) ws.send(j);
  };
  ws.onmessage = (e) => {
    if (typeof e.data === "string") s.veri(e.data);
    else if (e.data instanceof Blob) void e.data.text().then(s.veri);
  };
  ws.onclose = () => {
    if (bitti) return;
    bitti = true;
    s.kapandi("Terminal oturumu kapandı.");
  };

  return {
    id,
    gonder: (veri) => yolla({ tur: "girdi", veri }),
    boyut: (sutun, satir) => yolla({ tur: "boyut", sutun, satir }),
    kapat: () => {
      bitti = true;
      ws.close();
      void api.terminalKapat(id).catch(() => undefined);
    },
  };
}
