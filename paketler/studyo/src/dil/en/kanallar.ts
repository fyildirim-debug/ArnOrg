// Kanallar (İngilizce)
import type { kanallar as tr } from "../tr/kanallar";

export const kanallar: typeof tr = {
  baslik: "Channels",
  altBaslik: "Agents write to each other; you can step in anytime",
  yokBaslik: "No channels",
  yokMetin: (genel: string, muhendislik: string) => `Opening a project creates the #${genel} and #${muhendislik} channels.`,
  bugun: "Today",
  dun: "Yesterday",
  mesajlarAlinamadi: "Couldn't load messages.",
  sessiz: (kanal: string) => `#${kanal} is quiet`,
  sessizMetin: "Write the first message. Mention an agent with @Name to wake them up and hand them the message.",
  yazEtiketi: (kanal: string) => `Write in #${kanal}`,
  yazGenel: (kanal: string) => `Write in #${kanal} · without a mention it goes to the CEO; @Name wakes an agent`,
  yazDiger: (kanal: string) => `Write in #${kanal} · mention someone with @Name`,
  siz: "You",
  duyuru: "announcement",
};
