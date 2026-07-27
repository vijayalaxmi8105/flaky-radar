-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "githubId" BIGINT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ci_runs" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "githubRunId" BIGINT NOT NULL,
    "workflowName" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "conclusion" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ci_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tests" (
    "id" TEXT NOT NULL,
    "ciRunId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "suite" TEXT,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repositories_githubId_key" ON "repositories"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_fullName_key" ON "repositories"("fullName");

-- CreateIndex
CREATE INDEX "repositories_owner_name_idx" ON "repositories"("owner", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ci_runs_githubRunId_key" ON "ci_runs"("githubRunId");

-- CreateIndex
CREATE INDEX "ci_runs_repositoryId_createdAt_idx" ON "ci_runs"("repositoryId", "createdAt");

-- CreateIndex
CREATE INDEX "ci_runs_repositoryId_branch_idx" ON "ci_runs"("repositoryId", "branch");

-- CreateIndex
CREATE INDEX "ci_runs_status_idx" ON "ci_runs"("status");

-- CreateIndex
CREATE INDEX "tests_ciRunId_idx" ON "tests"("ciRunId");

-- CreateIndex
CREATE INDEX "tests_name_suite_idx" ON "tests"("name", "suite");

-- CreateIndex
CREATE INDEX "tests_status_idx" ON "tests"("status");

-- AddForeignKey
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_ciRunId_fkey" FOREIGN KEY ("ciRunId") REFERENCES "ci_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
