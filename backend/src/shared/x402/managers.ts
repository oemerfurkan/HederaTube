import { BatchSettlementChannelManager, type Channel } from "@x402/hedera/batch-settlement/server";
import { addressesEqual } from "@x402/hedera/batch-settlement";
import { NETWORK, USDC_EVM_ADDRESS, USDC_TOKEN_ID, receiverAddressOf } from "../hedera.js";
import { getX402Runtime } from "./scheme.js";

const managers = new Map<string, BatchSettlementChannelManager>();

/** One channel manager per creator (receiver, token): claims and settles only that creator's channels. */
export async function managerFor(creatorAccountId: string): Promise<BatchSettlementChannelManager> {
  let manager = managers.get(creatorAccountId);
  if (!manager) {
    const { scheme, facilitator } = await getX402Runtime();
    manager = new BatchSettlementChannelManager({
      scheme,
      facilitator,
      receiver: receiverAddressOf(creatorAccountId),
      token: USDC_EVM_ADDRESS,
      network: NETWORK,
      payTo: creatorAccountId,
      asset: USDC_TOKEN_ID,
    });
    managers.set(creatorAccountId, manager);
  }
  return manager;
}

export function channelsOfReceiver(channels: Channel[], creatorAccountId: string): Channel[] {
  const receiver = receiverAddressOf(creatorAccountId);
  return channels.filter(c => addressesEqual(c.channelConfig.receiver, receiver));
}
