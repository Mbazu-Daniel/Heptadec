import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { InternalServerException } from "../../common/exceptions";

const ENVELOPE = "v1";

function secretKey(): Buffer {
  const raw = process.env.HEPTADEC_SECRET_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new InternalServerException("Data source storage is not configured");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE}:${iv.toString("base64")}:${Buffer.concat([ciphertext, tag]).toString("base64")}`;
}

export function decryptSecret(envelope: string): string {
  const [version, ivText, payloadText] = envelope.split(":");
  if (version !== ENVELOPE || !ivText || !payloadText) {
    throw new InternalServerException("Data source storage is not configured");
  }
  const payload = Buffer.from(payloadText, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretKey(),
    Buffer.from(ivText, "base64"),
  );
  decipher.setAuthTag(payload.subarray(payload.length - 16));
  const plaintext = Buffer.concat([
    decipher.update(payload.subarray(0, payload.length - 16)),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
