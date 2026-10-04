// turndown-plugin-gfm tip tanımı (paket tip getirmez): GitHub biçimli Markdown eklentileri
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  type Eklenti = (hizmet: TurndownService) => void;

  /** tables + strikethrough + taskListItems + highlightedCodeBlock */
  export const gfm: Eklenti;
  export const tables: Eklenti;
  export const strikethrough: Eklenti;
  export const taskListItems: Eklenti;
  export const highlightedCodeBlock: Eklenti;
}
