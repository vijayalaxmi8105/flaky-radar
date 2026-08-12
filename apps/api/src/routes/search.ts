import { Router } from "express";
import { prisma } from "@flaky-radar/db";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { sendError } from "../lib/apiError.js";

const searchRouter = Router();

const SEARCH_LIMIT = 20;

searchRouter.get(
  "/search",
  authenticate,
  requireRole("admin", "member", "viewer"),
  async (req, res) => {
    try {
      const userId = req.user!.sub;
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const type = typeof req.query.type === "string" ? req.query.type : undefined;

      if (!q) {
        return sendError(req, res, "VALIDATION_ERROR", "q is required.");
      }
      if (type !== undefined && type !== "test" && type !== "repo") {
        return sendError(req, res, "VALIDATION_ERROR", "type must be 'test' or 'repo' if provided.");
      }

      // scope to repos this user can access — same pattern as GET /repositories
      const access = await prisma.userRepositoryAccess.findMany({
        where: { userId },
        select: { repositoryId: true },
      });
      const repoIds = access.map((a) => a.repositoryId);

      if (repoIds.length === 0) {
        return res.json({ results: [] });
      }

      const results: Array<Record<string, unknown>> = [];

      if (type === undefined || type === "repo") {
        const repos = await prisma.repository.findMany({
          where: {
            id: { in: repoIds },
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { fullName: { contains: q, mode: "insensitive" } },
              { owner: { contains: q, mode: "insensitive" } },
            ],
          },
          take: SEARCH_LIMIT,
          orderBy: { name: "asc" },
        });

        for (const repo of repos) {
          results.push({
            type: "repo",
            id: repo.id,
            owner: repo.owner,
            name: repo.name,
            fullName: repo.fullName,
          });
        }
      }

      if (type === undefined || type === "test") {
        const tests = await prisma.test.findMany({
          where: {
            repositoryId: { in: repoIds },
            OR: [
              { testName: { contains: q, mode: "insensitive" } },
              { suiteName: { contains: q, mode: "insensitive" } },
            ],
          },
          take: SEARCH_LIMIT,
          orderBy: { testName: "asc" },
        });

        for (const test of tests) {
          results.push({
            type: "test",
            id: test.id,
            repositoryId: test.repositoryId,
            suiteName: test.suiteName,
            testName: test.testName,
          });
        }
      }

      res.json({ results });
    } catch (err) {
      req.log?.error({ err }, "GET /search failed");
      return sendError(req, res, "INTERNAL_ERROR", "Something went wrong while searching.");
    }
  }
);

export { searchRouter };