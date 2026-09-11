/** WCAG relative luminance of a hex color. */
function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map(i => parseInt(clean.slice(i, i + 2), 16));
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Sets `--chain-on` so text on the Chain color always meets 4.5:1 (design rule: money buttons are Chain). */
export function applyChainContrast(chainHex = "#8259EF"): void {
  const L = luminance(chainHex);
  const onWhite = 1.05 / (L + 0.05);
  document.documentElement.style.setProperty("--chain", chainHex);
  document.documentElement.style.setProperty("--chain-on", onWhite >= 4.5 ? "#FFFFFF" : "#0F0F0F");
}
