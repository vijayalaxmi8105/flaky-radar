// apps/api/src/routes/repositories.ts
import { Router } from "express";
import { prisma } from "@flaky-radar/db";
import { failureRate, alternationRate, classify } from "@flaky-radar/analytics";
import type { TestExecution as AnalyticsExecution } from "@flaky-radar/analytics";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireRepoAccess } from "../middleware/requireRepoAccess.js";
import { sendError } from "../lib/apiError.js";

const repositoriesRouter = Router();

const TOP_FLAKY_LIMIT = 5;
const RECENT_RUNS_LIMIT = 10;

repositoriesRouter.get(
  "/repositories/:repoId",
  authenticate,
  requireRole("admin", "member", "viewer"),
  requireRepoAccess,
  async (req, res) => {
    try {
      const repoId = Array.isArray(req.params.repoId)
        ? req.params.repoId[0]
        : req.params.repoId;

      if (!repoId) {
        return sendError(req, res, "VALIDATION_ERROR", "repoId is required.");
      }

      const repo = await prisma.repository.findUnique({ where: { id: repoId } });
      if (!repo) {
        return sendError(req, res, "REPOSITORY_NOT_FOUND", "No repository with this id was found.");
      }

      // recent runs, most recent first
      const recentRuns = await prisma.ciRun.findMany({
        where: { repositoryId: repoId },
        orderBy: { startedAt: "desc" },
        take: RECENT_RUNS_LIMIT,
      });

      // all tests for this repo, with executions scoped to defaultBranch only,
      // chronologically ordered (required precondition for alternationRate)
      const tests = await prisma.test.findMany({
        where: { repositoryId: repoId },
        include: {
          executions: {
            where: { ciRun: { branch: repo.defaultBranch } },
            orderBy: { executedAt: "asc" },
            select: { status: true },
          },
        },
      });

      const scored = tests.map((test) => {
        const executions: AnalyticsExecution[] = test.executions.map((e) => ({
          status: e.status as AnalyticsExecution["status"],
        }));

        const fr = failureRate(executions);
        const ar = alternationRate(executions);
        const result = classify({
          failure_rate: fr.failureRate,
          alternation_rate: ar.alternationRate,
          total_executions: fr.totalExecutions,
        });

        return {
          testId: test.id,
          suiteName: test.suiteName,
          testName: test.testName,
          failureRate: fr.failureRate,
          alternationRate: ar.alternationRate,
          totalExecutions: fr.totalExecutions,
          classification: result.classification,
          confidenceScore: result.confidence_score,
        };
      });

      // reliabilityScore: share of scoreable tests (i.e. not INSUFFICIENT_DATA)
      // that are STABLE. Tests with too little data are excluded from both
      // numerator and denominator since they carry no reliability signal yet.
      const scoreable = scored.filter((t) => t.classification !== "INSUFFICIENT_DATA");
      const reliabilityScore =
        scoreable.length > 0
          ? scoreable.filter((t) => t.classification === "STABLE").length / scoreable.length
          : null;

      const topFlakyTests = scored
        .filter((t) => t.classification === "FLAKY" && t.totalExecutions > 0)
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .slice(0, TOP_FLAKY_LIMIT)
        .map((t) => ({
          testId: t.testId,
          suiteName: t.suiteName,
          testName: t.testName,
          failureRate: t.failureRate,
          alternationRate: t.alternationRate,
          confidenceScore: t.confidenceScore,
          totalExecutions: t.totalExecutions,
        }));

      res.json({
        id: repo.id,
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        isActive: repo.isActive,
        githubId: repo.githubId.toString(),
        reliabilityScore,
        recentRuns: recentRuns.map((r) => ({
          id: r.id,
          branch: r.branch,
          status: r.status,
          conclusion: r.conclusion,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          durationMs: r.durationMs,
        })),
        topFlakyTests,
      });
    } catch (err) {
      req.log?.error({ err }, "GET /repositories/:repoId failed");
      return sendError(req, res, "INTERNAL_ERROR", "Something went wrong while fetching this repository.");
    }
  }
);

export { repositoriesRouter };