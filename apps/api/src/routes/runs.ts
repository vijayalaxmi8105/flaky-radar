import { Router } from "express";
import { prisma } from "@flaky-radar/db";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { sendError } from "../lib/apiError.js";

const runsRouter = Router();

runsRouter.get(
  "/runs/:runId",
  authenticate,
  requireRole("admin", "member", "viewer"),
  async (req, res) => {
    try {
      const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;

      if (!runId) {
        return sendError(req, res, "VALIDATION_ERROR", "runId is required.");
      }

      const run = await prisma.ciRun.findUnique({ where: { id: runId } });
      if (!run) {
        return sendError(req, res, "RUN_NOT_FOUND", "No CI run with this id was found.");
      }

      // requireRepoAccess middleware expects repoId in req.params, which this
      // route doesn't have until after the run lookup above — so the same
      // access check (admin bypass + userRepositoryAccess lookup) is done
      // inline here, mirroring requireRepoAccess.ts exactly, including its
      // error codes, so behavior stays consistent across the API.
      if (req.user!.role !== "admin") {
        const access = await prisma.userRepositoryAccess.findUnique({
          where: {
            userId_repositoryId: {
              userId: req.user!.sub,
              repositoryId: run.repositoryId,
            },
          },
        });
        if (!access) {
          return sendError(req, res, "FORBIDDEN", "You do not have access to this repository.");
        }
      }

      // all test executions for this run, joined with test identity
      const executions = await prisma.testExecution.findMany({
        where: { ciRunId: runId },
        include: {
          test: {
            select: { id: true, suiteName: true, testName: true },
          },
        },
        orderBy: { executedAt: "asc" },
      });

      res.json({
        id: run.id,
        repositoryId: run.repositoryId,
        githubRunId: run.githubRunId.toString(),
        workflowName: run.workflowName,
        branch: run.branch,
        commitSha: run.commitSha,
        actor: run.actor,
        event: run.event,
        status: run.status,
        conclusion: run.conclusion,
        attempt: run.attempt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        durationMs: run.durationMs,
        executions: executions.map((e) => ({
          id: e.id,
          testId: e.test.id,
          suiteName: e.test.suiteName,
          testName: e.test.testName,
          status: e.status,
          durationMs: e.durationMs,
          errorMessage: e.errorMessage,
          executedAt: e.executedAt,
        })),
      });
    } catch (err) {
      req.log?.error({ err }, "GET /runs/:runId failed");
      return sendError(req, res, "INTERNAL_ERROR", "Something went wrong while fetching this run.");
    }
  }
);

export { runsRouter };