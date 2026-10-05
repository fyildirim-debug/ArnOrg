// Skill kütüphanesinin ucu (docs/API.md, "Skiller"): katalog ve rol varsayılanları. Çalışanın skilleri işe alımda
// (api.iseAl) ve api.ajanGuncelle ile değişir.
import type { SkillKatalogu } from "@arnorg/ortak";
import { istek } from "./istek";

export const skillApi = {
  katalog: () => istek<SkillKatalogu>("/api/skiller"),
};
