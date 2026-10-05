// Mesaj gövdesi ve seçenekleri. Araçla sorulan soruda soru metni ve seçici; yanıtlanınca seçilenler kilitli ve kısa bir
// özetle görünür. CEO sohbetinde ajanın düz metindeki numaralı listesi ve sorusu için "Seçerek yanıtla": maddeler onay
// kutusu olur (kurul o mesajdan sonra yazmadıysa). Seçim kurulun mesajı olarak soran ajana gider (POST /api/mesajlar/:mid/secim).
import type { Mesaj, MesajSecimi } from "@arnorg/ortak";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { secenekApi } from "../../api/secenek";
import { sozluk, useSozluk } from "../../dil";
import { bildir } from "../../durum/arayuz";
import { mesajYerineKoy } from "../../durum/secenek";
import { mesajUygula, useVeri } from "../../durum/veri";
import { akilliZaman } from "../../yardimcilar/bicim";
import { duzMetinSecenekleri, kurulSonraYazdi } from "../../yardimcilar/secenek";
import { MesajMetni } from "../MesajMetni";
import { Simge } from "../Simge";
import { SecenekSecici } from "./SecenekSecici";

/** Mesajın metni ve (varsa) seçenekleri; CeoSohbeti ve Kanallar MesajMetni yerine bunu çizer */
export function SecenekliMesaj({ mesaj }: { mesaj: Mesaj }) {
  const secim = mesaj.secim;
  // Düz metin listesi yalnız metin değişince yeniden aranır; kurulun sonraki mesajı ayrıca izlenir
  const oneri = useMemo(() => duzMetinSecenekleri(mesaj), [mesaj]);
  const yanitlandi = useVeri((d) => (oneri ? kurulSonraYazdi(mesaj, d.mesajlar[mesaj.kanal]) : false));

  if (secim) {
    return (
      <>
        <MesajMetni metin={secim.kaynak === "arac" && secim.soru ? secim.soru : mesaj.metin} />
        {secim.yanit ? <SecimOzeti secim={secim} /> : <SoruSecimi mesaj={mesaj} secim={secim} />}
      </>
    );
  }
  return (
    <>
      <MesajMetni metin={mesaj.metin} />
      {oneri && !yanitlandi ? <DuzMetinSecimi mesaj={mesaj} secenekler={oneri} /> : null}
    </>
  );
}

/** Kurulun seçimini gönderir; soru kilitlenir, yanıt mesajı kanala düşer */
function yanitlayici(mesaj: Mesaj) {
  return async (secilenler: number[], not: string) => {
    const sonuc = await secenekApi.yanitla(mesaj.id, { secilenler, ...(not ? { not } : {}) });
    mesajYerineKoy(sonuc.soru);
    mesajUygula(sonuc.yanit);
    const t = sozluk().secenek;
    bildir("basari", mesaj.gonderenAd ? t.gitti(mesaj.gonderenAd) : t.gittiAdsiz);
  };
}

/** Araçla sorulan, henüz yanıtlanmamış soru */
function SoruSecimi({ mesaj, secim }: { mesaj: Mesaj; secim: MesajSecimi }) {
  const t = useSozluk().secenek;
  return <SecenekSecici secenekler={secim.secenekler} coklu={secim.coklu} serbestYanit={secim.serbestYanit} etiket={secim.soru ? t.grup(secim.soru) : t.grupAdsiz} gonder={yanitlayici(mesaj)} />;
}

/** CEO'nun düz metindeki listesi: önce küçük bir düğme, açılınca onay kutuları */
function DuzMetinSecimi({ mesaj, secenekler }: { mesaj: Mesaj; secenekler: string[] }) {
  const s = useSozluk();
  const t = s.secenek;
  const [acik, setAcik] = useState(false);
  const panelId = `secim-${useId().replace(/[^\w-]/g, "")}`;
  const dugmeRef = useRef<HTMLButtonElement>(null);
  const kapandi = useRef(false);

  // Vazgeçince odak düğmeye döner
  useEffect(() => {
    if (!acik && kapandi.current) {
      kapandi.current = false;
      dugmeRef.current?.focus();
    }
  }, [acik]);

  if (!acik) {
    return (
      <button
        ref={dugmeRef}
        type="button"
        className="dugme dugme-kucuk secenek-ac"
        onClick={() => setAcik(true)}
        aria-expanded={false}
        aria-controls={panelId}
        title={t.secerekYanitlaIpucu(secenekler.length)}
      >
        <Simge ad="tamam" boyut={12} />
        {t.secerekYanitla}
        <span className="secenek-ac-sayi">{t.maddeSayisi(secenekler.length)}</span>
      </button>
    );
  }
  return (
    <div id={panelId} className="secenek-panel">
      <SecenekSecici
        secenekler={secenekler.map((metin) => ({ metin }))}
        coklu
        serbestYanit={false}
        etiket={t.grupAdsiz}
        gonder={yanitlayici(mesaj)}
        vazgec={() => {
          kapandi.current = true;
          setAcik(false);
        }}
        otomatikOdak
      />
    </div>
  );
}

/** Yanıtlanmış soru: seçilenler ve not kısa ve kilitli; bütün seçenekler açılarak görülür */
function SecimOzeti({ secim }: { secim: MesajSecimi }) {
  const s = useSozluk();
  const t = s.secenek;
  const y = secim.yanit!;
  const secilenler = y.secilenler.filter((n) => secim.secenekler[n - 1]);
  return (
    <div className="secenek-sonuc" role="group" aria-label={t.yanitlandi}>
      <p className="secenek-sonuc-ust">
        <Simge ad="kilit" boyut={11} />
        <time dateTime={y.zaman}>{t.yanitlandiZaman(akilliZaman(y.zaman))}</time>
      </p>
      {secilenler.length ? (
        <ol className="secenek-secilen" aria-label={t.seciminiz}>
          {secilenler.map((n) => (
            <li key={n}>
              <span className="secenek-no sayi" aria-hidden="true">
                {n}
              </span>
              <span className="secenek-metin">{secim.secenekler[n - 1]!.metin}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {y.not ? (
        <p className="secenek-sonuc-not">
          <span className="secenek-sonuc-etiket">{secilenler.length ? t.notunuz : t.yanitiniz}</span>
          {y.not}
        </p>
      ) : null}
      {secim.secenekler.length > secilenler.length ? (
        <details className="secenek-tumu">
          <summary>
            <Simge ad="sag" boyut={10} className="secenek-tumu-isaret" />
            {t.tumu(secim.secenekler.length)}
          </summary>
          <ol>
            {secim.secenekler.map((x, i) => {
              const secili = secilenler.includes(i + 1);
              return (
                <li key={i} className={secili ? "secenek-tumu-secili" : undefined}>
                  <span className="secenek-no sayi" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="secenek-metin">
                    {x.metin}
                    <span className="gizli"> · {secili ? t.onay.secilen : t.secilmedi}</span>
                  </span>
                  {secili ? <Simge ad="tamam" boyut={11} className="secenek-tumu-tik" /> : null}
                </li>
              );
            })}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
