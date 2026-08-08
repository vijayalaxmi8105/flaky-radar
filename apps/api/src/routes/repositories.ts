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

interface LatestFlakyScoreRow {
  testId: string;
  repositoryId: string;
  classification: string;
}

repositoriesRouter.get(
  "/repositories",
  authenticate,
  requireRole("admin", "member", "viewer"),
  async (req, res) => {
    try {
      const userId = req.user!.sub;

      const access = await prisma.userRepositoryAccess.findMany({
        where: { userId },
        select: { repositoryId: true },
      });
      const repoIds = access.map((a) => a.repositoryId);

      if (repoIds.length === 0) {
        return res.json({ repositories: [] });
      }

      const repos = await prisma.repository.findMany({
        where: { id: { in: repoIds } },
        orderBy: { name: "asc" },
      });

      // Latest cached flaky_scores row per test, scoped to accessible repos.
      // flaky_scores is a history table (no unique constraint on testId),
      // so "current" score = most recent row per test by computedAt.
      // Prisma has no DISTINCT ON support, hence raw SQL here.
      const latestScores = await prisma.$queryRaw<LatestFlakyScoreRow[]>`
        SELECT DISTINCT ON (fs."testId")
          fs."testId",
          t."repositoryId",
          fs.classification
        FROM flaky_scores fs
        JOIN tests t ON t.id = fs."testId"
        WHERE t."repositoryId" = ANY(${repoIds})
        ORDER BY fs."testId", fs."computedAt" DESC
      `;

      // Total test count per repo (independent of scoring/cache).
      const testCounts = await prisma.test.groupBy({
        by: ["repositoryId"],
        where: { repositoryId: { in: repoIds } },
        _count: { id: true },
      });
      const testCountByRepo = new Map(
        testCounts.map((tc) => [tc.repositoryId, tc._count.id])
      );

      // Group latest scores by repo, then compute reliabilityScore the same
      // way the detail endpoint does: share of scoreable (non
      // insufficient_data) tests that are stable. Cache writes
      // classification lowercase (see recompute-flaky-scores.ts), so
      // compare lowercase here too.
      const scoresByRepo = new Map<string, string[]>();
      for (const row of latestScores) {
        const list = scoresByRepo.get(row.repositoryId) ?? [];
        list.push(row.classification);
        scoresByRepo.set(row.repositoryId, list);
      }

      const results = repos.map((repo) => {
        const classifications = scoresByRepo.get(repo.id) ?? [];
        const scoreable = classifications.filter((c) => c !== "insufficient_data");
        const reliabilityScore =
          scoreable.length > 0
            ? scoreable.filter((c) => c === "stable").length / scoreable.length
            : null;

        return {
          id: repo.id,
          owner: repo.owner,
          name: repo.name,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          isActive: repo.isActive,
          githubId: repo.githubId.toString(),
          reliabilityScore,
          testCount: testCountByRepo.get(repo.id) ?? 0,
        };
      });

      res.json({ repositories: results });
    } catch (err) {
      req.log?.error({ err }, "GET /repositories failed");
      return sendError(req, res, "INTERNAL_ERROR", "Something went wrong while listing repositories.");
    }
  }
);

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