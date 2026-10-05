// Üst çubuktaki kısa token biçimi (0.0.8): Türkçe "1,2 M", İngilizce "1.2M"
import { afterEach, describe, expect, it } from "vitest";
import { useDilDurumu } from "../dil";
import { kisaToken } from "./bicim";

describe("kısa token", () => {
  afterEach(() => useDilDurumu.setState({ dil: "tr" }));

  it("Türkçe: bin, milyon (M), milyar (Mr); yuvarlama üst birime taşar", () => {
    useDilDurumu.setState({ dil: "tr" });
    expect(kisaToken(0)).toBe("0");
    expect(kisaToken(null)).toBe("0");
    expect(kisaToken(950)).toBe("950");
    expect(kisaToken(48_400)).toBe("48 bin");
    expect(kisaToken(999_499)).toBe("999 bin");
    expect(kisaToken(999_500)).toBe("1 M");
    expect(kisaToken(1_234_567)).toBe("1,2 M");
    expect(kisaToken(9_500_000)).toBe("9,5 M");
    expect(kisaToken(999_949_999)).toBe("999,9 M");
    expect(kisaToken(999_950_000)).toBe("1 Mr");
    expect(kisaToken(3_420_000_000)).toBe("3,4 Mr");
  });

  it("İngilizce: k, M, B", () => {
    useDilDurumu.setState({ dil: "en" });
    expect(kisaToken(950)).toBe("950");
    expect(kisaToken(48_400)).toBe("48k");
    expect(kisaToken(1_234_567)).toBe("1.2M");
    expect(kisaToken(12_000_000)).toBe("12M");
    expect(kisaToken(3_420_000_000)).toBe("3.4B");
  });
});
