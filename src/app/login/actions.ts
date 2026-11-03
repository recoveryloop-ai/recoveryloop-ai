"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { authorizeOperator } from "@/server/auth/authorization";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";

const loginSchema = z.object({ email: z.email(), password: z.string().min(12).max(256) });

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login?error=invalid");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) redirect("/login?error=invalid");

  const authorization = authorizeOperator(
    { id: data.user.id, email: data.user.email, appMetadata: data.user.app_metadata },
    process.env.DEMO_OPERATOR_EMAIL ?? "",
  );
  if (!authorization.authorized) {
    console.warn("operator_login_denied", { code: authorization.code });
    await supabase.auth.signOut();
    redirect("/login?error=forbidden");
  }
  redirect("/store");
}
