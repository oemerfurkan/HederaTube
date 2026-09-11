import { http, HttpResponse } from "msw";
import { decodeFunctionData, encodeAbiParameters } from "viem";
import { batchSettlementABI } from "@/payments/x402-lite";
import { findChannel } from "../x402/channels";
import { loadDb } from "../db";

/**
 * Simulates the Mirror Node `contracts/call` endpoint for `channels(bytes32)` so the client's
 * corrective-402 recovery reads the mock's truth instead of the empty on-chain state.
 */
export const mirrorHandlers = [
  http.post("/mock-mirror/api/v1/contracts/call", async ({ request }) => {
    const body = (await request.json()) as { data: `0x${string}` };
    let decoded: { functionName: string; args?: readonly unknown[] };
    try {
      decoded = decodeFunctionData({ abi: batchSettlementABI, data: body.data });
    } catch {
      return HttpResponse.json({ _status: { messages: [{ message: "CONTRACT_REVERT_EXECUTED" }] } }, { status: 400 });
    }
    if (decoded.functionName === "channels") {
      const channelId = String(decoded.args?.[0] ?? "");
      const channel = findChannel(loadDb(), channelId);
      const result = encodeAbiParameters(
        [{ type: "uint128" }, { type: "uint128" }],
        [BigInt(channel?.balance ?? "0"), BigInt(channel?.totalClaimed ?? "0")],
      );
      return HttpResponse.json({ result });
    }
    if (decoded.functionName === "refundNonce") {
      const channel = findChannel(loadDb(), String(decoded.args?.[0] ?? ""));
      return HttpResponse.json({ result: encodeAbiParameters([{ type: "uint256" }], [BigInt(channel?.refundNonce ?? "0")]) });
    }
    return HttpResponse.json({ _status: { messages: [{ message: "unsupported function in mock" }] } }, { status: 400 });
  }),
];
