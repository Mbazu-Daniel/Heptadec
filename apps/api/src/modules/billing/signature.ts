const TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

export async function isSignedDelivery(
  header: string | null,
  rawBody: string,
  secret: string,
): Promise<boolean> {
  if (header === null || secret === "") {
    return false;
  }
  const parts = header.split(",").map((part) => part.split("="));
  const seconds = Number(parts.find(([name]) => name === "t")?.[1]);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > TOLERANCE_SECONDS) {
    return false;
  }
  const signatures = parts
    .filter(([name]) => name === "v1")
    .map(([, value]) => value ?? "");
  if (signatures.length === 0) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = encoder.encode(`${seconds}.${rawBody}`);
  for (const signature of signatures) {
    const bytes = unhex(signature);
    if (bytes !== null && (await crypto.subtle.verify("HMAC", key, bytes, signed))) {
      return true;
    }
  }
  return false;
}

function unhex(text: string): Uint8Array<ArrayBuffer> | null {
  if (text.length % 2 !== 0) {
    return null;
  }
  const bytes = new Uint8Array(text.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const value = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16);
    if (Number.isNaN(value)) {
      return null;
    }
    bytes[index] = value;
  }
  return bytes;
}
