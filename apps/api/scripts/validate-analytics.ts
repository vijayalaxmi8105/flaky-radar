import { prisma } from "@flaky-radar/db";
import { failureRate, alternationRate, classify } from "@flaky-radar/analytics";
import type { TestExecution as AnalyticsExecution } from "@flaky-radar/analytics";

async function main() {
  // Find tests with at least 10 executions, most-populated first
  const grouped = await prisma.testExecution.groupBy({
    by: ["testId"],
    _count: { _all: true },
    having: { testId: { _count: { gte: 10 } } },
    orderBy: { _count: { testId: "desc" } },
    take: 5,
  });

  if (grouped.length === 0) {
    console.error("No test has >= 10 executions yet. Ingest more data first.");
    process.exit(1);
  }

  console.log(`Found ${grouped.length} candidate test(s) with >= 10 executions.`);

  for (const g of grouped) {
    const test = await prisma.test.findUnique({ where: { id: g.testId } });
    if (!test) continue;

    // Executions for this test, joined to ciRun for branch, ordered chronologically
    const rows = await prisma.testExecution.findMany({
      where: { testId: g.testId },
      include: { ciRun: { select: { branch: true } } },
      orderBy: { executedAt: "asc" },
    });

    // Group by branch, pick the branch with the most rows
    // (alternationRate requires single-branch, chronologically-sorted input)
    const byBranch = new Map<string, typeof rows>();
    for (const row of rows) {
      const branch = row.ciRun.branch;
      if (!byBranch.has(branch)) byBranch.set(branch, []);
      byBranch.get(branch)!.push(row);
    }
    const [bestBranch, branchRows] = [...byBranch.entries()].sort(
      (a, b) => b[1].length - a[1].length
    )[0];

    console.log("\n============================================");
    console.log(`Test: ${test.suiteName} > ${test.testName}`);
    console.log(`Branch: ${bestBranch} (${branchRows.length} executions)`);
    console.log(
      "Status history:",
      branchRows.map((r) => r.status).join(", ")
    );

    const executions: AnalyticsExecution[] = branchRows.map((r) => ({
      status: r.status as AnalyticsExecution["status"],
    }));

    const fr = failureRate(executions);
    const ar = alternationRate(executions);
    const result = classify({
      failure_rate: fr.failureRate,
      alternation_rate: ar.alternationRate,
      total_executions: fr.totalExecutions,
    });

    console.log("failureRate:", fr);
    console.log("alternationRate:", ar);
    console.log("classify result:", result);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});