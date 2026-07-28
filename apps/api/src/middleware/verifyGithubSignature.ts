import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  throw new Error("GITHUB_WEBHOOK_SECRET is not set");
}

export function verifyGithubSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const signatureHeader = req.get("X-Hub-Signature-256");

  if (!signatureHeader || !req.rawBody) {
    return res.status(401).json({ error: "Missing signature or body" });
  }

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", WEBHOOK_SECRET as string)
      .update(req.rawBody)
      .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(signatureHeader, "utf8");

  const isValid =
    expectedBuf.length === receivedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, receivedBuf);

  if (!isValid) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  next();
}