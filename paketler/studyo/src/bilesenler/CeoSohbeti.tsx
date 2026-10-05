// Karargâh: CEO ile bire bir akan sohbet (#yonetim). Kurulun mesajı CEO'ya gider, CEO yanıtı buraya yazar.
// Kurul sağda ve kâğıt tonunda, CEO solda; balon ve gölge yok, ayrım kıl çizgi ve tipografiyle.
// Yeni mesajda alta iner; kullanıcı yukarı kaydırdıysa inmez ve "yeni mesaj" düğmesi çıkar. Hazırlık görüşmesi
// bekliyorsa sohbetin üstünde kısa bir çağrı, sürüyorsa ince bir durum satırı durur. Başlıktaki "Brifing ver" CEO'dan
// durum özeti ister; CEO'nun brifingi bölümleriyle (BrifingMesaji) çizilir.
import { ARNORG_GONDEREN, kanalGorunenAdi, KURUL, type Ajan, type Mesaj, type ProjeOzeti } from "@arnorg/ortak";
import { useEffect, useId, useMemo, useState } from "react";
import { api } from "../api/uclar";
import { sozluk, useDil, useSozluk } from "../dil";
import { ajanaGit, bildir } from "../durum/arayuz";
import { useSohbet, yanitIstegiAlindi } from "../durum/sohbet";
import { ceoBul, kanalMesajlariniYukle, kanalOkundu, mesajUygula, projeUygula, useVeri } from "../durum/veri";
import { saat, tarih } from "../yardimcilar/bicim";
import { brifingAyir } from "../yardimcilar/brifing";
import { useIslem } from "../yardimcilar/kancalar";
import { useAltaYapisik, useYeniGelenler } from "./altaYapis";
import { AnmaliYazi } from "./AnmaliYazi";
import { BrifingDugmesi } from "./BrifingDugmesi";
import { BrifingMesaji } from "./BrifingMesaji";
import { Bos, HataKutu, Iskelet } from "./Durumlar";
import { AjanAvatar, AjanDurum } from "./Kisi";
import { alintiyla, gunEtiketi, gunlereAyir } from "./mesajGruplari";
import { MesajMetni } from "./MesajMetni";
import { SecenekliMesaj } from "./secenek/SecenekliMesaj";
import { Simge } from "./Simge";
import { KIMSE_YAZMIYOR, YaziyorGostergesi } from "./YaziyorGostergesi";

/** Kurul ile CEO'nun bire bir kanalı */
const KANAL = "yonetim";
const BOS: Mesaj[] = [];

export function CeoSohbeti() {
  const s = useSozluk();
  const c = s.sohbet.ceo;
  const dil = useDil();
  const pid = useVeri((d) => d.aktifProjeId);
  const proje = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId));
  const ajanlar = useVeri((d) => d.ajanlar);
  const projeYukleme = useVeri((d) => d.projeYukleme);
  const mesajlar = useVeri((d) => d.mesajlar[KANAL]);
  const yukleme = useVeri((d) => d.mesajYukleme[KANAL]);
  const yazanlar = useVeri((d) => d.yaziyorlar[KANAL]) ?? KIMSE_YAZMIYOR;
  const yanitIstegi = useSohbet((d) => d.yanitIstegi);
  const ceo = ceoBul(ajanlar);
  const liste = mesajlar ?? BOS;
  const [metin, setMetin] = useState("");
  const [alinti, setAlinti] = useState<string | null>(null);
  const { suruyor, calistir } = useIslem();
  const { ref, kaydirildi, yeni, alta, altaKilitle } = useAltaYapisik<HTMLOListElement>({ sayi: liste.length, degisim: yazanlar.length });
  const gruplar = useMemo(() => gunlereAyir(liste, tarih), [liste]);
  const yaziId = `ceo-yaz-${useId().replace(/[^\w-]/g, "")}`;
  const yeniMi = useYeniGelenler(() => liste.map((m) => m.id), !!mesajlar, pid);

  useEffect(() => {
    if (pid) kanalMesajlariniYukle(KANAL).catch(() => undefined);
  }, [pid]);

  // Sohbet açıkken gelen mesajlar okunmuş sayılır
  useEffect(() => {
    kanalOkundu(KANAL);
  }, [liste.length]);

  // Bir önemli an penceresinden "CEO'ya yanıt yaz": konu alıntılanır, yazma alanı odaklanır
  useEffect(() => {
    if (!yanitIstegi) return;
    setAlinti(yanitIstegi.alinti);
    yanitIstegiAlindi();
    requestAnimationFrame(() => document.getElementById(yaziId)?.focus());
  }, [yanitIstegi, yaziId]);

  const gonder = () => {
    const temiz = metin.trim();
    if (!temiz || !pid || !ceo) return;
    void calistir("gonder", async () => {
      const m = await api.mesajGonder(pid, KANAL, alintiyla(alinti, temiz));
      altaKilitle();
      mesajUygula(m);
      setMetin("");
      setAlinti(null);
    });
  };

  const ilkYukleme = !mesajlar && (yukleme === "yukleniyor" || yukleme === undefined || (projeYukleme === "yukleniyor" && !ajanlar.length));

  return (
    <section className="ceo-sohbet" aria-label={c.etiket}>
      <header className="sohbet-serit">
        <h2>{c.baslik}</h2>
        {ceo ? (
          <button type="button" className="sohbet-kim" onClick={() => ajanaGit(ceo.id)} title={s.genel.oturumuAc(ceo.ad)}>
            <AjanAvatar ajan={ceo} boyut="xs" />
            <b>{ceo.ad}</b>
          </button>
        ) : null}
        {ceo ? <AjanDurum durum={ceo.durum} /> : null}
        <small className="sohbet-kanal">{c.kanal(kanalGorunenAdi(KANAL, dil))}</small>
        {ceo && pid ? <BrifingDugmesi pid={pid} ceo={ceo} /> : null}
      </header>

      {proje && ceo ? <HazirlikCagrisi proje={proje} ceoAdi={ceo.ad} /> : null}

      <div className="sohbet-pencere">
        <ol className="sohbet-liste" ref={ref} onScroll={kaydirildi} aria-live="polite" aria-relevant="additions" tabIndex={0} aria-label={c.etiket}>
          {ilkYukleme ? (
            <li className="sohbet-durum">
              <Iskelet satir={5} />
            </li>
          ) : null}
          {yukleme === "hata" && !mesajlar ? (
            <li className="sohbet-durum">
              <HataKutu metin={c.alinamadi} yeniden={() => void kanalMesajlariniYukle(KANAL, true).catch(() => undefined)} />
            </li>
          ) : null}
          {mesajlar && !mesajlar.length ? (
            <li className="sohbet-durum">
              {ceo ? (
                <Bos kucuk baslik={c.bos(ceo.ad)}>
                  {c.bosMetin}
                </Bos>
              ) : (
                <Bos kucuk baslik={c.ceoYok}>
                  {c.ceoYokMetin}
                </Bos>
              )}
            </li>
          ) : null}
          {gruplar.map((g) => (
            <li key={g.gun} className="sohbet-gun">
              <div className="gun-ayrac" role="separator">
                <span>{gunEtiketi(g.gun, tarih, s.kanallar)}</span>
              </div>
              <ol className="sohbet-grup">
                {g.mesajlar.map(({ m, devam }) => (
                  <SohbetMesaji key={m.id} mesaj={m} devam={devam} ajanlar={ajanlar} yeni={yeniMi(m.id)} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
        {yeni > 0 ? (
          <button type="button" className="yeni-mesaj-dugme" onClick={() => alta()} title={s.sohbet.enAlta}>
            <Simge ad="asagi" boyut={12} />
            {s.sohbet.yeniMesaj(yeni)}
          </button>
        ) : null}
      </div>

      <YaziyorGostergesi kisiler={yazanlar} className="sohbet-yaziyor" />

      {ceo ? (
        <div className="sohbet-yaz">
          {alinti ? (
            <div className="sohbet-yanit">
              <span className="tek-satir">{c.yanit(alinti)}</span>
              <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" onClick={() => setAlinti(null)} aria-label={c.yanitKaldir} title={c.yanitKaldir}>
                <Simge ad="kapat" boyut={12} />
              </button>
            </div>
          ) : null}
          <div className="sohbet-yaz-satir">
            <AnmaliYazi id={yaziId} etiket={c.yazEtiketi(ceo.ad)} deger={metin} degistir={setMetin} gonder={gonder} ajanlar={ajanlar} placeholder={c.yer(ceo.ad)} />
            <button type="button" className="dugme dugme-ana" onClick={gonder} disabled={!metin.trim() || suruyor !== null} aria-label={s.genel.gonder}>
              {suruyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="gonder" boyut={13} />}
              <span className="ust-gizle-dar">{s.genel.gonder}</span>
            </button>
          </div>
          <p className="sohbet-ipucu">{c.ipucu}</p>
        </div>
      ) : mesajlar?.length ? (
        <p className="sohbet-ipucu sohbet-ceosuz">{c.ceoYokMetin}</p>
      ) : null}
    </section>
  );
}

function SohbetMesaji({ mesaj, devam, ajanlar, yeni }: { mesaj: Mesaj; devam: boolean; ajanlar: Ajan[]; yeni: boolean }) {
  const s = useSozluk();
  // Giriş hareketi yalnız öğe ilk çizildiğinde karar verilir; sonraki çizimler hareketi kesmez
  const [girer] = useState(yeni);
  const kurul = mesaj.gonderenId === KURUL;
  const sistem = mesaj.gonderenId === ARNORG_GONDEREN;
  const ajan = kurul || sistem ? undefined : ajanlar.find((a) => a.id === mesaj.gonderenId);
  // CEO'nun brifingi (dört bölümden en az üçü) bölümleriyle çizilir
  const brifing = useMemo(() => (ajan?.rol === "ceo" ? brifingAyir(mesaj.metin) : null), [ajan?.rol, mesaj.metin]);

  if (sistem) {
    return (
      <li className={`sohbet-sistem${girer ? " sohbet-yeni" : ""}`}>
        <span className="sohbet-sistem-imza" aria-hidden="true">
          A
        </span>
        <span className="sohbet-sistem-metin">
          <MesajMetni metin={mesaj.metin} />
        </span>
        <time dateTime={mesaj.zaman}>{saat(mesaj.zaman)}</time>
      </li>
    );
  }

  return (
    <li className={`sohbet-mesaj ${kurul ? "sohbet-kurul" : "sohbet-ajan"}${devam ? " sohbet-devam" : ""}${girer ? " sohbet-yeni" : ""}`}>
      {!kurul ? <div className="sohbet-av">{devam ? null : <AjanAvatar ajan={ajan} boyut="s" />}</div> : null}
      <div className="sohbet-govde">
        {!devam ? (
          <p className="sohbet-ust">
            {kurul ? (
              <b>{s.sohbet.ceo.siz}</b>
            ) : ajan ? (
              <button type="button" className="sohbet-ad" onClick={() => ajanaGit(ajan.id)} title={s.genel.oturumuAc(ajan.ad)}>
                {ajan.ad}
              </button>
            ) : (
              <b>{mesaj.gonderenAd}</b>
            )}
            {ajan ? <span className="sohbet-rol">{ajan.rolAdi}</span> : null}
            {brifing ? <span className="sohbet-brifing">{s.brifing.etiket}</span> : null}
            <time dateTime={mesaj.zaman}>{saat(mesaj.zaman)}</time>
          </p>
        ) : null}
        <div className="sohbet-metin">{brifing ? <BrifingMesaji brifing={brifing} /> : <SecenekliMesaj mesaj={mesaj} />}</div>
      </div>
    </li>
  );
}

/** Hazırlık görüşmesi: bekliyorsa başlat ya da atla; sürüyorsa ince durum satırı */
function HazirlikCagrisi({ proje, ceoAdi }: { proje: ProjeOzeti; ceoAdi: string }) {
  const s = useSozluk();
  const h = s.sohbet.hazirlik;
  const { suruyor, calistir } = useIslem();

  const islem = (ne: "baslat" | "atla") =>
    calistir(ne, async () => {
      const p = await api.hazirlik(proje.id, ne);
      projeUygula(p);
      if (ne === "atla") bildir("bilgi", sozluk().sohbet.hazirlik.atlandi);
    });

  if (proje.hazirlik === "bekliyor") {
    return (
      <div className="hazirlik" role="group" aria-label={h.etiket}>
        <p className="hazirlik-metin">
          <b>{h.baslik}</b> {h.metin(ceoAdi)}
        </p>
        <div className="hazirlik-eylem">
          <button type="button" className="dugme dugme-ana" onClick={() => void islem("baslat")} disabled={suruyor !== null}>
            {suruyor === "baslat" ? <span className="doner" aria-hidden="true" /> : null}
            {h.baslat}
          </button>
          <button type="button" className="dugme dugme-sessiz" onClick={() => void islem("atla")} disabled={suruyor !== null} title={h.atlaIpucu}>
            {suruyor === "atla" ? <span className="doner" aria-hidden="true" /> : null}
            {h.atla}
          </button>
        </div>
      </div>
    );
  }
  if (proje.hazirlik === "suruyor") {
    return (
      <p className="hazirlik-suruyor" role="status">
        <i aria-hidden="true" />
        {h.suruyor(ceoAdi)}
      </p>
    );
  }
  return null;
}
