import { describe, expect, it } from "vitest";

import { assertZaiConfiguration } from "../scripts/smoke/zai.js";

describe("Z.ai configuration allowlist", () => {
  it("allows the approved standard API endpoint and model", () => {
    expect(() =>
      assertZaiConfiguration("https://api.z.ai/api/paas/v4", "glm-5.3"),
    ).not.toThrow();
  });

  it("rejects an arbitrary base URL", () => {
    expect(() =>
      assertZaiConfiguration("https://example.invalid", "glm-5.3"),
    ).toThrow("ZAI_BASE_URL_NOT_ALLOWLISTED");
  });

  it("rejects an unapproved model ID", () => {
    expect(() =>
      assertZaiConfiguration("https://api.z.ai/api/paas/v4", "other-model"),
    ).toThrow("ZAI_MODEL_NOT_APPROVED");
  });
});
