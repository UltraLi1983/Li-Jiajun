// Human-facing terms are separate from stable codes stored in records.
export function formatSystemTerm(value: string): string {
  const words = value.trim()
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ");
  return words.replace(/^([a-z])/, letter => letter.toUpperCase());
}
