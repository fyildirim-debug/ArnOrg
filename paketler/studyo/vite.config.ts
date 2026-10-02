import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Geliştirmede çekirdek (ya da sahte sunucu) bu adreste çalışır; ARNORG_CEKIRDEK ile değiştirilebilir
const CEKIRDEK = process.env.ARNORG_CEKIRDEK ?? "http://127.0.0.1:47820";

export default defineConfig({
  plugins: [react()],
  // Derleme çekirdekten ya da Electron penceresinden açılır; göreli yollar iki durumda da çalışır
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Monaco büyük bir parça; yalnız Kod ekranında tembel yüklenir
    chunkSizeWarningLimit: 5000,
  },
  worker: { format: "es" },
  server: {
    port: 5173,
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
});
