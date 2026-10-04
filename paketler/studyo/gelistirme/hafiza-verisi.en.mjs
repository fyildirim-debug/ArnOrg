// Sahte çekirdeğin İngilizce hafıza kayıtları, ajan defterleri ve ajanlar arası soruları (ARNORG_DIL=en).
// Yalnız metinler; kimlik, tür, önem, kaynak ve zamanlar hafiza-verisi.mjs'den gelir (tohum.mjs birleştirir).
// Kimliksiz demo listeleri hafiza-verisi.mjs'deki sırayla eşleşir.

export const hafiza = {
  h1: { baslik: "Commit messages in English", metin: "Commit messages are written in English and say what changed. No Co-Authored-By or tool signature lines." },
  h2: {
    baslik: "Money is stored in minor units",
    metin: "Amounts are kept in the database as integer minor units (1 TRY = 100); the UI shows lira with `Intl.NumberFormat('tr-TR')`. No floating point.",
    etiketler: ["money", "database"],
  },
  h3: { baslik: "Single column on mobile", metin: "Below 520 pixels the order list collapses to a single column; no horizontal scrolling.", etiketler: ["ui"] },
  h4: {
    baslik: "Authentication: short-lived access + rotating refresh token",
    metin: "The access token lasts 15 minutes; the refresh token lasts 30 days and rotates on every use. If a stolen refresh token is used a second time, the whole family is revoked. Details: `notlar/kararlar/ADR-004-jeton.md`.",
  },
  h5: { baslik: "API version in the path: /api/v1", metin: "All endpoints live under `/api/v1`. A breaking change opens `/api/v2`, and the old one lives on for 90 days." },
  h6: {
    baslik: "Order statuses are a finite state machine",
    metin: "beklemede → hazirlaniyor → kargoda → teslim; cancellation only before shipping. Transitions live in `src/siparis/durum.ts`; status is written nowhere else.",
    etiketler: ["src/siparis/durum.ts", "orders"],
  },
  h7: { baslik: "better-sqlite3 NODE_MODULE_VERSION error", metin: "Symptom: tests fail with `was compiled against a different Node.js version`. Cause: the Node version changed. Fix: `npm rebuild better-sqlite3`." },
  h8: { baslik: "Vite cache shows a stale component", metin: "After switching branches, delete `node_modules/.vite`; otherwise you get an old build of SiparisListesi." },
  h9: { baslik: "Node 22 and npm workspaces", metin: "The repo uses npm workspaces and needs Node 22. Tests: `npm test`; type check: `npm run typecheck`." },
  h10: { baslik: "Payment provider test key is in the Vault", metin: "The Iyzico sandbox key is in the Vault: siparis-paneli/iyzico-sandbox. Never put it in code or notes.", etiketler: ["payments", "secret"] },
  h11: { baslik: "Payments and webhook signatures: Deniz", metin: "Deniz built the Iyzico payment flow and the webhook HMAC verification; questions about it go to Deniz.", etiketler: ["payments"] },
  h12: { baslik: "Accessibility and keyboard navigation: Ece", metin: "Ece wrote the table's keyboard navigation and focus rings.", etiketler: ["accessibility"] },
  // h2 ile bilerek benzer: hafıza bakımındaki tekrar eden kayıt örneği
  h13: { baslik: "Amounts in minor units, no floating point", metin: "Amounts are stored as integers in minor units; no floating point.", etiketler: ["money"] },
  h14: { baslik: "T-19 order filters merged", metin: "The date and status filters are merged into the main branch and kept in the URL query. Remaining: saved filters (T-31)." },
  h15: { baslik: "Node 20 is used", metin: "The project runs on Node 20." },
};

export const defterler = {
  ada: "## Open items\n- Sprint 3 report to the board on Friday at 17:00\n- Proposal to hire a designer for T-31\n\n## Promises\n- To Kerem: ADR-004 review today\n\n## Next\n- Summarize Onur's T-19 notes",
  kerem: "## Open items\n- T-21 token refresh: family revocation still to do\n\n## Watch out\n- Deniz's T-24 branch must use the /api/v1 prefix\n\n## Next\n- Move ADR-004 into the notes",
  deniz: "## Open items\n- T-24 order endpoints: the PATCH status transition has no tests\n- Waiting for board approval to git push\n\n## Promises\n- To Mert: test data in `test/veri/siparisler.json` today\n\n## Next\n- Webhook retries (idempotency key)",
  ece: "## Open items\n- T-26 list screen: empty state and loading skeleton\n\n## Watch out\n- Single column below 520 px (board preference)",
  mert: "## Waiting\n- T-24 to be merged, for T-27\n\n## Ready\n- e2e skeleton: create an order → see it in the list",
};

export const sorular = {
  s1: {
    soru: "Is pagination for the order list cursor-based or page-numbered? Which field does the endpoint return?",
    yanit: "Cursor-based. Call `GET /api/v1/siparisler?imlec=...&sinir=50`; the response has a `sonrakiImlec` field, and null means it's the last page.",
  },
  s2: {
    soru: "Which helper should we use to fake the clock in the refresh token test?",
    yanit: "`vi.useFakeTimers()` is enough; the token lifetime is read through `simdi()` in `src/auth/sure.ts`, so mock that.",
  },
  s3: { soru: "Are saved filters out of scope for the T-19 filters?" },
};

/** Canlı demo: sırayla sorulup yanıtlanan sorular */
export const demoSorular = [
  {
    soru: "If PATCH /siparisler/:id/durum tries to ship a cancelled order, which error code should it return?",
    yanit: "It should return 409 with `{ kod: 'GECERSIZ_GECIS', mevcut, istenen }` in the body. The transition rules are in src/siparis/durum.ts.",
  },
  {
    soru: "Where should we convert amounts from minor units to lira in the UI? Is there a shared helper?",
    yanit: "Use `tl(kurus)` from `src/ortak/para.ts`; don't write your own formatter.",
  },
];

/** Canlı demo: sırayla yazılan hafıza kayıtları */
export const demoKayitlar = [
  { baslik: "Playwright can't find the browser", metin: "In CI the browser isn't downloaded when `PLAYWRIGHT_BROWSERS_PATH` is empty; the cache step has to keep the `~/.cache/ms-playwright` path.", etiketler: ["ci", "e2e"] },
  { baslik: "Virtual scrolling for the order list", metin: "Above 500 rows, virtual scrolling with `@tanstack/react-virtual`; below that, a plain table.", etiketler: ["ui", "performance"] },
  { baslik: "Webhook retries are idempotent", metin: "The webhook handler checks the `Idempotency-Key` header; the same key a second time returns 200 and does nothing.", etiketler: ["payments", "webhook"] },
];
