import { describe, expect, it } from "vitest";

import { isUuid } from "../src/shared/identifiers";

describe("shared identifier validation", () => {
  it("accepts canonical UUIDs and rejects route junk before PostgreSQL sees it", () => {
    expect(isUuid("10000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});
