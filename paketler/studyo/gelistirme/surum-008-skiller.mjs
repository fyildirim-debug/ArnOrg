// Sahte çekirdeğin 0.0.8 "skiller" davranışları: çekirdeğin skill kütüphanesi (paketler/cekirdek/skiller/katalog.json
// doğrudan okunur, kopyası tutulmaz), GET /api/skiller, ajanlarda skiller alanı (rolün varsayılanları; kurulun
// değiştirdiği örnekler: Deniz'e Postgres, Selin'e pazarlama metni, Mert'ten Playwright testi çıkmış), işe alımda ve
// PATCH /api/ajanlar/:aid ile skill atama (çekirdekteki doğrulamayla), Kerem'in akışında bir Skill çağrısı.
//
//   kur(c): sahte-sunucu.mjs'teki rota, rotalar, db ve yardımcılarla çağrılır (surum-004-*.mjs deseni)

import fs from "node:fs";
import { ceviri } from "./dil.mjs";

const KATALOG = JSON.parse(fs.readFileSync(new URL("../../cekirdek/skiller/katalog.json", import.meta.url), "utf8"));
const SKILLER = KATALOG.skiller;
const KIMLIKLER = SKILLER.map((s) => s.kimlik);
/** Rol → varsayılan skiller (katalog sırasıyla); çekirdekteki skillKatalogu().roller ile aynı */
const ROLLER = {};
for (const s of SKILLER) for (const r of s.varsayilan) (ROLLER[r] ??= []).push(s.kimlik);

const sirala = (liste) => KIMLIKLER.filter((k) => liste.includes(k));
const rolSkilleri = (rol) => [...(ROLLER[rol] ?? [])];

export function kur(c) {
  const { rota, rotalar, db, yay, ajanBul, akisEkle, Hata, yeniKimlik } = c;
  const ajanYay = (a) => yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);

  /** Çekirdekteki skilleriDogrula: bilinmeyen kimlik ve CEO'ya skill 400 */
  function dogrula(liste, rol) {
    if (!Array.isArray(liste) || liste.some((k) => typeof k !== "string")) throw new Hata(400, ceviri("Skiller kimlik listesi olmalı.", "Skills must be a list of ids."));
    const bilinmeyen = liste.filter((k) => !KIMLIKLER.includes(k));
    if (bilinmeyen.length) throw new Hata(400, ceviri(`Bilinmeyen skill: ${bilinmeyen.join(", ")}.`, `Unknown skill: ${bilinmeyen.join(", ")}.`));
    const temiz = sirala(liste);
    if (rol === "ceo" && temiz.length) throw new Hata(400, ceviri("CEO skill kullanmaz; skilleri işe aldığı çalışanlara atar.", "The CEO does not use skills; they assign them to the people they hire."));
    return temiz;
  }

  for (const a of db.ajanlar) a.skiller ??= a.rol === "ceo" ? [] : rolSkilleri(a.rol);
  const deniz = ajanBul("deniz");
  if (deniz) deniz.skiller = sirala([...deniz.skiller, "supabase-postgres-best-practices", "sql-optimization-patterns"]);
  const selin = ajanBul("selin");
  if (selin) selin.skiller = sirala([...selin.skiller, "copywriting"]);
  const mert = ajanBul("mert");
  if (mert) mert.skiller = mert.skiller.filter((k) => k !== "webapp-testing");

  // Kerem bir mimari kararı yazmadan önce ADR skilini yükledi
  const kerem = ajanBul("kerem");
  if (kerem) {
    const aracKimligi = yeniKimlik("toolu");
    akisEkle(kerem.id, { tur: "arac_cagrisi", arac: "Skill", aracKimligi, girdi: { skill: "arnorg:architecture-decision-records" } });
    akisEkle(kerem.id, { tur: "arac_sonucu", aracKimligi, metin: "Launching skill: arnorg:architecture-decision-records" });
  }

  rota("GET", "/api/skiller", () => ({ skiller: SKILLER, roller: ROLLER }));

  // İşe alım: skiller doğrulanır (çalışan eklenmeden önce), verilmezse rolün varsayılanları
  const iseAl = rotalar.find((r) => r.yontem === "POST" && r.desen.test("/api/projeler/x/ajanlar"));
  const eskiIseAl = iseAl.isleyici;
  iseAl.isleyici = (istek) => {
    const g = istek.govde ?? {};
    const skiller = g.skiller == null ? null : dogrula(g.skiller, g.rol);
    const a = eskiIseAl(istek);
    const kayit = ajanBul(a.id) ?? a;
    kayit.skiller = skiller ?? (kayit.rol === "ceo" ? [] : rolSkilleri(kayit.rol));
    ajanYay(kayit);
    return kayit;
  };

  // PATCH /api/ajanlar/:aid skiller alanını da işler; null rolün varsayılanlarına döndürür
  const yama = rotalar.find((r) => r.yontem === "PATCH" && r.desen.test("/api/ajanlar/x"));
  const eskiYama = yama.isleyici;
  yama.isleyici = (istek) => {
    const g = istek.govde ?? {};
    const once = ajanBul(istek.p?.aid);
    const skiller = g.skiller === undefined ? undefined : g.skiller === null ? null : dogrula(g.skiller, once?.rol);
    const a = eskiYama(istek);
    if (skiller !== undefined) {
      a.skiller = skiller ?? (a.rol === "ceo" ? [] : rolSkilleri(a.rol));
      ajanYay(a);
    }
    return a;
  };
}
