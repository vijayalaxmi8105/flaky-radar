import { Request, Response, NextFunction } from "express";
import { prisma } from "@flaky-radar/db"; // adjust import path to your actual db client export
import { sendError } from "../lib/apiError.js";

export async function requireRepoAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return sendError(req, res, "UNAUTHORIZED", "Authentication is required.");
  }

  // admins bypass per-repo checks — remove this block if you want repo access
  // enforced even for admins
  if (req.user.role === "admin") {
    return next();
  }

  const repositoryId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;
  if (!repositoryId) {
    return sendError(req, res, "VALIDATION_ERROR", "repoId is required.");
  }

  const access = await prisma.userRepositoryAccess.findUnique({
    where: {
      userId_repositoryId: {
        userId: req.user.sub,
        repositoryId,
      },
    },
  });

  if (!access) {
    return sendError(req, res, "FORBIDDEN", "You do not have access to this repository.");
  }

  next();
}
