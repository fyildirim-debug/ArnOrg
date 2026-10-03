// Tek çizgi kalınlığında, 16 birimlik ızgarada çizilmiş simgeler
import type { ReactNode } from "react";

const YOLLAR = {
  karargah: (
    <>
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </>
  ),
  ofis: (
    <>
      <path d="M1.5 2.5h13v11h-13z" />
      <path d="M8 2.5v4.5M1.5 7h4M10 7h4.5M5.5 13.5v-3h5v3" />
    </>
  ),
  ekip: (
    <>
      <circle cx="8" cy="3.5" r="1.75" />
      <circle cx="3.5" cy="12.5" r="1.75" />
      <circle cx="12.5" cy="12.5" r="1.75" />
      <path d="M8 5.25V8M3.5 10.75V8h9v2.75" />
    </>
  ),
  pano: (
    <>
      <path d="M2.5 2.5v11M8 2.5v11M13.5 2.5v11" />
      <path d="M4.5 4h2M4.5 6.5h2M10 4h2" />
    </>
  ),
  kanallar: <path d="M6 2 4.5 14M11.5 2 10 14M2.5 5.5h11M2 10.5h11" />,
  notlar: (
    <>
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M9.5 1.5v3h3M5.5 8h5M5.5 10.5h5" />
    </>
  ),
  hafiza: (
    <>
      <path d="M8 2 14 5 8 8 2 5z" />
      <path d="m2 8 6 3 6-3M2 11l6 3 6-3" />
    </>
  ),
  kod: (
    <>
      <circle cx="4" cy="3.5" r="1.5" />
      <circle cx="4" cy="12.5" r="1.5" />
      <circle cx="12" cy="6" r="1.5" />
      <path d="M4 5v6M12 7.5c0 2.5-3 2.5-6.5 4" />
    </>
  ),
  denetim: (
    <>
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  onaylar: (
    <>
      <path d="M8 1.5 13.5 3.5v4c0 3.5-2.5 5.75-5.5 7-3-1.25-5.5-3.5-5.5-7v-4z" />
      <path d="m5.5 8 1.75 1.75L10.75 6" />
    </>
  ),
  projeler: (
    <>
      <path d="M1.5 4.5v8.5h13V6H8L6.5 3.5h-5z" />
    </>
  ),
  ayarlar: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </>
  ),
  asagi: <path d="m4 6 4 4 4-4" />,
  sag: <path d="m6 4 4 4-4 4" />,
  sol: <path d="m10 4-4 4 4 4" />,
  kapat: <path d="m4 4 8 8M12 4l-8 8" />,
  arti: <path d="M8 3v10M3 8h10" />,
  eksi: <path d="M3 8h10" />,
  sigdir: <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  ara: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3.25 3.25" />
    </>
  ),
  dur: <rect x="4" y="4" width="8" height="8" rx="1" />,
  kes: (
    <>
      <path d="M5.5 3.5v9M10.5 3.5v9" />
    </>
  ),
  oynat: <path d="M5 3.5v9l7-4.5z" />,
  gonder: <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />,
  dis: (
    <>
      <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5" />
      <path d="M11.5 9.5v4h-9v-9h4" />
    </>
  ),
  ray: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1" />
      <path d="M10 2.5v11" />
    </>
  ),
  yenile: (
    <>
      <path d="M13 8a5 5 0 1 1-1.5-3.6" />
      <path d="M13 2.5v3h-3" />
    </>
  ),
  kilit: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  dosya: (
    <>
      <path d="M4 1.5h5l3 3v10H4z" />
      <path d="M9 1.5v3h3" />
    </>
  ),
  klasor: <path d="M1.5 4.5v8.5h13V6H8L6.5 3.5h-5z" />,
  terminal: (
    <>
      <path d="m3 4.5 3 3-3 3M7.5 11.5h5" />
    </>
  ),
  fark: (
    <>
      <path d="M5 2.5v6M2 5.5h6M8 12.5h6" />
    </>
  ),
  mesaj: <path d="M2.5 3h11v7.5H7L4 13v-2.5H2.5z" />,
  plan: (
    <>
      <path d="M3 3.5h10M3 8h10M3 12.5h6" />
    </>
  ),
  cop: (
    <>
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.75 9.5h6.5L12 4" />
    </>
  ),
  geri: <path d="M13 8H3.5M7 4.5 3.5 8 7 11.5" />,
  kaydet: (
    <>
      <path d="M2.5 2.5h9l2 2v9h-11z" />
      <path d="M5 2.5v3.5h5V2.5M5 13.5V9.5h6v4" />
    </>
  ),
  duzenle: <path d="m10.5 2.5 3 3-8 8h-3v-3z" />,
  saat: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 4.75V8l2.25 1.5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type SimgeAdi = keyof typeof YOLLAR;

export function Simge({ ad, boyut = 16, className }: { ad: SimgeAdi; boyut?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={boyut}
      height={boyut}
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {YOLLAR[ad]}
    </svg>
  );
}
