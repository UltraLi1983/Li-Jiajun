export function formatNumber(value, fractionDigits) {
    if (!Number.isFinite(value))
        return "-";
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: fractionDigits ?? 0,
        maximumFractionDigits: fractionDigits ?? 3,
    }).format(value);
}
