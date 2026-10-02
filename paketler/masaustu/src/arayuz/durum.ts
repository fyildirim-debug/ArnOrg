// Açılış/hata sayfasının betiği. Durumu ön yükleme köprüsünden (window.arnorgDurum) alır.

import type { DurumBilgisi, DurumEylemi } from "../kopru.js";

const kopru = window.arnorgDurum;

function oge(kimlik: string): HTMLElement {
  const o = document.getElementById(kimlik);
  if (!o) throw new Error(`#${kimlik} yok`);
  return o;
}

function goster(d: DurumBilgisi): void {
  const hata = d.asama === "hata";
  document.body.dataset.asama = d.asama;
  document.title = hata ? "ArnOrg · Çekirdek durdu" : "ArnOrg";
  oge("surum").textContent = `v${d.surum}`;
  oge("baslik").textContent = hata ? d.baslik : "ArnOrg";
  oge("asama").textContent = hata ? "Hata" : d.baslik;
  oge("aciklama").textContent = d.aciklama;
  oge("kayit-dosyasi").textContent = d.kayitDosyasi;
  const kuyruk = oge("kuyruk");
  kuyruk.textContent = d.kayitKuyrugu || "(kayıt boş)";
  kuyruk.scrollTop = kuyruk.scrollHeight;
  if (hata) document.querySelector<HTMLButtonElement>("button.birincil")?.focus();
}

for (const dugme of document.querySelectorAll<HTMLButtonElement>("[data-eylem]")) {
  dugme.addEventListener("click", () => kopru.eylem(dugme.dataset.eylem as DurumEylemi));
}

kopru.dinle(goster);
void kopru.al().then(goster);
