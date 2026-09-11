import { decodeFunctionResult, encodeFunctionData, type Abi } from "viem";
import type { HederaContractReadArgs } from "./x402-lite";

/**
 * Pure-fetch port of `createMirrorNodeContractReader` from the vendored `@x402/hedera` package:
 * simulates a read-only call through `POST /api/v1/contracts/call` and decodes the result.
 */
export function createMirrorContractReader(options: { baseUrl: string; from?: `0x${string}` }) {
  return {
    async readContract(args: HederaContractReadArgs): Promise<unknown> {
      const data = encodeFunctionData({
        abi: args.abi as Abi,
        functionName: args.functionName,
        args: args.args as unknown[],
      });
      const from = args.from ?? options.from;
      const response = await fetch(`${options.baseUrl}/api/v1/contracts/call`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          block: "latest",
          data,
          estimate: false,
          to: args.address,
          ...(from ? { from } : {}),
        }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Mirror Node contracts/call failed (${response.status}): ${text}`);
      }
      const json = (await response.json()) as { result?: `0x${string}` };
      if (!json.result) throw new Error("Mirror Node contracts/call returned no result");
      return decodeFunctionResult({
        abi: args.abi as Abi,
        functionName: args.functionName,
        data: json.result,
      });
    },
  };
}
