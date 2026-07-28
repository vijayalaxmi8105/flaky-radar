import express, { Router } from "express";
import { captureRawBody } from "../middleware/rawBody";
import { verifyGithubSignature } from "../middleware/verifyGithubSignature";
import { logger } from "../logger";

export const webhookRouter = Router();

webhookRouter.post(
  "/github",
  express.json({ verify: captureRawBody, limit: "5mb" }),
  verifyGithubSignature,
  (req, res) => {
    logger.info(
      { rawBodyLength: req.rawBody?.length, parsedBody: req.body },
      "webhook verified and received"
    );
    res.status(202).json({ received: true });
  }
);