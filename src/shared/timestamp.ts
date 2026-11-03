export function toIsoTimestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}
