// Sol menü: ekranlar, bekleyen karar rozetleri, projeler ve ayarlar
import { useEffect, useRef } from "react";
import { useSozluk, type Sozluk } from "../dil";
import { git, PROJESIZ_GORUNUMLER, useArayuz, type Gorunum } from "../durum/arayuz";
import { useHafiza } from "../durum/hafiza";
import { useVeri } from "../durum/veri";
import { kanallarOkunmamis } from "../yardimcilar/kanallar";
import { Simge, type SimgeAdi } from "./Simge";

interface Oge {
  gorunum: Gorunum;
  /** Menü adı sözlükte s.gezinti.menu[gorunum] */
  simge: SimgeAdi;
}

const ANA: Oge[] = [
  { gorunum: "karargah", simge: "karargah" },
  { gorunum: "ofis", simge: "ofis" },
  { gorunum: "ekip", simge: "ekip" },
  { gorunum: "pano", simge: "pano" },
  { gorunum: "kanallar", simge: "kanallar" },
  { gorunum: "notlar", simge: "notlar" },
  { gorunum: "hafiza", simge: "hafiza" },
  { gorunum: "zeka", simge: "zeka" },
  { gorunum: "kod", simge: "kod" },
  { gorunum: "kod-zekasi", simge: "kodZekasi" },
  { gorunum: "tarayici", simge: "kure" },
  { gorunum: "denetim", simge: "denetim" },
  { gorunum: "onaylar", simge: "onaylar" },
];

const ALT: Oge[] = [
  { gorunum: "projeler", simge: "projeler" },
  { gorunum: "ayarlar", simge: "ayarlar" },
];

/** Menüdeki ekran adı */
export function gorunumAdi(s: Sozluk, g: Gorunum): string {
  return s.gezinti.menu[g as keyof Sozluk["gezinti"]["menu"]] ?? g;
}

export function Gezinti() {
  const s = useSozluk();
  const gorunum = useArayuz((d) => d.gorunum);
  const projeVar = useVeri((d) => d.aktifProjeId !== null);
  const onaylar = useVeri((d) => d.onaylar);
  const okunmamis = useVeri((d) => d.okunmamis);
  const bekleyenArac = onaylar.filter((o) => o.durum === "bekliyor" && o.tur === "arac").length;
  const bekleyenDiger = onaylar.filter((o) => o.durum === "bekliyor" && o.tur !== "arac").length;
  // CEO ile bire bir sohbetin okunmamışları Kanallar'a sayılmaz (Karargâh'ta görünür)
  const okunmamisToplam = kanallarOkunmamis(okunmamis);
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
        <span className="rozet rozet-uyari" aria-label={s.gezinti.rozetArac(bekleyenArac)}>
          {bekleyenArac}
        </span>
      );
    if (g === "onaylar" && bekleyenDiger)
      return (
        <span className="rozet" aria-label={s.gezinti.rozetOnay(bekleyenDiger)}>
          {bekleyenDiger}
        </span>
      );
    if (g === "hafiza" && bekleyenSoru)
      return (
        <span className="rozet rozet-sessiz" aria-label={s.gezinti.rozetSoru(bekleyenSoru)}>
          {bekleyenSoru}
        </span>
      );
    if (g === "kanallar" && okunmamisToplam)
      return (
        <span className="rozet rozet-sessiz" aria-label={s.gezinti.rozetOkunmamis(okunmamisToplam)}>
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
        title={kapali ? s.gezinti.onceProjeAc : undefined}
        onClick={() => git(o.gorunum)}
      >
        <Simge ad={o.simge} />
        <span>{gorunumAdi(s, o.gorunum)}</span>
        {kapali ? null : rozet(o.gorunum)}
      </button>
    );
  };

  return (
    <nav className="gezinti" aria-label={s.gezinti.menuEtiketi} ref={navRef}>
      {ANA.map(dugme)}
      <div className="gezinti-alt">{ALT.map(dugme)}</div>
    </nav>
  );
}
