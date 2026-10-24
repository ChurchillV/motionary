import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";

export const ADMIN_COOKIE = "admin_token";

/** Cookie value derived from the password, so the password itself is never stored. */
export function adminToken(password: string): string {
  return createHash("sha256").update(`motionary-admin:${password}`).digest("hex");
}

export function passwordMatches(input: string): boolean {
  if (!config.adminPassword) return false;
  const a = Buffer.from(adminToken(input));
  const b = Buffer.from(adminToken(config.adminPassword));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  if (!config.adminPassword) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value ?? "";
  const expected = adminToken(config.adminPassword);
  return token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
