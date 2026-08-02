import express, { Router } from "express";
import { captureRawBody } from "../middleware/rawBody";
import { verifyGithubSignature } from "../middleware/verifyGithubSignature";
import { logger } from "../logger";
import { claimDeliveryId } from "./dedupe";
import { prisma, Prisma } from "@flaky-radar/db";
import { ciEventsQueue, PROCESS_WORKFLOW_RUN_JOB } from "@flaky-radar/queue";

export const webhookRouter = Router();

webhookRouter.post(
  "/github",
  express.json({ verify: captureRawBody, limit: "5mb" }),
  verifyGithubSignature,
  async (req, res) => {
    const deliveryId = req.get("X-GitHub-Delivery");
    const eventType = req.get("X-GitHub-Event");

    if (!deliveryId || !eventType) {
      return res.status(400).json({ error: "missing delivery headers" });
    }

    // Fast in-memory dedupe check
    let isNew = true;
    try {
      isNew = await claimDeliveryId(deliveryId);
    } catch (err) {
      logger.warn(
        { err, deliveryId },
        "redis dedupe check failed, falling back to DB unique constraint only"
      );
    }

    if (!isNew) {
      logger.info({ deliveryId }, "duplicate webhook delivery, no-op");
      return res.status(202).json({ status: "duplicate_ignored" });
    }

    let delivery;
    try {
      delivery = await prisma.webhookDelivery.create({
        data: {
          githubDeliveryId: deliveryId,
          eventType,
          payload: req.body,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        logger.warn(
          { deliveryId },
          "DB unique constraint caught a duplicate Redis missed"
        );
        return res.status(202).json({ status: "duplicate_ignored" });
      }
      logger.error({ err, deliveryId }, "failed to persist webhook delivery");
      return res.status(500).json({ error: "internal error" });
    }

    try {
      await ciEventsQueue.add(PROCESS_WORKFLOW_RUN_JOB, {
        webhookDeliveryId: delivery.id,
      });
    } catch (err) {
      logger.error(
        { err, deliveryId, webhookDeliveryId: delivery.id },
        "failed to enqueue ci-events job"
      );
      // don't fail the response — the row is persisted; a later reconciliation
      // job can catch anything stuck in "pending" processingStatus
    }

    logger.info(
      { deliveryId, eventType, rawBodyLength: req.rawBody?.length },
      "webhook verified, deduped, and persisted"
    );
    return res.status(202).json({ status: "accepted" });
  }
);