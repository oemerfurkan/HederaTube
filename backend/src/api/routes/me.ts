import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../shared/db/client.js";
import { creators } from "../../shared/db/schema.js";
import { channelOf, earningsOf, ensureCreator, meOf, updateCreatorProfile } from "../../shared/db/queries.js";
import { objectKeys, storage } from "../../shared/storage.js";
import { HEDERA_ENTITY_ID_REGEX } from "../../shared/ids.js";
import { findAccount, tokenBalanceOf } from "../../shared/hedera.js";

export function meRouter(): Router {
  const router = Router();

  router.get("/me", async (req, res) => {
    const address = typeof req.query.address === "string" ? req.query.address : "";
    if (!address) return res.status(400).json({ error: "address required" });
    res.json(await meOf(address));
  });

  /** Channel name and description. Opens the creator row if this wallet has never uploaded. */
  router.put("/me/profile", async (req, res) => {
    const body = (req.body ?? {}) as { address?: string; accountId?: string; displayName?: string; description?: string };
    if (typeof body.address !== "string" || !body.address) return res.status(400).json({ error: "address required" });
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 60) : undefined;
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : undefined;
    if (displayName !== undefined && !displayName) return res.status(400).json({ error: "channel name cannot be empty" });
    const accountHint = typeof body.accountId === "string" && HEDERA_ENTITY_ID_REGEX.test(body.accountId) ? body.accountId : undefined;
    const creator = await ensureCreator(body.address, accountHint);
    if (!creator) return res.status(409).json({ error: "This wallet has no Hedera account yet" });
    await updateCreatorProfile(creator.id, {
      ...(displayName !== undefined ? { display_name: displayName } : {}),
      ...(description !== undefined ? { description } : {}),
    });
    res.json(await meOf(body.address));
  });

  /**
   * Channel photo. The browser crops and downsizes before sending, so the body is a small data URL
   * well inside the JSON limit; `image: null` removes the photo. Each upload gets a new versioned key.
   */
  router.put("/me/avatar", async (req, res) => {
    const body = (req.body ?? {}) as { address?: string; accountId?: string; image?: string | null };
    if (typeof body.address !== "string" || !body.address) return res.status(400).json({ error: "address required" });
    const accountHint = typeof body.accountId === "string" && HEDERA_ENTITY_ID_REGEX.test(body.accountId) ? body.accountId : undefined;
    const creator = await ensureCreator(body.address, accountHint);
    if (!creator) return res.status(409).json({ error: "This wallet has no Hedera account yet" });
    if (body.image === null) {
      await updateCreatorProfile(creator.id, { avatar_key: null });
      return res.json(await meOf(body.address));
    }
    const match = typeof body.image === "string" ? /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.image) : null;
    if (!match) return res.status(400).json({ error: "image must be a JPEG, PNG or WebP data URL" });
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 600 * 1024) return res.status(413).json({ error: "image too large" });
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const key = objectKeys.avatar(creator.id, Date.now(), ext);
    await storage.putObject(key, bytes, `image/${match[1]}`);
    await updateCreatorProfile(creator.id, { avatar_key: key });
    res.json(await meOf(body.address));
  });

  router.get("/creators/:id/avatar", async (req, res) => {
    const creator = await db.query.creators.findFirst({ where: eq(creators.id, req.params.id) });
    if (!creator?.avatar_key) return res.status(404).end();
    try {
      const obj = await storage.getObject(creator.avatar_key);
      const ext = creator.avatar_key.split(".").pop();
      res.setHeader("Content-Type", ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
      // the URL carries the version, so a given URL never changes content
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      obj.body.pipe(res);
    } catch {
      res.status(404).end();
    }
  });

  router.get("/me/earnings", async (req, res) => {
    const address = typeof req.query.address === "string" ? req.query.address : "";
    if (!address) return res.status(400).json({ error: "address required" });
    res.json(await earningsOf(address));
  });

  router.get("/channel/:handle", async (req, res) => {
    const channel = await channelOf(req.params.handle);
    if (!channel) return res.status(404).json({ error: "channel not found" });
    res.json(channel);
  });

  /** USDC balance from the Mirror Node (the frontend reads Mirror directly in real mode; kept for parity). */
  router.get("/wallet/balance", async (req, res) => {
    const address = typeof req.query.address === "string" ? req.query.address : "";
    if (!address) return res.status(400).json({ error: "address required" });
    const account = await findAccount(address).catch(() => undefined);
    const balance = account ? await tokenBalanceOf(account.account) : 0n;
    res.json({ address, balance: balance.toString() });
  });

  return router;
}
