import { Router } from "express";
import { pool } from "../db.js";
import { redis } from "../redis.js";

export const healthRouter = Router();

// Liveness: process is up, nothing external checked.
healthRouter.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Readiness: only 200 if dependencies actually respond.
healthRouter.get("/readyz", async (req, res) => {
  const checks: Record<string, "ok" | "fail"> = { db: "fail", redis: "fail" };

  const timeout = (ms: number) =>
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));

  const dbCheck = pool
    .query("SELECT 1")
    .then(() => (checks.db = "ok"))
    .catch((err: any) => {
      req.log.warn({ err }, "readyz: db check failed");
    });

  const redisCheck = redis
    .ping()
    .then(() => (checks.redis = "ok"))
    .catch((err: any) => {
      req.log.warn({ err }, "readyz: redis check failed");
    });

  await Promise.race([Promise.allSettled([dbCheck, redisCheck]), timeout(2000)]).catch(() => {
    req.log.warn("readyz: check timed out");
  });

  const allOk = Object.values(checks).every((v) => v === "ok");
  res.status(allOk ? 200 : 503).json({ status: allOk ? "ok" : "unavailable", checks });
});