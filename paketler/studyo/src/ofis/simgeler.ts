// Sahnedeki küçük çizgi simgeleri (16 birimlik ızgara, tek çizgi kalınlığı). Emoji kullanılmaz.

const YOLLAR = {
  terminal: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="m4.5 6 2.5 2-2.5 2M8.5 10.5h3"/>',
  kalem: '<path d="m10.5 2.5 3 3-8 8h-3v-3z"/><path d="m9 4 3 3"/>',
  buyutec: '<circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3.25 3.25"/>',
  kure: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2.75 4 2.75 6S10 12 8 14c-2-2-2.75-4-2.75-6S6 4 8 2z"/>',
  belge: '<path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3M6 8h4M6 10.5h4"/>',
  saat: '<circle cx="8" cy="8" r="5.75"/><path d="M8 4.75V8l2.25 1.5"/>',
  zarf: '<rect x="1.5" y="3.5" width="13" height="9" rx="1"/><path d="m2 4 6 5 6-5"/>',
  duraklat: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
  uyari: '<path d="M8 2 14.5 13.5h-13z"/><path d="M8 6.5v3.25M8 11.6v.1"/>',
  fincan: '<path d="M3 6h8v3.5a3.5 3.5 0 0 1-3.5 3.5h-1A3.5 3.5 0 0 1 3 9.5z"/><path d="M11 7h1.25a1.75 1.75 0 0 1 0 3.5H11M5.5 2.5v1.5M8 2v2"/>',
  bardak: '<path d="M4 3h8l-1 10.5H5z"/><path d="M4.5 7h7"/>',
  kitap: '<path d="M2 3.5c2-1 4-1 6 .5 2-1.5 4-1.5 6-.5v9.5c-2-1-4-1-6 .5-2-1.5-4-1.5-6-.5z"/><path d="M8 4v9.5"/>',
  dal: '<circle cx="4" cy="3.5" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="6" r="1.5"/><path d="M4 5v6M12 7.5c0 2.5-3 2.5-6.5 4"/>',
  onay: '<path d="m3 8.5 3.25 3.25L13 5"/>',
  kisi: '<circle cx="8" cy="5" r="2.75"/><path d="M2.75 14c.5-3 2.5-4.5 5.25-4.5s4.75 1.5 5.25 4.5"/>',
  alt: '<rect x="2" y="2" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/><path d="M7 4.5h2.5V9"/>',
  ekran: '<rect x="1.5" y="2" width="13" height="8.5" rx="1"/><path d="M8 10.5V13M5 14.5 8 13l3 1.5M4.5 7.5l2-2 1.75 1.5 3-3"/>',
} as const;

export type OfisSimgesi = keyof typeof YOLLAR;

export function simgeSvg(ad: OfisSimgesi, boyut = 12): string {
  return `<svg viewBox="0 0 16 16" width="${boyut}" height="${boyut}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${YOLLAR[ad]}</svg>`;
}

/** Araç adından balon simgesi */
export function aracSimgesi(arac: string | undefined): OfisSimgesi {
  if (!arac) return "belge";
  if (/^(Bash|BashOutput|KillShell|KillBash|PowerShell)$/.test(arac)) return "terminal";
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(arac)) return "kalem";
  if (/^(Read|Grep|Glob|LS)$/.test(arac)) return "buyutec";
  if (/^(WebFetch|WebSearch)$/.test(arac)) return "kure";
  if (/^(Task|Agent)$/.test(arac)) return "alt";
  if (/mesaj|kanal/.test(arac)) return "zarf";
  if (/hafiza|not_/.test(arac)) return "kitap";
  return "belge";
}
