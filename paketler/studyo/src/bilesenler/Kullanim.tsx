// Abonelik kullanımı: üst çubuk göstergesi ve Karargâh paneli.
// Abonelikte ücret alınmaz; asıl sınır claude.ai planının 5 saatlik ve haftalık pencereleridir.
import type { HesapDurumu, KullanimPenceresi } from "@arnorg/ortak";
import { git } from "../durum/arayuz";
import { abonelikMi, hesabiYukle, useVeri } from "../durum/veri";
import { akilliZaman, para, saat, token, yuzde } from "../yardimcilar/bicim";

/** Göstergede öne çıkan pencereler: 5 saatlik ve haftalık */
function anaPencereler(h: HesapDurumu | null): KullanimPenceresi[] {
  return (h?.pencereler ?? []).filter((p) => p.tur === "bes_saat" || p.tur === "haftalik");
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

/** Üst çubuk: plan ve iki pencere; API girişinde günlük harcama */
export function UstKullanim() {
  const hesap = useVeri((d) => d.hesap);
  const maliyet = useVeri((d) => d.maliyet);
  const abonelik = useVeri(abonelikMi);

  if (!abonelik) {
    const bugun = maliyet?.bugunUsd ?? 0;
    const butce = maliyet?.gunlukButceUsd ?? 0;
    return (
      <span className={`metre${butce > 0 && bugun >= butce * 0.9 ? " metre-asim" : ""}`} title="API girişi: bugünkü harcama / günlük bütçe">
        Bugün <b>{para(bugun)}</b>
        {butce > 0 ? <span className="ust-gizle-dar">/ {para(butce)}</span> : null}
      </span>
    );
  }

  const pencereler = anaPencereler(hesap);
  const baslik = hesap?.sinir
    ? `Kullanım sınırda: ${hesap.sinir.pencere} %${hesap.sinir.yuzde}. Ajanlar ${hesap.sinir.sifirlanma ? saat(hesap.sinir.sifirlanma) : "pencere açılınca"} sürecek.`
    : "Claude aboneliği: ücret alınmaz, plan pencereleri sayılır";
  return (
    <button type="button" className={`ust-kullanim${hesap?.sinir ? " ust-kullanim-sinir" : ""}`} onClick={() => git("ayarlar")} title={baslik}>
      {hesap?.plan ? <span className="plan-rozet">{hesap.plan}</span> : null}
      {pencereler.length ? (
        pencereler.map((p) => (
          <span key={p.tur} className="ust-pencere">
            <small>{p.tur === "bes_saat" ? "5 sa" : "Hafta"}</small>
            <KullanimCubugu deger={p.yuzde} sinir={pencereSiniri(hesap, p)} etiket={`${p.ad} yüzde ${Math.round(p.yuzde ?? 0)}`} />
            <b>{yuzde(p.yuzde)}</b>
          </span>
        ))
      ) : (
        <span className="metre">
          Bugün <b>{token(maliyet?.bugunToken ?? 0)}</b> token
        </span>
      )}
      {hesap?.uyari ? <i className="ust-uyari" aria-label="Giriş uyarısı" /> : null}
    </button>
  );
}

/** Karargâh: pencereler, sıfırlanma zamanları, ajan başına bugünkü token */
export function KullanimPaneli() {
  const hesap = useVeri((d) => d.hesap);
  const maliyet = useVeri((d) => d.maliyet);
  const pencereler = hesap?.pencereler ?? [];
  const ajanlar = [...(maliyet?.ajanlar ?? [])].filter((a) => a.bugunToken > 0).sort((a, b) => b.bugunToken - a.bugunToken);
  const enCok = ajanlar[0]?.bugunToken ?? 0;

  return (
    <div className="kullanim-panel">
      <div className="kullanim-baslik">
        <span>
          Claude {hesap?.plan ?? "aboneliği"}
          {hesap?.eposta ? <small> · {hesap.eposta}</small> : null}
        </span>
        <button type="button" className="metin-dugme" onClick={() => void hesabiYukle(true)} title="Claude Code'a yeniden sor">
          Yenile
        </button>
      </div>
      {hesap?.sinir ? (
        <p className="kullanim-uyari">
          {hesap.sinir.pencere} %{hesap.sinir.yuzde}, sınır %{hesap.sinir.sinirYuzde}. Ajanlar durdu;{" "}
          {hesap.sinir.sifirlanma ? `${akilliZaman(hesap.sinir.sifirlanma)} sürecekler` : "pencere açılınca sürecekler"}.
        </p>
      ) : null}
      {hesap?.uyari ? <p className="kullanim-uyari">{hesap.uyari}</p> : null}
      {pencereler.length ? (
        <ul className="kullanim-pencereler">
          {pencereler.map((p) => {
            const sinir = pencereSiniri(hesap, p);
            return (
              <li key={`${p.tur}-${p.ad}`}>
                <span className="kp-ad">{p.ad}</span>
                <b>{yuzde(p.yuzde)}</b>
                <KullanimCubugu deger={p.yuzde} sinir={sinir} etiket={`${p.ad} yüzde ${Math.round(p.yuzde ?? 0)}`} />
                <small>{p.sifirlanma ? `Sıfırlanma ${akilliZaman(p.sifirlanma)}` : " "}</small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="soluk kullanim-bos">
          {hesap?.durum === "hata"
            ? `Kullanım okunamadı: ${hesap.hata ?? "bilinmeyen hata"}`
            : hesap?.durum === "hazir" && !hesap.pencereVar
              ? "Bu girişte plan pencereleri yok."
              : "Pencereler ilk ajan çalışınca ya da Yenile ile okunur."}
        </p>
      )}
      <dl className="kullanim-token">
        <div>
          <dt>Bugün</dt>
          <dd>
            <b>{token(maliyet?.bugunToken ?? 0)}</b> token
          </dd>
        </div>
        <div>
          <dt>Toplam</dt>
          <dd>
            <b>{token(maliyet?.toplamToken ?? 0)}</b> token
          </dd>
        </div>
      </dl>
      {ajanlar.length ? (
        <ul className="kullanim-ajanlar" aria-label="Bugün ajan başına token">
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
      <p className="kullanim-not">Abonelikle çalışılıyor; ücret alınmaz. Token, girdi ve çıktının toplamıdır (önbellekten okuma hariç).</p>
    </div>
  );
}
