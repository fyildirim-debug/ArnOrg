// VS Code'un kısayol hizmeti tuş olaylarını window üzerinde dinler. Tezgâh gizliyken (başka ekranda)
// ya da odak Stüdyo'nun kendi bir giriş alanındayken Ctrl+P, Ctrl+S gibi kısayollar tezgâha gitmesin:
// olay document'te (window'dan önce) durdurulur; Stüdyo'nun kendi dinleyicileri etkilenmez.

let gorunur = false;
let kap: HTMLElement | null = null;

export function tezgahGorunurlugu(acik: boolean) {
  gorunur = acik;
}

function duzenlenebilir(o: EventTarget | null): boolean {
  if (!(o instanceof HTMLElement)) return false;
  return o.isContentEditable || o instanceof HTMLInputElement || o instanceof HTMLTextAreaElement || o instanceof HTMLSelectElement;
}

function suz(e: KeyboardEvent) {
  if (!kap) return;
  const icerde = e.composedPath().includes(kap);
  if (!gorunur || (!icerde && duzenlenebilir(e.target))) e.stopPropagation();
}

/** Bir kez kurulur; kap tezgâhın gölge kökünü taşıyan öğedir */
export function klavyeSuzgeciniKur(tezgahKabi: HTMLElement) {
  if (kap) return;
  kap = tezgahKabi;
  document.addEventListener("keydown", suz);
  document.addEventListener("keyup", suz);
}
