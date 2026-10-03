// Sol menü: ekranlar, bekleyen karar rozetleri, projeler ve ayarlar
import { useEffect, useRef } from "react";
import { git, PROJESIZ_GORUNUMLER, useArayuz, type Gorunum } from "../durum/arayuz";
import { useHafiza } from "../durum/hafiza";
import { useVeri } from "../durum/veri";
import { Simge, type SimgeAdi } from "./Simge";

interface Oge {
  gorunum: Gorunum;
  ad: string;
  simge: SimgeAdi;
}

const ANA: Oge[] = [
  { gorunum: "karargah", ad: "Karargâh", simge: "karargah" },
  { gorunum: "ofis", ad: "Ofis", simge: "ofis" },
  { gorunum: "ekip", ad: "Ekip", simge: "ekip" },
  { gorunum: "pano", ad: "Pano", simge: "pano" },
  { gorunum: "kanallar", ad: "Kanallar", simge: "kanallar" },
  { gorunum: "notlar", ad: "Notlar", simge: "notlar" },
  { gorunum: "hafiza", ad: "Hafıza", simge: "hafiza" },
  { gorunum: "kod", ad: "Kod", simge: "kod" },
  { gorunum: "kod-zekasi", ad: "Kod zekâsı", simge: "kodZekasi" },
  { gorunum: "denetim", ad: "Denetim", simge: "denetim" },
  { gorunum: "onaylar", ad: "Onaylar", simge: "onaylar" },
];

const ALT: Oge[] = [
  { gorunum: "projeler", ad: "Projeler", simge: "projeler" },
  { gorunum: "ayarlar", ad: "Ayarlar", simge: "ayarlar" },
];

export function Gezinti() {
  const gorunum = useArayuz((d) => d.gorunum);
  const projeVar = useVeri((d) => d.aktifProjeId !== null);
  const onaylar = useVeri((d) => d.onaylar);
  const okunmamis = useVeri((d) => d.okunmamis);
  const bekleyenArac = onaylar.filter((o) => o.durum === "bekliyor" && o.tur === "arac").length;
  const bekleyenDiger = onaylar.filter((o) => o.durum === "bekliyor" && o.tur !== "arac").length;
  const okunmamisToplam = Object.values(okunmamis).reduce((a, b) => a + b, 0);
  const bekleyenSoru = useHafiza((d) => (d.projeId === useVeri.getState().aktifProjeId ? d.sorular.filter((s) => s.durum === "bekliyor").length : 0));
  const navRef = useRef<HTMLElement>(null);

  // Dar ekranda menü yatay kayar; etkin öğe görünür kalsın
  useEffect(() => {
    const nav = navRef.current;
    const etkin = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !etkin || nav.scrollWidth <= nav.clientWidth) return;
    const kutu = etkin.getBoundingClientRect();
    const sol = kutu.left - nav.getBoundingClientRect().left + nav.scrollLeft - nav.clientWidth / 2 + kutu.width / 2;
    nav.scrollTo({ left: Math.max(0, sol) });
  }, [gorunum]);

  const rozet = (g: Gorunum) => {
    if (g === "denetim" && bekleyenArac)
      return (
        <span className="rozet rozet-uyari" aria-label={`${bekleyenArac} araç çağrısı kararınızı bekliyor`}>
          {bekleyenArac}
        </span>
      );
    if (g === "onaylar" && bekleyenDiger)
      return (
        <span className="rozet" aria-label={`${bekleyenDiger} onay bekliyor`}>
          {bekleyenDiger}
        </span>
      );
    if (g === "hafiza" && bekleyenSoru)
      return (
        <span className="rozet rozet-sessiz" aria-label={`${bekleyenSoru} soru yanıt bekliyor`}>
          {bekleyenSoru}
        </span>
      );
    if (g === "kanallar" && okunmamisToplam)
      return (
        <span className="rozet rozet-sessiz" aria-label={`${okunmamisToplam} okunmamış mesaj`}>
          {okunmamisToplam > 99 ? "99+" : okunmamisToplam}
        </span>
      );
    return null;
  };

  const dugme = (o: Oge) => {
    const etkin = gorunum === o.gorunum || (o.gorunum === "ekip" && gorunum === "ajan");
    const kapali = !projeVar && !PROJESIZ_GORUNUMLER.includes(o.gorunum);
    return (
      <button
        key={o.gorunum}
        type="button"
        className="nav-dugme"
        aria-current={etkin ? "page" : undefined}
        disabled={kapali}
        title={kapali ? "Önce bir proje açın" : undefined}
        onClick={() => git(o.gorunum)}
      >
        <Simge ad={o.simge} />
        <span>{o.ad}</span>
        {kapali ? null : rozet(o.gorunum)}
      </button>
    );
  };

  return (
    <nav className="gezinti" aria-label="Stüdyo menüsü" ref={navRef}>
      {ANA.map(dugme)}
      <div className="gezinti-alt">{ALT.map(dugme)}</div>
    </nav>
  );
}
