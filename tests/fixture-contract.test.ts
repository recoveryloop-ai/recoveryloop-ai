import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/scenarios.json", import.meta.url), "utf8")) as {
  merchant_policy: { version: string };
  order: { id: string; fixture_key: string; total_minor: number };
  scenarios: { id: string; total_minor?: number; capture_minor?: number; expected_refund_eligible_minor?: number }[];
};

describe("judge fixture contract", () => {
  it("keeps the primary F02 demo identifiers and policy version aligned", () => {
    expect(fixture.merchant_policy.version).toBe("v1");
    expect(fixture.order).toMatchObject({ id: "RG-2048", fixture_key: "F02", total_minor: 25_000 });
    expect(fixture.scenarios.find((scenario) => scenario.id === "F02")).toMatchObject({
      expected_refund_eligible_minor: 10_000,
    });
  });

  it("contains every S1 deterministic acceptance scenario", () => {
    const ids = new Set(fixture.scenarios.map((scenario) => scenario.id));
    expect(["F01", "F02", "F03", "F04", "F05"].every((id) => ids.has(id))).toBe(true);
    expect(fixture.scenarios.slice(0, 5).every((scenario) => scenario.total_minor === scenario.capture_minor)).toBe(true);
  });
});
