// World ID verification is parked for now. Kept for when it returns; re-enable in api/app.ts.
/*
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../shared/db/client.js";
import { creators } from "../../shared/db/schema.js";
import { creatorByAddress, meOf } from "../../shared/db/queries.js";
import { HEDERA_ENTITY_ID_REGEX, newCreatorId, normalizeAddress } from "../../shared/ids.js";
import { env } from "../../shared/env.js";
import { findAccount, mirror, USDC_TOKEN_ID } from "../../shared/hedera.js";

export function verifyRouter(): Router {
  const router = Router();

  /** RP context for an IDKit v4 request. Unsigned placeholder until a World RP key is configured. * /
  router.post("/verify/world/request", (_req, res) => {
    const now = Math.floor(Date.now() / 1000);
    res.json({ rp_id: env.WORLD_APP_ID ? `rp_${env.WORLD_APP_ID}` : "rp_hederatube_dev", nonce: randomUUID().replace(/-/g, ""), created_at: now, expires_at: now + 300, signature: `0x${"00".repeat(64)}` });
  });

  router.post("/verify/world", async (req, res) => {
    const body = (req.body ?? {}) as { address?: string; accountId?: string; proof?: { nullifier_hash?: string }; handle?: string; displayName?: string };
    if (!body.address) return res.status(400).json({ error: "address required" });
    const address = normalizeAddress(body.address);
    const nullifier = body.proof?.nullifier_hash;
    if (!nullifier) return res.status(400).json({ error: "proof missing nullifier_hash" });
    if (env.WORLD_VERIFY_MODE === "real") {
      // Hook for the real flow: POST https://developer.worldcoin.org/api/v2/verify/<app_id> with the proof.
      return res.status(501).json({ error: "World ID proof verification is not configured on this server" });
    }

    const clash = await db.query.creators.findFirst({ where: eq(creators.world_nullifier_hash, nullifier) });
    if (clash && clash.wallet_address !== address) return res.status(409).json({ error: "This World ID already backs another creator account." });

    const handle = (body.handle || address.slice(2, 10)).toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const taken = await db.query.creators.findFirst({ where: eq(creators.handle, handle) });
    if (taken && taken.wallet_address !== address) return res.status(409).json({ error: "Handle is taken." });

    let creator = await creatorByAddress(address);
    if (!creator) {
      const accountId = body.accountId && HEDERA_ENTITY_ID_REGEX.test(body.accountId) ? body.accountId : (await findAccount(address).catch(() => undefined))?.account;
      if (!accountId) return res.status(409).json({ error: "No Hedera account for this wallet yet. Fund it first." });
      const receivable = await mirror.canReceiveToken(accountId, USDC_TOKEN_ID).catch(() => true);
      if (!receivable) return res.status(409).json({ error: "Creator account must be associated with USDC" });
      const [inserted] = await db
        .insert(creators)
        .values({
          id: newCreatorId(),
          wallet_address: address,
          hedera_account_id: accountId,
          handle,
          display_name: body.displayName || handle,
          world_nullifier_hash: nullifier,
          verified_at: new Date(),
        })
        .returning();
      creator = inserted;
    }
    res.json(await meOf(address));
  });

  return router;
}

*/
export {};
