// Shared password hashing utilities using Web Crypto API (PBKDF2)
// Compatible with Supabase Edge Runtime (no Worker dependency)

const ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(password, salt);
  const keyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  
  const saltHex = bytesToHex(salt);
  const hashHex = bytesToHex(keyBytes);
  return `pbkdf2:${ITERATIONS}:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Support bcrypt hashes from old system (starts with $2)
  if (stored.startsWith("$2")) {
    // Cannot verify old bcrypt hashes in edge runtime
    // They would need to be migrated
    return false;
  }

  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

  const iterations = parseInt(parts[1], 10);
  const salt = hexToBytes(parts[2]);
  const expectedHash = parts[3];

  const key = await deriveKey(password, salt, iterations);
  const keyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  const actualHash = bytesToHex(keyBytes);

  return actualHash === expectedHash;
}

async function deriveKey(password: string, salt: Uint8Array, iterations = ITERATIONS): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH * 8 },
    true,
    ["encrypt"],
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
