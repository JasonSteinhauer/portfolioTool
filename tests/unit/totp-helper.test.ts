import { describe, expect, it } from "vitest";
import { base32Decode, hotp, totp } from "../support/totp";

// Testvektoren aus RFC 4226 (Anhang D) und RFC 6238 (Anhang B, SHA-1, 8 Stellen → hier 6).
describe("TOTP-Testhelfer", () => {
  const rfcKey = Buffer.from("12345678901234567890", "ascii");

  it("erfüllt die HOTP-Testvektoren aus RFC 4226", () => {
    const expected = [
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489",
    ];
    expected.forEach((code, counter) => expect(hotp(rfcKey, counter)).toBe(code));
  });

  it("erfüllt die TOTP-Testvektoren aus RFC 6238", () => {
    // Base32 von "12345678901234567890"
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // gitleaks:allow – öffentlicher RFC-6238-Testvektor
    expect(base32Decode(secret).equals(rfcKey)).toBe(true);
    expect(totp(secret, 59_000)).toBe("287082");
    expect(totp(secret, 1_111_111_109_000)).toBe("081804");
    expect(totp(secret, 1_234_567_890_000)).toBe("005924");
    expect(totp(secret, 2_000_000_000_000)).toBe("279037");
  });
});
