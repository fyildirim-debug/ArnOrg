// Sahte çekirdeğin İngilizce örnek verisi (ARNORG_DIL=en): Arnex Software · Order Panel.
// Burada yalnız metinler durur ve veri.mjs'deki kimliklerle anılır. Kimlikler, zamanlar, sayılar ve ilişkiler
// veri.mjs'den gelir; tohum.mjs ikisini birleştirir ve eksik ya da fazla kaydı açılışta uyarır.

export const roller = {
  ceo: { ad: "CEO", aciklama: "Writes the plan, proposes hires, hands out the work and reports to the board. Does not write code.", talimat: "You are the company's CEO." },
  cto: { ad: "CTO", aciklama: "Records architecture decisions as ADRs, splits tasks technically and sets the standards." },
  backend: { ad: "Backend developer", aciklama: "API, database and server-side work. Works in their own workspace." },
  frontend: { ad: "Frontend developer", aciklama: "UI screens, components and client-side state." },
  test: { ad: "Test engineer", aciklama: "Writes end-to-end and unit tests and reproduces bugs." },
  inceleme: { ad: "Code reviewer", aciklama: "Reviews changes, leaves line comments, approves the merge or sends it back." },
  guvenlik: { ad: "Security specialist", aciklama: "OWASP audits, dependency scans and secret leak checks." },
  devops: { ad: "DevOps", aciklama: "CI, deployment, monitoring and infrastructure scripts." },
  tasarim: { ad: "Designer", aciklama: "Design system, screen flows and accessibility." },
  yazar: { ad: "Technical writer", aciklama: "User docs, API reference and release notes." },
};

export const projeler = {
  "siparis-paneli": { ad: "Order Panel", aciklama: "Order, stock and shipping tracking for small businesses · Sprint 3: the order flow end to end" },
  "arnex-web": { ad: "Arnex Web", aciklama: "Company website · Astro and content notes" },
};

/** Ajanların adı ve karakteri aynı kalır; rol adı İngilizce rol kataloğundan gelir */
export const ajanlar = {
  ada: { isAciklamasi: "Compiling Sprint 3 progress", talimatEki: "Write a short status report every morning at 09:00. Report blocked work to the board right away." },
  kerem: { isAciklamasi: "T-21 Token refresh architecture" },
  deniz: { isAciklamasi: "T-24 Order API endpoints · waiting for approval to git push" },
  ece: { isAciklamasi: "T-26 Order list screen" },
  mert: { isAciklamasi: "Waiting on T-24 for T-27" },
  onur: { isAciklamasi: "Waiting for the T-19 fixes" },
  burak: { isAciklamasi: "CI cache and the Windows job" },
  selin: { isAciklamasi: "Drafts for the empty and error states are done" },
  zeynep: { isAciklamasi: "Paused by the board" },
  lale: { isAciklamasi: "Waiting for a brief" },
};

export const gorevler = {
  g15: { baslik: "Project skeleton", etiket: "infra", aciklama: "Vite + React client, Node API, shared types.", kabulOlcutu: "npm run dev starts both sides; CI is green." },
  g16: { baslik: "Database schema", aciklama: "Order, customer, product and shipment tables; first migration.", kabulOlcutu: "The migration can be rolled back; seed data loads." },
  g17: { baslik: "CI pipeline", etiket: "infra", aciklama: "Lint, type check and tests on Windows and Linux." },
  g18: { baslik: "Design system", etiket: "design", aciklama: "Table, badge, button and form components; empty and error states." },
  g19: { baslik: "Sign-in flow", aciklama: "Email + password sign-in, short-lived access token.", kabulOlcutu: "The refresh token is single-use; no race between two tabs." },
  g20: { baslik: "Product catalog screen", aciklama: "Moved to Sprint 4; the catalog API has to land first." },
  g21: { baslik: "Token refresh architecture", etiket: "architecture", aciklama: "Single-use refresh token and a client-side lock, per ADR-004.", kabulOlcutu: "ADR approved; implementation notes ready for Deniz and Ece." },
  g22: { baslik: "Product catalog API", aciklama: "GET /urunler with offset pagination.", kabulOlcutu: "Tests pass; Onur approves." },
  g23: { baslik: "Error tracking setup", etiket: "infra", aciklama: "Collect server and client errors in one place." },
  g24: { baslik: "Order API endpoints", aciklama: "GET /siparisler (cursor pagination), POST /siparisler, PATCH /siparisler/:id/durum.", kabulOlcutu: "Pagination follows ADR-005; validation errors return 422; tests pass." },
  g25: { baslik: "Order state machine", aciklama: "Pending → Preparing → Shipped → Delivered; cancellations and returns." },
  g26: { baslik: "Order list screen", aciklama: "Table, status badge, next page by cursor, error box.", kabulOlcutu: "Empty, loading and error states; works with the keyboard." },
  g27: { baslik: "End-to-end tests for the order flow", aciklama: "Create order → list → change status." },
  g28: { baslik: "Shipping carrier integration", aciklama: "One carrier to start; shipment code and tracking link." },
  g29: { baslik: "Order notification emails", aciklama: "'Order received' and 'Order shipped' emails." },
  w1: { baslik: "Site skeleton and content structure", etiket: "infra" },
};

/** Ajanların açtığı kanalın İngilizce adı; sistem kanalları (genel, toplanti) kimliğiyle kalır, Stüdyo görünen adını çevirir */
export const kanalAdlari = { muhendislik: "engineering" };

/** Kanal açıklamaları, Türkçe kanal kimliğiyle */
export const kanallar = {
  "siparis-paneli": {
    genel: "Whole team · messages without a mention go to the CEO",
    muhendislik: "Technical talk · decisions move to the notes as ADRs",
    toplanti: "Meeting room · whoever is mentioned joins the room",
  },
  "arnex-web": { genel: "Whole team", muhendislik: "Technical talk" },
};

/** Mesaj metinleri; kanal ve kurulun adı (Board) tohum.mjs'de çevrilir */
export const mesajlar = {
  m1: "The goal for this sprint is an order flow that works end to end. Let's leave payments for the next sprint.",
  m2: "Got it. I've built Sprint 3 around T-21, T-24, T-26 and T-27. Kerem takes the architecture, Deniz the API and Ece the list; Mert starts on tests once T-24 reaches review.",
  m3: "Good morning. Where we left off yesterday: T-22 is in review, and T-19 went back to Ece with two security findings. Today's priority is T-24 and T-26.",
  m4: "T-24: GET and POST /siparisler are ready, pagination tests in progress. @Mert the schema is in notlar/api/siparis.md.",
  m5: "Got it. I'll start the E2E tests as soon as T-24 moves to review.",
  m6: "T-19 review done: the session lifetime is hard-coded and there's a race condition on the refresh token. Sent it back to Ece.",
  m7: "We need a security audit before the payment integration. I'm proposing we hire a security specialist; the proposal is in Approvals.",
  m8: "I've opened the ADR-004 draft for token refresh. Please leave comments in the note, not in the channel.",
  m9: "@Kerem cursor or offset for pagination? We used offset for the catalog.",
  m10: "Cursor. The order list is going to grow; the decision is in the notes as ADR-005. The catalog can stay on offset for now.",
  m11: "I took the `Rozet` badge component from the design system for the list screen. For T-26 I'm using the `sonrakiImlec` field from the API response.",
  m12: "@Ece the field is `sonrakiImlec`; it's null on the last page.",
};

/** Notlar aynı yollarda durur (yol nottaki kimliktir); başlık ve içerik İngilizce */
export const notlar = {
  "vizyon.md": `# Vision

A web panel that brings order, stock and shipping tracking for small businesses together on **one screen**.

## First release

- The order flow end to end: create, list, change status
- Integration with one shipping carrier
- Role-based access: owner, staff

## Success criterion

The first ten businesses can run their orders from this panel alone for a whole week.
`,
  "mimari.md": `# Architecture

- **Client:** Vite + React, TanStack Query
- **Server:** Node.js API, Fastify
- **Data:** PostgreSQL, migrations under \`db/goc/\`
- **Auth:** short-lived access token + rotating refresh token (see ADR-004)

| Layer | Owner |
|---|---|
| API | Deniz |
| UI | Ece |
| Tests | Mert |
`,
  "sozluk.md": `# Glossary

- **Order:** a customer's confirmed cart.
- **Shipment:** part of an order that has been handed to the carrier.
- **Cursor:** in pagination, the key the next page starts from.
`,
  "kararlar/ADR-004-jeton-yenileme.md": `# ADR-004 · Token refresh

**Status:** Proposed · Kerem · 2 October 2026

## Context

In the T-19 review we saw that when two tabs refresh at the same time, the token gets used twice.

## Decision

The refresh token is **single-use**; if the same family shows up a second time, the whole family is revoked. On the client, refreshing goes through a single lock.

## Consequences

- Ece implements the client lock in T-19.
- Deniz implements the server side in T-24.
- Mert writes a test for the race condition.
`,
  "kararlar/ADR-005-imlec-sayfalama.md": `# ADR-005 · Cursor-based pagination

The order list is going to grow, so we use a **cursor** instead of an offset. The catalog endpoints stay on offset for now.

\`\`\`http
GET /siparisler?imlec=eyJpZCI6MTI0fQ&limit=25
\`\`\`
`,
  "api/siparis.md": `# Order API

| Method | Path | Description |
|---|---|---|
| GET | \`/siparisler?imlec=&limit=\` | List paginated by cursor |
| POST | \`/siparisler\` | New order; a validation error returns 422 |
| PATCH | \`/siparisler/:id/durum\` | Transition allowed by the state machine |
`,
};

export const politika = {
  k1: { ad: "Destructive commands", aciklama: "Irreversible deletion of files and data" },
  k2: { ad: "Secret files", aciklama: "Environment variables, keys" },
  k3: { ad: "Writing outside the workspace", aciklama: "Any path outside the worktree" },
  k4: { ad: "Outbound push and publish", aciklama: "Writing to the remote repo, publishing packages, deploying" },
  k5: { ad: "Network access", aciklama: "Outside the allowed domains" },
  k6: { ad: "Test commands", aciklama: "Tests are always allowed" },
};

/** Denetim kayıtları: kural adları politikadaki İngilizce adlarla aynı olmalı */
export const denetim = {
  d1: { kural: "Outbound push and publish" },
  d3: { kural: "Destructive commands", neden: "Pattern: rm\\s+-rf" },
  d4: { kural: "Test commands" },
  d5: { kural: "Secret files" },
  d6: { neden: "Author and date added to the note header" },
  d7: { kural: "Network access" },
  d9: { girdiOzeti: "T-27 → Planned" },
  d10: { kural: "Test commands" },
  d12: { girdiOzeti: "#general · Did the T-24 schema change?" },
  d14: { girdiOzeti: "\"payment provider\"" },
  d15: { kural: "Network access", neden: "Rejected by the board" },
};

export const onaylar = {
  o1: {
    ayrinti: "Wants to push the T-24 changes straight to main.",
    veri: { girdi: { description: "Push to main" }, kural: "Outbound push and publish → ask for approval" },
  },
  o2: {
    baslik: "Aras · Security specialist",
    ayrinti: "An independent audit of the session and token flows before the payment integration, plus a dependency scan.",
    veri: { talimatEki: "Audit against OWASP ASVS 4 level 2; write the findings up as ADRs." },
  },
  o3: {
    baslik: "T-22 Product catalog API → main",
    ayrinti: "Onur reviewed it in two rounds and approved. No conflicts, tests passed.",
    veri: { testler: "48/48 passed" },
  },
  o4: {
    baslik: "Deniz · index migration on the orders table",
    ayrinti: "Cursor-based pagination needs an index on siparisler(olusturma, id). The migration can be rolled back; expect a short write lock on the large table.",
  },
  o5: {
    baslik: "Payment provider: iyzico",
    ayrinti: "Three providers were compared; iyzico is recommended for its local card support and fees.",
    not: "Let's start it in Sprint 4.",
  },
  o6: {
    ayrinti: "Wanted to delete the old test folder.",
    veri: { kural: "Destructive commands" },
    not: "Remove the folder with git rm so I can see it in the PR.",
  },
};

// ---------------------------------------------------------------------------
// Ajan akışları: veri.mjs'deki adımlarla aynı sırada [dakikaOnce, tur, alanlar].
// Yalnız metin taşıyan alanlar (metin, girdideki açıklamalar) yazılır; araç, kimlik, dosya yolu ve zaman
// Türkçe adımdan gelir. Alanı verilmeyen adım (kod kesiti, test çıktısı) olduğu gibi kalır.
// ---------------------------------------------------------------------------

const ADA_RAPORU = `## Sprint 3 · Day 2

**27 percent** of the sprint plan is done. Token refresh (T-21) and the order API (T-24) are on track; the T-26 list screen can go into review today.

- **T-19** went back to Ece with two security findings: the session lifetime is hard-coded and there's a race condition on the refresh token. The client lock in ADR-004 fixes both.
- **T-22** has Onur's approval; the merge decision is yours.
- **Usage:** 42% of the 5-hour window and 18% of the weekly window used; the agents are below the limits. Deniz's index migration decision is in Approvals.

Before we move on to payments, I recommend hiring a **security specialist**. The proposal and rationale are in Approvals.`;

const VITEST_KALDI = ` RUN  v5.0.3 /home/furkan/.arnorg/calisma/siparis-paneli/deniz

 ✓ tests/api/siparisler.test.ts (6 tests) 39ms
 ❯ tests/api/sayfalama.test.ts (4 tests | 1 failed) 22ms
   × sonrakiImlec is null on the last page
     → expected 'eyJpZCI6MTMwfQ' to be null

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 9 passed (10)`;

export const akislar = {
  ada: [
    [95, "kullanici", { metin: "Prepare the daily status report; highlight the usage windows and anything that's blocked." }],
    [94, "dusunce", { metin: "First I should read the statuses on the board and yesterday's channel messages.\nThen I'll check the usage windows and flag anything close to a limit." }],
    [94, "arac_cagrisi", { arac: "mcp__arnorg__kanal_oku", girdi: { kanal: "general" } }],
    [94, "arac_sonucu", { metin: "Read 30 messages from #general." }],
    [93, "arac_cagrisi", { arac: "mcp__arnorg__gorev_guncelle" }],
    [93, "arac_sonucu", { metin: "T-27 → Planned" }],
    [92, "asistan", { metin: "Good morning. Yesterday's status is in #general; T-24 and T-26 are today's priority." }],
    [92, "sonuc"],
    [20, "kullanici", { metin: "When can we move on to payments?" }],
    [19, "arac_cagrisi", { arac: "mcp__arnorg__hafiza_ara", girdi: { sorgu: "payment provider" } }],
    [19, "arac_sonucu", { metin: "2 results: decision \"Payment provider\" (approved: iyzico), sozluk.md" }],
    [18, "arac_cagrisi", { arac: "mcp__arnorg__onay_iste", girdi: { baslik: "Aras · Security specialist" } }],
    [18, "arac_sonucu", { metin: "Approval request opened: o2" }],
    [11, "asistan", { metin: ADA_RAPORU }],
    [11, "sonuc"],
  ],
  deniz: [
    [58, "sistem", { metin: "Session opened · arnorg/deniz/T-24 · sonnet" }],
    [58, "kullanici", { metin: "Start on T-24: Order API endpoints. Acceptance criteria: GET /siparisler paginates by cursor, POST validates, tests pass." }],
    [57, "dusunce", { metin: "The current routes file might still use an offset.\nADR-005 says cursor; let me read the routes and the database layer first." }],
    [57, "asistan", { metin: "For T-24 I'm reading the current routes and **ADR-005** first." }],
    [57, "arac_cagrisi", { arac: "Read" }],
    [57, "arac_sonucu"],
    [56, "arac_cagrisi", { arac: "Grep" }],
    [56, "arac_sonucu", { metin: "src/sunucu/veritabani.ts:41:  // TODO cursor support" }],
    [55, "arac_cagrisi", { arac: "Task", girdi: { description: "Research pagination edge cases", prompt: "List the last-page, empty-list and deleted-record cases for cursor-based pagination." } }],
    [55, "asistan", { metin: "Going through the edge cases: last page, empty list, a record deleted after the cursor." }],
    [54, "arac_cagrisi", { arac: "Read" }],
    [54, "arac_sonucu", { metin: "# ADR-005 · Cursor-based pagination\n…" }],
    [53, "arac_sonucu", { metin: "Three edge cases: (1) sonrakiImlec is null on the last page, (2) an empty list returns 200 with an empty array, (3) if the cursor's record was deleted, continue from the next larger id." }],
    [52, "arac_cagrisi", { arac: "Write" }],
    [52, "arac_sonucu", { metin: "File created." }],
    [50, "arac_cagrisi", { arac: "Edit" }],
    [50, "arac_sonucu", { metin: "File updated." }],
    [48, "arac_cagrisi", { arac: "Write" }],
    [48, "arac_sonucu", { metin: "File created." }],
    [46, "arac_cagrisi", { arac: "Bash", girdi: { description: "Run the API tests" } }],
    [46, "arac_sonucu", { metin: VITEST_KALDI }],
    [45, "asistan", { metin: "`sonrakiImlec` isn't null on the last page; the bounds check should be `<=`. Fixing it." }],
    [45, "arac_cagrisi", { arac: "Edit" }],
    [45, "arac_sonucu", { metin: "File updated." }],
    [44, "arac_cagrisi", { arac: "Bash", girdi: { description: "Run the API tests again" } }],
    [44, "arac_sonucu"],
    [43, "sonuc"],
    [24, "kullanici", { metin: "Kerem: @Deniz let's call the field sonrakiImlec; Ece expects that on the client." }],
    [23, "asistan", { metin: "OK, the response field is already `sonrakiImlec`. I'll let Ece know in the channel." }],
    [22, "arac_cagrisi", { arac: "mcp__arnorg__mesaj_gonder", girdi: { kanal: "engineering", metin: "@Ece the field is sonrakiImlec; it's null on the last page." } }],
    [22, "arac_sonucu", { metin: "Message posted to #engineering." }],
    [21, "sonuc"],
    [4, "asistan", { metin: "Tests pass. Pushing the changes." }],
    [3, "arac_cagrisi", { arac: "Bash", girdi: { description: "Push to main" } }],
    [3, "sistem", { metin: "Audit: \"Outbound push and publish\" rule · waiting for the board's decision" }],
  ],
  ece: [
    [40, "kullanici", { metin: "T-26: Order list screen. Use the Tablo and Rozet components from the design system; next page by cursor." }],
    [39, "arac_cagrisi", { arac: "Read" }],
    [39, "arac_sonucu"],
    [36, "arac_cagrisi", { arac: "Write" }],
    [36, "arac_sonucu", { metin: "File created." }],
    [30, "arac_cagrisi", { arac: "Edit" }],
    [30, "arac_sonucu", { metin: "File updated." }],
    [9, "arac_cagrisi", { arac: "Read" }],
    [9, "arac_sonucu", { metin: "Denied by ArnOrg policy: Secret files (.env)" }],
    [8, "asistan", { metin: "I don't have access to the env file; I'll take the API address from the proxy in `vite.config.ts`." }],
  ],
  kerem: [
    [120, "kullanici", { metin: "T-21: Write the token refresh architecture up as an ADR; put together implementation notes for Deniz and Ece." }],
    [118, "arac_cagrisi", { arac: "mcp__arnorg__not_yaz" }],
    [118, "arac_sonucu", { metin: "Note written (author and date added to the header)." }],
    [15, "arac_cagrisi", { arac: "Grep" }],
    [15, "arac_sonucu"],
  ],
  mert: [
    [51, "kullanici", { metin: "Deniz: @Mert the schema is in notlar/api/siparis.md." }],
    [51, "asistan", { metin: "Got it. I'll start the E2E tests as soon as T-24 moves to review." }],
    [7, "arac_cagrisi", { arac: "Bash", girdi: { description: "Delete the old tests" } }],
    [6, "arac_sonucu", { metin: "Rejected by the board: Remove the folder with git rm so I can see it in the PR." }],
    [6, "sonuc"],
  ],
  onur: [
    [36, "kullanici", { metin: "Review T-19." }],
    [35, "arac_cagrisi", { arac: "Read" }],
    [35, "arac_sonucu"],
    [34, "asistan", { metin: "Two findings:\n\n1. The session lifetime is hard-coded as `3600`; it should use `ayarlar.oturumSuresiSn`.\n2. If two tabs refresh at the same time, the same refresh token is sent twice. We need the client lock from ADR-004.\n\nSending T-19 back to Ece." }],
    [34, "sonuc"],
    [33, "sistem", { metin: "Session closed" }],
  ],
};
