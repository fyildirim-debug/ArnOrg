// Ofis karakterleri: katalog, ajanların çözülmüş karakteri (avatarlar için) ve karakter seçici (radyo grubu)
import type { Ajan, Dil } from "@arnorg/ortak";
import { karakterBul, karakterMetni } from "@arnorg/ortak/karakterler";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { create } from "zustand";
import { useDil, useSozluk } from "../dil";
import { useVeri } from "../durum/veri";
import { projeAtamalari } from "../ofis/karakterAtama";
import { adayKarakteri } from "../ofis/karakterSecimi";
import { varlikAdresi, varliklariYukle, type KarakterVarligi, type Varliklar } from "../ofis/varliklar";

// ---------------------------------------------------------------------------
// Katalog ve atamalar (tek yükleme, bütün avatarlar paylaşır)
// ---------------------------------------------------------------------------

const useKatalog = create<{ v: Varliklar | null }>(() => ({ v: null }));
const useAtamalar = create<{ harita: Map<string, KarakterVarligi> }>(() => ({ harita: new Map() }));

let istendi = false;
let baglandi = false;
let imza = "";

function katalogIste() {
  if (istendi) return;
  istendi = true;
  varliklariYukle()
    .then((v) => useKatalog.setState({ v }))
    .catch(() => {
      // Avatarlar harfle kalır; sonraki açılışta yeniden denenir
      istendi = false;
    });
}

/** Ajan listesinin karakter atamasını etkileyen kısmı değişince haritayı yeniler */
function atamalariGuncelle() {
  const v = useKatalog.getState().v;
  const d = useVeri.getState();
  if (!v || !d.aktifProjeId) return;
  const yeni = `${d.aktifProjeId}|${d.ajanlar.map((a) => `${a.id}:${a.rol}:${a.karakter ?? ""}:${a.olusturma}`).join(",")}`;
  if (yeni === imza) return;
  imza = yeni;
  const kimlikler = projeAtamalari(d.aktifProjeId, d.ajanlar, v.karakterler);
  const harita = new Map<string, KarakterVarligi>();
  for (const [ajanId, kid] of kimlikler) {
    const k = v.karakterler.find((x) => x.id === kid);
    if (k) harita.set(ajanId, k);
  }
  useAtamalar.setState({ harita });
}

function bagla() {
  katalogIste();
  if (baglandi) return;
  baglandi = true;
  useVeri.subscribe(atamalariGuncelle);
  useKatalog.subscribe(atamalariGuncelle);
  atamalariGuncelle();
}

export function useKarakterKatalogu(): Varliklar | null {
  useEffect(bagla, []);
  return useKatalog((s) => s.v);
}

/** Ajanın Ofis'teki karakteri: kayıtlıysa o, değilse role göre atanmış olan */
export function useAjanKarakteri(ajanId: string | null | undefined): KarakterVarligi | undefined {
  useEffect(bagla, []);
  return useAtamalar((s) => (ajanId ? s.harita.get(ajanId) : undefined));
}

// ---------------------------------------------------------------------------
// Portre ve seçici
// ---------------------------------------------------------------------------

/** Karakterin arayüz dilindeki görünüş tanımı; çevirisi yoksa varlık bildirimindeki ad */
function karakterAdi(k: KarakterVarligi, dil: Dil): string {
  const tanim = karakterBul(k.id);
  return tanim ? karakterMetni(tanim, dil).ad : k.ad;
}

/** Görselin üst kısmı (yüz ve omuzlar) kare ya da yuvarlak kutuda */
export function KarakterPortresi({ karakter, className }: { karakter: KarakterVarligi; className?: string }) {
  return <img className={`karakter-portre${className ? ` ${className}` : ""}`} src={varlikAdresi(karakter.dosya)} alt="" draggable={false} decoding="async" loading="lazy" />;
}

interface SeciciOzellikleri {
  /** Seçili karakter; null: otomatik */
  deger: string | null;
  degisti: (karakter: string | null) => void;
  /** Otomatik seçimde önerilecek rol */
  rol: string;
  /** Düzenlenen ajan (yeni işe alımda yok) */
  ajan?: Ajan;
  etiketId: string;
  devreDisi?: boolean;
}

export function KarakterSecici({ deger, degisti, rol, ajan, etiketId, devreDisi }: SeciciOzellikleri) {
  const t = useSozluk().bilesenler.karakter;
  const dil = useDil();
  const v = useKarakterKatalogu();
  const harita = useAtamalar((s) => s.harita);
  const ajanlar = useVeri((d) => d.ajanlar);
  const dugmeler = useRef<(HTMLButtonElement | null)[]>([]);
  const aciklamaId = useId();

  if (!v) return <p className="alan-ipucu">{t.yukleniyor}</p>;
  const katalog = v.karakterler;

  // Başka ajanların kullandığı karakterler (kayıtlı ya da otomatik atanmış)
  const kullanan = new Map<string, string>();
  for (const a of ajanlar) {
    if (a.id === ajan?.id) continue;
    const k = (a.karakter && katalog.some((x) => x.id === a.karakter) ? a.karakter : null) ?? harita.get(a.id)?.id;
    if (k && !kullanan.has(k)) kullanan.set(k, a.ad);
  }
  // Otomatikte ne olacağı: var olan ajanda Ofis'teki ataması, yeni işe alımda role uyan boş karakter
  const otomatik = ajan && !ajan.karakter ? harita.get(ajan.id)?.id : adayKarakteri(rol, katalog, kullanan.keys(), ajan?.id ?? "yeni");
  const secenekler: (string | null)[] = [null, ...katalog.map((k) => k.id)];
  const seciliNo = Math.max(0, secenekler.indexOf(deger));
  const secili = katalog.find((k) => k.id === deger);
  const otomatikKarakter = katalog.find((k) => k.id === otomatik);

  const sec = (i: number) => {
    const n = (i + secenekler.length) % secenekler.length;
    const k = secenekler[n]!;
    if (k !== deger) degisti(k);
    dugmeler.current[n]?.focus();
  };
  const tus = (e: KeyboardEvent) => {
    const adim = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (adim) sec(seciliNo + adim);
    else if (e.key === "Home") sec(0);
    else if (e.key === "End") sec(secenekler.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <>
      <div className="karakter-secici" role="radiogroup" aria-labelledby={etiketId} aria-describedby={aciklamaId} aria-disabled={devreDisi || undefined} onKeyDown={tus}>
        {secenekler.map((kid, i) => {
          const k = katalog.find((x) => x.id === kid);
          const isaretli = i === seciliNo;
          const kim = kid ? kullanan.get(kid) : undefined;
          const oneri = deger === null && kid !== null && kid === otomatik;
          const ad = k
            ? `${karakterAdi(k, dil)}${kim ? ` · ${t.kullaniyor(kim)}` : ""}${oneri ? ` · ${t.otomatikSecim}` : ""}`
            : `${t.otomatik}${otomatikKarakter ? `: ${karakterAdi(otomatikKarakter, dil)}` : ""}`;
          return (
            <button
              key={kid ?? "otomatik"}
              ref={(el) => {
                dugmeler.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isaretli}
              aria-label={ad}
              title={ad}
              tabIndex={isaretli ? 0 : -1}
              disabled={devreDisi}
              className={`karakter-secenek${k ? "" : " karakter-otomatik"}`}
              data-kullaniliyor={kim ? "" : undefined}
              data-oneri={oneri ? "" : undefined}
              onClick={() => sec(i)}
            >
              {k ? (
                <KarakterPortresi karakter={k} />
              ) : (
                <span aria-hidden="true">
                  <b>{t.otoKisa}</b>
                  <small>{t.rolKisa}</small>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="alan-ipucu" id={aciklamaId}>
        {secili
          ? `${karakterAdi(secili, dil)}${kullanan.has(secili.id) ? ` · ${t.suAnKullaniyor(kullanan.get(secili.id) ?? "")}` : ""}`
          : t.otomatikIpucu(otomatikKarakter ? karakterAdi(otomatikKarakter, dil).toLocaleLowerCase(dil === "tr" ? "tr-TR" : "en-US") : null)}
      </p>
      <KisilikOzeti karakterId={secili?.id ?? otomatikKarakter?.id ?? null} />
    </>
  );
}

/** Karakterin kişiliği: ajanın üslubuna ve ofisteki davranışına yansır */
export function KisilikOzeti({ karakterId }: { karakterId: string | null }) {
  const t = useSozluk().bilesenler.karakter;
  const dil = useDil();
  const tanim = karakterBul(karakterId);
  if (!tanim) return null;
  // Kişilik metinleri arayüz dilinde; çevirisi yoksa Türkçesi
  const k = karakterMetni(tanim, dil);
  return (
    <div className="kisilik" aria-label={t.kisilik(k.lakap)}>
      <div className="kisilik-ust">
        <b className="kisilik-lakap">{k.lakap}</b>
        <span className="kisilik-mizac">
          {k.mizac.map((m) => (
            <span key={m} className="etiket">
              {m}
            </span>
          ))}
        </span>
      </div>
      <p>{k.ozet}</p>
      <dl>
        <div>
          <dt>{t.uslup}</dt>
          <dd>{k.konusma}</dd>
        </div>
        <div>
          <dt>{t.calisma}</dt>
          <dd>{k.calisma}</dd>
        </div>
        <div>
          <dt>{t.ofiste}</dt>
          <dd>
            {t.enCok(t.yerler[tanim.sevdigiYer])} · <q>{k.sozler[0]}</q>
          </dd>
        </div>
      </dl>
    </div>
  );
}
