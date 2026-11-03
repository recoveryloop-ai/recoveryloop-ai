import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { assertTrustedOrigin } from "@/server/http/request-security";
import { routeErrorResponse } from "@/server/http/route-error";

export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    return NextResponse.redirect(new URL("/", request.headers.get("origin")!), { status: 303 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
