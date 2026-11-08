import { randomBytes, scryptSync } from "node:crypto";

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
  console.error("Run this command in an interactive terminal; the password is never read from command arguments.");
  process.exit(1);
}

process.stdout.write("Enter a new admin password (input hidden): ");
let password = "";
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

const finish = () => {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write("\n");
  if (password.length < 12) {
    console.error("Use at least 12 characters. No hash was generated.");
    process.exit(1);
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  password = "";
  console.log("ADMIN_PASSWORD_HASH=scrypt$" + salt.toString("base64url") + "$" + hash.toString("base64url"));
  console.log("Copy the hash directly into your backend secret store. Do not share it in chat or commit it.");
};

process.stdin.on("data", (chunk) => {
  for (const char of chunk) {
    if (char === "\u0003") {
      password = "";
      process.stdin.setRawMode(false);
      process.exit(130);
    }
    if (char === "\r" || char === "\n") {
      finish();
      return;
    }
    if (char === "\u007f" || char === "\b") password = password.slice(0, -1);
    else if (char >= " " && char <= "~") password += char;
  }
});
