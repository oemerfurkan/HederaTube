import { Router } from "express";
import { channelOf, earningsOf, meOf } from "../../shared/db/queries.js";
import { findAccount, tokenBalanceOf } from "../../shared/hedera.js";

export function meRouter(): Router {
  const router = Router();

  router.get("/me", async (req, res) => {
    const address = typeof req.query.address === "string" ? req.query.address : "";
    if (!address) return res.status(400).json({ error: "address required" });
    res.json(await meOf(address));
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
