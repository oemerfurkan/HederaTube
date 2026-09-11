/** Tiny class joiner; no tailwind-merge needed because variants never overlap. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
