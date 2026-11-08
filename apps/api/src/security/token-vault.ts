import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const AAD = Buffer.from("online4tech-publisher:meta-token:v1", "utf8");

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key");
  }
  return key;
}

function decodePart(value: string): Buffer {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error("Invalid encrypted token envelope");
  }
  return decoded;
}

/**
 * Creates an AES-256-GCM token vault.
 * Store only the returned envelope in the database; keep the key in the backend secret store.
 */
export function createTokenVault(encodedKey: string) {
  const key = decodeKey(encodedKey);

  return {
    encrypt(plaintext: string): string {
      if (!plaintext) throw new Error("Token value cannot be empty");

      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      cipher.setAAD(AAD);

      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return [
        VERSION,
        iv.toString("base64url"),
        authTag.toString("base64url"),
        ciphertext.toString("base64url"),
      ].join(".");
    },

    decrypt(envelope: string): string {
      try {
        const parts = envelope.split(".");
        if (parts.length !== 4 || parts[0] !== VERSION) {
          throw new Error("Invalid encrypted token envelope");
        }

        const iv = decodePart(parts[1]);
        const authTag = decodePart(parts[2]);
        const ciphertext = decodePart(parts[3]);

        if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH || ciphertext.length === 0) {
          throw new Error("Invalid encrypted token envelope");
        }

        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAAD(AAD);
        decipher.setAuthTag(authTag);

        return Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        // Do not include ciphertext, keys, or underlying crypto details in the error.
        throw new Error("Encrypted token could not be decrypted");
      }
    },
  };
}
