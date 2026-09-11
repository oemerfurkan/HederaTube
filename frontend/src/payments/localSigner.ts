import { getAddress, recoverAddress } from "viem";
import { privateKeyToAccount, sign, type PrivateKeyAccount } from "viem/accounts";
import { get, set } from "idb-keyval";
import type { ClientHederaBatchSigner } from "./x402-lite";
import { createMirrorContractReader } from "./mirrorReader";
import { CHAIN, DEV_PRIVATE_KEY, HASHIO_RPC, MIRROR_CONTRACT_CALL_URL } from "@/lib/hedera";
import { createWalletClient, http } from "viem";
import type { Eip1193Provider } from "./privySigner";

const KEY_STORAGE = "ht:dev-signer:private-key";

/**
 * Dev/test signer: a viem private-key account with the same interface as the Privy signer.
 * ECDSA signatures over the raw 32-byte digest, 65 bytes r||s||v (v = 27/28), exactly what HAS
 * `isAuthorizedRaw` expects.
 */
export function createLocalSigner(
  account: PrivateKeyAccount,
  privateKey: `0x${string}`,
  accountId = "0.0.0",
): ClientHederaBatchSigner {
  const evmAddress = getAddress(account.address);
  const reader = createMirrorContractReader({ baseUrl: MIRROR_CONTRACT_CALL_URL, from: evmAddress });
  return {
    accountId,
    evmAddress,
    keyType: "ECDSA_SECP256K1",
    signDigest: digest => sign({ hash: digest, privateKey, to: "hex" }),
    verifyOwnSignature: async (digest, signature) =>
      (await recoverAddress({ hash: digest, signature })).toLowerCase() === evmAddress.toLowerCase(),
    readContract: args => reader.readContract(args),
  };
}

/** Loads (or generates once) a browser-persistent dev key. */
/** EIP-1193 provider for the dev key over the Hedera JSON-RPC relay (used for the allowance approve). */
export function localProvider(privateKey: `0x${string}`): Eip1193Provider {
  const client = createWalletClient({ account: privateKeyToAccount(privateKey), chain: CHAIN, transport: http(HASHIO_RPC) });
  return { request: args => client.request(args as never) as Promise<unknown> };
}

export async function loadOrCreateLocalSigner(): Promise<{
  signer: ClientHederaBatchSigner;
  privateKey: `0x${string}`;
}> {
  let privateKey = (await get<`0x${string}`>(KEY_STORAGE)) ?? undefined;
  if (DEV_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(DEV_PRIVATE_KEY)) {
    privateKey = DEV_PRIVATE_KEY as `0x${string}`;
  }
  if (!privateKey) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    privateKey = `0x${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
    await set(KEY_STORAGE, privateKey);
  }
  const account = privateKeyToAccount(privateKey);
  return { signer: createLocalSigner(account, privateKey), privateKey };
}
