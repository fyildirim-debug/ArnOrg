// Canlı olay kanalı (WS /ws): yeniden bağlanan, projeye abone olan istemci
import type { IstemciOlayi, SunucuOlayi } from "@arnorg/ortak";
import { anahtar } from "./anahtar";

export type WsDurumu = "baglaniyor" | "bagli" | "kopuk";

/** Aynı kökene göre ws/wss adresi kurar ve anahtarı ekler */
export function wsAdresi(yol: string): string {
  const protokol = location.protocol === "https:" ? "wss:" : "ws:";
  const ayrac = yol.includes("?") ? "&" : "?";
  return `${protokol}//${location.host}${yol}${ayrac}anahtar=${encodeURIComponent(anahtar() ?? "")}`;
}

type OlayDinleyici = (olay: SunucuOlayi) => void;

const olayDinleyicileri = new Set<OlayDinleyici>();

/** Bileşenlerin tek tek olay dinlemesi için (ör. Kod ekranında dosya.degisti) */
export function olaylariDinle(dinleyici: OlayDinleyici): () => void {
  olayDinleyicileri.add(dinleyici);
  return () => olayDinleyicileri.delete(dinleyici);
}

interface GeriCagirimlar {
  olay: (olay: SunucuOlayi) => void;
  durum: (durum: WsDurumu) => void;
  /** Kopmadan sonra yeniden bağlanınca: kaçan olaylar için veri tazelenir */
  yenidenBaglandi: () => void;
}

const PING_ARALIGI = 25_000;
const EN_UZUN_BEKLEME = 15_000;

export class CanliBaglanti {
  private ws: WebSocket | null = null;
  private deneme = 0;
  private yenidenZamanlayici: ReturnType<typeof setTimeout> | undefined;
  private pingZamanlayici: ReturnType<typeof setInterval> | undefined;
  private projeId: string | null = null;
  private kapatildi = false;
  private oncedenBaglandi = false;
  private readonly cb: GeriCagirimlar;

  constructor(cb: GeriCagirimlar) {
    this.cb = cb;
  }

  baslat() {
    this.kapatildi = false;
    this.baglan();
  }

  kapat() {
    this.kapatildi = true;
    clearTimeout(this.yenidenZamanlayici);
    clearInterval(this.pingZamanlayici);
    this.ws?.close();
    this.ws = null;
  }

  abone(projeId: string | null) {
    this.projeId = projeId;
    this.gonder({ tur: "abone", projeId });
  }

  /** Bağlantı koptuysa beklemeden yeniden dener */
  simdiDene() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    clearTimeout(this.yenidenZamanlayici);
    this.deneme = 0;
    this.baglan();
  }

  private gonder(olay: IstemciOlayi) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(olay));
  }

  private baglan() {
    if (this.kapatildi || !anahtar()) return;
    this.cb.durum("baglaniyor");
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsAdresi("/ws"));
    } catch {
      this.yenidenPlanla();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.deneme = 0;
      this.cb.durum("bagli");
      this.gonder({ tur: "abone", projeId: this.projeId });
      clearInterval(this.pingZamanlayici);
      this.pingZamanlayici = setInterval(() => this.gonder({ tur: "ping" }), PING_ARALIGI);
      if (this.oncedenBaglandi) this.cb.yenidenBaglandi();
      this.oncedenBaglandi = true;
    };

    ws.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      let olay: SunucuOlayi;
      try {
        olay = JSON.parse(e.data) as SunucuOlayi;
      } catch {
        return;
      }
      this.cb.olay(olay);
      olayDinleyicileri.forEach((d) => d(olay));
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      clearInterval(this.pingZamanlayici);
      this.ws = null;
      this.cb.durum("kopuk");
      this.yenidenPlanla();
    };

    ws.onerror = () => {
      // onclose ardından gelir; yeniden deneme orada planlanır
    };
  }

  private yenidenPlanla() {
    if (this.kapatildi) return;
    clearTimeout(this.yenidenZamanlayici);
    // Üstel bekleme + küçük rastgele sapma: 0,5 s, 1 s, 2 s, 4 s … en çok 15 s
    const temel = Math.min(EN_UZUN_BEKLEME, 500 * 2 ** this.deneme);
    const bekleme = temel + Math.random() * 300;
    this.deneme += 1;
    this.yenidenZamanlayici = setTimeout(() => this.baglan(), bekleme);
  }
}
