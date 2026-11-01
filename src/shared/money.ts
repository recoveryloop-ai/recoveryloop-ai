export const USD = "USD" as const;

export type Currency = typeof USD;

export interface Money {
  readonly currency: Currency;
  readonly minor: number;
}

export function assertMinorUnits(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer number of cents`);
  }
  if (value < 0) {
    throw new RangeError(`${label} cannot be negative`);
  }
  return value;
}

export function money(minor: number, currency: Currency = USD): Money {
  return Object.freeze({ minor: assertMinorUnits(minor), currency });
}

export function addMoney(...amounts: readonly Money[]): Money {
  const currency = amounts[0]?.currency ?? USD;
  const total = amounts.reduce((sum, amount) => {
    if (amount.currency !== currency) {
      throw new Error("MIXED_CURRENCY_FORBIDDEN");
    }
    return sum + assertMinorUnits(amount.minor);
  }, 0);

  return money(assertMinorUnits(total, "total"), currency);
}

export function multiplyMoney(amount: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new TypeError("quantity must be a non-negative safe integer");
  }
  return money(assertMinorUnits(amount.minor * quantity, "line total"), amount.currency);
}

export function formatMoney(amount: Money): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: amount.currency,
  }).format(amount.minor / 100);
}

export function formatPayPalAmount(amount: Money): string {
  const dollars = Math.floor(amount.minor / 100);
  const cents = (amount.minor % 100).toString().padStart(2, "0");
  return `${dollars}.${cents}`;
}

export function parsePayPalAmount(value: string, currency: string): Money {
  if (currency !== USD) throw new Error("UNSUPPORTED_CURRENCY");
  const match = /^(0|[1-9]\d*)\.(\d{2})$/.exec(value);
  if (!match) throw new Error("INVALID_PROVIDER_AMOUNT");
  const dollars = Number(match[1]);
  const cents = Number(match[2]);
  return money(assertMinorUnits((dollars * 100) + cents, "provider amount"));
}
