import { describe, expect, it } from "vitest";

import {
  assertPayPalSandbox,
  parseBaseEnvironment,
} from "../src/server/config/runtime-env.js";

describe("PayPal demo-mode environment guard", () => {
  it("allows sandbox in demo mode", () => {
    expect(() =>
      assertPayPalSandbox({ DEMO_MODE: "true", PAYPAL_ENV: "sandbox" }),
    ).not.toThrow();
  });

  it("rejects live PayPal in demo mode", () => {
    expect(() =>
      assertPayPalSandbox({ DEMO_MODE: "true", PAYPAL_ENV: "live" }),
    ).toThrow("PAYPAL_LIVE_FORBIDDEN_IN_DEMO_MODE");
  });

  it("defaults to the safe environment", () => {
    expect(parseBaseEnvironment({})).toEqual({
      DEMO_MODE: "true",
      PAYPAL_ENV: "sandbox",
    });
  });
});
