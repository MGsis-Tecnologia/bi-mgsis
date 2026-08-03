import crypto from "crypto";

/** Gera um token aleatório e seu hash (o que é guardado no banco — nunca o token puro). */
export function generateToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
