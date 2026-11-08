import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { createTokenVault } from "./token-vault.js";

test("token vault round-trips AES-256-GCM envelopes", () => {
  const key = randomBytes(32).toString("base64");
  const vault = createTokenVault(key);
  const envelope = vault.encrypt("test-meta-access-token");
  assert.match(envelope, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(vault.decrypt(envelope), "test-meta-access-token");
});

test("token vault rejects tampered ciphertext and invalid keys", () => {
  const key = randomBytes(32).toString("base64");
  const vault = createTokenVault(key);
  const envelope = vault.encrypt("test-meta-access-token");
  const parts = envelope.split(".");
  parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
  assert.throws(() => vault.decrypt(parts.join(".")), /could not be decrypted/);
  assert.throws(() => createTokenVault("not-a-valid-key"), /32-byte key/);
});
