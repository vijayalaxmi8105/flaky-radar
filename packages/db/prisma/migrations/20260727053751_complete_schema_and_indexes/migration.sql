/*
  Warnings:

  - You are about to drop the column `attempt` on the `tests` table. All the data in the column will be lost.
  - You are about to drop the column `ciRunId` on the `tests` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `tests` table. All the data in the column will be lost.
  - You are about to drop the column `durationMs` on the `tests` table. All the data in the column will be lost.
  - You are about to drop the column `errorMessage` on the `tests` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `tests` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `tests` table. All the data in the column will be lost.
  - You are about to drop the column `suite` on the `tests` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[repositoryId,githubRunId]` on the table `ci_runs` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[repositoryId,suiteName,testName]` on the table `tests` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `repositoryId` to the `tests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `suiteName` to the `tests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `testName` to the `tests` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "tests" DROP CONSTRAINT "tests_ciRunId_fkey";

-- DropIndex
DROP INDEX "ci_runs_githubRunId_key";

-- DropIndex
DROP INDEX "ci_runs_repositoryId_createdAt_idx";

-- DropIndex
DROP INDEX "tests_ciRunId_idx";

-- DropIndex
DROP INDEX "tests_name_suite_idx";

-- DropIndex
DROP INDEX "tests_status_idx";

-- AlterTable
ALTER TABLE "ci_runs" ADD COLUMN     "actor" TEXT,
ADD COLUMN     "durationMs" INTEGER;

-- AlterTable
ALTER TABLE "tests" DROP COLUMN "attempt",
DROP COLUMN "ciRunId",
DROP COLUMN "createdAt",
DROP COLUMN "durationMs",
DROP COLUMN "errorMessage",
DROP COLUMN "name",
DROP COLUMN "status",
DROP COLUMN "suite",
ADD COLUMN     "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "repositoryId" TEXT NOT NULL,
ADD COLUMN     "suiteName" TEXT NOT NULL,
ADD COLUMN     "testName" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "test_executions" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "ciRunId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "stackTrace" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flaky_scores" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "passRate" DOUBLE PRECISION NOT NULL,
    "failureRate" DOUBLE PRECISION NOT NULL,
    "totalExecutions" INTEGER NOT NULL,
    "classification" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flaky_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "githubDeliveryId" TEXT NOT NULL,
    "repositoryId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "githubOauthId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_repository_access" (
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_repository_access_pkey" PRIMARY KEY ("userId","repositoryId")
);

-- CreateIndex
CREATE INDEX "test_executions_testId_executedAt_idx" ON "test_executions"("testId", "executedAt" DESC);

-- CreateIndex
CREATE INDEX "test_executions_ciRunId_idx" ON "test_executions"("ciRunId");

-- CreateIndex
CREATE INDEX "flaky_scores_testId_computedAt_idx" ON "flaky_scores"("testId", "computedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_githubDeliveryId_key" ON "webhook_deliveries"("githubDeliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_githubOauthId_key" ON "users"("githubOauthId");

-- CreateIndex
CREATE INDEX "ci_runs_repositoryId_startedAt_idx" ON "ci_runs"("repositoryId", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ci_runs_repositoryId_githubRunId_key" ON "ci_runs"("repositoryId", "githubRunId");

-- CreateIndex
CREATE UNIQUE INDEX "tests_repositoryId_suiteName_testName_key" ON "tests"("repositoryId", "suiteName", "testName");

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_executions" ADD CONSTRAINT "test_executions_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_executions" ADD CONSTRAINT "test_executions_ciRunId_fkey" FOREIGN KEY ("ciRunId") REFERENCES "ci_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flaky_scores" ADD CONSTRAINT "flaky_scores_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_repository_access" ADD CONSTRAINT "user_repository_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_repository_access" ADD CONSTRAINT "user_repository_access_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
