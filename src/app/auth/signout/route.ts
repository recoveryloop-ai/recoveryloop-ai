import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { assertTrustedOrigin } from "@/server/http/request-security";

export async function POST(request: Request) {
  assertTrustedOrigin(request);
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
