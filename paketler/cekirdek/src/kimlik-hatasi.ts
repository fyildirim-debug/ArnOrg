// Claude Code'un giriş ve abonelik sorunları. Ajan oturumu bunları yakalayınca kurulum durumu tazelenir ve Stüdyo
// her ekranda giriş asistanını gösterir. Asıl kaynak SDK'nın yapısal hata alanıdır (asistan mesajındaki error);
// oturum hiç açılamadan çöktüğünde hata ve stderr metnine bakılır.

export type KimlikSorunu = "giris" | "abonelik";

/** SDK'nın asistan mesajındaki hata alanından (authentication_failed, billing_error…) */
export function kimlikSorunuHatadan(hata: string | null | undefined): KimlikSorunu | null {
  switch (hata) {
    case "authentication_failed":
    case "oauth_org_not_allowed":
    case "verification_required":
    case "account_on_hold":
      return "giris";
    case "billing_error":
      return "abonelik";
    default:
      return null;
  }
}

/** Claude Code'un kendi giriş hatası ifadeleri; yalın "401" ya da "token expired" başka bir aracın çıktısında da geçebilir */
const GIRIS_HATASI =
  /invalid api key|run \/login|not logged in\b|oauth token (?:has )?expired|authentication[_ ]error|authentication_failed|invalid bearer token|api error: 401\b/i;
const ABONELIK_HATASI = /billing_error|credit balance is too low|subscription (?:has )?expired/i;

/** Oturum çöktüğünde hata ve stderr metninden (yedek yol) */
export function kimlikSorunuMetinden(metin: string): KimlikSorunu | null {
  if (GIRIS_HATASI.test(metin)) return "giris";
  if (ABONELIK_HATASI.test(metin)) return "abonelik";
  return null;
}
