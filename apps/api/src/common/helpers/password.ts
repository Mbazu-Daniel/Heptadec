const MAX_ITERATIONS = 100_000;
const ITERATIONS = MAX_ITERATIONS;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const PREFIX = "$pbkdf2-sha256$";

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

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt, ITERATIONS);
  return `${PREFIX}${ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

export async function verifyPassword(data: {
  password: string;
  hash: string;
}): Promise<boolean> {
  if (!data.hash.startsWith(PREFIX)) {
    return false;
  }
  const [iterationsText, saltText, expectedText] = data.hash
    .slice(PREFIX.length)
    .split("$");
  if (
    iterationsText === undefined ||
    saltText === undefined ||
    expectedText === undefined
  ) {
    return false;
  }
  const iterations = Number.parseInt(iterationsText, 10);
  if (!Number.isSafeInteger(iterations) || iterations <= 0) {
    return false;
  }
  if (iterations > MAX_ITERATIONS) {
    console.error(
      `[api] stored password hash asks for ${iterations} iterations, above the ${MAX_ITERATIONS} this runtime supports; the account needs a password reset`,
    );
    return false;
  }
  const actual = await derive(data.password, fromBase64(saltText), iterations);
  const expected = fromBase64(expectedText);
  return matches(actual, expected);
}

function matches(actual: Uint8Array, expected: Uint8Array): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  let difference = 0;
  actual.forEach((byte, index) => {
    const other = expected[index];
    if (other !== undefined) {
      difference |= byte ^ other;
    }
  });
  return difference === 0;
}
