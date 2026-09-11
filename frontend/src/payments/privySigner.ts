import { getAddress, recoverAddress, type Hex } from "viem";
import type { ClientHederaBatchSigner } from "./x402-lite";
import { createMirrorContractReader } from "./mirrorReader";
import { MIRROR_CONTRACT_CALL_URL } from "@/lib/hedera";

/** Minimal EIP-1193 surface we need from Privy's embedded wallet provider. */
export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

/**
 * Normalises a secp256k1 signature to 65 bytes r||s||v with v ∈ {27, 28}. Privy returns hex;
 * some providers use v = 0/1.
 */
export function normalizeSignature(signature: string): Hex {
  const hex = signature.startsWith("0x") ? signature.slice(2) : signature;
  if (hex.length !== 130) {
    throw new Error(`Unexpected signature length ${hex.length / 2} bytes (expected 65)`);
  }
  let v = parseInt(hex.slice(128), 16);
  if (v === 0 || v === 1) v += 27;
  if (v !== 27 && v !== 28) throw new Error(`Unexpected recovery id ${v}`);
  return `0x${hex.slice(0, 128)}${v.toString(16).padStart(2, "0")}`;
}

/**
 * `ClientHederaBatchSigner` backed by a Privy embedded wallet. Both the deposit authorization
 * digest (plain keccak, not EIP-712) and the EIP-712 voucher digest are signed as raw hashes via
 * Privy's `secp256k1_sign` RPC. Never use `personal_sign`: the EIP-191 prefix breaks HAS
 * `isAuthorizedRaw` verification on-chain.
 */
export function createPrivySigner(options: {
  address: string;
  accountId: string;
  getProvider: () => Promise<Eip1193Provider>;
}): ClientHederaBatchSigner {
  const evmAddress = getAddress(options.address);
  const reader = createMirrorContractReader({ baseUrl: MIRROR_CONTRACT_CALL_URL, from: evmAddress });
  return {
    accountId: options.accountId,
    evmAddress,
    keyType: "ECDSA_SECP256K1",
    async signDigest(digest) {
      const provider = await options.getProvider();
      const raw = (await provider.request({ method: "secp256k1_sign", params: [digest] })) as string;
      const signature = normalizeSignature(raw);
      const recovered = await recoverAddress({ hash: digest, signature });
      if (recovered.toLowerCase() !== evmAddress.toLowerCase()) {
        throw new Error("Privy raw signature did not recover to the wallet address");
      }
      return signature;
    },
    verifyOwnSignature: async (digest, signature) =>
      (await recoverAddress({ hash: digest, signature })).toLowerCase() === evmAddress.toLowerCase(),
    readContract: args => reader.readContract(args),
  };
}
