// Sahte çekirdeğin dosya sistemi: main dalı ve ajan çalışma alanlarındaki değişiklikler

export const ana = {
  ".gitignore": "node_modules/\ndist/\n.env*\n",
  "CLAUDE.md": `# Sipariş Paneli · ortak kurallar

- Türkçe değişken ve yorum.
- Her görev kendi dalında: arnorg/<ajan>/<görev>.
- main'e doğrudan push yok; birleştirme kurul onayıyla.
- Testler vitest ile; \`npm test\` her zaman yeşil kalır.
`,
  "README.md": `# Sipariş Paneli

Küçük işletmeler için sipariş, stok ve kargo takibi.

\`\`\`sh
npm install
npm run dev
\`\`\`
`,
  "package.json": `{
  "name": "siparis-paneli",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "fastify": "^5.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vite": "^8.0.0",
    "vitest": "^5.0.0"
  }
}
`,
  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src", "tests"]
}
`,
  ".arnorg/proje.yaml": `ad: Sipariş Paneli
aciklama: Küçük işletmeler için sipariş, stok ve kargo takibi
varsayilan_dal: main
birlestirme: yerel
not: ArnOrg proje ayarları. Ekip kimlikleri ekip/, proje hafızası notlar/ altında tutulur.
`,
  "src/main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Uygulama } from "./Uygulama";

createRoot(document.getElementById("kok")!).render(
  <StrictMode>
    <Uygulama />
  </StrictMode>,
);
`,
  "src/api/istemci.ts": `export interface Siparis {
  id: number;
  no: string;
  musteri: string;
  durum: "beklemede" | "hazirlaniyor" | "kargoda" | "teslim";
  tutar: number;
}

export interface SiparisSayfasi {
  siparisler: Siparis[];
  sonrakiImlec: string | null;
}

export async function siparisleriGetir(p: { imlec: string | null; limit: number }): Promise<SiparisSayfasi> {
  const q = new URLSearchParams({ limit: String(p.limit) });
  if (p.imlec) q.set("imlec", p.imlec);
  const yanit = await fetch(\`/api/siparisler?\${q}\`);
  if (!yanit.ok) throw new Error("Siparişler alınamadı");
  return yanit.json();
}
`,
  "src/auth/oturum.ts": `import { ayarlar } from "../ayarlar";
import { jetonDeposu } from "./jetonDeposu";
import type { ApiIstemci } from "../api/istemci";

export async function oturumuYenile(istemci: ApiIstemci) {
  const sure = 3600;
  const jeton = jetonDeposu.yenilemeJetonu();
  const yanit = await istemci.post("/oturum/yenile", { jeton });
  jetonDeposu.yaz(yanit.erisim, yanit.yenileme, sure);
}
`,
  "src/auth/jetonDeposu.ts": `// Erişim ve yenileme jetonlarını bellekte ve sessionStorage'da tutar
let erisim: string | null = null;

export const jetonDeposu = {
  erisimJetonu: () => erisim,
  yenilemeJetonu: () => sessionStorage.getItem("yenileme"),
  yaz(yeniErisim: string, yenileme: string, sureSn: number) {
    erisim = yeniErisim;
    sessionStorage.setItem("yenileme", yenileme);
    setTimeout(() => (erisim = null), sureSn * 1000);
  },
};
`,
  "src/bilesenler/Tablo.tsx": `import type { ReactNode } from "react";

export interface Sutun<T> {
  ad: string;
  alan: keyof T;
  hizala?: "sol" | "sag";
  hucre?: (satir: T) => ReactNode;
}

export function Tablo<T extends { id: number }>({
  satirlar,
  sutunlar,
  yukleniyor,
  sonraki,
}: {
  satirlar: T[];
  sutunlar: Sutun<T>[];
  yukleniyor?: boolean;
  sonraki?: () => void;
}) {
  if (yukleniyor) return <p className="tablo-bos">Yükleniyor…</p>;
  if (!satirlar.length) return <p className="tablo-bos">Kayıt yok.</p>;
  return (
    <table className="tablo">
      <thead>
        <tr>{sutunlar.map((s) => <th key={String(s.alan)}>{s.ad}</th>)}</tr>
      </thead>
      <tbody>
        {satirlar.map((r) => (
          <tr key={r.id}>
            {sutunlar.map((s) => (
              <td key={String(s.alan)} className={s.hizala === "sag" ? "sag" : undefined}>
                {s.hucre ? s.hucre(r) : String(r[s.alan])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {sonraki ? <button onClick={sonraki}>Sonraki sayfa</button> : null}
    </table>
  );
}
`,
  "src/ekranlar/SiparisListesi.tsx": `import { useState } from "react";
import { Tablo } from "../bilesenler/Tablo";
import { siparisleriGetir, type Siparis } from "../api/istemci";

const SAYFA_BOYUTU = 20;

export function SiparisListesi() {
  const [imlec, setImlec] = useState<string | null>(null);
  const { veri, yukleniyor } = siparisleriGetir({ imlec, limit: SAYFA_BOYUTU });

  return (
    <Tablo
      satirlar={veri?.siparisler ?? []}
      yukleniyor={yukleniyor}
      sutunlar={[
        { ad: "No", alan: "no" },
        { ad: "Müşteri", alan: "musteri" },
      ]}
      sonraki={() => setImlec(veri.sonrakiImlec)}
    />
  );
}
`,
  "src/ekranlar/SiparisDetay.tsx": `import type { Siparis } from "../api/istemci";

export function SiparisDetay({ siparis }: { siparis: Siparis }) {
  return (
    <article>
      <h1>{siparis.no}</h1>
      <p>{siparis.musteri}</p>
    </article>
  );
}
`,
  "src/sunucu/index.ts": `import Fastify from "fastify";
import { siparisRotalari } from "./siparisRotalari";

const app = Fastify({ logger: true });
await app.register(siparisRotalari, { prefix: "/api" });
await app.listen({ port: 3000 });
`,
  "src/sunucu/siparisRotalari.ts": `import type { FastifyInstance } from "fastify";
import { siparisleriListele, siparisOlustur } from "./veritabani";

export async function siparisRotalari(app: FastifyInstance) {
  app.get("/siparisler", async (istek) => {
    const { limit = 25, ofset = 0 } = istek.query as { limit?: number; ofset?: number };
    return siparisleriListele({ limit, ofset });
  });

  app.post("/siparisler", async (istek, yanit) => {
    const siparis = await siparisOlustur(istek.body);
    return yanit.code(201).send(siparis);
  });
}
`,
  "src/sunucu/veritabani.ts": `import pg from "pg";

const havuz = new pg.Pool({ connectionString: process.env.VERITABANI_ADRESI });

export async function siparisleriListele(p: { limit: number; ofset: number }) {
  // TODO imleç desteği
  const { rows } = await havuz.query("SELECT * FROM siparis ORDER BY id LIMIT $1 OFFSET $2", [p.limit, p.ofset]);
  return { siparisler: rows };
}

export async function siparisOlustur(govde: unknown) {
  const { rows } = await havuz.query("INSERT INTO siparis (veri) VALUES ($1) RETURNING *", [govde]);
  return rows[0];
}
`,
  "tests/api/siparisler.test.ts": `import { describe, expect, it } from "vitest";
import { uygulamaKur } from "../yardimci";

describe("sipariş API", () => {
  it("listeyi döner", async () => {
    const app = await uygulamaKur();
    const yanit = await app.inject({ method: "GET", url: "/api/siparisler" });
    expect(yanit.statusCode).toBe(200);
  });
});
`,
};

/** Ajan çalışma alanlarındaki farklar: null = silindi */
export const katmanlar = {
  deniz: {
    "src/sunucu/siparisRotalari.ts": `import type { FastifyInstance } from "fastify";
import { imleciCoz, imlecUret } from "./sayfalama";
import { siparisleriListele, siparisOlustur } from "./veritabani";

export async function siparisRotalari(app: FastifyInstance) {
  app.get("/siparisler", async (istek) => {
    const { limit = 25, imlec } = istek.query as { limit?: number; imlec?: string };
    const sayfa = imleciCoz(imlec);
    const kayitlar = await siparisleriListele({ limit: limit + 1, sonId: sayfa?.id ?? 0 });
    const devam = kayitlar.length > limit;
    return {
      siparisler: kayitlar.slice(0, limit),
      sonrakiImlec: devam ? imlecUret(kayitlar[limit - 1]!) : null,
    };
  });

  app.post("/siparisler", async (istek, yanit) => {
    const sonuc = siparisSemasi.safeParse(istek.body);
    if (!sonuc.success) return yanit.code(422).send({ hata: sonuc.error.issues });
    const siparis = await siparisOlustur(sonuc.data);
    return yanit.code(201).send(siparis);
  });
}
`,
    "src/sunucu/sayfalama.ts": `// ADR-005: imleç, son kaydın kimliğini taşıyan base64url JSON'dur
export function imlecUret(kayit: { id: number }): string {
  return Buffer.from(JSON.stringify({ id: kayit.id })).toString("base64url");
}

export function imleciCoz(imlec?: string): { id: number } | null {
  if (!imlec) return null;
  try {
    const veri = JSON.parse(Buffer.from(imlec, "base64url").toString("utf8"));
    return typeof veri.id === "number" ? veri : null;
  } catch {
    return null;
  }
}
`,
    "tests/api/sayfalama.test.ts": `import { describe, expect, it } from "vitest";
import { imleciCoz, imlecUret } from "../../src/sunucu/sayfalama";

describe("imleç", () => {
  it("gidiş dönüş", () => {
    expect(imleciCoz(imlecUret({ id: 124 }))).toEqual({ id: 124 });
  });

  it("bozuk imleç null döner", () => {
    expect(imleciCoz("bozuk")).toBeNull();
  });
});
`,
    "tests/api/siparisler.test.ts": `import { describe, expect, it } from "vitest";
import { uygulamaKur } from "../yardimci";

describe("sipariş API", () => {
  it("listeyi döner", async () => {
    const app = await uygulamaKur();
    const yanit = await app.inject({ method: "GET", url: "/api/siparisler" });
    expect(yanit.statusCode).toBe(200);
    expect(yanit.json()).toHaveProperty("sonrakiImlec");
  });

  it("geçersiz gövdede 422 döner", async () => {
    const app = await uygulamaKur();
    const yanit = await app.inject({ method: "POST", url: "/api/siparisler", payload: {} });
    expect(yanit.statusCode).toBe(422);
  });
});
`,
  },
  ece: {
    "src/bilesenler/Rozet.tsx": `import type { Siparis } from "../api/istemci";

const ADLAR: Record<Siparis["durum"], string> = {
  beklemede: "Beklemede",
  hazirlaniyor: "Hazırlanıyor",
  kargoda: "Kargoda",
  teslim: "Teslim edildi",
};

export function Rozet({ durum }: { durum: Siparis["durum"] }) {
  return <span className={\`rozet rozet-\${durum}\`}>{ADLAR[durum]}</span>;
}
`,
    "tests/liste.test.tsx": `import { render, screen } from "@testing-library/react";
import { SiparisListesi } from "../src/ekranlar/SiparisListesi";

test("hata durumunda uyarı kutusu", async () => {
  sunucuHatasiVer(500);
  render(<SiparisListesi />);
  expect(await screen.findByText("Siparişler yüklenemedi.")).toBeVisible();
});
`,
    "src/auth/oturum.ts": `import { ayarlar } from "../ayarlar";
import { jetonDeposu } from "./jetonDeposu";
import type { ApiIstemci } from "../api/istemci";

// ADR-004: yenileme tek kilit üzerinden yapılır
let yenileniyor: Promise<void> | null = null;

export async function oturumuYenile(istemci: ApiIstemci) {
  const sure = ayarlar.oturumSuresiSn;
  const jeton = jetonDeposu.yenilemeJetonu();
  const yanit = await istemci.post("/oturum/yenile", { jeton });
  jetonDeposu.yaz(yanit.erisim, yanit.yenileme, sure);
}
`,
  },
  kerem: {
    "src/auth/jetonDeposu.ts": `// Erişim ve yenileme jetonlarını bellekte ve sessionStorage'da tutar
// ADR-004: yenileme jetonu tek kullanımlık; aile kimliği ile izlenir
let erisim: string | null = null;
let aile: string | null = null;

export const jetonDeposu = {
  erisimJetonu: () => erisim,
  yenilemeJetonu: () => sessionStorage.getItem("yenileme"),
  aileKimligi: () => aile,
  yaz(yeniErisim: string, yenileme: string, sureSn: number, yeniAile?: string) {
    erisim = yeniErisim;
    if (yeniAile) aile = yeniAile;
    sessionStorage.setItem("yenileme", yenileme);
    setTimeout(() => (erisim = null), sureSn * 1000);
  },
};
`,
  },
  mert: {},
  onur: {},
  ada: {},
};

/** Ece'nin liste ekranında canlı düzenlemesi: sırayla uygulanan sürümler */
const LISTE_BAS = `import { useState } from "react";
import { Tablo } from "../bilesenler/Tablo";
import { Rozet } from "../bilesenler/Rozet";
import { siparisleriGetir, type Siparis } from "../api/istemci";

const SAYFA_BOYUTU = 25;

export function SiparisListesi() {
  const [imlec, setImlec] = useState<string | null>(null);
  const { veri, yukleniyor, hata } = siparisleriGetir({ imlec, limit: SAYFA_BOYUTU });

  if (hata) return <HataKutusu mesaj="Siparişler yüklenemedi." />;

  return (
    <Tablo
      satirlar={veri?.siparisler ?? []}
      yukleniyor={yukleniyor}
      sutunlar={[
        { ad: "No", alan: "no" },
        { ad: "Müşteri", alan: "musteri" },
        { ad: "Durum", alan: "durum", hucre: (s: Siparis) => <Rozet durum={s.durum} /> },
`;
const LISTE_SON = `      ]}
      sonraki={() => setImlec(veri.sonrakiImlec)}
    />
  );
}
`;

export const listeSurumleri = [
  LISTE_BAS + LISTE_SON,
  LISTE_BAS + `        { ad: "Tutar", alan: "tutar", hizala: "sag" },\n` + LISTE_SON,
  LISTE_BAS +
    `        { ad: "Tutar", alan: "tutar", hizala: "sag", hucre: (s: Siparis) => paraBicimi.format(s.tutar) },\n` +
    LISTE_SON.replace("    />", "      bosMetin=\"Henüz sipariş yok.\"\n    />"),
  LISTE_BAS.replace('import { siparisleriGetir, type Siparis } from "../api/istemci";', 'import { siparisleriGetir, type Siparis } from "../api/istemci";\n\nconst paraBicimi = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });') +
    `        { ad: "Tutar", alan: "tutar", hizala: "sag", hucre: (s: Siparis) => paraBicimi.format(s.tutar) },\n` +
    LISTE_SON.replace("    />", "      bosMetin=\"Henüz sipariş yok.\"\n    />"),
];

katmanlar.ece["src/ekranlar/SiparisListesi.tsx"] = listeSurumleri[1];

/** Dosya uzantısından Monaco dil kimliği */
export function dilBul(yol) {
  const uzanti = yol.split(".").pop()?.toLowerCase() ?? "";
  const ad = yol.split("/").pop() ?? "";
  if (ad === ".gitignore") return "plaintext";
  return (
    {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      mjs: "javascript",
      jsx: "javascript",
      json: "json",
      md: "markdown",
      css: "css",
      html: "html",
      yaml: "yaml",
      yml: "yaml",
      sh: "shell",
      sql: "sql",
    }[uzanti] ?? "plaintext"
  );
}
