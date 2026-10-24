"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminToken, passwordMatches } from "@/lib/admin";

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const password = String(form.get("password") ?? "");
  if (!process.env.ADMIN_PASSWORD) return "Set ADMIN_PASSWORD in the environment first.";
  if (!passwordMatches(password)) return "Wrong password.";
  (await cookies()).set(ADMIN_COOKIE, adminToken(password), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/admin/curate");
}
