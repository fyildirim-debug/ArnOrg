// Eklerin simgeleri: ataş (ekle), görsel, büyüt. Simge.tsx ile aynı dil: 16 birimlik ızgara, tek çizgi kalınlığı.
const YOLLAR = {
  atac: <path d="M13.6 7.4 8 13a3.6 3.6 0 0 1-5.1-5.1l5.7-5.7a2.4 2.4 0 0 1 3.4 3.4l-5.6 5.6a1.2 1.2 0 0 1-1.7-1.7l5.1-5.1" />,
  gorsel: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1" />
      <circle cx="5.75" cy="6.25" r="1.25" />
      <path d="m2.5 12.25 3.5-3.5 2.25 2.25 2.5-2.5 2.75 2.75" />
    </>
  ),
  buyut: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.25 10.25 3.5 3.5M5 7h4M7 5v4" />
    </>
  ),
} as const;

export type EkSimgeAdi = keyof typeof YOLLAR;

export function EkSimgesi({ ad, boyut = 16 }: { ad: EkSimgeAdi; boyut?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={boyut}
      height={boyut}
      aria-hidden="true"
      focusable="false"
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
