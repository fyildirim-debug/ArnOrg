// Avatar, ajan kişi etiketi ve durum göstergesi
import { sozluk, useSozluk } from "../dil";
import { KURUL, type Ajan, type AjanDurumu } from "@arnorg/ortak";
import { ajanaGit } from "../durum/arayuz";
import { modelAdi, useModelKatalogu } from "../durum/modeller";
import { ilkHarf } from "../yardimcilar/bicim";
import { KarakterPortresi, useAjanKarakteri } from "./KarakterSecici";

type Boyut = "xs" | "s" | "m" | "l";

export function Avatar({ ad, ceo, siz, boyut = "m" }: { ad: string; ceo?: boolean; siz?: boolean; boyut?: Boyut }) {
  const s = useSozluk();
  const sinif = ["av", boyut !== "m" ? `av-${boyut}` : "", ceo ? "av-ceo" : "", siz ? "av-siz" : ""].filter(Boolean).join(" ");
  return (
    <span className={sinif} aria-hidden="true">
      {ilkHarf(siz ? s.bilesenler.kisi.siz : ad)}
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
  const s = useSozluk();
  // Model kataloğu gelince alt satırdaki sürümlü ad yenilenir
  useModelKatalogu();
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
      title={s.genel.oturumuAc(ajan.ad)}
    >
      {icerik}
    </button>
  );
}

/** Kurul ya da ajan için gönderen görünümü */
export function GonderenAvatar({ gonderenId, ad, ajan, boyut = "m" }: { gonderenId: string; ad: string; ajan?: Ajan; boyut?: Boyut }) {
  if (gonderenId === KURUL) return <Avatar ad="" siz boyut={boyut} />;
  // Ajan hâlâ ekipteyse ofis karakterinin portresi; işten çıkmışsa adın baş harfi
  if (ajan) return <AjanAvatar ajan={ajan} boyut={boyut} />;
  return <Avatar ad={ad} boyut={boyut} />;
}

export function AjanDurum({ durum }: { durum: AjanDurumu }) {
  const s = useSozluk();
  return (
    <span className={`durum durum-${durum}`}>
      <i aria-hidden="true" />
      {s.genel.ajanDurumu[durum]}
    </span>
  );
}

export function DurumNoktasi({ durum }: { durum: AjanDurumu }) {
  const s = useSozluk();
  return <i className={`nokta nokta-${durum}`} title={s.genel.ajanDurumu[durum]} aria-hidden="true" />;
}

/** Modelin sürümlü adı (Fable 5.1, Opus 5.5): çekirdeğin model kataloğundan (durum/modeller.ts) */
export { modelAdi };

/** Modelin sürümlü adı; katalog gelince yeniden çizilir */
export function ModelAdi({ model }: { model: string }) {
  useModelKatalogu();
  return <>{modelAdi(model)}</>;
}

/** Seçilebilir izin modları; adları sözlükte (s.genel.izinModu) */
export const IZIN_MODLARI = ["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk", "auto"] as const;

export function izinModuAdi(mod: string): string {
  return sozluk().genel.izinModu[mod] ?? mod;
}
