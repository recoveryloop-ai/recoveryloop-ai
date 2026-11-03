import { describe, expect, it } from "vitest";

import { assertTrustedOrigin } from "../src/server/http/request-security";

describe("trusted request origin", () => {
  it("accepts the public Host origin even when the framework request URL uses an internal hostname", () => {
    const request = new Request("http://localhost:4173/auth/signout", {
      method: "POST",
      headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" },
    });
    expect(() => assertTrustedOrigin(request)).not.toThrow();
  });

  it("rejects a cross-site origin", () => {
    const request = new Request("https://recoveryloop.example/auth/signout", {
      method: "POST",
      headers: { host: "recoveryloop.example", origin: "https://attacker.invalid" },
    });
    expect(() => assertTrustedOrigin(request)).toThrow("ORIGIN_NOT_ALLOWED");
  });
});
