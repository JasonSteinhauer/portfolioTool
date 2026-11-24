import { createHash } from "node:crypto";
import { AwsClient } from "aws4fetch";
import type { StoragePort } from "./local";

/**
 * Cloudflare R2 (S3-kompatibel) als Medienspeicher für den Betrieb auf Vercel (dort ist das
 * Dateisystem nicht beschreibbar). Signiert Anfragen mit AWS SigV4 (aws4fetch, ohne AWS-SDK).
 * Der Bucket bleibt privat – ausgeliefert wird ausschließlich über die eigenen Routen der App.
 */
const KEY_PATTERN = /^sha256\/[0-9a-f]{2}\/[0-9a-f]{64}$/;

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export class R2Storage implements StoragePort {
  private readonly client: AwsClient;
  private readonly base: string;

  constructor(
    config: R2Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto",
    });
    this.base = `https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}`;
  }

  private url(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error("Ungültiger Speicherschlüssel");
    return `${this.base}/${key}`;
  }

  private async send(key: string, init: RequestInit): Promise<Response> {
    const signed = await this.client.sign(this.url(key), init);
    return this.fetchImpl(signed);
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const response = await this.send(key, {
      method: "PUT",
      body: bytes as Uint8Array<ArrayBuffer>,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.byteLength),
        // Signierter Inhalts-Hash: R2 lehnt die Anfrage ab, wenn die Daten unterwegs verändert wurden.
        "x-amz-content-sha256": createHash("sha256").update(bytes).digest("hex"),
      },
    });
    if (!response.ok) throw new Error(`R2 PUT fehlgeschlagen (${response.status})`);
  }

  async get(key: string) {
    const response = await this.send(key, { method: "GET" });
    if (response.status === 404) return null;
    if (!response.ok || !response.body) throw new Error(`R2 GET fehlgeschlagen (${response.status})`);
    return { stream: response.body, size: Number(response.headers.get("content-length") ?? 0) };
  }

  async delete(key: string): Promise<void> {
    const response = await this.send(key, { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error(`R2 DELETE fehlgeschlagen (${response.status})`);
  }
}
