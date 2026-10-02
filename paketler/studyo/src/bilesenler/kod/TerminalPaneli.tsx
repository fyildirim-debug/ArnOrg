// Çalışma alanında gerçek terminal: xterm + fit, çekirdekte node-pty
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { hataMetni } from "../../api/istek";
import { terminalAc, type TerminalOturumu } from "../../api/terminal";

const TEMA = {
  background: "#0a0a0b",
  foreground: "#f2f0ec",
  cursor: "#f27a68",
  cursorAccent: "#0a0a0b",
  selectionBackground: "#f27a6855",
  black: "#19191c",
  red: "#f07c6c",
  green: "#8fd6a8",
  yellow: "#eccb72",
  blue: "#9ec7e3",
  magenta: "#d9a0c8",
  cyan: "#8fd0d0",
  white: "#ede7dc",
  brightBlack: "#77726b",
  brightRed: "#f5998b",
  brightGreen: "#b9e6c6",
  brightYellow: "#f3dc9c",
  brightBlue: "#bfdcef",
  brightMagenta: "#e6c0db",
  brightCyan: "#b5e3e3",
  brightWhite: "#f2f0ec",
};

type Durum = { tur: "aciliyor" } | { tur: "acik" } | { tur: "kapandi"; neden: string } | { tur: "hata"; neden: string };

export function TerminalPaneli({
  projeId,
  alan,
  gorunur,
  gunluk,
}: {
  projeId: string;
  alan: string;
  /** Panel gizliyken terminal yaşar ama boyutlanmaz */
  gorunur: boolean;
  gunluk: (metin: string) => void;
}) {
  const kapRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const oturumRef = useRef<TerminalOturumu | null>(null);
  const [durum, setDurum] = useState<Durum>({ tur: "aciliyor" });
  const [kusak, setKusak] = useState(0);
  const gunlukRef = useRef(gunluk);
  gunlukRef.current = gunluk;

  useEffect(() => {
    const kap = kapRef.current;
    if (!kap) return;
    let bitti = false;
    const term = new Terminal({
      fontFamily: '"IBM Plex Mono", ui-monospace, Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 5000,
      theme: TEMA,
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(kap);
    termRef.current = term;
    fitRef.current = fit;
    try {
      fit.fit();
    } catch {
      // gizli kapta ölçü yok
    }
    setDurum({ tur: "aciliyor" });

    terminalAc({
      projeId,
      alan,
      sutun: term.cols,
      satir: term.rows,
      veri: (m) => term.write(m),
      kapandi: (neden) => {
        if (bitti) return;
        setDurum({ tur: "kapandi", neden });
        term.write("\r\n\x1b[2m[oturum kapandı]\x1b[0m\r\n");
        gunlukRef.current(`Terminal kapandı (${alan})`);
      },
    })
      .then((o) => {
        if (bitti) {
          o.kapat();
          return;
        }
        oturumRef.current = o;
        setDurum({ tur: "acik" });
        gunlukRef.current(`Terminal açıldı (${alan})`);
        term.onData((v) => o.gonder(v));
        term.onResize(({ cols, rows }) => o.boyut(cols, rows));
        o.boyut(term.cols, term.rows);
      })
      .catch((e: unknown) => {
        if (bitti) return;
        const neden = hataMetni(e);
        setDurum({ tur: "hata", neden });
        gunlukRef.current(`Terminal açılamadı: ${neden}`);
      });

    const gozlemci = new ResizeObserver(() => {
      if (kap.offsetParent === null) return;
      try {
        fit.fit();
      } catch {
        // ölçü alınamadı
      }
    });
    gozlemci.observe(kap);

    return () => {
      bitti = true;
      gozlemci.disconnect();
      oturumRef.current?.kapat();
      oturumRef.current = null;
      term.dispose();
      termRef.current = null;
    };
  }, [projeId, alan, kusak]);

  useEffect(() => {
    if (!gorunur) return;
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // ölçü alınamadı
      }
      termRef.current?.focus();
    });
  }, [gorunur]);

  return (
    <div className="e-terminal">
      {durum.tur === "hata" || durum.tur === "kapandi" ? (
        <div className="e-terminal-durum">
          <span className={durum.tur === "hata" ? "alan-hata" : "alan-ipucu"}>{durum.neden}</span>
          <button type="button" className="dugme dugme-kucuk" onClick={() => setKusak((k) => k + 1)}>
            Yeni terminal
          </button>
        </div>
      ) : null}
      <div className="e-terminal-kap" ref={kapRef} aria-label="Terminal" />
    </div>
  );
}
