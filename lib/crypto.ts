import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey() {
  const value = process.env.ENCRYPTION_KEY;
  if (!value || !/^[\da-fA-F]{64}$/.test(value)) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hexadecimal value.");
  }
  return Buffer.from(value, "hex");
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(payload: string): string {
  const data = Buffer.from(payload, "base64");
  if (data.length < 29) throw new Error("Encrypted credential payload is invalid.");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}