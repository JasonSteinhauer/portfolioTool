import { createHmac } from "node:crypto";

/**
 * Minimaler TOTP-Generator (RFC 6238, HMAC-SHA1, 6 Stellen, 30 s) – nur für Tests,
 * damit End-to-End-Tests die 2FA wie eine echte Authenticator-App bedienen können.
 */
export function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`Ungültiges Base32-Zeichen: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function hotp(key: Buffer, counter: number, digits = 6): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, "0");
}

export function totp(base32Secret: string, timeMs = Date.now(), stepSeconds = 30): string {
  return hotp(base32Decode(base32Secret), Math.floor(timeMs / 1000 / stepSeconds));
}
