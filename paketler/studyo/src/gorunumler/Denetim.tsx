// Denetim: karar bekleyen araç çağrıları, denetim kaydı ve politika kuralları
import { KARAR_ADLARI, type Karar } from "@arnorg/ortak";
import { useMemo, useState } from "react";
import { BekleyenCagri } from "../bilesenler/denetim/BekleyenCagri";
import { PolitikaDuzenleyici } from "../bilesenler/denetim/PolitikaDuzenleyici";
import { Bos, Iskelet } from "../bilesenler/Durumlar";
import { ajanaGit } from "../durum/arayuz";
import { useVeri } from "../durum/veri";
import { akilliZaman, saatSaniye } from "../yardimcilar/bicim";

const SAYFA = 150;
const KARAR_SIRASI: (Karar | "tumu")[] = ["tumu", "izin", "ret", "sor", "degisti"];

export function Denetim() {
  const onaylar = useVeri((d) => d.onaylar);
  const denetim = useVeri((d) => d.denetim);
  const ajanlar = useVeri((d) => d.ajanlar);
  const yukleme = useVeri((d) => d.projeYukleme);
  const [karar, setKarar] = useState<Karar | "tumu">("tumu");
  const [ajanId, setAjanId] = useState("");
  const [arama, setArama] = useState("");
  const [goster, setGoster] = useState(SAYFA);

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
          <h1>Denetim</h1>
          <p>Her araç çağrısı ArnOrg'un kapısından geçer · politika .arnorg/proje.yaml</p>
        </div>
      </div>

      <section aria-labelledby="bekleyen-baslik">
        <h2 className="ara-baslik" id="bekleyen-baslik">
          Karar bekleyen çağrılar <small>{bekleyenler.length ? `${bekleyenler.length} bekliyor` : "yok"}</small>
        </h2>
        {bekleyenler.length ? (
          <div className="bekleyen-liste">
            {bekleyenler.map((o) => (
              <BekleyenCagri key={o.id} onay={o} />
            ))}
          </div>
        ) : (
          <p className="bekleyen-yok">
            Şu an kararınızı bekleyen çağrı yok. "Onaya sor" kuralına takılan çağrılar burada belirir; süre dolarsa çağrı reddedilir.
          </p>
        )}
      </section>

      <section aria-labelledby="kayit-baslik">
        <h2 className="ara-baslik" id="kayit-baslik">
          Son kararlar <small>{denetim.length} kayıt · PreToolUse kapısı</small>
        </h2>
        <div className="suzgec">
          <div className="bolumlu" role="group" aria-label="Karara göre süz">
            {KARAR_SIRASI.map((k) => (
              <button key={k} type="button" aria-pressed={karar === k} onClick={() => setKarar(k)}>
                {k === "tumu" ? "Tümü" : KARAR_ADLARI[k]} <span className="soluk sayi">{sayilar[k] ?? 0}</span>
              </button>
            ))}
          </div>
          <select className="secim suzgec-secim" aria-label="Ajana göre süz" value={ajanId} onChange={(e) => setAjanId(e.target.value)}>
            <option value="">Bütün ajanlar</option>
            {ajanlar.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ad}
              </option>
            ))}
          </select>
          <input
            className="girdi suzgec-arama"
            type="search"
            aria-label="Kayıtlarda ara"
            placeholder="Ara: komut, yol, kural"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
          />
        </div>
        {yukleme === "yukleniyor" && !denetim.length ? <Iskelet satir={6} /> : null}
        {yukleme !== "yukleniyor" && !suzulmus.length ? (
          <Bos kucuk baslik={denetim.length ? "Eşleşen kayıt yok" : "Henüz kayıt yok"}>
            {denetim.length ? "Süzgeçleri gevşetin." : "Ajanlar çalışmaya başlayınca her araç çağrısı ve verilen karar burada listelenir."}
          </Bos>
        ) : null}
        {suzulmus.length ? (
          <div className="tablo-sar">
            <table className="tablo denetim-tablo">
              <thead>
                <tr>
                  <th scope="col">Saat</th>
                  <th scope="col">Ajan</th>
                  <th scope="col">Araç</th>
                  <th scope="col">Girdi</th>
                  <th scope="col">Karar</th>
                  <th scope="col">Kural</th>
                </tr>
              </thead>
              <tbody>
                {suzulmus.slice(0, goster).map((k) => (
                  <tr key={k.id}>
                    <td className="sayi soluk" title={saatSaniye(k.zaman)}>
                      {akilliZaman(k.zaman)}
                    </td>
                    <td>
                      <button type="button" className="metin-dugme tablo-ajan" onClick={() => ajanaGit(k.ajanId)}>
                        {k.ajanAd}
                      </button>
                    </td>
                    <td>
                      <code className="arac">{k.arac.replace(/^mcp__[^_]+__/, "")}</code>
                    </td>
                    <td className="td-girdi">{k.girdiOzeti}</td>
                    <td>
                      <span className={`hukum hukum-${k.karar}`}>{KARAR_ADLARI[k.karar]}</span>
                    </td>
                    <td className="td-kural">{[k.kural, k.neden].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {suzulmus.length > goster ? (
              <div className="tablo-daha">
                <button type="button" className="dugme dugme-kucuk" onClick={() => setGoster((g) => g + SAYFA)}>
                  {Math.min(SAYFA, suzulmus.length - goster)} kayıt daha göster
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
          Politika <small>izin · ret · onaya sor</small>
        </h2>
        <PolitikaDuzenleyici />
      </section>
    </>
  );
}
