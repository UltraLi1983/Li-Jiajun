export function formatNumber(value: number, fractionDigits?: number): string {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits ?? 0,
    maximumFractionDigits: fractionDigits ?? 3,
  }).format(value);
}
