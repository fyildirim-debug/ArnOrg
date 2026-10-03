// Gömme iş parçacığı: transformers.js (onnxruntime-node, CPU) ile metinleri vektöre çevirir.
// Kendi başına durur: yalnız Node yerleşikleri ve @huggingface/transformers içe aktarılır; derlemede
// dist/gomme-calisani.js olur, kaynaktan çalışırken (testler, geliştirme) Node tür ayıklamasıyla açılır.
import fs from "node:fs";
import path from "node:path";
import { parentPort } from "node:worker_threads";

interface YukleMesaji {
  tur: "yukle";
  model: string;
  dtype: string;
  onbellek: string;
  izlek: number;
  /** Önbellekte bulunması gereken dosyalar; biri eksikse model indirilecek demektir */
  dosyalar: string[];
}

interface GomMesaji {
  tur: "gom";
  id: number;
  metinler: string[];
}

interface Tensor {
  data: ArrayLike<number>;
  dims: number[];
}

type Cikarici = (metinler: string[], secenek: { pooling: "mean"; normalize: boolean }) => Promise<Tensor>;

const ust = parentPort;
let cikarici: Cikarici | null = null;

function hataMetni(h: unknown): string {
  return h instanceof Error ? h.message : String(h);
}

async function yukle(m: YukleMesaji): Promise<void> {
  try {
    const tf = await import("@huggingface/transformers");
    tf.env.cacheDir = m.onbellek;
    tf.env.allowLocalModels = false;
    // transformers önbellekten okurken de "download" bildirir; indirme olup olmadığı dosyalardan anlaşılır
    const modelKlasoru = path.join(m.onbellek, ...m.model.split("/"));
    const indiriyor = !m.dosyalar.every((d) => fs.existsSync(path.join(modelKlasoru, ...d.split("/"))));
    let sonYuzde = -1;
    const ilerleme = (o: { status: string; progress?: number }) => {
      if (!indiriyor || o.status !== "progress_total" || typeof o.progress !== "number") return;
      const yuzde = Math.floor(o.progress);
      if (yuzde === sonYuzde) return;
      sonYuzde = yuzde;
      ust?.postMessage({ tur: "ilerleme", durum: "indiriliyor", yuzde });
    };
    ust?.postMessage({ tur: "ilerleme", durum: "yukleniyor" });
    const p = await tf.pipeline("feature-extraction", m.model, {
      dtype: m.dtype as "q8",
      session_options: { intraOpNumThreads: m.izlek, interOpNumThreads: 1 },
      progress_callback: ilerleme as never,
    });
    cikarici = p as unknown as Cikarici;
    ust?.postMessage({ tur: "hazir", boyut: null });
  } catch (h) {
    ust?.postMessage({ tur: "hata", mesaj: `Model yüklenemedi: ${hataMetni(h)}` });
  }
}

async function gom(m: GomMesaji): Promise<void> {
  try {
    if (!cikarici) throw new Error("Model yüklenmedi.");
    const t = await cikarici(m.metinler, { pooling: "mean", normalize: true });
    const vektorler = Float32Array.from(t.data);
    ust?.postMessage({ tur: "sonuc", id: m.id, vektorler, boyut: t.dims[t.dims.length - 1] }, [vektorler.buffer]);
  } catch (h) {
    ust?.postMessage({ tur: "sonuc", id: m.id, hata: hataMetni(h) });
  }
}

ust?.on("message", (m: YukleMesaji | GomMesaji) => {
  if (m.tur === "yukle") void yukle(m);
  else if (m.tur === "gom") void gom(m);
});
