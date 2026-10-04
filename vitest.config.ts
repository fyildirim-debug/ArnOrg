import { defineConfig } from "vitest/config";

// Kök test yapılandırması: tüm paketlerin birim testleri
export default defineConfig({
  test: {
    include: ["paketler/*/src/**/*.test.ts", "paketler/*/test/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    // Çekirdeğin ilk açılış dili sistem dilinden seçilir; testler Türkçe metinleri bekler
    env: { ARNORG_DIL: "tr" },
  },
});
