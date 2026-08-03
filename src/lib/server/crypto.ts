import crypto from "crypto";

// Chave de criptografia para segredos guardados no banco (ex: senha SMTP).
// Prioriza SETTINGS_ENCRYPTION_KEY dedicada; cai para AUTH_SECRET/DATABASE_URL
// para funcionar sem config extra, no mesmo espírito de src/lib/server/auth.ts.
function encryptionKey(): Buffer {
  const raw =
    process.env.SETTINGS_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    "dev-insecure-fallback";
  return crypto.createHash("sha256").update(raw).digest();
}

/** Criptografa um texto (ex: senha SMTP) para guardar no banco. Formato: iv:tag:ciphertext (base64). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString("base64")).join(":");
}

/** Reverte encryptSecret. Lança erro se o valor estiver corrompido ou a chave tiver mudado. */
export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
