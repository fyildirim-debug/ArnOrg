// Editör sekmeleri ve Monaco modelleri: açma, kaydetme, kirli izleme, ajan değişikliklerini canlı uygulama
import type { DosyaIcerigi } from "@arnorg/ortak";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiHatasi, hataMetni } from "../../api/istek";
import { api } from "../../api/uclar";
import { bildir } from "../../durum/arayuz";
import { dosyaAdi } from "../../yardimcilar/bicim";
import { dilKimligi, modelAdresi, monaco } from "./monacoKurulum";

export interface Sekme {
  yol: string;
  yukleniyor: boolean;
  hata: string | null;
  dil: string;
  saltOkunur: boolean;
  duzenleyenAjanId: string | null;
  kirli: boolean;
  /** Kaydedilmemiş değişiklik varken dosya dışarıdan değişti */
  cakisma: { ajanAd: string } | null;
  /** Son ajan değişikliğinin kısa süreli işareti */
  flas: { ajanAd: string; zaman: number } | null;
}

interface ModelKaydi {
  model: monaco.editor.ITextModel;
  kayitliSurum: number;
}

export interface SekmeYonetimi {
  sekmeler: Sekme[];
  aktif: string | null;
  setAktif: (yol: string | null) => void;
  ac: (yol: string) => Promise<void>;
  kapat: (yol: string) => void;
  kaydet: (yol: string) => Promise<boolean>;
  yenidenYukle: (yol: string) => Promise<void>;
  kirliGuncelle: () => void;
  disaridanDegisti: (yol: string, ajanAd: string) => Promise<void>;
  cakismayiBirak: (yol: string) => void;
  model: (yol: string) => monaco.editor.ITextModel | null;
}

function bosSekme(yol: string): Sekme {
  return { yol, yukleniyor: true, hata: null, dil: "plaintext", saltOkunur: false, duzenleyenAjanId: null, kirli: false, cakisma: null, flas: null };
}

/** Yalnız değişen ortayı değiştirir: imleç ve kaydırma değişmeyen yerlerde kalır */
function farkliBolumuUygula(model: monaco.editor.ITextModel, yeni: string): { bas: number; son: number } | null {
  const eski = model.getValue();
  if (eski === yeni) return null;
  let bas = 0;
  const enKisa = Math.min(eski.length, yeni.length);
  while (bas < enKisa && eski.charCodeAt(bas) === yeni.charCodeAt(bas)) bas++;
  let eskiSon = eski.length;
  let yeniSon = yeni.length;
  while (eskiSon > bas && yeniSon > bas && eski.charCodeAt(eskiSon - 1) === yeni.charCodeAt(yeniSon - 1)) {
    eskiSon--;
    yeniSon--;
  }
  const basKonum = model.getPositionAt(bas);
  const sonKonum = model.getPositionAt(eskiSon);
  model.pushEditOperations(
    [],
    [{ range: new monaco.Range(basKonum.lineNumber, basKonum.column, sonKonum.lineNumber, sonKonum.column), text: yeni.slice(bas, yeniSon) }],
    () => null,
  );
  const ilkSatir = model.getPositionAt(bas).lineNumber;
  const sonSatir = model.getPositionAt(Math.max(bas, yeniSon)).lineNumber;
  return { bas: ilkSatir, son: Math.max(ilkSatir, sonSatir) };
}

export function useSekmeler(
  projeId: string,
  alan: string,
  gunluk: (metin: string) => void,
  editor: () => monaco.editor.IStandaloneCodeEditor | null,
): SekmeYonetimi {
  const [sekmeler, setSekmeler] = useState<Sekme[]>([]);
  const [aktif, setAktif] = useState<string | null>(null);
  const modeller = useRef(new Map<string, ModelKaydi>());
  const susturRef = useRef(false);
  const sekmelerRef = useRef(sekmeler);
  sekmelerRef.current = sekmeler;

  const guncelle = useCallback((yol: string, d: Partial<Sekme>) => {
    setSekmeler((s) => s.map((x) => (x.yol === yol ? { ...x, ...d } : x)));
  }, []);

  // Çalışma alanı değişince bütün modeller atılır
  useEffect(() => {
    const harita = modeller.current;
    return () => {
      for (const { model } of harita.values()) model.dispose();
      harita.clear();
      setSekmeler([]);
      setAktif(null);
    };
  }, [projeId, alan]);

  const icerikUygula = useCallback(
    (d: DosyaIcerigi) => {
      const adres = modelAdresi(alan, d.yol);
      const dil = dilKimligi(d.dil);
      let kayit = modeller.current.get(d.yol);
      if (!kayit) {
        const model = monaco.editor.getModel(adres) ?? monaco.editor.createModel(d.icerik, dil, adres);
        if (model.getValue() !== d.icerik) model.setValue(d.icerik);
        kayit = { model, kayitliSurum: model.getAlternativeVersionId() };
        modeller.current.set(d.yol, kayit);
      } else {
        susturRef.current = true;
        try {
          farkliBolumuUygula(kayit.model, d.icerik);
        } finally {
          susturRef.current = false;
        }
        kayit.kayitliSurum = kayit.model.getAlternativeVersionId();
      }
      if (kayit.model.getLanguageId() !== dil) monaco.editor.setModelLanguage(kayit.model, dil);
      guncelle(d.yol, {
        yukleniyor: false,
        hata: null,
        dil,
        saltOkunur: d.saltOkunur,
        duzenleyenAjanId: d.duzenleyenAjanId,
        kirli: false,
        cakisma: null,
      });
    },
    [alan, guncelle],
  );

  const ac = useCallback(
    async (yol: string) => {
      setAktif(yol);
      if (sekmelerRef.current.some((s) => s.yol === yol)) return;
      setSekmeler((s) => (s.some((x) => x.yol === yol) ? s : [...s, bosSekme(yol)]));
      try {
        icerikUygula(await api.dosya(projeId, alan, yol));
      } catch (e) {
        const metin = e instanceof ApiHatasi && e.durum === 413 ? "Dosya 2 MB'tan büyük; editörde açılamaz. Dışarıda açın." : hataMetni(e);
        guncelle(yol, { yukleniyor: false, hata: metin });
      }
    },
    [projeId, alan, icerikUygula, guncelle],
  );

  const kapat = useCallback((yol: string) => {
    const kayit = modeller.current.get(yol);
    kayit?.model.dispose();
    modeller.current.delete(yol);
    setSekmeler((s) => {
      const i = s.findIndex((x) => x.yol === yol);
      const yeni = s.filter((x) => x.yol !== yol);
      setAktif((a) => (a === yol ? (yeni[Math.min(i, yeni.length - 1)]?.yol ?? null) : a));
      return yeni;
    });
  }, []);

  const kirliGuncelle = useCallback(() => {
    if (susturRef.current) return;
    setSekmeler((s) => {
      let degisti = false;
      const yeni = s.map((x) => {
        const k = modeller.current.get(x.yol);
        if (!k) return x;
        const kirli = k.model.getAlternativeVersionId() !== k.kayitliSurum;
        if (kirli === x.kirli) return x;
        degisti = true;
        return { ...x, kirli };
      });
      return degisti ? yeni : s;
    });
  }, []);

  /** 409'dan sonra yalnız kilit bilgisini tazele (içeriğe dokunmadan) */
  const kilitBilgisiniTazele = useCallback(
    async (yol: string) => {
      try {
        const d = await api.dosya(projeId, alan, yol);
        guncelle(yol, { saltOkunur: d.saltOkunur, duzenleyenAjanId: d.duzenleyenAjanId });
      } catch {
        // kilit bilgisi alınamazsa sekme olduğu gibi kalır
      }
    },
    [projeId, alan, guncelle],
  );

  const kaydet = useCallback(
    async (yol: string) => {
      const k = modeller.current.get(yol);
      const sekme = sekmelerRef.current.find((s) => s.yol === yol);
      if (!k || !sekme || sekme.saltOkunur) return false;
      const surum = k.model.getAlternativeVersionId();
      try {
        await api.dosyaYaz(projeId, { alan, yol, icerik: k.model.getValue() });
        k.kayitliSurum = surum;
        guncelle(yol, { kirli: k.model.getAlternativeVersionId() !== surum, cakisma: null });
        gunluk(`Kaydedildi: ${yol}`);
        return true;
      } catch (e) {
        const metin = hataMetni(e);
        gunluk(`Kaydedilemedi: ${yol} · ${metin}`);
        bildir(e instanceof ApiHatasi && e.durum === 409 ? "uyari" : "hata", `${dosyaAdi(yol)} kaydedilemedi: ${metin}`);
        if (e instanceof ApiHatasi && e.durum === 409) void kilitBilgisiniTazele(yol);
        return false;
      }
    },
    [projeId, alan, guncelle, gunluk, kilitBilgisiniTazele],
  );

  const yenidenYukle = useCallback(
    async (yol: string) => {
      try {
        icerikUygula(await api.dosya(projeId, alan, yol));
      } catch (e) {
        bildir("hata", `${dosyaAdi(yol)} yüklenemedi: ${hataMetni(e)}`);
      }
    },
    [projeId, alan, icerikUygula],
  );

  const disaridanDegisti = useCallback(
    async (yol: string, ajanAd: string) => {
      const sekme = sekmelerRef.current.find((s) => s.yol === yol);
      const k = modeller.current.get(yol);
      if (!sekme || !k || sekme.yukleniyor) return;
      if (sekme.kirli) {
        guncelle(yol, { cakisma: { ajanAd } });
        return;
      }
      try {
        const d = await api.dosya(projeId, alan, yol);
        susturRef.current = true;
        let aralik: { bas: number; son: number } | null = null;
        try {
          aralik = farkliBolumuUygula(k.model, d.icerik);
        } finally {
          susturRef.current = false;
        }
        k.kayitliSurum = k.model.getAlternativeVersionId();
        guncelle(yol, { saltOkunur: d.saltOkunur, duzenleyenAjanId: d.duzenleyenAjanId, kirli: false, flas: { ajanAd, zaman: Date.now() } });
        if (aralik) satirlariParlat(k.model, aralik, ajanAd, editor());
      } catch (e) {
        gunluk(`Değişiklik alınamadı: ${yol} · ${hataMetni(e)}`);
      }
    },
    [projeId, alan, guncelle, gunluk, editor],
  );

  const cakismayiBirak = useCallback((yol: string) => guncelle(yol, { cakisma: null }), [guncelle]);
  const model = useCallback((yol: string) => modeller.current.get(yol)?.model ?? null, []);

  return { sekmeler, aktif, setAktif, ac, kapat, kaydet, yenidenYukle, kirliGuncelle, disaridanDegisti, cakismayiBirak, model };
}

/** Ajanın değiştirdiği satırları kısa süre vurgular ve son satıra adını yazar */
function satirlariParlat(
  model: monaco.editor.ITextModel,
  aralik: { bas: number; son: number },
  ajanAd: string,
  editor: monaco.editor.IStandaloneCodeEditor | null,
) {
  if (model.isDisposed()) return;
  const son = Math.min(aralik.son, model.getLineCount());
  const koleksiyon = model.deltaDecorations(
    [],
    [
      {
        range: new monaco.Range(aralik.bas, 1, son, 1),
        options: { isWholeLine: true, className: "e-canli-satir", linesDecorationsClassName: "e-canli-cizgi" },
      },
      {
        // Ad, değişikliğin ilk satırına yazılır: görünür kılınan satır odur
        range: new monaco.Range(aralik.bas, model.getLineMaxColumn(aralik.bas), aralik.bas, model.getLineMaxColumn(aralik.bas)),
        options: { showIfCollapsed: true, after: { content: ` ${ajanAd}`, inlineClassName: "e-ajan-etiket" } },
      },
    ],
  );
  // Kullanıcı başka yerde değilse değişikliği görünür kıl
  if (editor && editor.getModel() === model && !editor.hasTextFocus()) editor.revealLineInCenterIfOutsideViewport(aralik.bas);
  setTimeout(() => {
    if (!model.isDisposed()) model.deltaDecorations(koleksiyon, []);
  }, 2600);
}
