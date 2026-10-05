-- DropForeignKey
ALTER TABLE "AssessmentPeriod" DROP CONSTRAINT "AssessmentPeriod_cycleId_fkey";

-- DropIndex
DROP INDEX "AssessmentPeriod_cycleId_code_key";

-- AlterTable
ALTER TABLE "AssessmentPeriod" DROP COLUMN "code",
DROP COLUMN "endsOn",
DROP COLUMN "startsOn",
ADD COLUMN     "dueAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "graceMinutes" INTEGER NOT NULL,
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentPeriod_cycleId_key_key" ON "AssessmentPeriod"("cycleId", "key");

