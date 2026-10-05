// Mesaj ekleri (docs/API.md, "Mesaj ekleri"): yükleme (base64 JSON; ilerleme için XMLHttpRequest), taslağın silinmesi,
// ekin baytları (anahtar başlıkla; görsel nesne adresiyle gösterilir) ve ekli kanal mesajı.
import type { EkYukleIstegi, KanalMesajiIstegi, Mesaj, MesajEki } from "@arnorg/ortak";
import { sozluk } from "../dil";
import { anahtar, anahtarAyarla } from "./anahtar";
import { ApiHatasi, indir, istek } from "./istek";

const k = encodeURIComponent;

/** Dosyayı base64 okur (data: öneki atılır) */
function base64Oku(dosya: Blob): Promise<string> {
  return new Promise((coz, reddet) => {
    const okuyucu = new FileReader();
    okuyucu.onload = () => coz(String(okuyucu.result).replace(/^data:[^,]*,/, ""));
    okuyucu.onerror = () => reddet(okuyucu.error ?? new Error("FileReader"));
    okuyucu.readAsDataURL(dosya);
  });
}

/** Başarısız yanıtın metni: çekirdeğin hata metni, yoksa durum koduna göre */
function yanitHatasi(xhr: XMLHttpRequest): ApiHatasi {
  const m = sozluk().bildirim.api;
  let mesaj = xhr.status === 413 ? m.cokBuyuk : xhr.status === 401 ? m.anahtarGecersiz : m.beklenmeyen(xhr.status);
  try {
    const j = JSON.parse(xhr.responseText) as { hata?: unknown };
    if (typeof j.hata === "string" && j.hata) mesaj = j.hata;
  } catch {
    // Gövde JSON değil; durum metni kalır
  }
  if (xhr.status === 401) anahtarAyarla(null);
  return new ApiHatasi(mesaj, xhr.status);
}

export const ekApi = {
  /** Dosyayı yükler; ilerleme 0–1 arası (gövdenin gönderilen payı). İptalde AbortError */
  yukle: async (pid: string, dosya: File, ilerleme: (oran: number) => void, sinyal?: AbortSignal): Promise<MesajEki> => {
    const govde: EkYukleIstegi = { ad: dosya.name, veri: await base64Oku(dosya) };
    if (sinyal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Promise<MesajEki>((coz, reddet) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/projeler/${k(pid)}/ekler`);
      xhr.setRequestHeader("Accept", "application/json");
      xhr.setRequestHeader("Content-Type", "application/json");
      const a = anahtar();
      if (a) xhr.setRequestHeader("Authorization", `Bearer ${a}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) ilerleme(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            coz(JSON.parse(xhr.responseText) as MesajEki);
          } catch {
            reddet(new ApiHatasi(sozluk().bildirim.api.beklenmeyen(xhr.status), xhr.status));
          }
        } else reddet(yanitHatasi(xhr));
      };
      xhr.onerror = () => reddet(new ApiHatasi(sozluk().bildirim.api.ulasilamadi, 0));
      xhr.onabort = () => reddet(new DOMException("Aborted", "AbortError"));
      sinyal?.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(JSON.stringify(govde));
    });
  },
  /** Gönderilmemiş taslağı siler */
  sil: (id: string) => istek<{ tamam: true }>(`/api/ekler/${k(id)}`, { method: "DELETE" }),
  /** Ekin baytları (anahtar başlıkla gider) */
  icerik: (id: string, sinyal?: AbortSignal) => indir(`/api/ekler/${k(id)}`, sinyal),
  /** Kanal mesajı; ekler yüklenmiş taslakların kimlikleri, ekli mesajın metni boş olabilir */
  mesajGonder: (pid: string, kanal: string, metin: string, ekler: string[] = []) => {
    const govde: KanalMesajiIstegi = ekler.length ? { metin, ekler } : { metin };
    return istek<Mesaj>(`/api/projeler/${k(pid)}/kanallar/${k(kanal)}/mesajlar`, { method: "POST", govde });
  },
};
