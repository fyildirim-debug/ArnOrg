// Ekip tablosu: durum, şu anki iş ve bugünkü bütçe
import type { Ajan } from "@arnorg/ortak";
import { ajanaGit } from "../durum/arayuz";
import { para } from "../yardimcilar/bicim";
import { AjanDurum, AjanKisi } from "./Kisi";

export function ButceCubugu({ harcanan, butce }: { harcanan: number; butce: number }) {
  const oran = butce > 0 ? Math.min(100, Math.round((harcanan / butce) * 100)) : 0;
  const sinif = oran >= 100 ? " butce-asim" : oran >= 80 ? " butce-sinir" : "";
  return (
    <span
      className={`butce${sinif}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={oran}
      aria-label={`Bütçenin yüzde ${oran} kullanıldı`}
    >
      <span style={{ width: `${oran}%` }} />
    </span>
  );
}

export function EkipTablosu({ ajanlar }: { ajanlar: Ajan[] }) {
  return (
    <div className="tablo-sar">
      <table className="tablo tablo-tik ekip-tablo">
        <thead>
          <tr>
            <th scope="col">Çalışan</th>
            <th scope="col">Durum</th>
            <th scope="col">Şu an</th>
            <th scope="col">Bugünkü bütçe</th>
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
              aria-label={`${a.ad} oturumunu aç`}
            >
              <td>
                <AjanKisi ajan={a} tiklanir={false} />
              </td>
              <td>
                <AjanDurum durum={a.durum} />
              </td>
              <td className="td-is">{a.isAciklamasi || <span className="soluk">—</span>}</td>
              <td className="td-butce">
                <ButceCubugu harcanan={a.bugunHarcananUsd} butce={a.gunlukButceUsd} />
                <small className="sayi">
                  {para(a.bugunHarcananUsd)} / {para(a.gunlukButceUsd)}
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
