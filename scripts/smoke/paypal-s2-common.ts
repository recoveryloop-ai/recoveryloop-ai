import { createClient } from "@supabase/supabase-js";

import { requireEnvironment } from "./common";

export async function getOperatorAccessToken(): Promise<string> {
  const supabase = createClient(
    requireEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await supabase.auth.signInWithPassword({
    email: requireEnvironment("DEMO_OPERATOR_EMAIL"),
    password: requireEnvironment("DEMO_OPERATOR_PASSWORD"),
  });
  if (error || !data.session) throw new Error("S2_OPERATOR_SIGN_IN_FAILED");
  return data.session.access_token;
}
