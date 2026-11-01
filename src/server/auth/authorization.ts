export type OperatorRole = "operator" | "admin";

export interface AuthenticatedPrincipal {
  readonly id: string;
  readonly email: string | undefined;
  readonly appMetadata: Readonly<Record<string, unknown>>;
}

export type AuthorizationResult =
  | { readonly authorized: true; readonly principalId: string; readonly role: OperatorRole }
  | { readonly authorized: false; readonly status: 401 | 403; readonly code: string };

export function authorizeOperator(
  principal: AuthenticatedPrincipal | null,
  allowlistedEmail: string,
): AuthorizationResult {
  if (!principal) {
    return { authorized: false, status: 401, code: "AUTHENTICATION_REQUIRED" };
  }
  if (!principal.email || principal.email.toLowerCase() !== allowlistedEmail.toLowerCase()) {
    return { authorized: false, status: 403, code: "OPERATOR_EMAIL_NOT_ALLOWED" };
  }
  const role = principal.appMetadata.role;
  if (role !== "operator" && role !== "admin") {
    return { authorized: false, status: 403, code: "OPERATOR_ROLE_REQUIRED" };
  }
  return { authorized: true, principalId: principal.id, role };
}
