#!/usr/bin/env node
import { pbkdf2Sync, randomBytes } from "node:crypto";
import process from "node:process";

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
  process.stderr.write("Run this command in an interactive terminal so the password can be entered without echo.\n");
  process.exit(1);
}

process.stdout.write("New Publisher admin password (hidden input): ");
process.stdin.setRawMode(true);
process.stdin.resume();

let password = "";
let finished = false;

function finish(cancelled = false) {
  if (finished) return;
  finished = true;
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write("\n");
  if (cancelled) {
    process.stderr.write("Cancelled. No hash was generated.\n");
    process.exitCode = 1;
    return;
  }
  if (password.length < 12 || password.length > 256) {
    process.stderr.write("Password must be between 12 and 256 characters. No hash was generated.\n");
    process.exitCode = 1;
    password = "";
    return;
  }
  const iterations = 600_000;
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, iterations, 64, "sha256");
  password = "";
  process.stdout.write(
    "Copy this value directly into the Cloudflare Worker secret ADMIN_PASSWORD_HASH. Do not commit it or send it in chat:\n",
  );
  process.stdout.write(
    `pbkdf2-sha256$${iterations}$${salt.toString("base64url")}$${hash.toString("base64url")}\n`,
  );
}

process.stdin.on("data", (chunk) => {
  for (const character of chunk.toString("utf8")) {
    if (character === "\u0003") {
      finish(true);
      return;
    }
    if (character === "\r" || character === "\n") {
      finish(false);
      return;
    }
    if (character === "\u007f" || character === "\b") {
      password = password.slice(0, -1);
      continue;
    }
    if (character >= " " && character !== "\u007f") password += character;
  }
});
