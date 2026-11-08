import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearSessionCookie,
  createAdminSession,
  newPasswordHash,
  readCookie,
  sessionCookie,
  verifyAdminPassword,
  verifyAdminSession,
} from "./admin-auth.js";

const secret = Buffer.alloc(32, 7).toString("base64");
const now = 1_800_000_000_000;

test("admin password hash verifies without storing plaintext", () => {
  const hash = newPasswordHash("a-long-test-password");
  assert.match(hash, /^scrypt\$/);
  assert.equal(verifyAdminPassword("a-long-test-password", hash), true);
  assert.equal(verifyAdminPassword("wrong-password", hash), false);
});

test("signed session validates and expires", () => {
  const token = createAdminSession(secret, now);
  assert.equal(verifyAdminSession(token, secret, now), true);
  assert.equal(verifyAdminSession(token, secret, now + 8 * 60 * 60 * 1000 + 1000), false);
});

test("session rejects tampering and a different signing key", () => {
  const token = createAdminSession(secret, now);
  const [payload, signature] = token.split(".");
  const changedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  const changed = `${payload}.${changedSignature}`;
  assert.equal(verifyAdminSession(changed, secret, now), false);
  assert.equal(verifyAdminSession(token, Buffer.alloc(32, 8).toString("base64"), now), false);
});

test("cookie helpers set secure browser protections and clear correctly", () => {
  const cookie = sessionCookie("opaque-token", true);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(readCookie("other=x; o4t_admin_session=opaque-token"), "opaque-token");
  assert.match(clearSessionCookie(false), /Max-Age=0/);
});
