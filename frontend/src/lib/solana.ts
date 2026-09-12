/** Ed25519 seed wrapped as PKCS#8, the only private-key shape WebCrypto imports for this curve. */
const PKCS8_ED25519_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Bitcoin-alphabet base58, as Solana addresses are written. */
export function base58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] * 256;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  return "1".repeat(zeros) + digits.reverse().map(d => ALPHABET[d]).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base64urlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

/**
 * Dev wallet only. Derives a Solana address from the local secp256k1 key so the wallet panel has all
 * three chains without a second key file; the key never leaves WebCrypto. Privy users get a real
 * Solana embedded wallet instead. Returns undefined where the browser lacks Ed25519 in WebCrypto.
 */
export async function deriveDevSolanaAddress(secpPrivateKey: string): Promise<string | undefined> {
  try {
    const material = new Uint8Array([...new TextEncoder().encode("hederatube:solana:"), ...hexToBytes(secpPrivateKey)]);
    const seed = new Uint8Array(await crypto.subtle.digest("SHA-256", material));
    const pkcs8 = new Uint8Array([...PKCS8_ED25519_PREFIX, ...seed]);
    const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
    const jwk = await crypto.subtle.exportKey("jwk", key);
    return jwk.x ? base58(base64urlToBytes(jwk.x)) : undefined;
  } catch {
    return undefined;
  }
}
