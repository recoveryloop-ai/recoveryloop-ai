import { AppError } from "./app-error";

export function assertTrustedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) throw new AppError("ORIGIN_REQUIRED", 403);

  const allowedOrigins = new Set([new URL(request.url).origin]);
  const configuredBaseUrl = process.env.APP_BASE_URL;
  if (configuredBaseUrl) allowedOrigins.add(new URL(configuredBaseUrl).origin);

  if (!allowedOrigins.has(origin)) throw new AppError("ORIGIN_NOT_ALLOWED", 403);
}
