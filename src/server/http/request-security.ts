import { AppError } from "./app-error";

export function assertTrustedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) throw new AppError("ORIGIN_REQUIRED", 403);

  const requestUrl = new URL(request.url);
  const allowedOrigins = new Set([requestUrl.origin]);
  const host = request.headers.get("host") ?? request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? requestUrl.protocol.slice(0, -1);
  if (host && (protocol === "http" || protocol === "https")) allowedOrigins.add(`${protocol}://${host}`);
  const configuredBaseUrl = process.env.APP_BASE_URL;
  if (configuredBaseUrl) allowedOrigins.add(new URL(configuredBaseUrl).origin);

  if (!allowedOrigins.has(origin)) throw new AppError("ORIGIN_NOT_ALLOWED", 403);
}
