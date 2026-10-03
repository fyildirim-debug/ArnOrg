import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Geliştirmede çekirdek (ya da sahte sunucu) bu adreste çalışır; ARNORG_CEKIRDEK ile değiştirilebilir
const CEKIRDEK = process.env.ARNORG_CEKIRDEK ?? "http://127.0.0.1:47820";

// VS Code tezgâhı (monaco-vscode-api) CSS'lerini metin olarak ister: tezgâh Stüdyo'nun stillerinden yalıtılmış
// bir gölge kökte çalışır ve bu metinleri oraya kendisi ekler.
const vscodeCssMetinOlarak: Plugin = {
  name: "arnorg-vscode-css-metin",
  enforce: "pre",
  async resolveId(kaynak, iceAktaran, secenekler) {
    if (!kaynak.endsWith(".css") || kaynak.includes("?")) return undefined;
    const cozulen = await this.resolve(kaynak, iceAktaran, { ...secenekler, skipSelf: true });
    if (cozulen && /node_modules\/(@codingame\/monaco-vscode|vscode\/)[^?]*\.css$/.test(cozulen.id)) return { ...cozulen, id: `${cozulen.id}?inline` };
    return undefined;
  },
};

// Yerleşik eklentiler kaynak eşlemlerini (.map) de dosya olarak kaydeder; yalnız hata ayıklamaya yarayan bu
// dosyalar (~60 MB) pakete girmesin, yerlerine boş bir eşlem verilir
const eklentiEslemleriniAt: Plugin = {
  name: "arnorg-eklenti-eslemlerini-at",
  enforce: "pre",
  transform(kod, kimlik) {
    if (!/node_modules\/@codingame\/monaco-vscode-[^/]+\/index\.js$/.test(kimlik) || !kod.includes(".map'")) return undefined;
    return { code: kod.replace(/new URL\('[^']+\.map', import\.meta\.url\)/g, 'new URL("data:application/json,%7B%7D")'), map: null };
  },
};

// Tezgâhtaki TypeScript dil sunucusu proje çapında IntelliSense için SharedArrayBuffer ister: sayfa
// çapraz köken yalıtımlı sunulur (çekirdek de aynı başlıkları gönderir, bkz. cekirdek/src/fs-api.ts)
const yalitimBasliklari = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" };

export default defineConfig({
  plugins: [vscodeCssMetinOlarak, eklentiEslemleriniAt, react()],
  // Derleme çekirdekten ya da Electron penceresinden açılır; göreli yollar iki durumda da çalışır
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    // Tezgâh parçaları büyük; yalnız Kod ekranı ilk açılınca yüklenir
    chunkSizeWarningLimit: 20_000,
    // Eklenti dosyaları (dil bilgisi, iframe, wasm) URL ile yüklenir; data: adresine gömülmesin
    assetsInlineLimit: 0,
  },
  worker: { format: "es" },
  server: {
    port: 5173,
    headers: yalitimBasliklari,
    proxy: {
      // Çekirdek Host ve Origin başlıklarını denetler (DNS yeniden bağlama koruması);
      // vekil iki başlığı da çekirdeğin kendi kökenine çevirir.
      "/api": {
        target: CEKIRDEK,
        changeOrigin: true,
        configure: (vekil) => {
          vekil.on("proxyReq", (istek) => {
            if (istek.getHeader("origin")) istek.setHeader("origin", CEKIRDEK);
          });
        },
      },
      "/ws": {
        target: CEKIRDEK,
        ws: true,
        changeOrigin: true,
        configure: (vekil) => {
          vekil.on("proxyReqWs", (istek) => {
            istek.setHeader("origin", CEKIRDEK);
          });
        },
      },
    },
  },
  preview: { headers: yalitimBasliklari },
});
