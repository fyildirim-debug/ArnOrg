// Notlar (İngilizce)
import type { notlar as tr } from "../tr/notlar";

export const notlar: typeof tr = {
  baslik: "Notes",
  altBaslikOnce: "Project docs live in the repo:",
  altBaslikSonra: "· vision, architecture, decisions · every agent reads, writes and searches them",
  yeniNot: "New note",
  alinamadi: "Couldn't load notes.",
  henuzYok: "No notes yet.",
  degisiklikleriAt: "Discard changes",
  kaydedilmemisUyari: "This note has unsaved changes. They'll be lost if you switch to another note.",
  notSecin: "Pick a note",
  notSecinMetin: "Open a note from the tree on the left.",
  bosBaslik: "No notes",
  bosMetin: "Vision and architecture notes are created when the project opens. Start with New note.",

  notAlinamadi: "Couldn't load the note.",
  kaydedildi: (dosya: string) => `${dosya} saved.`,
  kaydedildiZaman: (zaman: string) => `saved ${zaman}`,
  kaydedilmedi: "Unsaved · Ctrl+S",
  degisiklikYok: "No changes",
  icerik: (yol: string) => `Content of ${yol}`,
  onizleme: "Preview",
  onizlemeBos: "The preview shows up here.",
  notBos: "This note is empty.",

  dosyaAdiYazin: "Enter a file name, e.g. kararlar/ADR-006-cache.md",
  yolHatasi: "The path can't contain ..",
  notVar: "A note with this name already exists.",
  yeniYol: "Path of the new note",
  olustur: "Create",
};
