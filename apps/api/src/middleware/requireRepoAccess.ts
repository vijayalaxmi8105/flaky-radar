import { Request, Response, NextFunction } from "express";
import { prisma } from "@flaky-radar/db"; // adjust import path to your actual db client export

export async function requireRepoAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthenticated" });
  }

  // admins bypass per-repo checks — remove this block if you want repo access
  // enforced even for admins
  if (req.user.role === "admin") {
    return next();
  }

  const repositoryId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;
  if (!repositoryId) {
    return res.status(400).json({ error: "missing_repo_id" });
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
    return res.status(403).json({ error: "no_repo_access" });
  }

  next();
}