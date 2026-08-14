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
const DEFAULT_RUNS_LIMIT = 20;
const MAX_RUNS_LIMIT = 100;
const DEFAULT_SUMMARY_WINDOW_DAYS = 30;

interface LatestFlakyScoreRow {
  testId: string;
  repositoryId: string;
  classification: string;
}

interface LatestFlakyScoreFullRow {
  testId: string;
  suiteName: string;
  testName: string;
  passRate: number;
  failureRate: number;
  totalExecutions: number;
  classification: string;
  confidenceScore: number;
  computedAt: Date;
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
      const repoIds = access.map((a: { repositoryId: string }) => a.repositoryId);

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
        testCounts.map((tc: { repositoryId: string; _count: { id: number } }) => [tc.repositoryId, tc._count.id])
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

      const results = repos.map((repo: { id: string; owner: string; name: string; fullName: string; defaultBranch: string; isActive: boolean; githubId: bigint }) => {
        const classifications = scoresByRepo.get(repo.id) ?? [];
        const scoreable = classifications.filter((c: string) => c !== "insufficient_data");
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

      const scored = tests.map((test: { id: string; suiteName: string; testName: string; executions: { status: string }[] }) => {
        const executions: AnalyticsExecution[] = test.executions.map((e: { status: string }) => ({
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
      const scoreable = scored.filter((t: typeof scored[number]) => t.classification !== "INSUFFICIENT_DATA");
      const reliabilityScore =
        scoreable.length > 0
          ? scoreable.filter((t: typeof scoreable[number]) => t.classification === "STABLE").length / scoreable.length
          : null;

      const topFlakyTests = scored
        .filter((t: typeof scored[number]) => t.classification === "FLAKY" && t.totalExecutions > 0)
        .sort((a: typeof scored[number], b: typeof scored[number]) => b.confidenceScore - a.confidenceScore)
        .slice(0, TOP_FLAKY_LIMIT)
        .map((t: typeof scored[number]) => ({
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
        recentRuns: recentRuns.map((r: { id: string; branch: string; status: string; conclusion: string | null; startedAt: Date; completedAt: Date | null; durationMs: number | null }) => ({
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

repositoriesRouter.get(
  "/repositories/:repoId/runs",
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

      const { branch, status, since, until, cursor } = req.query as Record<string, string | undefined>;

      let limit = DEFAULT_RUNS_LIMIT;
      if (req.query.limit !== undefined) {
        const parsed = Number(req.query.limit);
        if (!Number.isNaN(parsed) && parsed > 0) {
          limit = Math.min(Math.floor(parsed), MAX_RUNS_LIMIT);
        }
      }

      const where: Record<string, unknown> = { repositoryId: repoId };
      if (branch) where.branch = branch;
      if (status) where.status = status;
      if (since || until) {
        where.startedAt = {
          ...(since ? { gte: new Date(since) } : {}),
          ...(until ? { lte: new Date(until) } : {}),
        };
      }

      // fetch one extra row to detect whether a next page exists
      const runs = await prisma.ciRun.findMany({
        where,
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      const hasMore = runs.length > limit;
      const page = hasMore ? runs.slice(0, limit) : runs;
      const nextCursor = hasMore ? page[page.length - 1].id : null;

      res.json({
        runs: page.map((r) => ({
          id: r.id,
          branch: r.branch,
          status: r.status,
          conclusion: r.conclusion,
          workflowName: r.workflowName,
          commitSha: r.commitSha,
          actor: r.actor,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          durationMs: r.durationMs,
        })),
        nextCursor,
      });
    } catch (err) {
      req.log?.error({ err }, "GET /repositories/:repoId/runs failed");
      return sendError(req, res, "INTERNAL_ERROR", "Something went wrong while fetching runs.");
    }
  }
);

repositoriesRouter.get(
  "/repositories/:repoId/flaky-tests",
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

      // Latest cached flaky_scores row per test in this repo (same
      // DISTINCT ON pattern as the list endpoint, since flaky_scores is a
      // history table with no unique constraint on testId). Reads from
      // cache rather than live-computing, matching the list endpoint's
      // approach and avoiding the N+1 anti-pattern fixed on Day 24.
      const latestScores = await prisma.$queryRaw<LatestFlakyScoreFullRow[]>`
        SELECT DISTINCT ON (fs."testId")
          fs."testId",
          t."suiteName",
          t."testName",
          fs."passRate",
          fs."failureRate",
          fs."totalExecutions",
          fs.classification,
          fs."confidenceScore",
          fs."computedAt"
        FROM flaky_scores fs
        JOIN tests t ON t.id = fs."testId"
        WHERE t."repositoryId" = ${repoId}
        ORDER BY fs."testId", fs."computedAt" DESC
      `;

      // "fix this first" ranking: most confidently flaky first.
      // Cache writes classification lowercase (recompute-flaky-scores.ts),
      // so compare lowercase here too, matching the list endpoint.
      const flakyTests = latestScores
        .filter((row) => row.classification === "flaky")
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .map((row) => ({
          testId: row.testId,
          suiteName: row.suiteName,
          testName: row.testName,
          passRate: row.passRate,
          failureRate: row.failureRate,
          totalExecutions: row.totalExecutions,
          confidenceScore: row.confidenceScore,
          computedAt: row.computedAt,
        }));

      res.json({ flakyTests });
    } catch (err) {
      req.log?.error({ err }, "GET /repositories/:repoId/flaky-tests failed");
      return sendError(req, res, "INTERNAL_ERROR", "Something went wrong while fetching flaky tests.");
    }
  }
);

repositoriesRouter.get(
  "/repositories/:repoId/analytics/summary",
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

      let windowDays = DEFAULT_SUMMARY_WINDOW_DAYS;
      if (req.query.days !== undefined) {
        const parsed = Number(req.query.days);
        if (!Number.isNaN(parsed) && parsed > 0) {
          windowDays = Math.floor(parsed);
        }
      }
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

      // Latest cached flaky_scores row per test in this repo (same
      // DISTINCT ON pattern used elsewhere in this file).
      const latestScores = await prisma.$queryRaw<LatestFlakyScoreFullRow[]>`
        SELECT DISTINCT ON (fs."testId")
          fs."testId",
          t."suiteName",
          t."testName",
          fs."passRate",
          fs."failureRate",
          fs."totalExecutions",
          fs.classification,
          fs."confidenceScore",
          fs."computedAt"
        FROM flaky_scores fs
        JOIN tests t ON t.id = fs."testId"
        WHERE t."repositoryId" = ${repoId}
        ORDER BY fs."testId", fs."computedAt" DESC
      `;

      // Classification buckets. "broken" is a distinct cache classification
      // (consistently failing, not flaky) separate from stable/flaky/
      // insufficient_data - confirmed via direct DB inspection.
      const classificationCounts = {
        stable: 0,
        flaky: 0,
        broken: 0,
        insufficient_data: 0,
      };
      for (const row of latestScores) {
        if (row.classification in classificationCounts) {
          classificationCounts[row.classification as keyof typeof classificationCounts]++;
        }
      }

      // reliabilityScore: share of scoreable tests (i.e. not
      // insufficient_data) that are stable. Matches the definition used by
      // the /repositories list endpoint - "scoreable" is everything except
      // insufficient_data, so "broken" tests count against reliability
      // without being confused for "flaky".
      const scoreableCount =
        latestScores.length - classificationCounts.insufficient_data;
      const reliabilityScore =
        scoreableCount > 0 ? classificationCounts.stable / scoreableCount : null;

      const topFlakyTests = latestScores
        .filter((row) => row.classification === "flaky")
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .slice(0, TOP_FLAKY_LIMIT)
        .map((row) => ({
          testId: row.testId,
          suiteName: row.suiteName,
          testName: row.testName,
          failureRate: row.failureRate,
          confidenceScore: row.confidenceScore,
          totalExecutions: row.totalExecutions,
        }));

      // Run summary over the window, computed directly from ci_runs
      // (not cached — cheap aggregate, and freshness matters more here
      // than for the per-test flaky scores).
      const runsInWindow = await prisma.ciRun.findMany({
        where: { repositoryId: repoId, startedAt: { gte: since } },
        select: { conclusion: true },
      });

      const totalRuns = runsInWindow.length;
      const passedRuns = runsInWindow.filter((r) => r.conclusion === "success").length;
      const failedRuns = runsInWindow.filter((r) => r.conclusion === "failure").length;
      const runPassRate = totalRuns > 0 ? passedRuns / totalRuns : null;

      res.json({
        repositoryId: repo.id,
        reliabilityScore,
        testCounts: {
          total: latestScores.length,
          stable: classificationCounts.stable,
          flaky: classificationCounts.flaky,
          broken: classificationCounts.broken,
          insufficientData: classificationCounts.insufficient_data,
        },
        runSummary: {
          windowDays,
          totalRuns,
          passedRuns,
          failedRuns,
          passRate: runPassRate,
        },
        topFlakyTests,
      });
    } catch (err) {
      req.log?.error({ err }, "GET /repositories/:repoId/analytics/summary failed");
      return sendError(req, res, "INTERNAL_ERROR", "Something went wrong while fetching the analytics summary.");
    }
  }
);

repositoriesRouter.get(
  "/repositories/:repoId/tests/:testId",
  authenticate,
  requireRole("admin", "member", "viewer"),
  requireRepoAccess,
  async (req, res) => {
    try {
      const repoId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;
      const testId = Array.isArray(req.params.testId) ? req.params.testId[0] : req.params.testId;

      if (!repoId || !testId) {
        return sendError(req, res, "VALIDATION_ERROR", "repoId and testId are required.");
      }

      const repo = await prisma.repository.findUnique({ where: { id: repoId } });
      if (!repo) {
        return sendError(req, res, "REPOSITORY_NOT_FOUND", "No repository with this id was found.");
      }

      const test = await prisma.test.findUnique({
        where: { id: testId },
        include: {
          executions: {
            where: { ciRun: { branch: repo.defaultBranch } },
            orderBy: { executedAt: "asc" },
            select: { status: true },
          },
        },
      });

      if (!test || test.repositoryId !== repoId) {
        return sendError(req, res, "TEST_NOT_FOUND", "No test with this id was found in this repository.");
      }

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

      res.json({
        testId: test.id,
        repositoryId: test.repositoryId,
        suiteName: test.suiteName,
        testName: test.testName,
        failureRate: fr.failureRate,
        alternationRate: ar.alternationRate,
        totalExecutions: fr.totalExecutions,
        classification: result.classification,
        confidenceScore: result.confidence_score,
        firstSeenAt: test.firstSeenAt,
        lastSeenAt: test.lastSeenAt,
      });
    } catch (err) {
      req.log?.error({ err }, "GET /repositories/:repoId/tests/:testId failed");
      return sendError(req, res, "INTERNAL_ERROR", "Something went wrong while fetching this test.");
    }
  }
);

repositoriesRouter.get(
  "/repositories/:repoId/tests/:testId/timeline",
  authenticate,
  requireRole("admin", "member", "viewer"),
  requireRepoAccess,
  async (req, res) => {
    try {
      const repoId = Array.isArray(req.params.repoId) ? req.params.repoId[0] : req.params.repoId;
      const testId = Array.isArray(req.params.testId) ? req.params.testId[0] : req.params.testId;

      if (!repoId || !testId) {
        return sendError(req, res, "VALIDATION_ERROR", "repoId and testId are required.");
      }

      const repo = await prisma.repository.findUnique({ where: { id: repoId } });
      if (!repo) {
        return sendError(req, res, "REPOSITORY_NOT_FOUND", "No repository with this id was found.");
      }

      const test = await prisma.test.findUnique({ where: { id: testId } });
      if (!test || test.repositoryId !== repoId) {
        return sendError(req, res, "TEST_NOT_FOUND", "No test with this id was found in this repository.");
      }

      // aggregate pass/fail counts per calendar day, scoped to default branch
      const rows = await prisma.$queryRaw<{ day: Date; status: string; count: bigint }[]>`
        SELECT
          date_trunc('day', te."executedAt") AS day,
          te.status,
          COUNT(*) AS count
        FROM test_executions te
        JOIN ci_runs r ON r.id = te."ciRunId"
        WHERE te."testId" = ${testId}
          AND r.branch = ${repo.defaultBranch}
        GROUP BY day, te.status
        ORDER BY day ASC
      `;

      const byDay = new Map<string, { passCount: number; failCount: number }>();
      for (const row of rows) {
        const key = row.day.toISOString().slice(0, 10);
        const entry = byDay.get(key) ?? { passCount: 0, failCount: 0 };
        if (row.status === "pass") entry.passCount += Number(row.count);
        else if (row.status === "fail") entry.failCount += Number(row.count);
        byDay.set(key, entry);
      }

      const timeline = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({ date, ...counts }));

      res.json({ testId: test.id, timeline });
    } catch (err) {
      req.log?.error({ err }, "GET /repositories/:repoId/tests/:testId/timeline failed");
      return sendError(req, res, "INTERNAL_ERROR", "Something went wrong while fetching the test timeline.");
    }
  }
);

export { repositoriesRouter };