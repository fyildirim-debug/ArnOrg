// Abonelik kullanımı: üst çubuk göstergesi ve Karargâh paneli.
// ArnOrg yalnız Claude aboneliğiyle çalışır; sınır claude.ai planının 5 saatlik ve haftalık pencereleridir.
import type { HesapDurumu, KullanimPenceresi } from "@arnorg/ortak";
import { useSozluk, type Sozluk } from "../dil";
import { git } from "../durum/arayuz";
import { hesabiYukle, useVeri } from "../durum/veri";
import { akilliZaman, saat, token, yuzde } from "../yardimcilar/bicim";

/** Göstergede öne çıkan pencereler: 5 saatlik ve haftalık */
function anaPencereler(h: HesapDurumu | null): KullanimPenceresi[] {
  return (h?.pencereler ?? []).filter((p) => p.tur === "bes_saat" || p.tur === "haftalik");
}

/** Pencerenin arayüz dilindeki adı; türü bilinmeyen pencerede çekirdeğin verdiği ad */
export function pencereAdi(s: Sozluk, p: KullanimPenceresi): string {
  const k = s.bilesenler.kullanim;
  if (p.tur === "model") {
    // Çekirdek "Haftalık · <model>" yazar; model adı olduğu gibi kalır
    const model = p.ad.split(" · ").slice(1).join(" · ");
    return model ? k.haftalikModel(model) : p.ad;
  }
  return k.pencere[p.tur] ?? p.ad;
}

/** Sınırı aşan pencerenin adı (çekirdek adıyla bildirir) */
function sinirPencereAdi(s: Sozluk, h: HesapDurumu): string {
  const ad = h.sinir?.pencere ?? "";
  const p = h.pencereler.find((x) => x.ad === ad);
  return p ? pencereAdi(s, p) : ad;
}

/** Pencerenin ayardaki üst sınırı (5 saatlik ya da haftalık) */
function pencereSiniri(h: HesapDurumu | null, p: KullanimPenceresi): number {
  return p.tur === "bes_saat" ? (h?.sinirYuzdeleri.besSaatlik ?? 0) : (h?.sinirYuzdeleri.haftalik ?? 0);
}

export function KullanimCubugu({ deger, sinir, etiket }: { deger: number | null; sinir: number; etiket: string }) {
  const oran = Math.max(0, Math.min(100, Math.round(deger ?? 0)));
  const sinif = sinir > 0 && oran >= sinir ? " kullanim-asim" : sinir > 0 && oran >= sinir - 10 ? " kullanim-sinir" : "";
  return (
    <span className={`kullanim-cubuk${sinif}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={oran} aria-label={etiket}>
      <span style={{ width: `${oran}%` }} />
      {sinir > 0 && sinir < 100 ? <i style={{ left: `${sinir}%` }} aria-hidden="true" /> : null}
    </span>
  );
}

/** Üst çubuk: plan ve iki pencere; pencereler henüz okunmadıysa bugünkü token */
export function UstKullanim() {
  const s = useSozluk();
  const k = s.bilesenler.kullanim;
  const hesap = useVeri((d) => d.hesap);
  const kullanim = useVeri((d) => d.kullanim);
  const pencereler = anaPencereler(hesap);
  const baslik = hesap?.sinir
    ? k.sinirBaslik(sinirPencereAdi(s, hesap), yuzde(hesap.sinir.yuzde), hesap.sinir.sifirlanma ? saat(hesap.sinir.sifirlanma) : null)
    : k.abonelikBaslik;
  return (
    <button type="button" className={`ust-kullanim${hesap?.sinir ? " ust-kullanim-sinir" : ""}`} onClick={() => git("ayarlar")} title={baslik}>
      {hesap?.plan ? <span className="plan-rozet">{hesap.plan}</span> : null}
      {pencereler.length ? (
        pencereler.map((p) => (
          <span key={p.tur} className="ust-pencere">
            <small>{p.tur === "bes_saat" ? k.besSaatKisa : k.haftaKisa}</small>
            <KullanimCubugu deger={p.yuzde} sinir={pencereSiniri(hesap, p)} etiket={k.cubuk(pencereAdi(s, p), Math.round(p.yuzde ?? 0))} />
            <b>{yuzde(p.yuzde)}</b>
          </span>
        ))
      ) : (
        <span className="metre">
          {k.bugun} <b>{token(kullanim?.bugunToken ?? 0)}</b> {s.genel.tokenBirimi(kullanim?.bugunToken ?? 0)}
        </span>
      )}
      {hesap?.uyari ? <i className="ust-uyari" aria-label={k.girisUyarisi} /> : null}
    </button>
  );
}

/** Karargâh: pencereler, sıfırlanma zamanları, ajan başına bugünkü token */
export function KullanimPaneli() {
  const s = useSozluk();
  const k = s.bilesenler.kullanim;
  const hesap = useVeri((d) => d.hesap);
  const kullanim = useVeri((d) => d.kullanim);
  const pencereler = hesap?.pencereler ?? [];
  const ajanlar = [...(kullanim?.ajanlar ?? [])].filter((a) => a.bugunToken > 0).sort((a, b) => b.bugunToken - a.bugunToken);
  const enCok = ajanlar[0]?.bugunToken ?? 0;

  return (
    <div className="kullanim-panel">
      <div className="kullanim-baslik">
        <span>
          {hesap?.plan ? `Claude ${hesap.plan}` : k.claudeAboneligi}
          {hesap?.eposta ? <small> · {hesap.eposta}</small> : null}
        </span>
        <button type="button" className="metin-dugme" onClick={() => void hesabiYukle(true)} title={k.yenidenSor}>
          {s.genel.yenile}
        </button>
      </div>
      {hesap?.sinir ? (
        <p className="kullanim-uyari">
          {k.sinirUyari(
            sinirPencereAdi(s, hesap),
            yuzde(hesap.sinir.yuzde),
            yuzde(hesap.sinir.sinirYuzde),
            hesap.sinir.sifirlanma ? akilliZaman(hesap.sinir.sifirlanma) : null,
          )}
        </p>
      ) : null}
      {hesap?.uyari ? <p className="kullanim-uyari">{hesap.uyari}</p> : null}
      {pencereler.length ? (
        <ul className="kullanim-pencereler">
          {pencereler.map((p) => {
            const sinir = pencereSiniri(hesap, p);
            return (
              <li key={`${p.tur}-${p.ad}`}>
                <span className="kp-ad">{pencereAdi(s, p)}</span>
                <b>{yuzde(p.yuzde)}</b>
                <KullanimCubugu deger={p.yuzde} sinir={sinir} etiket={k.cubuk(pencereAdi(s, p), Math.round(p.yuzde ?? 0))} />
                <small>{p.sifirlanma ? k.sifirlanma(akilliZaman(p.sifirlanma)) : " "}</small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="soluk kullanim-bos">
          {hesap?.durum === "hata"
            ? k.okunamadi(hesap.hata)
            : hesap?.durum === "hazir" && !hesap.pencereVar
              ? k.pencereYok
              : k.pencereBekleniyor}
        </p>
      )}
      <dl className="kullanim-token">
        <div>
          <dt>{k.bugun}</dt>
          <dd>
            <b>{token(kullanim?.bugunToken ?? 0)}</b> {s.genel.tokenBirimi(kullanim?.bugunToken ?? 0)}
          </dd>
        </div>
        <div>
          <dt>{k.toplam}</dt>
          <dd>
            <b>{token(kullanim?.toplamToken ?? 0)}</b> {s.genel.tokenBirimi(kullanim?.toplamToken ?? 0)}
          </dd>
        </div>
      </dl>
      {ajanlar.length ? (
        <ul className="kullanim-ajanlar" aria-label={k.ajanBasina}>
          {ajanlar.map((a) => (
            <li key={a.ajanId}>
              <span>{a.ad}</span>
              <span className="kullanim-pay" aria-hidden="true">
                <span style={{ width: `${enCok ? Math.max(4, Math.round((a.bugunToken / enCok) * 100)) : 0}%` }} />
              </span>
              <small>{token(a.bugunToken)}</small>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="kullanim-not">{k.not}</p>
    </div>
  );
}
