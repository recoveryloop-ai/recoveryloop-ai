import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { createDatabase } from "../../db/client";
import { AppError } from "../../http/app-error";

export const judgeCookieName = "recoveryloop_judge";
export const judgeSessionTtlSeconds = 45 * 60;
export const judgeRequestLimit = 120;

import { caseworkScenarios, type CaseworkScenario } from "../casework/contracts";
export type DemoScenario = CaseworkScenario;
export const mutableDemoScenarios = caseworkScenarios.filter((scenario): scenario is Exclude<DemoScenario, "BASELINE"> => scenario !== "BASELINE");

export type JudgeSession = {
  id: string;
  scenario: DemoScenario;
  expiresAt: string;
  cookieValue?: string;
};

function signingSecret(): string {
  const secret = process.env.DEMO_SESSION_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) throw new AppError("DEMO_SESSION_CONFIGURATION_INVALID", 503);
  return secret;
}

export function hashJudgeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function signJudgeToken(token: string, secret = signingSecret()): string {
  return createHmac("sha256", secret).update(token).digest("base64url");
}

export function encodeJudgeCookie(token: string, secret = signingSecret()): string {
  return `${token}.${signJudgeToken(token, secret)}`;
}

export function decodeJudgeCookie(value: string | undefined, secret = signingSecret()): string | null {
  if (!value) return null;
  const [token, signature, extra] = value.split(".");
  if (!token || !signature || extra || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  const expected = Buffer.from(signJudgeToken(token, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? token : null;
}

function readCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const pair of header.split(";")) {
    const [name, ...parts] = pair.trim().split("=");
    if (name === judgeCookieName) return decodeURIComponent(parts.join("="));
  }
  return undefined;
}

export async function resolveJudgeSession(request: Request): Promise<JudgeSession> {
  const token = decodeJudgeCookie(readCookie(request));
  const { client } = createDatabase(process.env.DATABASE_URL ?? "");
  try {
    if (token) {
      const [existing] = await client<{ id: string; expires_at: Date | string; request_count: number; scenario: string | null }[]>`
        select js.id, js.expires_at, js.request_count, ov.scenario
        from judge_sessions js
        left join demo_overlays ov on ov.session_id = js.id and ov.case_ref = 'RG-2048' and ov.expires_at > now()
        where js.token_hash = ${hashJudgeToken(token)} and js.expires_at > now()
        limit 1`;
      if (existing) {
        const [touched] = await client<{ id: string }[]>`update judge_sessions
          set request_count = request_count + 1, last_seen_at = now()
          where id = ${existing.id} and expires_at > now() and request_count < ${judgeRequestLimit}
          returning id`;
        if (!touched) throw new AppError("DEMO_SESSION_RATE_LIMITED", 429, true);
        return {
          id: existing.id,
          scenario: (existing.scenario as DemoScenario | null) ?? "BASELINE",
          expiresAt: new Date(existing.expires_at).toISOString(),
        };
      }
    }

    const nextToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + judgeSessionTtlSeconds * 1000).toISOString();
    await client`delete from judge_sessions where expires_at <= now()`;
    const [created] = await client<{ id: string }[]>`insert into judge_sessions
      (token_hash, request_count, expires_at, last_seen_at)
      values (${hashJudgeToken(nextToken)}, 1, ${expiresAt}, now()) returning id`;
    if (!created) throw new AppError("DEMO_SESSION_CREATE_FAILED", 500);
    return { id: created.id, scenario: "BASELINE", expiresAt, cookieValue: encodeJudgeCookie(nextToken) };
  } finally {
    await client.end();
  }
}

export async function setDemoOverlay(sessionId: string, scenario: Exclude<DemoScenario, "BASELINE">): Promise<void> {
  if (!(mutableDemoScenarios as readonly string[]).includes(scenario)) throw new AppError("DEMO_SCENARIO_NOT_ALLOWED", 400);
  const expiresAt = new Date(Date.now() + judgeSessionTtlSeconds * 1000).toISOString();
  const payload = { scenario, caseRef: "RG-2048", source: "SYNTHETIC_SESSION_OVERLAY", providerWrite: false } as const;
  const evidenceHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const { client } = createDatabase(process.env.DATABASE_URL ?? "");
  try {
    await client.begin(async (sql) => {
      const [active] = await sql<{ id: string }[]>`select id from judge_sessions where id = ${sessionId} and expires_at > now() for update`;
      if (!active) throw new AppError("DEMO_SESSION_EXPIRED", 401);
      await sql`insert into demo_overlays (session_id, case_ref, scenario, evidence_hash, payload_json, expires_at)
        values (${sessionId}, 'RG-2048', ${scenario}, ${evidenceHash}, ${JSON.stringify(payload)}::jsonb, ${expiresAt})
        on conflict (session_id, case_ref) do update set scenario = excluded.scenario,
          evidence_hash = excluded.evidence_hash, payload_json = excluded.payload_json,
          expires_at = excluded.expires_at, updated_at = now()`;
    });
  } finally {
    await client.end();
  }
}

export async function resetDemoOverlay(sessionId: string): Promise<number> {
  const { client } = createDatabase(process.env.DATABASE_URL ?? "");
  try {
    const removed = await client<{ id: string }[]>`delete from demo_overlays where session_id = ${sessionId} returning id`;
    return removed.length;
  } finally {
    await client.end();
  }
}
