// Showcase: the project's root README.md, the page the board reads; the product marketer and update requests (English)
export const tanitim = {
  yukleniyor: "Loading the showcase page",
  alinamadi: "Couldn't load the showcase page.",
  commitYok: "not committed yet",
  taslakKunyesi: "draft",
  commitBaslik: (commit: string, mesaj: string) => `Last commit ${commit}: ${mesaj}`,
  surumEtiketi: "Version shown",
  yayinda: "Published",
  taslak: "Draft",
  yayindaYok: "No merged README.md yet",
  taslakHazir: (ad: string) => `${ad}'s draft is ready; not merged yet`,
  taslakNotu: (ad: string) => `In ${ad}'s workspace; not merged yet, it goes live once merged.`,
  koddaAc: "Open in Code",
  koddaAcBaslik: "Open README.md in the Code screen",
  bosReadme: "README.md is empty.",
  gorselYok: (alt: string) => (alt ? `Image unavailable: ${alt}` : "Image unavailable"),
  kunyeEtiketi: "Page details",
  sahibi: "Maintainer",
  uzmanMetin: "Writes README.md and keeps it current after deliveries and merged work.",
  uzmanYok: "No product marketer yet",
  uzmanYokMetin: (otonom: boolean) =>
    otonom
      ? "Requests go to the CEO: the CEO hires a Product marketer directly, and the marketer writes README.md."
      : "Requests go to the CEO: the CEO proposes hiring a Product marketer, the proposal lands in Approvals, and the marketer writes README.md.",
  guncellenmesiniIste: "Request an update",
  notEtiketi: "Note (optional)",
  notIpucu: "e.g. add the new orders screen and a screenshot",
  kimeGidecek: (ad: string, uzman: boolean) => (uzman ? `Goes to ${ad}.` : `No marketer yet; the request goes to ${ad} (CEO).`),
  gonder: "Send request",
  istendi: (zaman: string) => `Last request · ${zaman}`,
  iletildi: (ad: string) => `sent to ${ad}`,
  istekGitti: (ad: string, uzman: boolean, otonom: boolean) =>
    uzman ? `Sent to ${ad}.` : otonom ? `Sent to ${ad}; they will hire a product marketer.` : `Sent to ${ad}; they will propose hiring a product marketer.`,
  bosBaslik: "No showcase page yet",
  bosMetin:
    "The board reads the project here, from the root README.md: what it does, who it is for, its key features, setup and the roadmap. A Product marketer writes the page and keeps it current after deliveries.",
  ceodanIste: "Ask the CEO for a product marketer",
  ceoIpucu: (ad: string, otonom: boolean) => (otonom ? `${ad} will hire one directly; the CEO has the decision authority.` : `${ad} will propose hiring one; the proposal lands in Approvals.`),
  uzmanaYazdir: (ad: string) => `Ask ${ad} to write README.md`,
  ceoYok: "This project has no CEO; hire one from Team first.",
};
