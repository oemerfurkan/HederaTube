import { USDC_DECIMALS } from "./hedera";

const SCALE = 10n ** BigInt(USDC_DECIMALS);

/** Formats USDC base units as a fixed four-decimal string (design rule: amounts are tabular, 4 dp). */
export function formatUsdc(baseUnits: bigint | string | number, decimals = 4): string {
  const value = BigInt(baseUnits);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  const frac = abs % SCALE;
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").slice(0, decimals);
  return `${negative ? "-" : ""}${whole.toString()}.${fracStr}`;
}

/** Parses a decimal USDC string ("0.0720") into base units. Throws on invalid input. */
export function parseUsdc(text: string): bigint {
  const trimmed = text.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new Error(`Invalid USDC amount: ${text}`);
  }
  const [wholePart, fracPart = ""] = trimmed.split(".");
  const frac = (fracPart + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(wholePart || "0") * SCALE + BigInt(frac || "0");
}

/** Approximate fiat value; USDC is treated as 1:1 with USD. Always secondary in the UI. */
export function approxUsd(baseUnits: bigint | string): string {
  const value = Number(BigInt(baseUnits)) / Number(SCALE);
  return `≈ $${value.toFixed(value < 0.01 && value > 0 ? 4 : 2)}`;
}

export function usdcToBaseUnits(amount: number): bigint {
  return parseUsdc(amount.toFixed(USDC_DECIMALS));
}
