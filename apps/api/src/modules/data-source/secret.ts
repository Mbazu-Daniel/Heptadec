import { InternalServerException } from "../../common/exceptions";

const ENVELOPE = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function secretKey(): Promise<CryptoKey> {
  const raw = process.env.HEPTADEC_SECRET_KEY ?? "";
  const bytes = fromBase64(raw);
  if (bytes.length !== KEY_BYTES) {
    throw new InternalServerException("Data source storage is not configured");
  }
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await secretKey(),
      new TextEncoder().encode(plaintext),
    ),
  );
  return `${ENVELOPE}:${toBase64(iv)}:${toBase64(sealed)}`;
}

export async function decryptSecret(envelope: string): Promise<string> {
  const [version, ivText, payloadText] = envelope.split(":");
  if (version !== ENVELOPE || !ivText || !payloadText) {
    throw new InternalServerException("Data source storage is not configured");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivText), tagLength: 128 },
    await secretKey(),
    fromBase64(payloadText),
  );
  return new TextDecoder().decode(plaintext);
}
