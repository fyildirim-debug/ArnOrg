// Ofisin kalıcılığı. Motorlar proje başına bellekte tutulur: Ofis ekranından çıkınca motor durur ve sahnesi
// DOM'dan ayrılır, geri gelince aynı motor kaldığı yerden sürer (kişilerin konumu, etkinliği, kamera aynen).
// Kamera görünümü (kamera.ts) ve masa ataması (masaAtama.ts) ayrıca proje başına tarayıcıda saklanır; sayfa
// yeniden yüklenince de korunur.
import { OfisMotoru } from "./motor";
import type { Varliklar } from "./varliklar";

/** Bellekte en çok bu kadar proje motoru kalır; en eskisi yok edilir */
const EN_COK_MOTOR = 3;

const motorlar = new Map<string, OfisMotoru>();

/** Projenin motoru: bellekte varsa o, yoksa yeni. Son kullanılan sona taşınır. */
export function ofisMotoru(projeId: string, varliklar: Varliklar): OfisMotoru {
  let motor = motorlar.get(projeId);
  if (motor && motor.varliklar !== varliklar) {
    // Varlık bildirimi yeniden yüklendi (hata sonrası): eski motor yeni görsellerle uyuşmaz
    motor.yokEt();
    motor = undefined;
  }
  motorlar.delete(projeId);
  motor ??= new OfisMotoru({ projeId, varliklar });
  motorlar.set(projeId, motor);
  for (const [pid, m] of motorlar) {
    if (motorlar.size <= EN_COK_MOTOR) break;
    if (m.bagliMi()) continue;
    m.yokEt();
    motorlar.delete(pid);
  }
  return motor;
}
