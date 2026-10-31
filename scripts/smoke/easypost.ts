import { z } from "zod";

import {
  describeError,
  directExecution,
  loadLocalEnvironment,
  printResult,
  redactIdentifier,
  requireEnvironment,
  type SmokeResult,
} from "./common.js";

const trackerSchema = z.object({
  id: z.string().startsWith("trk_"),
  mode: z.literal("test"),
  status: z.string(),
  carrier: z.string().nullable(),
  tracking_code: z.string(),
  created_at: z.string(),
});

export async function smokeEasyPost(): Promise<SmokeResult> {
  loadLocalEnvironment();

  try {
    const apiKey = requireEnvironment("EASYPOST_API_KEY");
    const response = await fetch("https://api.easypost.com/v2/trackers", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tracker: { tracking_code: "EZ5000000005" } }),
      signal: AbortSignal.timeout(15_000),
    });

    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const tracker = trackerSchema.parse(payload);

    return {
      provider: "EasyPost",
      status: "PASS",
      capability: "Create and validate return-to-sender test tracker",
      evidence: {
        http_status: response.status,
        tracker_id: redactIdentifier(tracker.id),
        mode: tracker.mode,
        status: tracker.status,
        carrier: tracker.carrier,
        created_at: tracker.created_at,
      },
    };
  } catch (error) {
    const message = describeError(error);
    return {
      provider: "EasyPost",
      status: message.startsWith("MISSING_ENV:") ? "BLOCKED" : "FAIL",
      capability: "Create and validate return-to-sender test tracker",
      blocker: message,
    };
  }
}

if (directExecution(import.meta.url)) {
  printResult(await smokeEasyPost());
}
