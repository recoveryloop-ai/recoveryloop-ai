import { describe, expect, it } from "vitest";

import { authorizeOperator } from "../src/server/auth/authorization.js";

const allowlistedEmail = "faheelanjum12@gmail.com";

describe("operator authorization boundary", () => {
  it("rejects anonymous requests with 401", () => {
    expect(authorizeOperator(null, allowlistedEmail)).toEqual({
      authorized: false,
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("does not trust an email without an app_metadata operator role", () => {
    expect(authorizeOperator({ id: "user-1", email: allowlistedEmail, appMetadata: { role: "viewer" } }, allowlistedEmail)).toMatchObject({
      authorized: false,
      status: 403,
    });
  });

  it("requires both allowlisted email and operator app_metadata", () => {
    expect(authorizeOperator({ id: "user-1", email: allowlistedEmail, appMetadata: { role: "operator" } }, allowlistedEmail)).toEqual({
      authorized: true,
      principalId: "user-1",
      role: "operator",
    });
  });
});
