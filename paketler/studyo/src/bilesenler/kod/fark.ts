// Birleşik fark (unified diff) ayrıştırıcı
// Çekirdek yalnız birleşik farkı verir, main'deki dosyanın tamamını vermez. Bu yüzden Monaco DiffEditor
// yerine farkın kendisi satır numaralı, vurgulu bir görünümde çizilir.

export interface FarkSatiri {
  tur: "baglam" | "ekle" | "sil" | "bilgi";
  metin: string;
  eski: number | null;
  yeni: number | null;
}

export interface FarkParcasi {
  baslik: string;
  satirlar: FarkSatiri[];
}

export interface DosyaFarki {
  yol: string;
  eskiYol: string | null;
  parcalar: FarkParcasi[];
  ikili: boolean;
}

const PARCA = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function yolTemizle(s: string): string | null {
  const t = s.trim().replace(/\t.*$/, "");
  if (t === "/dev/null") return null;
  return t.replace(/^[ab]\//, "");
}

export function farkiAyristir(fark: string): DosyaFarki[] {
  const dosyalar: DosyaFarki[] = [];
  let dosya: DosyaFarki | null = null;
  let parca: FarkParcasi | null = null;
  let eski = 0;
  let yeni = 0;
  // Parça başlığındaki satır sayıları: içerik bunlar bitene kadar okunur ("--- " ile başlayan silinmiş satır başlık sanılmasın)
  let kalanEski = 0;
  let kalanYeni = 0;

  const yeniDosya = (yol: string, eskiYol: string | null): DosyaFarki => {
    const d: DosyaFarki = { yol, eskiYol, parcalar: [], ikili: false };
    dosyalar.push(d);
    parca = null;
    return d;
  };

  for (const satir of fark.replace(/\r\n/g, "\n").split("\n")) {
    if (parca && (kalanEski > 0 || kalanYeni > 0)) {
      const p: FarkParcasi = parca;
      if (satir.startsWith("+")) {
        p.satirlar.push({ tur: "ekle", metin: satir.slice(1), eski: null, yeni: yeni++ });
        kalanYeni--;
      } else if (satir.startsWith("-")) {
        p.satirlar.push({ tur: "sil", metin: satir.slice(1), eski: eski++, yeni: null });
        kalanEski--;
      } else if (satir.startsWith("\\")) {
        p.satirlar.push({ tur: "bilgi", metin: satir.slice(2), eski: null, yeni: null });
      } else {
        p.satirlar.push({ tur: "baglam", metin: satir.slice(1), eski: eski++, yeni: yeni++ });
        kalanEski--;
        kalanYeni--;
      }
      continue;
    }
    if (satir.startsWith("\\") && parca) {
      (parca as FarkParcasi).satirlar.push({ tur: "bilgi", metin: satir.slice(2), eski: null, yeni: null });
      continue;
    }
    if (satir.startsWith("diff --git ")) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(satir);
      dosya = yeniDosya(m?.[2] ?? satir.slice(11), m?.[1] ?? null);
      continue;
    }
    if (satir.startsWith("--- ")) {
      // "diff --git" başlığı olmayan farklarda dosya burada başlar
      if (!dosya || dosya.parcalar.length) dosya = yeniDosya("", null);
      dosya.eskiYol = yolTemizle(satir.slice(4));
      continue;
    }
    if (satir.startsWith("+++ ") && dosya) {
      dosya.yol = yolTemizle(satir.slice(4)) ?? dosya.eskiYol ?? dosya.yol;
      continue;
    }
    if (satir.startsWith("Binary files ") && dosya) {
      dosya.ikili = true;
      continue;
    }
    const m = PARCA.exec(satir);
    if (m && dosya) {
      eski = Number(m[1]);
      yeni = Number(m[3]);
      kalanEski = m[2] === undefined ? 1 : Number(m[2]);
      kalanYeni = m[4] === undefined ? 1 : Number(m[4]);
      const p: FarkParcasi = { baslik: satir, satirlar: [] };
      dosya.parcalar.push(p);
      parca = p;
    }
  }
  return dosyalar.filter((d) => d.yol || d.eskiYol);
}
