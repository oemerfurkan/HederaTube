/**
 * HederaTube facilitator — x402 `batch-settlement` on Hedera.
 *
 * Exposes the standard facilitator surface (`POST /verify`, `POST /settle`, `GET /supported`)
 * for the batch-settlement scheme: verifies deposit / voucher / refund payloads and submits
 * deposit, claim, settle and refund contract calls to the escrow from the operator account.
 */
import { x402Facilitator } from "@x402/core/facilitator";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import {
  createFacilitatorHederaBatchSigner,
  createHederaAuthorizerSigner,
  getBatchSettlementDeployment,
  parseHederaPrivateKey,
  type HederaAuthorizerSigner,
} from "@x402/hedera/batch-settlement";
import { BatchSettlementHederaScheme } from "@x402/hedera/batch-settlement/facilitator";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";

dotenv.config();

const PORT = Number(process.env.PORT || "4022");
const NETWORK = (process.env.HEDERA_NETWORK || "hedera:testnet") as `${string}:${string}`;
const operatorId = process.env.HEDERA_ACCOUNT_ID?.trim();
const operatorKey = process.env.HEDERA_PRIVATE_KEY?.trim();
const authorizerId = process.env.HEDERA_RECEIVER_AUTHORIZER_ACCOUNT_ID?.trim();
const authorizerKey = process.env.HEDERA_RECEIVER_AUTHORIZER_PRIVATE_KEY?.trim();
const mirrorNodeUrl = process.env.HEDERA_MIRROR_NODE_URL?.trim() || undefined;
const simulateBeforeSend = process.env.SIMULATE_BEFORE_SEND !== "false";

if (!operatorId || !operatorKey) {
  console.error("HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY are required (see .env-local)");
  process.exit(1);
}

/**
 * Builds the facilitator with the Hedera batch-settlement scheme registered.
 *
 * @returns The configured facilitator and the advertised authorizer (if any).
 */
async function buildFacilitator(): Promise<{
  facilitator: x402Facilitator;
  authorizer?: HederaAuthorizerSigner;
}> {
  const deployment = getBatchSettlementDeployment(NETWORK);

  const signer = createFacilitatorHederaBatchSigner({
    accountId: operatorId!,
    privateKey: parseHederaPrivateKey(operatorKey!),
    network: NETWORK,
    ...(mirrorNodeUrl ? { mirrorNodeUrl } : {}),
  });

  let authorizer: HederaAuthorizerSigner | undefined;
  if (authorizerId && authorizerKey) {
    authorizer = await createHederaAuthorizerSigner(authorizerId, parseHederaPrivateKey(authorizerKey), {
      network: NETWORK,
      ...(mirrorNodeUrl ? { mirrorNodeUrl } : {}),
    });
  }

  const facilitator = new x402Facilitator()
    .onAfterVerify(async ctx => {
      const payload = ctx.paymentPayload.payload as { type?: string };
      console.log(`[verify] ${payload.type ?? "?"} valid=${ctx.result.isValid} payer=${ctx.result.payer ?? "-"}`);
    })
    .onVerifyFailure(async ctx => {
      console.warn(`[verify] failed: ${ctx.error instanceof Error ? ctx.error.message : String(ctx.error)}`);
    })
    .onAfterSettle(async ctx => {
      const payload = ctx.paymentPayload.payload as { type?: string };
      console.log(
        `[settle] ${payload.type ?? "?"} success=${ctx.result.success} tx=${ctx.result.transaction || "-"} amount=${ctx.result.amount ?? "-"}` +
          (ctx.result.success ? "" : ` reason=${ctx.result.errorReason}`),
      );
    })
    .onSettleFailure(async ctx => {
      console.warn(`[settle] failed: ${ctx.error instanceof Error ? ctx.error.message : String(ctx.error)}`);
    });

  facilitator.register(
    NETWORK,
    new BatchSettlementHederaScheme(signer, authorizer, { simulateBeforeSend }),
  );

  console.log(`network:              ${NETWORK}`);
  console.log(`operator (fee payer): ${operatorId}`);
  console.log(`escrow:               ${deployment.settlementId} (${deployment.settlement})`);
  console.log(`collector:            ${deployment.collectorId} (${deployment.collector})`);
  console.log(
    authorizer
      ? `receiver authorizer:  ${authorizerId} (${authorizer.address})`
      : "receiver authorizer:  not configured (servers must supply their own)",
  );
  return { facilitator, authorizer };
}

/**
 * Sends a JSON error response.
 *
 * @param res - Express response.
 * @param status - HTTP status code.
 * @param error - Error to report.
 */
function fail(res: Response, status: number, error: unknown): void {
  res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
}

/**
 * Starts the HTTP server.
 */
async function main(): Promise<void> {
  const { facilitator } = await buildFacilitator();
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, network: NETWORK });
  });

  app.get("/supported", (_req, res) => {
    try {
      res.json(facilitator.getSupported());
    } catch (error) {
      fail(res, 500, error);
    }
  });

  app.post("/verify", async (req: Request, res: Response) => {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload?: PaymentPayload;
      paymentRequirements?: PaymentRequirements;
    };
    if (!paymentPayload || !paymentRequirements) {
      return fail(res, 400, "Missing paymentPayload or paymentRequirements");
    }
    try {
      const response: VerifyResponse = await facilitator.verify(paymentPayload, paymentRequirements);
      res.json(response);
    } catch (error) {
      console.error("verify error:", error);
      fail(res, 500, error);
    }
  });

  app.post("/settle", async (req: Request, res: Response) => {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload?: PaymentPayload;
      paymentRequirements?: PaymentRequirements;
    };
    if (!paymentPayload || !paymentRequirements) {
      return fail(res, 400, "Missing paymentPayload or paymentRequirements");
    }
    try {
      const response: SettleResponse = await facilitator.settle(paymentPayload, paymentRequirements);
      res.json(response);
    } catch (error) {
      console.error("settle error:", error);
      if (error instanceof Error && error.message.includes("Settlement aborted:")) {
        return res.json({
          success: false,
          errorReason: error.message.replace("Settlement aborted: ", ""),
          transaction: "",
          network: paymentRequirements.network,
        } satisfies SettleResponse);
      }
      fail(res, 500, error);
    }
  });

  app.listen(PORT, () => {
    console.log(`HederaTube facilitator listening on http://localhost:${PORT}`);
    console.log("  GET  /health");
    console.log("  GET  /supported");
    console.log("  POST /verify");
    console.log("  POST /settle");
  });
}

main().catch(error => {
  console.error("startup failed:", error);
  process.exit(1);
});
