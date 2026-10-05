// İçe aktarma çözüm matrisi: Node CJS, uzantılı ve uzantısız ESM, TypeScript paths ve baseUrl (extends, yorumlu JSON),
// Vite alias, package.json imports, Vue ve React bileşenleri, HTML ve şablon başvuruları, Express dosya başvuruları ve
// görünümleri, Python paketleri, PHP. Her örnek bir de Windows'taki gibi (\ ayraçlı yollar, harf duyarsız) çözülür.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IceAktarmaCozucu, cozumBaglami } from "./cozucu.js";
import { dilTani } from "./diller.js";
import { kokeGoreli, metneCevir, yolSadelestir } from "./platform.js";
import { cozumle } from "./semboller.js";
import { jsoncOku, yapilandirmaTakmaAdlari } from "./takma-adlar.js";

/**
 * Örnek projenin içe aktarma kenarları ("a -> b"): yöneticinin dosya işleme adımları (çıkar, genişlet, çöz; dosya
 * başvurusu çözülmezse atılır). windows: dosya listesi ve içe aktaran yol \ ayraçlı verilir, çözüm harf duyarsızdır.
 */
function kenarlar(dosyalar: Record<string, string>, s: { windows?: boolean } = {}): string[] {
  const yollar = Object.keys(dosyalar).filter((y) => dilTani(y));
  const baglam = cozumBaglami(new Set(yollar), (y) => dosyalar[y] ?? null);
  const ters = (y: string) => (s.windows ? y.replace(/\//g, "\\") : y);
  const c = new IceAktarmaCozucu({ dosyalar: yollar.map(ters), ...baglam }, Boolean(s.windows));
  const sonuc = new Set<string>();
  for (const y of yollar) {
    const dil = dilTani(y)!;
    const metin = dosyalar[y]!.replace(/\r\n?/g, "\n");
    for (const i of cozumle(metin, dil.aile).iceAktarmalar.flatMap((x) => c.genislet(x, ters(y), dil.aile))) {
      const h = c.coz(i, ters(y), dil.aile);
      if (h) sonuc.add(`${y} -> ${h}`);
    }
  }
  return [...sonuc].sort();
}

/** Satır sonlarını CRLF yapar (Windows'ta yazılmış dosyalar) */
const crlf = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).map(([y, m]) => [y, m.replace(/\n/g, "\r\n")]));

// ---------------------------------------------------------------------------
// Örnek projeler
// ---------------------------------------------------------------------------

/** QR menü: Express + CommonJS, public/ altında HTML, CSS ve tarayıcı betikleri, EJS görünümleri */
const QR_MENU: Record<string, string> = {
  "package.json": JSON.stringify({ name: "qr-menu", main: "server.js", dependencies: { express: "^4.19.0", qrcode: "^1.5.3" } }),
  "server.js": [
    "const express = require('express');",
    "const path = require('path');",
    "const menu = require('./routes/menu');",
    'const admin = require("./routes/admin.js");',
    "const db = require('./db');",
    "const { qrOlustur } = require('./lib');",
    "const ayarlar = require('./ayarlar.json');",
    "const app = express();",
    "app.use(express.static(path.join(__dirname, 'public')));",
    "app.get('/', (i, y) => y.sendFile(path.join(__dirname, 'public', 'index.html')));",
    "app.get('/menu', (i, y) => y.render('menu', { urunler: db.urunler() }));",
    "// require('./eski') yorumda kalır",
    "",
  ].join("\n"),
  "routes/menu.js": "const db = require('../db');\nconst { fiyat } = require('../lib/fiyat');\nmodule.exports = (i, y) => y.json(db.urunler().map(fiyat));\n",
  "routes/admin.js": "const yetki = require('../middleware/yetki');\nmodule.exports = [yetki];\n",
  "middleware/yetki.js": "module.exports = (i, y, s) => s();\n",
  "db.js": "const fs = require('fs');\nconst veri = JSON.parse(fs.readFileSync('./data/menu.json', 'utf8'));\nmodule.exports = { urunler: () => veri.urunler };\n",
  "lib/index.js": "module.exports = { ...require('./qr'), ...require('./fiyat') };\n",
  "lib/qr.js": "const QRCode = require('qrcode');\nmodule.exports = { qrOlustur: (m) => QRCode.toBuffer(m) };\n",
  "lib/fiyat.js": "module.exports = { fiyat: (u) => u };\n",
  "ayarlar.json": '{ "ad": "Menü" }\n',
  "data/menu.json": '{ "urunler": [] }\n',
  "views/menu.ejs": "<%- include('partials/baslik') %>\n<link rel=\"stylesheet\" href=\"/css/style.css\">\n<%# include('yorumdaki') %>\n",
  "views/partials/baslik.ejs": "<h1>Menü</h1>\n",
  "public/index.html": [
    "<!doctype html>",
    '<link rel="stylesheet" href="css/style.css">',
    '<link rel="canonical" href="https://menu.ornek.com/">',
    '<script src="https://cdn.jsdelivr.net/npm/alpinejs@3"></script>',
    "<!-- <script src=\"js/eski.js\"></script> -->",
    '<a href="hakkinda.html">Hakkında</a> <a href="https://ornek.com/x.html">dış</a>',
    '<script src="/js/app.js" type="module"></script>',
    "",
  ].join("\n"),
  "public/hakkinda.html": "<p>Hakkında</p>\n",
  "public/css/style.css": "@import url('reset.css');\nbody { margin: 0 }\n",
  "public/css/reset.css": "* { margin: 0 }\n",
  "public/js/app.js": [
    "import { kart } from './kart.js';",
    "import sepet from './sepet';",
    "const isci = new Worker(new URL('./isci.js', import.meta.url));",
    "navigator.serviceWorker.register('/sw.js');",
    "",
  ].join("\n"),
  "public/js/kart.js": "export const kart = 1;\n",
  "public/js/sepet.js": "export default {};\n",
  "public/js/isci.js": "onmessage = () => {};\n",
  "public/js/eski.js": "// kullanılmıyor\n",
  "public/sw.js": "self.addEventListener('fetch', () => {});\n",
};

const QR_MENU_KENARLARI = [
  "db.js -> data/menu.json",
  "lib/index.js -> lib/fiyat.js",
  "lib/index.js -> lib/qr.js",
  "public/css/style.css -> public/css/reset.css",
  "public/index.html -> public/css/style.css",
  "public/index.html -> public/hakkinda.html",
  "public/index.html -> public/js/app.js",
  "public/js/app.js -> public/js/isci.js",
  "public/js/app.js -> public/js/kart.js",
  "public/js/app.js -> public/js/sepet.js",
  "public/js/app.js -> public/sw.js",
  "routes/admin.js -> middleware/yetki.js",
  "routes/menu.js -> db.js",
  "routes/menu.js -> lib/fiyat.js",
  "server.js -> ayarlar.json",
  "server.js -> db.js",
  "server.js -> lib/index.js",
  "server.js -> public/index.html",
  "server.js -> routes/admin.js",
  "server.js -> routes/menu.js",
  "server.js -> views/menu.ejs",
  "views/menu.ejs -> public/css/style.css",
  "views/menu.ejs -> views/partials/baslik.ejs",
];

/** Vue + TypeScript: tsconfig paths (extends zinciri, yorumlu JSON), baseUrl, Vue tek dosya bileşenleri, Vite index.html */
const VUE_TS: Record<string, string> = {
  "package.json": JSON.stringify({ name: "menu-vue", type: "module", dependencies: { vue: "^3.5.0" } }),
  "tsconfig.json": [
    "{",
    "  // tsc --init gibi yorumlu",
    '  "extends": "./tsconfig.temel.json",',
    '  "compilerOptions": {',
    '    "paths": {',
    '      "@/*": ["src/*"],',
    '      "@bilesenler/*": ["src/components/*"],',
    '      "#ortak": ["src/shared/index.ts"], /* tam ad */',
    "    },",
    "  },",
    "}",
    "",
  ].join("\n"),
  "tsconfig.temel.json": '{ "compilerOptions": { "baseUrl": ".", "strict": true } }\n',
  "index.html": '<!DOCTYPE html>\n<div id="app"></div>\n<script type="module" src="/src/main.ts"></script>\n',
  "src/main.ts": [
    "import { createApp } from 'vue';",
    "import App from '@/App.vue';",
    "import { Dugme } from '@bilesenler/Dugme';",
    "import ortak from '#ortak';",
    "import { para } from 'utils/para';",
    "createApp(App).mount('#app');",
    "",
  ].join("\n"),
  "src/App.vue": [
    "<template>",
    "  <p>Don't panic: <a href=\"/menu\">menü</a></p>",
    "  <MenuListesi />",
    "</template>",
    "",
    '<script setup lang="ts">',
    "import MenuListesi from './components/MenuListesi.vue';",
    "import { useMenu } from '@/composables/useMenu';",
    "</script>",
    "",
  ].join("\n"),
  "src/components/MenuListesi.vue": "<script setup>\nimport UrunKarti from './UrunKarti.vue'\n</script>\n<template><UrunKarti /></template>\n",
  "src/components/UrunKarti.vue": "<template><div /></template>\n",
  "src/components/Dugme.tsx": "import { useMenu } from '../composables/useMenu';\nexport function Dugme() { return <button>Tamam</button>; }\n",
  "src/composables/useMenu.ts": "import { api } from '../services/api.js';\nexport const useMenu = () => api;\n",
  "src/services/api.ts": "export const api = {};\n",
  "src/shared/index.ts": "export default {};\n",
  "utils/para.ts": "export const para = 1;\n",
};

const VUE_TS_KENARLARI = [
  "index.html -> src/main.ts",
  "src/App.vue -> src/components/MenuListesi.vue",
  "src/App.vue -> src/composables/useMenu.ts",
  "src/components/Dugme.tsx -> src/composables/useMenu.ts",
  "src/components/MenuListesi.vue -> src/components/UrunKarti.vue",
  "src/composables/useMenu.ts -> src/services/api.ts",
  "src/main.ts -> src/App.vue",
  "src/main.ts -> src/components/Dugme.tsx",
  "src/main.ts -> src/shared/index.ts",
  "src/main.ts -> utils/para.ts",
];

/** React + Vite: alias (nesne ve dizi biçimi), yapılandırmasız takma ad tahmini, package.json imports, uzantısız ESM */
const REACT_VITE: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "menu-react",
    type: "module",
    imports: { "#db": "./server/db.js", "#yardim/*": "./src/yardim/*.js" },
    dependencies: { react: "^19.0.0", "@tanstack/react-query": "^5.0.0" },
  }),
  "vite.config.js": [
    "import { fileURLToPath, URL } from 'node:url';",
    "import path from 'node:path';",
    "export default defineConfig({",
    "  resolve: {",
    "    alias: {",
    "      '@': fileURLToPath(new URL('./src', import.meta.url)),",
    "      '@hooks': path.resolve(__dirname, 'src/hooks'),",
    "      vue: 'vue/dist/vue.esm-bundler.js',",
    "    },",
    "  },",
    "});",
    "",
  ].join("\n"),
  "vitest.config.js": "export default { resolve: { alias: [{ find: '~stil', replacement: path.resolve(__dirname, 'src/stil') }] } };\n",
  "index.html": '<div id="root"></div>\n<script type="module" src="/src/main.jsx"></script>\n',
  "src/main.jsx": "import App from '@/App';\nimport '~stil/ana.css';\nimport { useQuery } from '@tanstack/react-query';\n",
  "src/App.jsx": [
    "import Menu from './components/Menu'",
    "import { useSepet } from '@hooks/useSepet'",
    "import { tarih } from '#yardim/tarih'",
    "import { api } from '$lib/api'",
    "export default function App() { return <Menu /> }",
    "",
  ].join("\n"),
  "src/components/Menu.jsx": "import Kart from './Kart.jsx'\nexport default function Menu() { return <div>Don't <Kart /></div> }\n",
  "src/components/Kart.jsx": "export default function Kart() { return null }\n",
  "src/hooks/useSepet.js": "export function useSepet() {}\n",
  "src/yardim/tarih.js": "export const tarih = 1;\n",
  "src/lib/api.js": "export const api = {};\n",
  "src/stil/ana.css": "body { margin: 0 }\n",
  "server/index.mjs": "import db from '#db';\nimport { a } from './a.mjs';\nimport b from './b';\nexport * from './c/index.js';\n",
  "server/db.js": "export default {};\n",
  "server/a.mjs": "export const a = 1;\n",
  "server/b.js": "export default 1;\n",
  "server/c/index.js": "export const c = 1;\n",
  "core/x.js": "// @tanstack/react-query adlı bağımlılık klasöre eşlenmez\n",
};

const REACT_VITE_KENARLARI = [
  "index.html -> src/main.jsx",
  "server/index.mjs -> server/a.mjs",
  "server/index.mjs -> server/b.js",
  "server/index.mjs -> server/c/index.js",
  "server/index.mjs -> server/db.js",
  "src/App.jsx -> src/components/Menu.jsx",
  "src/App.jsx -> src/hooks/useSepet.js",
  "src/App.jsx -> src/lib/api.js",
  "src/App.jsx -> src/yardim/tarih.js",
  "src/components/Menu.jsx -> src/components/Kart.jsx",
  "src/main.jsx -> src/App.jsx",
  "src/main.jsx -> src/stil/ana.css",
];

/** Python: paket, alt modül içe aktarması, göreli içe aktarma, paket olmayan betik klasörü, Flask şablonları */
const PYTHON: Record<string, string> = {
  "app/__init__.py": "",
  "app/main.py": [
    "from flask import Flask, render_template",
    "from app.routers import menu, admin",
    "from .db import oturum",
    "from . import ayarlar",
    "import app.models as modeller",
    "def anasayfa():",
    "    return render_template('menu.html', urunler=[])",
    "",
  ].join("\n"),
  "app/db.py": "from .ayarlar import VERITABANI\ndef oturum():\n    return VERITABANI\n",
  "app/ayarlar.py": 'VERITABANI = "sqlite:///menu.db"\n',
  "app/models.py": "class Urun:\n    pass\n",
  "app/routers/__init__.py": "",
  "app/routers/menu.py": "from ..models import Urun\n",
  "app/routers/admin.py": "from ..db import oturum\n",
  "app/templates/menu.html": "{% extends \"base.html\" %}\n<link rel=\"stylesheet\" href=\"{{ url_for('static', filename='css/ana.css') }}\">\n{# {% include 'yorum.html' %} #}\n",
  "app/templates/base.html": "<html>{% block govde %}{% endblock %}</html>\n",
  "app/static/css/ana.css": "body { margin: 0 }\n",
  "scripts/tohum/calistir.py": "import yardimci\nyardimci.yukle()\n",
  "scripts/tohum/yardimci.py": "def yukle():\n    pass\n",
};

const PYTHON_KENARLARI = [
  "app/db.py -> app/ayarlar.py",
  "app/main.py -> app/ayarlar.py",
  "app/main.py -> app/db.py",
  "app/main.py -> app/models.py",
  "app/main.py -> app/routers/admin.py",
  "app/main.py -> app/routers/menu.py",
  "app/main.py -> app/templates/menu.html",
  "app/routers/admin.py -> app/db.py",
  "app/routers/menu.py -> app/models.py",
  "app/templates/menu.html -> app/static/css/ana.css",
  "app/templates/menu.html -> app/templates/base.html",
  "scripts/tohum/calistir.py -> scripts/tohum/yardimci.py",
];

// ---------------------------------------------------------------------------

describe("içe aktarma çözüm matrisi", () => {
  const ornekler: [string, Record<string, string>, string[]][] = [
    ["Node CommonJS + Express + HTML/CSS/JS + EJS (QR menü)", QR_MENU, QR_MENU_KENARLARI],
    ["Vue + TypeScript: paths, baseUrl, extends, yorumlu tsconfig", VUE_TS, VUE_TS_KENARLARI],
    ["React + Vite: alias, imports, uzantılı ve uzantısız ESM", REACT_VITE, REACT_VITE_KENARLARI],
    ["Python paketleri ve Flask şablonları", PYTHON, PYTHON_KENARLARI],
  ];
  for (const [ad, dosyalar, beklenen] of ornekler) {
    it(`${ad}: Linux`, () => {
      expect(kenarlar(dosyalar)).toEqual(beklenen);
    });
    it(`${ad}: Windows (\\ ayraçlı yollar, CRLF, harf duyarsız)`, () => {
      expect(kenarlar(crlf(dosyalar), { windows: true })).toEqual(beklenen);
    });
  }

  it("bağlantısız kalan dosyalar: yorumdaki betik, dış adresler ve bağımlılık adları bağ kurmaz", () => {
    const k = kenarlar(QR_MENU).join("\n");
    expect(k).not.toContain("public/js/eski.js");
    expect(k).not.toContain("cdn");
    expect(kenarlar(REACT_VITE).join("\n")).not.toContain("core/");
    expect(kenarlar(PYTHON)).not.toContain("app/main.py -> app/routers/__init__.py");
  });

  it("Windows'ta yazılmış ters eğik çizgili belirteçler ve büyük/küçük harf farkı", () => {
    const dosyalar = {
      "server.js": "const menu = require('.\\\\routes\\\\menu');\nconst db = require('.\\\\Lib\\\\DB.js');\n",
      "routes/menu.js": 'const db = require("..\\\\lib\\\\db");\n',
      "lib/db.js": "module.exports = {};\n",
      "public/index.html": '<script src="js\\app.js"></script>\n',
      "public/js/app.js": "export {};\n",
    };
    const beklenen = ["public/index.html -> public/js/app.js", "routes/menu.js -> lib/db.js", "server.js -> lib/db.js", "server.js -> routes/menu.js"];
    expect(kenarlar(dosyalar, { windows: true })).toEqual(beklenen);
    // Linux harf duyarlıdır: Lib/DB.js ile lib/db.js aynı dosya değildir
    expect(kenarlar(dosyalar)).toEqual(beklenen.filter((k) => k !== "server.js -> lib/db.js"));
  });

  it("PHP __DIR__ ile ve göreli require; baseUrl src iken paths hedefleri baseUrl'e göre", () => {
    expect(kenarlar({ "index.php": "<?php\nrequire __DIR__ . '/inc/db.php';\ninclude 'inc/ust.php';\n", "inc/db.php": "<?php\n", "inc/ust.php": "<?php\n" })).toEqual([
      "index.php -> inc/db.php",
      "index.php -> inc/ust.php",
    ]);
    expect(
      kenarlar({
        "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: "src", paths: { "@ui/*": ["ui/*"] } } }),
        "src/index.ts": "import { Liste } from '@ui/Liste';\nimport { api } from 'servisler/api';\n",
        "src/ui/Liste.tsx": "export const Liste = 1;\n",
        "src/servisler/api.ts": "export const api = 1;\n",
      }),
    ).toEqual(["src/index.ts -> src/servisler/api.ts", "src/index.ts -> src/ui/Liste.tsx"]);
  });
});

describe("takma ad yapılandırmaları", () => {
  it("yorumlu JSON: satır ve blok yorumları, sondaki virgüller; dizgelerdeki // korunur", () => {
    expect(jsoncOku('{\n  // yorum\n  "a": "https://x.com/y", /* blok */\n  "b": [1, 2,],\n}\n')).toEqual({ a: "https://x.com/y", b: [1, 2] });
    expect(jsoncOku("{ bozuk")).toBeNull();
  });

  it("Vite alias: paket adına giden ve çözülemeyen tanımlar atlanır", () => {
    const adlar = yapilandirmaTakmaAdlari("web/vite.config.ts", "export default { resolve: { alias: { '@': path.resolve(__dirname, 'src'), react: 'preact/compat', '#x': process.env.X } } }");
    expect(adlar.map((a) => `${a.desen} → ${a.hedefler.join(",")}`)).toEqual(["@ → web/src", "@/* → web/src/*"]);
    expect(adlar.every((a) => a.kapsam === "web")).toBe(true);
  });
});

describe("Windows yolları ve kodlamaları", () => {
  it("mutlak yol köke göreli olur: sürücü harfi ve klasör adları harf duyarsız, Git Bash /c/ biçimi", () => {
    const kok = "C:\\Users\\Furkan\\qr-menu";
    expect(kokeGoreli(kok, "c:\\users\\furkan\\QR-MENU\\routes\\menu.js", path.win32)).toBe("routes/menu.js");
    expect(kokeGoreli(kok, "C:/Users/Furkan/qr-menu/public/index.html", path.win32)).toBe("public/index.html");
    expect(kokeGoreli(kok, "/c/Users/Furkan/qr-menu/db.js", path.win32)).toBe("db.js");
    expect(kokeGoreli(kok, ".\\routes\\admin.js", path.win32)).toBe("routes/admin.js");
    expect(kokeGoreli(kok, "routes\\\\menu.js\\", path.win32)).toBe("routes/menu.js");
    expect(kokeGoreli(kok, "/src/app.js", path.win32)).toBe("src/app.js");
    // Kökün dışındaki mutlak yol olduğu gibi kalır (dizinde bulunmaz)
    expect(kokeGoreli(kok, "D:\\baska\\x.js", path.win32)).toBe("D:/baska/x.js");
    expect(kokeGoreli("/home/furkan/qr-menu", "/home/furkan/qr-menu/routes/menu.js", path.posix)).toBe("routes/menu.js");
    expect(yolSadelestir("./a\\b//c/")).toBe("a/b/c");
  });

  it("UTF-16 (Windows PowerShell) ve BOM'lu UTF-8 metin olur; NUL baytlı dosya ikilidir", () => {
    const metin = "const db = require('./db');\r\n";
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(metin, "utf16le")]);
    const be = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(metin, "utf16le").swap16()]);
    expect(metneCevir(le)).toBe(metin);
    expect(metneCevir(be)).toBe(metin);
    expect(metneCevir(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("çay", "utf8")]))).toBe("çay");
    expect(metneCevir(Buffer.from([0x61, 0x00, 0x62]))).toBeNull();
  });
});
