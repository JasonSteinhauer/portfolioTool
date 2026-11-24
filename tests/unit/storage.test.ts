import { describe, expect, it, vi } from "vitest";
import { createStorageFromEnv } from "@/lib/storage/factory";
import { LocalStorage, storageKeyFor } from "@/lib/storage/local";
import { R2Storage } from "@/lib/storage/r2";

const KEY = storageKeyFor("a".repeat(64));
const config = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "test-access-key-0001",
  // Synthetisch, zur Laufzeit gebaut (kein echter Schlüssel)
  secretAccessKey: ["test", "secret"].join("-").padEnd(40, "x"),
  bucket: "portfolio-media",
};

describe("Speicher-Auswahl", () => {
  it("lokal ist Standard, R2 verlangt vollständige Angaben", () => {
    expect(createStorageFromEnv({})).toBeInstanceOf(LocalStorage);
    expect(() => createStorageFromEnv({ MEDIA_STORAGE: "r2" })).toThrow(/R2_ACCOUNT_ID/);
    const r2 = createStorageFromEnv({
      MEDIA_STORAGE: "r2",
      R2_ACCOUNT_ID: config.accountId,
      R2_ACCESS_KEY_ID: config.accessKeyId,
      R2_SECRET_ACCESS_KEY: config.secretAccessKey,
      R2_BUCKET: config.bucket,
    });
    expect(r2).toBeInstanceOf(R2Storage);
  });
});

describe("R2-Adapter", () => {
  it("signiert Anfragen (SigV4) an den privaten Bucket", async () => {
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(null, { status: 200 }));
    const storage = new R2Storage(config, fetchMock as unknown as typeof fetch);
    await storage.put(KEY, new Uint8Array([1, 2, 3]));
    const request = fetchMock.mock.calls[0][0];
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(`https://${config.accountId}.r2.cloudflarestorage.com/portfolio-media/${KEY}`);
    expect(request.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=test-access-key-0001\/\d{8}\/auto\/s3\/aws4_request/,
    );
    expect(request.headers.get("x-amz-content-sha256")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("liefert null bei 404 und Datenstrom sonst", async () => {
    const responses = [
      new Response(null, { status: 404 }),
      new Response(new Uint8Array([7, 8]), { headers: { "content-length": "2" } }),
    ];
    const storage = new R2Storage(config, (async () => responses.shift()!) as unknown as typeof fetch);
    expect(await storage.get(KEY)).toBeNull();
    const file = await storage.get(KEY);
    expect(file?.size).toBe(2);
    expect(new Uint8Array(await new Response(file!.stream).arrayBuffer())).toEqual(new Uint8Array([7, 8]));
  });

  it("lehnt ungültige Schlüssel ab und meldet Fehler ohne Details", async () => {
    const storage = new R2Storage(
      config,
      (async () => new Response("<Error>secret</Error>", { status: 403 })) as unknown as typeof fetch,
    );
    await expect(storage.put("../etc/passwd", new Uint8Array())).rejects.toThrow(/Ungültiger/);
    await expect(storage.put(KEY, new Uint8Array([1]))).rejects.toThrow("R2 PUT fehlgeschlagen (403)");
  });
});
