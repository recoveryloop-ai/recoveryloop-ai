const baseUrl = (process.env.RELEASE_BASE_URL ?? "https://recoveryloop-ai.vercel.app").replace(/\/$/, "");
const repositoryUrl = process.env.RELEASE_REPOSITORY_URL ?? "https://github.com/recoveryloop-ai/recoveryloop-ai";
const rawRepositoryUrl = process.env.RELEASE_RAW_REPOSITORY_URL ?? "https://raw.githubusercontent.com/recoveryloop-ai/recoveryloop-ai/main";
const timeoutMs = 30_000;
const results = [];

function record(name, details = {}) {
  results.push({ name, status: "PASS", ...details });
}

async function request(pathOrUrl, init = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
  return fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs), ...init });
}

function assert(condition, code, details) {
  if (!condition) throw new Error(`${code}${details ? `:${details}` : ""}`);
}

function cookiePair(setCookie) {
  return setCookie.split(";", 1)[0];
}

const publicRoutes = [
  ["/", "landing"],
  ["/app", "command"],
  ["/app/cases", "cases"],
  ["/app/orders", "orders"],
  ["/app/recovery", "recovery"],
  ["/app/actions", "actions"],
  ["/app/demo", "demo"],
  ["/app/settings", "settings"],
];

try {
  assert(new URL(baseUrl).protocol === "https:", "RELEASE_HTTPS_REQUIRED", baseUrl);
  for (const [path, label] of publicRoutes) {
    const response = await request(path);
    assert(response.status === 200, "PUBLIC_ROUTE_FAILED", `${path}:${response.status}`);
    if (path === "/") {
      assert(response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "CSP_MISSING");
      assert(response.headers.get("strict-transport-security")?.includes("max-age="), "HSTS_MISSING");
    }
    record(`public:${label}`, { path, statusCode: response.status });
  }

  const sessionResponse = await request("/api/demo/state");
  assert(sessionResponse.status === 200, "DEMO_SESSION_FAILED", String(sessionResponse.status));
  const setCookie = sessionResponse.headers.get("set-cookie") ?? "";
  assert(/recoveryloop_judge=/.test(setCookie), "JUDGE_COOKIE_MISSING");
  assert(/HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=Lax/i.test(setCookie), "JUDGE_COOKIE_FLAGS_INVALID");
  const cookie = cookiePair(setCookie);
  const baseline = await sessionResponse.json();
  assert(baseline.scenario === "BASELINE" && baseline.after?.proposedRefundMinor === 10_000, "BASELINE_PROJECTION_INVALID");
  record("judge-session-cookie", { httpOnly: true, secure: true, sameSite: "Lax", baselineProposedMinor: 10_000 });

  const overlayResponse = await request("/api/demo/overlay", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: baseUrl },
    body: JSON.stringify({ scenario: "ALREADY_REFUNDED" }),
  });
  assert(overlayResponse.status === 200, "OVERLAY_WRITE_FAILED", String(overlayResponse.status));
  const projectedResponse = await request("/api/demo/state", { headers: { Cookie: cookie } });
  const projected = await projectedResponse.json();
  assert(projected.scenario === "ALREADY_REFUNDED", "OVERLAY_NOT_PERSISTED");
  assert(projected.after?.proposedRefundMinor === 0 && projected.after?.reasonCodes?.includes("REFUND_ALREADY_SETTLED"), "OVERLAY_DIFF_INVALID");
  assert(projected.providerWrite === false, "OVERLAY_PROVIDER_WRITE_FLAG_INVALID");
  record("isolated-overlay", { scenario: projected.scenario, proposedMinor: 0, reason: "REFUND_ALREADY_SETTLED" });

  const resetResponse = await request("/api/demo/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: baseUrl },
    body: "{}",
  });
  assert(resetResponse.status === 200, "OVERLAY_RESET_FAILED", String(resetResponse.status));
  const resetState = await (await request("/api/demo/state", { headers: { Cookie: cookie } })).json();
  assert(resetState.scenario === "BASELINE" && resetState.after?.proposedRefundMinor === 10_000, "RESET_BASELINE_INVALID");
  record("safe-reset", { scenario: resetState.scenario, canonicalLedgerMutated: false });

  const anonymousAttempts = [
    ["/api/paypal/orders", { sku: "RL-A250" }],
    ["/api/cases/RG-2048/proposals", { mode: "deterministic" }],
    ["/api/proposals/11111111-1111-4111-8111-111111111111/approve", { snapshot_hash: "a".repeat(64), confirmation: "invalid" }],
    ["/api/actions/11111111-1111-4111-8111-111111111111/execute", { confirmation: "invalid" }],
    ["/api/actions/11111111-1111-4111-8111-111111111111/reconcile", { mode: "provider_readback" }],
  ];
  for (const [path, body] of anonymousAttempts) {
    const response = await request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify(body),
    });
    assert(response.status === 401 || response.status === 403, "ANONYMOUS_MONEY_ROUTE_OPEN", `${path}:${response.status}`);
  }
  record("anonymous-money-denial", { attemptedRoutes: anonymousAttempts.length, allowedStatuses: [401, 403] });

  const certificateResponse = await request("/api/cases/RG-2052/certificate");
  assert(certificateResponse.status === 200, "CERTIFICATE_UNAVAILABLE", String(certificateResponse.status));
  const certificate = await certificateResponse.json();
  assert(certificate.provider === "PAYPAL_SANDBOX", "CERTIFICATE_PROVIDER_INVALID");
  assert(certificate.refundStatus === "COMPLETED" && certificate.refundAmountMinor === 10_000, "CERTIFICATE_REFUND_INVALID");
  assert(typeof certificate.captureId === "string" && certificate.captureId.includes("…"), "CERTIFICATE_CAPTURE_ID_NOT_REDACTED");
  assert(typeof certificate.refundId === "string" && certificate.refundId.includes("…"), "CERTIFICATE_REFUND_ID_NOT_REDACTED");
  record("provider-certificate", { provider: certificate.provider, captureMinor: certificate.captureAmountMinor, refundMinor: certificate.refundAmountMinor, redacted: true });

  const repositoryResponse = await request(repositoryUrl);
  const readmeResponse = await request(`${rawRepositoryUrl}/README.md`);
  const licenseResponse = await request(`${rawRepositoryUrl}/LICENSE`);
  assert(repositoryResponse.status === 200, "PUBLIC_REPOSITORY_UNAVAILABLE", String(repositoryResponse.status));
  assert(readmeResponse.status === 200 && (await readmeResponse.text()).includes("RecoveryLoop AI"), "PUBLIC_README_UNAVAILABLE");
  assert(licenseResponse.status === 200 && (await licenseResponse.text()).startsWith("MIT License"), "PUBLIC_LICENSE_UNAVAILABLE");
  record("public-repository", { repositoryUrl, readme: true, license: "MIT" });

  console.log(JSON.stringify({
    status: "PASS",
    operation: "verify-s8-release",
    baseUrl,
    repositoryUrl,
    providerWrites: 0,
    checks: results,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL",
    operation: "verify-s8-release",
    baseUrl,
    completedChecks: results,
    error: error instanceof Error ? error.message : "UNKNOWN_RELEASE_ERROR",
  }, null, 2));
  process.exitCode = 1;
}
