// Claude Code giriş ve abonelik sorunlarının tanınması
import { describe, expect, it } from "vitest";
import { kimlikSorunuHatadan, kimlikSorunuMetinden } from "./kimlik-hatasi.js";

describe("kimlik sorunu", () => {
  it("SDK'nın hata alanından", () => {
    expect(kimlikSorunuHatadan("authentication_failed")).toBe("giris");
    expect(kimlikSorunuHatadan("oauth_org_not_allowed")).toBe("giris");
    expect(kimlikSorunuHatadan("verification_required")).toBe("giris");
    expect(kimlikSorunuHatadan("billing_error")).toBe("abonelik");
    expect(kimlikSorunuHatadan("rate_limit")).toBeNull();
    expect(kimlikSorunuHatadan("overloaded")).toBeNull();
    expect(kimlikSorunuHatadan(undefined)).toBeNull();
  });

  it("çöken oturumun hata ve stderr metninden", () => {
    expect(kimlikSorunuMetinden("Claude Code process exited with code 1 · Invalid API key · Please run /login")).toBe("giris");
    expect(kimlikSorunuMetinden("OAuth token has expired. Please obtain a new token or refresh your existing token.")).toBe("giris");
    expect(kimlikSorunuMetinden('API Error: 401 {"type":"error","error":{"type":"authentication_error"}}')).toBe("giris");
    expect(kimlikSorunuMetinden("Your credit balance is too low to access the Anthropic API")).toBe("abonelik");
    expect(kimlikSorunuMetinden("Claude Code process exited with code 1 · ENOENT spawn git")).toBeNull();
    expect(kimlikSorunuMetinden("Not logged in · Please run /login")).toBe("giris");
    expect(kimlikSorunuMetinden("Request timed out after 4010 ms")).toBeNull();
    expect(kimlikSorunuMetinden("Claude Code process exited with code 1 · test 401 failed")).toBeNull();
    expect(kimlikSorunuMetinden("You are not logged into any GitHub hosts. To log in, run: gh auth login")).toBeNull();
    expect(kimlikSorunuMetinden("fetch failed: GitHub token expired")).toBeNull();
  });
});
