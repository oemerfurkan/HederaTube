import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { signRequest } from "@worldcoin/idkit-server";
import { db } from "../../shared/db/client.js";
import { creators } from "../../shared/db/schema.js";
import { ensureCreator, meOf } from "../../shared/db/queries.js";
import { HEDERA_ENTITY_ID_REGEX, normalizeAddress } from "../../shared/ids.js";
import { env } from "../../shared/env.js";
import { logger } from "../../shared/logger.js";

/** World ID 4.0 verify endpoints per environment (docs.world.org/api-reference/developer-portal/verify). */
const VERIFY_BASE: Record<string, string> = {
  production: "https://developer.world.org/api/v4/verify",
  sandbox: "https://developer.world.org/api/v4/verify",
  staging: "https://staging-developer.worldcoin.org/api/v4/verify",
};

type WorldVerifyResponse = {
  success: boolean;
  nullifier?: string;
  /** World ID 3.0 responses spell it this way. */
  nullifier_hash?: string;
  code?: string;
  detail?: string;
  results?: { identifier: string; success: boolean; nullifier?: string; code?: string; detail?: string }[];
};

/**
 * Creators are humans: one World ID Selfie Check (credential 11) per creator account. The RP context
 * is signed here with the portal's signing key, the proof is checked by World's verifier, and the
 * RP-scoped nullifier is stored under a unique index so one face cannot open a second channel.
 * In `simulate` mode no proof is exchanged; the nullifier is derived from the wallet.
 */
export function verifyRouter(): Router {
  const router = Router();
  const real = env.WORLD_VERIFY_MODE === "real";

  router.post("/verify/world/request", (_req, res) => {
    if (real) {
      if (!env.WORLD_RP_ID || !env.WORLD_RP_SIGNING_KEY) {
        return res.status(503).json({ error: "World ID is not configured on this server (WORLD_RP_ID, WORLD_RP_SIGNING_KEY)" });
      }
      try {
        const sig = signRequest({ signingKeyHex: env.WORLD_RP_SIGNING_KEY, action: env.WORLD_ACTION, ttl: 300 });
        return res.json({ rp_id: env.WORLD_RP_ID, nonce: sig.nonce, created_at: sig.createdAt, expires_at: sig.expiresAt, signature: sig.sig, action: env.WORLD_ACTION });
      } catch (err) {
        // a wrong key shape (an address instead of the 32-byte signing key) surfaces here
        logger.error({ err }, "world id rp signing failed");
        return res.status(503).json({ error: `World ID signing key rejected: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
    const now = Math.floor(Date.now() / 1000);
    res.json({
      rp_id: env.WORLD_RP_ID ?? "rp_hederatube_dev",
      nonce: `0x${randomBytes(32).toString("hex")}`,
      created_at: now,
      expires_at: now + 300,
      signature: `0x${"00".repeat(65)}`,
      action: env.WORLD_ACTION,
      simulated: true,
    });
  });

  router.post("/verify/world", async (req, res) => {
    const body = (req.body ?? {}) as { address?: string; accountId?: string; result?: unknown; simulated?: boolean };
    if (typeof body.address !== "string" || !body.address) return res.status(400).json({ error: "address required" });
    const address = normalizeAddress(body.address);

    let nullifier: string;
    let credential = "selfie";
    if (real) {
      if (!env.WORLD_RP_ID) return res.status(503).json({ error: "World ID is not configured on this server (WORLD_RP_ID)" });
      if (!body.result || typeof body.result !== "object") return res.status(400).json({ error: "proof result required" });
      let data: WorldVerifyResponse;
      let ok: boolean;
      try {
        const response = await fetch(`${VERIFY_BASE[env.WORLD_ENVIRONMENT]}/${env.WORLD_RP_ID}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body.result),
        });
        ok = response.ok;
        data = (await response.json()) as WorldVerifyResponse;
      } catch (err) {
        logger.warn({ err }, "world id verifier unreachable");
        return res.status(502).json({ error: "Could not reach the World ID verifier" });
      }
      const passed = data.results?.find(r => r.success);
      const topLevel = data.nullifier ?? data.nullifier_hash;
      if (!ok || !data.success || (!passed && !topLevel)) {
        const detail = data.results?.find(r => !r.success)?.detail ?? data.detail ?? data.code ?? "verification failed";
        logger.info({ code: data.code, detail }, "world id proof rejected");
        return res.status(400).json({ error: `World ID: ${detail}` });
      }
      const found = topLevel ?? passed?.nullifier;
      if (!found) return res.status(400).json({ error: "World ID response carried no nullifier" });
      nullifier = found.toLowerCase();
      credential = passed?.identifier ?? "selfie";
    } else {
      // deterministic per wallet, so re-verifying the same dev wallet is idempotent
      nullifier = `0x${createHash("sha256").update(`hederatube-sim:${address}`).digest("hex")}`;
    }

    const clash = await db.query.creators.findFirst({ where: eq(creators.world_nullifier_hash, nullifier) });
    if (clash && clash.wallet_address !== address) {
      return res.status(409).json({ error: "This World ID already backs another creator account." });
    }
    const accountHint = typeof body.accountId === "string" && HEDERA_ENTITY_ID_REGEX.test(body.accountId) ? body.accountId : undefined;
    const creator = await ensureCreator(address, accountHint);
    if (!creator) return res.status(409).json({ error: "This wallet has no Hedera account yet" });
    await db.update(creators).set({ world_nullifier_hash: nullifier, verified_at: new Date() }).where(eq(creators.id, creator.id));
    logger.info({ creator: creator.id, credential, simulated: !real }, "world id verified");
    res.json(await meOf(address));
  });

  return router;
}
