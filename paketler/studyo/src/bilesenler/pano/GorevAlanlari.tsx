// Görev formu alanları: oluşturma ve düzenleme ortak kullanır
import type { Gorev } from "@arnorg/ortak";
import { useSozluk } from "../../dil";
import { useVeri } from "../../durum/veri";
import { Simge } from "../Simge";

export interface GorevTaslagi {
  baslik: string;
  aciklama: string;
  kabulOlcutu: string;
  etiket: string;
  atananId: string;
  bagimliliklar: string[];
}

export function taslakOlustur(g?: Gorev): GorevTaslagi {
  return {
    baslik: g?.baslik ?? "",
    aciklama: g?.aciklama ?? "",
    kabulOlcutu: g?.kabulOlcutu ?? "",
    etiket: g?.etiket ?? "",
    atananId: g?.atananId ?? "",
    bagimliliklar: g?.bagimliliklar ?? [],
  };
}

export function GorevAlanlari({
  taslak,
  degistir,
  gorevId,
  denendi,
}: {
  taslak: GorevTaslagi;
  degistir: (t: Partial<GorevTaslagi>) => void;
  gorevId?: string;
  denendi: boolean;
}) {
  const s = useSozluk();
  const t = s.pano.alanlar;
  const ajanlar = useVeri((d) => d.ajanlar);
  const gorevler = useVeri((d) => d.gorevler);
  const etiketler = Array.from(new Set(gorevler.map((g) => g.etiket).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
  const adaylar = gorevler.filter((g) => g.id !== gorevId && !taslak.bagimliliklar.includes(g.id) && g.durum !== "iptal");
  const baslikHata = denendi && !taslak.baslik.trim();
  const on = gorevId ?? "yeni";

  return (
    <div className="form-izgara">
      <div className="alan tam">
        <label htmlFor={`g-baslik-${on}`}>{t.baslik}</label>
        <input
          id={`g-baslik-${on}`}
          className="girdi"
          value={taslak.baslik}
          onChange={(e) => degistir({ baslik: e.target.value })}
          aria-invalid={baslikHata ? true : undefined}
          data-ilk-odak
        />
        {baslikHata ? <span className="alan-hata">{t.baslikGerekli}</span> : null}
      </div>
      <div className="alan">
        <label htmlFor={`g-atanan-${on}`}>{t.atanan}</label>
        <select id={`g-atanan-${on}`} className="secim" value={taslak.atananId} onChange={(e) => degistir({ atananId: e.target.value })}>
          <option value="">{s.pano.atanmadi}</option>
          {ajanlar.map((a) => (
            <option key={a.id} value={a.id}>
              {a.ad} · {a.rolAdi}
            </option>
          ))}
        </select>
      </div>
      <div className="alan">
        <label htmlFor={`g-etiket-${on}`}>{t.etiket}</label>
        <input
          id={`g-etiket-${on}`}
          className="girdi"
          list={`g-etiketler-${on}`}
          value={taslak.etiket}
          onChange={(e) => degistir({ etiket: e.target.value })}
          placeholder={t.etiketOrnek}
        />
        <datalist id={`g-etiketler-${on}`}>
          {etiketler.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
      </div>
      <div className="alan tam">
        <label htmlFor={`g-aciklama-${on}`}>{t.aciklama}</label>
        <textarea
          id={`g-aciklama-${on}`}
          className="metin-alani"
          rows={4}
          value={taslak.aciklama}
          onChange={(e) => degistir({ aciklama: e.target.value })}
        />
      </div>
      <div className="alan tam">
        <label htmlFor={`g-kabul-${on}`}>{t.kabulOlcutu}</label>
        <textarea
          id={`g-kabul-${on}`}
          className="metin-alani"
          rows={3}
          value={taslak.kabulOlcutu}
          onChange={(e) => degistir({ kabulOlcutu: e.target.value })}
          placeholder={t.kabulOrnek}
        />
      </div>
      <div className="alan tam">
        <span className="alan-ad">{t.bagimliliklar}</span>
        {taslak.bagimliliklar.length ? (
          <ul className="bagimlilik-liste">
            {taslak.bagimliliklar.map((id) => {
              const g = gorevler.find((x) => x.id === id);
              return (
                <li key={id}>
                  <code>{g?.kod ?? id}</code>
                  <span className="tek-satir">{g?.baslik ?? t.bilinmeyenGorev}</span>
                  {g ? <span className={`gd gd-${g.durum}`}>{s.genel.gorevDurumu[g.durum]}</span> : null}
                  <button
                    type="button"
                    className="dugme dugme-sessiz dugme-kucuk dugme-simge"
                    aria-label={t.bagimlilikKaldir(g?.kod ?? id)}
                    onClick={() => degistir({ bagimliliklar: taslak.bagimliliklar.filter((x) => x !== id) })}
                  >
                    <Simge ad="kapat" boyut={11} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="alan-ipucu">{t.bagimlilikYok}</span>
        )}
        {adaylar.length ? (
          <select
            className="secim"
            aria-label={t.bagimlilikEkle}
            value=""
            onChange={(e) => {
              if (e.target.value) degistir({ bagimliliklar: [...taslak.bagimliliklar, e.target.value] });
            }}
          >
            <option value="">{t.bagimlilikEkleSecenek}</option>
            {adaylar.map((g) => (
              <option key={g.id} value={g.id}>
                {g.kod} · {g.baslik}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}
