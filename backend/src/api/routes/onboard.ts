import { Router } from "express";
import { eq } from "drizzle-orm";
import { isAddress } from "viem";
import { db } from "../../shared/db/client.js";
import { faucetDrips } from "../../shared/db/schema.js";
import { normalizeAddress } from "../../shared/ids.js";
import { dripHbarTo, findAccount, mirror, pollUntil, USDC_TOKEN_ID } from "../../shared/hedera.js";
import { logger } from "../../shared/logger.js";

export function onboardRouter(): Router {
  const router = Router();

  /**
   * HBAR drip to the viewer's EVM address (guide §2.8): creates the Hedera account with gas for
   * the allowance approval. Once per address. USDC is not dripped.
   */
  router.post("/onboard/faucet", async (req, res) => {
    const raw = typeof req.body?.address === "string" ? req.body.address : "";
    if (!isAddress(raw)) return res.status(400).json({ error: "invalid address" });
    const address = normalizeAddress(raw);

    const existing = await db.query.faucetDrips.findFirst({ where: eq(faucetDrips.address, address) });
    if (existing) {
      const account = existing.account_id ?? (await findAccount(address).catch(() => undefined))?.account ?? "";
      if (account && !existing.account_id) await db.update(faucetDrips).set({ account_id: account }).where(eq(faucetDrips.address, address));
      return res.json({ txId: existing.tx_id, accountId: account });
    }

    const already = await findAccount(address).catch(() => undefined);
    let txId = "";
    if (!already) {
      try {
        txId = await dripHbarTo(address);
      } catch (err) {
        logger.error({ err, address }, "faucet transfer failed");
        return res.status(502).json({ error: "faucet transfer failed" });
      }
    }
    const account = already ?? (await pollUntil(() => findAccount(address), { timeoutMs: 40_000, intervalMs: 2_000 }));
    await db.insert(faucetDrips).values({ address, tx_id: txId || "existing", account_id: account?.account ?? null }).onConflictDoNothing();
    if (account) {
      const receivable = await mirror.canReceiveToken(account.account, USDC_TOKEN_ID).catch(() => undefined);
      logger.info({ address, account: account.account, autoAssociations: account.max_automatic_token_associations, usdcReceivable: receivable }, "faucet drip");
    }
    res.json({ txId, accountId: account?.account ?? "" });
  });

  return router;
}
