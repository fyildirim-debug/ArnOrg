// Denetim: karar bekleyen araç çağrıları, denetim kaydı (süzgeç ve JSONL dışa aktarım) ve politika kuralları
import type { Karar } from "@arnorg/ortak";
import { useMemo, useState } from "react";
import { api } from "../api/uclar";
import { BekleyenCagri } from "../bilesenler/denetim/BekleyenCagri";
import { PolitikaDuzenleyici } from "../bilesenler/denetim/PolitikaDuzenleyici";
import { Bos, Iskelet } from "../bilesenler/Durumlar";
import { Simge } from "../bilesenler/Simge";
import { sozluk, useSozluk } from "../dil";
import { ajanaGit, bildir } from "../durum/arayuz";
import { useVeri } from "../durum/veri";
import { akilliZaman, saatSaniye } from "../yardimcilar/bicim";
import { blobuKaydet } from "../yardimcilar/indirme";
import { useIslem } from "../yardimcilar/kancalar";

const SAYFA = 150;
const KARAR_SIRASI: (Karar | "tumu")[] = ["tumu", "izin", "ret", "sor", "degisti"];

export function Denetim() {
  const s = useSozluk();
  const t = s.denetim;
  const onaylar = useVeri((d) => d.onaylar);
  const denetim = useVeri((d) => d.denetim);
  const ajanlar = useVeri((d) => d.ajanlar);
  const yukleme = useVeri((d) => d.projeYukleme);
  const pid = useVeri((d) => d.aktifProjeId);
  const [karar, setKarar] = useState<Karar | "tumu">("tumu");
  const [ajanId, setAjanId] = useState("");
  const [arama, setArama] = useState("");
  const [goster, setGoster] = useState(SAYFA);
  const { suruyor, calistir } = useIslem();

  // Süzgeç çekirdekte de aynıdır; ekranda yüklü olanlarla sınırlı kalmaz, tablodaki bütün kayıtlara uygulanır
  const disaAktar = () =>
    void calistir("disa", async () => {
      if (!pid) return;
      const suzgec = { karar: karar === "tumu" ? undefined : karar, ajan: ajanId || undefined, q: arama.trim() || undefined };
      const { veri, dosyaAdi } = await api.denetimDisaAktar(pid, suzgec);
      if (!veri.size) {
        bildir("bilgi", sozluk().denetim.disaAktarBos);
        return;
      }
      blobuKaydet(veri, dosyaAdi ?? `arnorg-denetim-${pid}.jsonl`);
    });

  const bekleyenler = onaylar.filter((o) => o.tur === "arac" && o.durum === "bekliyor").sort((a, b) => a.olusturma.localeCompare(b.olusturma));
  const sayilar = useMemo(() => {
    const s: Record<string, number> = { tumu: denetim.length };
    for (const k of denetim) s[k.karar] = (s[k.karar] ?? 0) + 1;
    return s;
  }, [denetim]);

  const suzulmus = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    return denetim.filter(
      (k) =>
        (karar === "tumu" || k.karar === karar) &&
        (!ajanId || k.ajanId === ajanId) &&
        (!q || `${k.arac} ${k.girdiOzeti} ${k.kural ?? ""} ${k.neden ?? ""}`.toLocaleLowerCase("tr-TR").includes(q)),
    );
  }, [denetim, karar, ajanId, arama]);

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>{t.baslik}</h1>
          <p>{t.altBaslik}</p>
        </div>
      </div>

      <section aria-labelledby="bekleyen-baslik">
        <h2 className="ara-baslik" id="bekleyen-baslik">
          {t.bekleyenler} <small>{bekleyenler.length ? t.bekliyor(bekleyenler.length) : t.bekleyenYokKisa}</small>
        </h2>
        {bekleyenler.length ? (
          <div className="bekleyen-liste">
            {bekleyenler.map((o) => (
              <BekleyenCagri key={o.id} onay={o} />
            ))}
          </div>
        ) : (
          <p className="bekleyen-yok">{t.bekleyenYok}</p>
        )}
      </section>

      <section aria-labelledby="kayit-baslik">
        <h2 className="ara-baslik" id="kayit-baslik">
          {t.sonKararlar} <small>{`${s.genel.kayitSayisi(denetim.length)} · ${t.kapi}`}</small>
        </h2>
        <div className="suzgec">
          <div className="bolumlu" role="group" aria-label={t.karaGore}>
            {KARAR_SIRASI.map((k) => (
              <button key={k} type="button" aria-pressed={karar === k} onClick={() => setKarar(k)}>
                {k === "tumu" ? s.genel.tumu : s.genel.karar[k]} <span className="soluk sayi">{sayilar[k] ?? 0}</span>
              </button>
            ))}
          </div>
          <select className="secim suzgec-secim" aria-label={t.ajanaGore} value={ajanId} onChange={(e) => setAjanId(e.target.value)}>
            <option value="">{t.butunAjanlar}</option>
            {ajanlar.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ad}
              </option>
            ))}
          </select>
          <input
            className="girdi suzgec-arama"
            type="search"
            aria-label={t.araEtiket}
            placeholder={t.araYer}
            value={arama}
            onChange={(e) => setArama(e.target.value)}
          />
          <button type="button" className="dugme suzgec-disa" onClick={disaAktar} disabled={suruyor !== null || !denetim.length} title={t.disaAktarIpucu}>
            {suruyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="indir" />}
            {t.disaAktar}
          </button>
        </div>
        {yukleme === "yukleniyor" && !denetim.length ? <Iskelet satir={6} /> : null}
        {yukleme !== "yukleniyor" && !suzulmus.length ? (
          <Bos kucuk baslik={denetim.length ? t.eslesenYok : t.henuzYok}>
            {denetim.length ? t.eslesenYokMetin : t.henuzYokMetin}
          </Bos>
        ) : null}
        {suzulmus.length ? (
          <div className="tablo-sar">
            <table className="tablo denetim-tablo">
              <thead>
                <tr>
                  <th scope="col">{t.sutun.saat}</th>
                  <th scope="col">{t.sutun.ajan}</th>
                  <th scope="col">{t.sutun.arac}</th>
                  <th scope="col">{t.sutun.girdi}</th>
                  <th scope="col">{t.sutun.karar}</th>
                  <th scope="col">{t.sutun.kural}</th>
                </tr>
              </thead>
              <tbody>
                {suzulmus.slice(0, goster).map((k) => (
                  <tr key={k.id}>
                    <td className="sayi soluk" title={saatSaniye(k.zaman)}>
                      {akilliZaman(k.zaman)}
                    </td>
                    <td>
                      <span className="denetim-ajan">
                        <button type="button" className="metin-dugme tablo-ajan" onClick={() => ajanaGit(k.ajanId)}>
                          {k.ajanAd}
                        </button>
                        {k.altAjan ? (
                          <span className="etiket denetim-alt-ajan" title={t.altAjanIpucu(k.altAjan)}>
                            {t.altAjan}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      <code className="arac">{k.arac.replace(/^mcp__[^_]+__/, "")}</code>
                    </td>
                    <td className="td-girdi">{k.girdiOzeti}</td>
                    <td>
                      <span className={`hukum hukum-${k.karar}`}>{s.genel.karar[k.karar]}</span>
                    </td>
                    <td className="td-kural">{[k.kural, k.neden].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {suzulmus.length > goster ? (
              <div className="tablo-daha">
                <button type="button" className="dugme dugme-kucuk" onClick={() => setGoster((g) => g + SAYFA)}>
                  {t.dahaGoster(Math.min(SAYFA, suzulmus.length - goster))}
                </button>
                <small>
                  {goster} / {suzulmus.length}
                </small>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="politika-baslik">
        <h2 className="ara-baslik" id="politika-baslik">
          {t.politika} <small>{t.politikaAlt}</small>
        </h2>
        <PolitikaDuzenleyici />
      </section>
    </>
  );
}
