import { describe, expect, it } from "vitest";

import { toIsoTimestamp } from "../src/server/modules/payments/checkout-service";

describe("checkout service database timestamps", () => {
  it("normalizes PostgreSQL timestamp strings for an existing capture receipt", () => {
    expect(toIsoTimestamp("2026-11-03T12:34:56.789Z")).toBe("2026-11-03T12:34:56.789Z");
  });

  it("normalizes Date values and preserves null", () => {
    expect(toIsoTimestamp(new Date("2026-11-03T12:34:56.789Z"))).toBe("2026-11-03T12:34:56.789Z");
    expect(toIsoTimestamp(null)).toBeNull();
  });
});
