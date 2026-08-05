import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { prisma } from "@flaky-radar/db";
import { processCiEvent } from "./processor.js";
import type { Job } from "bullmq";
import type { CiEventJobData } from "@flaky-radar/queue";

vi.mock("../junit/fetchJunitArtifact.js", () => ({
  fetchJunitXmlForRun: vi.fn(),
}));
import { fetchJunitXmlForRun } from "../junit/fetchJunitArtifact.js";
const mockFetch = vi.mocked(fetchJunitXmlForRun);

function payload(runId: number, repoFullName: string) {
  return {
    action: "completed",
    workflow_run: {
      id: runId,
      name: "CI",
      head_branch: "main",
      head_sha: "abc123def456",
      run_attempt: 1,
      event: "push",
      status: "completed",
      conclusion: "success",
      run_started_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-01T10:05:00Z",
      actor: { login: "octocat" },
    },
    repository: { full_name: repoFullName },
  };
}

function fakeJob(webhookDeliveryId: string): Job<CiEventJobData> {
  return {
    id: "fake-job-" + Date.now() + Math.random(),
    data: { webhookDeliveryId } as CiEventJobData,
    attemptsMade: 0,
    opts: { attempts: 5 },
  } as unknown as Job<CiEventJobData>;
}

const JUNIT_XML_TWO_TESTS = `<?xml version="1.0"?>
<testsuite name="MySuite" tests="2" failures="0" errors="0" skipped="0">
  <testcase classname="MySuite" name="testA" time="0.5" />
  <testcase classname="MySuite" name="testB" time="0.3" />
</testsuite>`;

const JUNIT_XML_ZERO_TESTS = `<?xml version="1.0"?>
<testsuite name="EmptySuite" tests="0" failures="0" errors="0" skipped="0">
</testsuite>`;

const JUNIT_XML_SKIP_ERROR = `<?xml version="1.0"?>
<testsuite name="MixedSuite" tests="3" failures="0" errors="1" skipped="1">
  <testcase classname="MixedSuite" name="testPass" time="0.1" />
  <testcase classname="MixedSuite" name="testSkipped" time="0.0">
    <skipped />
  </testcase>
  <testcase classname="MixedSuite" name="testError" time="0.2">
    <error message="boom">Stack trace here</error>
  </testcase>
</testsuite>`;

async function setupRepoAndDelivery(repoFullName: string, githubId: bigint, runId: number) {
  const [owner, name] = repoFullName.split("/");
  const repo = await prisma.repository.create({
    data: { githubId, owner, name, fullName: repoFullName },
  });
  const delivery = await prisma.webhookDelivery.create({
    data: {
      githubDeliveryId: `delivery-${runId}`,
      eventType: "workflow_run",
      payload: payload(runId, repoFullName),
    },
  });
  return { repo, delivery };
}

async function cleanup(repoId: string, deliveryId: string) {
  await prisma.testExecution.deleteMany({ where: { ciRun: { repositoryId: repoId } } });
  await prisma.test.deleteMany({ where: { repositoryId: repoId } });
  await prisma.ciRun.deleteMany({ where: { repositoryId: repoId } });
  await prisma.webhookDelivery.deleteMany({ where: { id: deliveryId } });
  await prisma.repository.deleteMany({ where: { id: repoId } });
}

describe("processCiEvent idempotency + edge cases", () => {
  let repoId: string;
  let deliveryId: string;

  afterEach(async () => {
    vi.clearAllMocks();
    if (repoId && deliveryId) {
      await cleanup(repoId, deliveryId);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("does not duplicate ci_runs, tests, or test_executions on replay", async () => {
    mockFetch.mockResolvedValue(JUNIT_XML_TWO_TESTS);
    const { repo, delivery } = await setupRepoAndDelivery(
      "test-owner/idempotency-repo",
      999002n,
      777001
    );
    repoId = repo.id;
    deliveryId = delivery.id;

    await processCiEvent(fakeJob(delivery.id));
    await processCiEvent(fakeJob(delivery.id));

    const runs = await prisma.ciRun.findMany({
      where: { repositoryId: repo.id, githubRunId: 777001n },
    });
    expect(runs).toHaveLength(1);

    const tests = await prisma.test.findMany({ where: { repositoryId: repo.id } });
    expect(tests).toHaveLength(2);

    const executions = await prisma.testExecution.findMany({
      where: { ciRun: { repositoryId: repo.id } },
    });
    expect(executions).toHaveLength(2);
  });

  it("handles a run with zero tests gracefully", async () => {
    mockFetch.mockResolvedValue(JUNIT_XML_ZERO_TESTS);
    const { repo, delivery } = await setupRepoAndDelivery(
      "test-owner/zero-tests-repo",
      999003n,
      777002
    );
    repoId = repo.id;
    deliveryId = delivery.id;

    await processCiEvent(fakeJob(delivery.id));

    const runs = await prisma.ciRun.findMany({ where: { repositoryId: repo.id } });
    expect(runs).toHaveLength(1);

    const executions = await prisma.testExecution.findMany({
      where: { ciRun: { repositoryId: repo.id } },
    });
    expect(executions).toHaveLength(0);
  });

  it("correctly records skipped and error statuses", async () => {
    mockFetch.mockResolvedValue(JUNIT_XML_SKIP_ERROR);
    const { repo, delivery } = await setupRepoAndDelivery(
      "test-owner/skip-error-repo",
      999004n,
      777003
    );
    repoId = repo.id;
    deliveryId = delivery.id;

    await processCiEvent(fakeJob(delivery.id));

    const executions = await prisma.testExecution.findMany({
      where: { ciRun: { repositoryId: repo.id } },
      orderBy: { executedAt: "asc" },
    });
    const statuses = executions.map((e) => e.status).sort();
    expect(statuses).toEqual(["error", "pass", "skip"]);
  });

  it("does not fail the whole job when the artifact is missing (null)", async () => {
    mockFetch.mockResolvedValue(null);
    const { repo, delivery } = await setupRepoAndDelivery(
      "test-owner/missing-artifact-repo",
      999005n,
      777004
    );
    repoId = repo.id;
    deliveryId = delivery.id;

    await expect(processCiEvent(fakeJob(delivery.id))).resolves.not.toThrow();

    const runs = await prisma.ciRun.findMany({ where: { repositoryId: repo.id } });
    expect(runs).toHaveLength(1);

    const executions = await prisma.testExecution.findMany({
      where: { ciRun: { repositoryId: repo.id } },
    });
    expect(executions).toHaveLength(0);
  });

  it("does not fail the whole job when artifact fetch throws (malformed/network error)", async () => {
    mockFetch.mockRejectedValue(new Error("simulated malformed artifact / network failure"));
    const { repo, delivery } = await setupRepoAndDelivery(
      "test-owner/malformed-artifact-repo",
      999006n,
      777005
    );
    repoId = repo.id;
    deliveryId = delivery.id;

    await expect(processCiEvent(fakeJob(delivery.id))).resolves.not.toThrow();

    const runs = await prisma.ciRun.findMany({ where: { repositoryId: repo.id } });
    expect(runs).toHaveLength(1);
  });
});