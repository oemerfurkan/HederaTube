/**
 * Hover panels are tinted with one of the palette colors, picked deterministically from the item's
 * id so a card always keeps the same hue. The mix is kept very light, so it reads as a wash over
 * the page rather than a colored surface.
 */
const PALETTE = ["--primary", "--chain", "--positive", "--destructive", "--pending"] as const;

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** CSS background for a hover panel: the item's palette color at `percent` opacity. */
export function hoverTint(id: string, percent = 12): string {
  const token = PALETTE[hash(id) % PALETTE.length];
  return `color-mix(in oklab, var(${token}) ${percent}%, transparent)`;
}
