import { authorizeOperator, type AuthorizationResult } from "./authorization";
import { createSupabaseServerClient } from "./supabase-server";

export async function requireOperator(request?: Request): Promise<AuthorizationResult> {
  const supabase = await createSupabaseServerClient();
  const authorizationHeader = request?.headers.get("authorization");
  const bearerToken = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : undefined;
  const { data, error } = await supabase.auth.getUser(bearerToken);

  if (error || !data.user) {
    return authorizeOperator(null, process.env.DEMO_OPERATOR_EMAIL ?? "");
  }

  return authorizeOperator(
    {
      id: data.user.id,
      email: data.user.email,
      appMetadata: data.user.app_metadata,
    },
    process.env.DEMO_OPERATOR_EMAIL ?? "",
  );
}
