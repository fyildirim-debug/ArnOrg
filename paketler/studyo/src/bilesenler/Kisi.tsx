// Avatar, ajan kişi etiketi ve durum göstergesi
import { AJAN_DURUM_ADLARI, KURUL, type Ajan, type AjanDurumu } from "@arnorg/ortak";
import { ajanaGit } from "../durum/arayuz";
import { ilkHarf } from "../yardimcilar/bicim";
import { KarakterPortresi, useAjanKarakteri } from "./KarakterSecici";

type Boyut = "xs" | "s" | "m" | "l";

export function Avatar({ ad, ceo, siz, boyut = "m" }: { ad: string; ceo?: boolean; siz?: boolean; boyut?: Boyut }) {
  const sinif = ["av", boyut !== "m" ? `av-${boyut}` : "", ceo ? "av-ceo" : "", siz ? "av-siz" : ""].filter(Boolean).join(" ");
  return (
    <span className={sinif} aria-hidden="true">
      {siz ? "S" : ilkHarf(ad)}
    </span>
  );
}

export function ajanCeoMu(a: Pick<Ajan, "rol"> | undefined | null): boolean {
  return a?.rol === "ceo";
}

/** Ajanın Ofis karakteri belliyse yüz kırpması, değilse baş harfi */
export function AjanAvatar({ ajan, boyut = "m" }: { ajan: Ajan | undefined; boyut?: Boyut }) {
  const karakter = useAjanKarakteri(ajan?.id);
  if (!karakter) return <Avatar ad={ajan?.ad ?? "?"} ceo={ajanCeoMu(ajan)} boyut={boyut} />;
  const sinif = ["av", "av-portre", boyut !== "m" ? `av-${boyut}` : "", ajanCeoMu(ajan) ? "av-ceo" : ""].filter(Boolean).join(" ");
  return (
    <span className={sinif} aria-hidden="true">
      <KarakterPortresi karakter={karakter} />
    </span>
  );
}

/** Avatar + ad + alt satır; tıklanınca ajan oturumunu açar */
export function AjanKisi({
  ajan,
  alt,
  boyut = "s",
  tiklanir = true,
}: {
  ajan: Ajan;
  alt?: string;
  boyut?: Boyut;
  tiklanir?: boolean;
}) {
  const icerik = (
    <>
      <AjanAvatar ajan={ajan} boyut={boyut} />
      <span className="kisi-metin">
        <b className="tek-satir">{ajan.ad}</b>
        <small className="tek-satir">{alt ?? `${ajan.rolAdi} · ${modelAdi(ajan.model)}`}</small>
      </span>
    </>
  );
  if (!tiklanir) return <span className="kisi">{icerik}</span>;
  return (
    <button
      type="button"
      className="kisi kisi-dugme"
      onClick={(e) => {
        e.stopPropagation();
        ajanaGit(ajan.id);
      }}
      title={`${ajan.ad} oturumunu aç`}
    >
      {icerik}
    </button>
  );
}

/** Kurul ya da ajan için gönderen görünümü */
export function GonderenAvatar({ gonderenId, ad, ajan, boyut = "m" }: { gonderenId: string; ad: string; ajan?: Ajan; boyut?: Boyut }) {
  if (gonderenId === KURUL) return <Avatar ad="Siz" siz boyut={boyut} />;
  // Ajan hâlâ ekipteyse ofis karakterinin portresi; işten çıkmışsa adın baş harfi
  if (ajan) return <AjanAvatar ajan={ajan} boyut={boyut} />;
  return <Avatar ad={ad} boyut={boyut} />;
}

export function AjanDurum({ durum }: { durum: AjanDurumu }) {
  return (
    <span className={`durum durum-${durum}`}>
      <i aria-hidden="true" />
      {AJAN_DURUM_ADLARI[durum]}
    </span>
  );
}

export function DurumNoktasi({ durum }: { durum: AjanDurumu }) {
  return <i className={`nokta nokta-${durum}`} title={AJAN_DURUM_ADLARI[durum]} aria-hidden="true" />;
}

const MODEL_ADLARI: Record<string, string> = { opus: "Opus", sonnet: "Sonnet", haiku: "Haiku" };

export function modelAdi(model: string): string {
  return MODEL_ADLARI[model] ?? model;
}

export const IZIN_MODU_ADLARI: Record<string, string> = {
  default: "Varsayılan",
  acceptEdits: "Düzenlemeleri kabul et",
  bypassPermissions: "Tam yetki (denetim kapısıyla)",
  plan: "Plan modu",
  dontAsk: "Sormadan",
  auto: "Otomatik",
};

export function izinModuAdi(mod: string): string {
  return IZIN_MODU_ADLARI[mod] ?? mod;
}
