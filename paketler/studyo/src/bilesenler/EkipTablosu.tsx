// Ekip tablosu: durum, şu anki iş ve bugünkü token kullanımı
import type { Ajan } from "@arnorg/ortak";
import { useSozluk } from "../dil";
import { ajanaGit } from "../durum/arayuz";
import { token } from "../yardimcilar/bicim";
import { AjanDurum, AjanKisi } from "./Kisi";

/** Bugünkü token payı; çubuk ekipte en çok kullanana göre ölçeklenir */
export function PayCubugu({ deger, enCok }: { deger: number; enCok: number }) {
  const s = useSozluk();
  const oran = enCok > 0 ? Math.min(100, Math.round((deger / enCok) * 100)) : 0;
  return (
    <span
      className="pay-cubuk"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={oran}
      aria-label={s.bilesenler.ekipTablosu.pay(oran)}
    >
      <span style={{ width: `${oran}%` }} />
    </span>
  );
}

export function EkipTablosu({ ajanlar }: { ajanlar: Ajan[] }) {
  const s = useSozluk();
  const t = s.bilesenler.ekipTablosu;
  const enCok = Math.max(0, ...ajanlar.map((a) => a.bugunToken));
  return (
    <div className="tablo-sar">
      <table className="tablo tablo-tik ekip-tablo">
        <thead>
          <tr>
            <th scope="col">{t.calisan}</th>
            <th scope="col">{t.durum}</th>
            <th scope="col">{t.suAn}</th>
            <th scope="col">{t.bugunkuKullanim}</th>
          </tr>
        </thead>
        <tbody>
          {ajanlar.map((a) => (
            <tr
              key={a.id}
              tabIndex={0}
              onClick={() => ajanaGit(a.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  ajanaGit(a.id);
                }
              }}
              aria-label={s.genel.oturumuAc(a.ad)}
            >
              <td>
                <AjanKisi ajan={a} tiklanir={false} />
              </td>
              <td>
                <AjanDurum durum={a.durum} />
              </td>
              <td className="td-is">{a.isAciklamasi || <span className="soluk">—</span>}</td>
              <td className="td-kullanim">
                <PayCubugu deger={a.bugunToken} enCok={enCok} />
                <small className="sayi">
                  {token(a.bugunToken)} {s.genel.tokenBirimi(a.bugunToken)}
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
