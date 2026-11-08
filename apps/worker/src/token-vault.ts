import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const AAD = Buffer.from("online4tech-publisher:meta-token:v1", "utf8");

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be canonical base64-encoded 32-byte key");
  }
  return key;
}

function decodePart(value: string): Buffer {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error("Invalid token envelope");
  return decoded;
}

/** AES-256-GCM envelope compatible with the existing API token vault. */
export function createTokenVault(encodedKey: string) {
  const key = decodeKey(encodedKey);
  return {
    encrypt(plaintext: string): string {
      if (!plaintext) throw new Error("Token value cannot be empty");
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      cipher.setAAD(AAD);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return [
        VERSION,
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        ciphertext.toString("base64url"),
      ].join(".");
    },
    decrypt(envelope: string): string {
      try {
        const parts = envelope.split(".");
        if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Invalid token envelope");
        const iv = decodePart(parts[1]);
        const tag = decodePart(parts[2]);
        const ciphertext = decodePart(parts[3]);
        if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH || ciphertext.length === 0) {
          throw new Error("Invalid token envelope");
        }
        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAAD(AAD);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      } catch {
        throw new Error("Encrypted token could not be decrypted");
      }
    },
  };
}
