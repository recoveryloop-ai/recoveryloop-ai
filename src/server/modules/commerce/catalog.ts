import { addMoney, money, multiplyMoney, type Money } from "../../../shared/money";

export interface CatalogItem {
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly unit: Money;
  readonly accent: string;
}

export interface CartLine {
  readonly item: CatalogItem;
  readonly quantity: number;
  readonly total: Money;
}

export const catalog: readonly CatalogItem[] = Object.freeze([
  Object.freeze({
    sku: "RL-A100",
    name: "Atlas Studio Headphones",
    description: "Closed-back wireless headphones with a 40-hour battery.",
    unit: money(15_000),
    accent: "coral",
  }),
  Object.freeze({
    sku: "RL-B100",
    name: "Orbit Mechanical Keyboard",
    description: "Low-profile switches, aluminum frame, and multi-device pairing.",
    unit: money(10_000),
    accent: "mint",
  }),
]);

export function buildStaticCart(): { readonly lines: readonly CartLine[]; readonly total: Money } {
  const lines = catalog.map((item) => ({
    item,
    quantity: 1,
    total: multiplyMoney(item.unit, 1),
  }));

  return Object.freeze({
    lines: Object.freeze(lines),
    total: addMoney(...lines.map((line) => line.total)),
  });
}
