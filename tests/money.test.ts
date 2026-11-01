import { describe, expect, it } from "vitest";

import { addMoney, formatMoney, money, multiplyMoney } from "../src/shared/money.js";
import { buildStaticCart } from "../src/server/modules/commerce/catalog.js";

describe("integer money", () => {
  it("calculates the canonical $250 cart exactly in cents", () => {
    const cart = buildStaticCart();
    expect(cart.lines.map((line) => line.total.minor)).toEqual([15_000, 10_000]);
    expect(cart.total).toEqual({ minor: 25_000, currency: "USD" });
    expect(formatMoney(cart.total)).toBe("$250.00");
  });

  it("rejects fractional, negative, and mixed-currency inputs", () => {
    expect(() => money(100.5)).toThrow("safe integer");
    expect(() => money(-1)).toThrow("cannot be negative");
    expect(() => addMoney(money(100), { minor: 100, currency: "EUR" } as never)).toThrow("MIXED_CURRENCY_FORBIDDEN");
  });

  it("multiplies only by whole non-negative quantities", () => {
    expect(multiplyMoney(money(3_333), 3).minor).toBe(9_999);
    expect(() => multiplyMoney(money(100), 1.5)).toThrow("quantity");
  });
});
