import { defineConfig } from "vitest/config";

// Kök test yapılandırması: tüm paketlerin birim testleri
export default defineConfig({
  test: {
    include: ["paketler/*/src/**/*.test.ts", "paketler/*/test/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
  },
});
