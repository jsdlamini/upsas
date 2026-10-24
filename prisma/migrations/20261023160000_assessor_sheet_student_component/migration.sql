-- AssessorSheet refactor: nomination/member model -> student/component model.
-- Tables are empty in both environments (nothing live), so drop + add is safe.

-- DropForeignKey
ALTER TABLE "AssessorSheet" DROP CONSTRAINT "AssessorSheet_memberId_fkey";
ALTER TABLE "AssessorSheet" DROP CONSTRAINT "AssessorSheet_nominationId_fkey";
ALTER TABLE "AssessorSheet" DROP CONSTRAINT "AssessorSheet_rubricVersionId_fkey";
ALTER TABLE "CriterionScore" DROP CONSTRAINT "CriterionScore_criterionId_fkey";

-- DropIndex
DROP INDEX "AssessorSheet_nominationId_assessorId_key";

-- AlterTable
ALTER TABLE "AssessorSheet" DROP COLUMN "attestation",
DROP COLUMN "memberId",
DROP COLUMN "nominationId",
DROP COLUMN "rawTotal",
DROP COLUMN "unlockedAt",
DROP COLUMN "unlockedById",
ADD COLUMN     "component" TEXT NOT NULL,
ADD COLUMN     "studentId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AssessorSheet_assessorId_studentId_component_key" ON "AssessorSheet"("assessorId", "studentId", "component");
