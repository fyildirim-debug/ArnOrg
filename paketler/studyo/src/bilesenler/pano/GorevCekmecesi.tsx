// Görev ayrıntısı: düzenlenebilir alanlar ve izin verilen durum geçişleri
import { GOREV_GECISLERI, type Gorev, type GorevDurumu } from "@arnorg/ortak";
import { useEffect, useState } from "react";
import { api } from "../../api/uclar";
import { sozluk, useSozluk } from "../../dil";
import { ajanaGit, bildir } from "../../durum/arayuz";
import { gorevUygula, useVeri } from "../../durum/veri";
import { akilliZaman, kisaToken, sayi, tarih } from "../../yardimcilar/bicim";
import { useGorevHarcamalari } from "../butce/Harcama";
import { useIslem } from "../../yardimcilar/kancalar";
import { Cekmece } from "../Cekmece";
import { HataKutu } from "../Durumlar";
import { GorevKayitlari } from "../ortak/OrtakCalisma";
import { GorevAlanlari, taslakOlustur, type GorevTaslagi } from "./GorevAlanlari";
import { acikBagimliliklar } from "./gorevYardimcilari";

function ayniMi(a: GorevTaslagi, b: GorevTaslagi) {
  return (
    a.baslik === b.baslik &&
    a.aciklama === b.aciklama &&
    a.kabulOlcutu === b.kabulOlcutu &&
    a.etiket === b.etiket &&
    a.atananId === b.atananId &&
    a.bagimliliklar.join() === b.bagimliliklar.join()
  );
}

export function GorevCekmecesi({ gorev, kapat }: { gorev: Gorev; kapat: () => void }) {
  const s = useSozluk();
  const t = s.pano.cekmece;
  const ajanlar = useVeri((d) => d.ajanlar);
  const gorevler = useVeri((d) => d.gorevler);
  const [taslak, setTaslak] = useState(() => taslakOlustur(gorev));
  const [denendi, setDenendi] = useState(false);
  const { suruyor, hata, setHata, calistir } = useIslem();
  const ilk = taslakOlustur(gorev);
  const kirli = !ayniMi(taslak, ilk);

  // Görev başka yerden güncellenince ve kullanıcı bir şey değiştirmemişse taslağı tazele
  useEffect(() => {
    if (!kirli) setTaslak(taslakOlustur(gorev));
  }, [gorev.guncelleme]);

  const olusturan = ajanlar.find((a) => a.id === gorev.olusturanId);
  const atanan = ajanlar.find((a) => a.id === gorev.atananId);
  const bagli = acikBagimliliklar(gorev, gorevler);
  const bagimlilar = gorevler.filter((g) => g.bagimliliklar.includes(gorev.id));

  const tasi = (durum: GorevDurumu) =>
    calistir(
      `tasi-${durum}`,
      async () => {
        gorevUygula(await api.gorevGuncelle(gorev.id, { durum }));
        bildir("basari", `${gorev.kod} → ${sozluk().genel.gorevDurumu[durum]}`);
      },
      true,
    );

  const kaydet = () => {
    setDenendi(true);
    if (!taslak.baslik.trim()) return;
    void calistir(
      "kaydet",
      async () => {
        gorevUygula(
          await api.gorevGuncelle(gorev.id, {
            baslik: taslak.baslik.trim(),
            aciklama: taslak.aciklama,
            kabulOlcutu: taslak.kabulOlcutu,
            etiket: taslak.etiket.trim(),
            atananId: taslak.atananId || null,
            bagimliliklar: taslak.bagimliliklar,
          }),
        );
        bildir("basari", sozluk().pano.cekmece.kaydedildi(gorev.kod));
      },
      true,
    );
  };

  return (
    <Cekmece
      baslik={
        <>
          <code className="cekmece-kod">{gorev.kod}</code> {gorev.baslik}
        </>
      }
      kapat={kapat}
      alt={
        <>
          <button type="button" className="dugme dugme-ana" onClick={kaydet} disabled={!kirli || suruyor !== null}>
            {suruyor === "kaydet" ? <span className="doner" aria-hidden="true" /> : null}
            {s.genel.kaydet}
          </button>
          {kirli ? (
            <button
              type="button"
              className="dugme dugme-sessiz"
              onClick={() => {
                setTaslak(ilk);
                setHata(null);
              }}
            >
              {t.geriAl}
            </button>
          ) : null}
          <span className="alan-ipucu itele">{t.guncellendi(akilliZaman(gorev.guncelleme))}</span>
        </>
      }
    >
      <section className="gorev-durum-bolum" aria-label={t.durum}>
        <div className="gorev-durum-ust">
          <span className={`gd gd-${gorev.durum}`}>{s.genel.gorevDurumu[gorev.durum]}</span>
          {atanan ? (
            <button type="button" className="metin-dugme" onClick={() => ajanaGit(atanan.id)}>
              {atanan.ad} · {atanan.rolAdi}
            </button>
          ) : (
            <span className="soluk">{s.pano.atanmadi}</span>
          )}
        </div>
        <div className="dugme-satir">
          {GOREV_GECISLERI[gorev.durum].map((d) => (
            <button
              key={d}
              type="button"
              className={`dugme dugme-kucuk${d === "iptal" ? " dugme-tehlike" : ""}`}
              onClick={() => void tasi(d)}
              disabled={suruyor !== null}
              title={d === "calisiliyor" && bagli.length ? t.bagimliliklarBitmedi(bagli.map((b) => b.kod).join(", ")) : undefined}
            >
              {suruyor === `tasi-${d}` ? <span className="doner" aria-hidden="true" /> : null}
              {s.genel.gorevDurumu[d]}
              {d === "iptal" ? null : " →"}
            </button>
          ))}
        </div>
        {bagli.length ? (
          <p className="bilet-not">{t.bagliUyari(bagli.map((b) => `${b.kod} (${s.genel.gorevDurumu[b.durum]})`).join(", "))}</p>
        ) : null}
        {hata ? <HataKutu baslik={t.islemYapilamadi} metin={hata} /> : null}
      </section>

      <GorevAlanlari taslak={taslak} degistir={(t) => setTaslak((o) => ({ ...o, ...t }))} gorevId={gorev.id} denendi={denendi} />

      <dl className="kv gorev-kunye">
        <dt>{t.olusturan}</dt>
        <dd>{olusturan ? `${olusturan.ad} · ${olusturan.rolAdi}` : s.genel.kurul}</dd>
        <dt>{t.olusturma}</dt>
        <dd>{tarih(gorev.olusturma)}</dd>
        {bagimlilar.length ? (
          <>
            <dt>{t.bunuBekleyen}</dt>
            <dd>{bagimlilar.map((b) => b.kod).join(", ")}</dd>
          </>
        ) : null}
        <GorevTokeni gorev={gorev} />
      </dl>
      <GorevKayitlari gorevId={gorev.id} />
    </Cekmece>
  );
}

/** 0.0.10 · Görevde işlenen token ve görevin tavanı (künye satırı) */
function GorevTokeni({ gorev }: { gorev: Gorev }) {
  const s = useSozluk();
  const t = s.butce.gorev;
  const token = gorev.token ?? 0;
  const tavan = useGorevHarcamalari(50).find((g) => g.gorevId === gorev.id)?.tavan ?? 0;
  if (!token) return null;
  return (
    <>
      <dt>{t.harcanan}</dt>
      <dd className="sayi" title={`${sayi(token)} ${s.genel.tokenBirimi(token)}`}>
        {tavan ? t.tavanli(kisaToken(token), kisaToken(tavan)) : kisaToken(token)}
      </dd>
    </>
  );
}
