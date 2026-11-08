import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { createTokenVault } from "./token-vault.js";

const key = randomBytes(32).toString("base64");

test("encrypts and decrypts a token", () => {
  const vault = createTokenVault(key);
  const token = "sample-token-value-that-is-not-a-real-credential";
  assert.equal(vault.decrypt(vault.encrypt(token)), token);
});

test("uses a fresh IV for each encryption", () => {
  const vault = createTokenVault(key);
  const token = "same-input";
  assert.notEqual(vault.encrypt(token), vault.encrypt(token));
});

test("rejects invalid encryption keys", () => {
  assert.throws(() => createTokenVault("not-a-valid-key"));
  assert.throws(() => createTokenVault(Buffer.alloc(16).toString("base64")));
});

test("rejects tampered ciphertext", () => {
  const vault = createTokenVault(key);
  const encrypted = vault.encrypt("token-to-protect");
  const parts = encrypted.split(".");
  parts[3] = `${parts[3].slice(0, -1)}${parts[3].endsWith("A") ? "B" : "A"}`;
  assert.throws(() => vault.decrypt(parts.join(".")), /could not be decrypted/);
});

test("rejects decryption with a different key", () => {
  const vault = createTokenVault(key);
  const otherVault = createTokenVault(randomBytes(32).toString("base64"));
  assert.throws(() => otherVault.decrypt(vault.encrypt("protected-token")), /could not be decrypted/);
});
