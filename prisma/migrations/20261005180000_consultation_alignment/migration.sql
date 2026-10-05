-- DropForeignKey
ALTER TABLE "ActionItem" DROP CONSTRAINT "ActionItem_consultationId_fkey";

-- DropForeignKey
ALTER TABLE "Attestation" DROP CONSTRAINT "Attestation_consultationId_fkey";

-- DropForeignKey
ALTER TABLE "Consultation" DROP CONSTRAINT "Consultation_memberId_fkey";

-- DropForeignKey
ALTER TABLE "Consultation" DROP CONSTRAINT "Consultation_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Deliverable" DROP CONSTRAINT "Deliverable_consultationId_fkey";

-- DropIndex
DROP INDEX "Consultation_memberId_periodCode_status_idx";

-- AlterTable
ALTER TABLE "Consultation" DROP COLUMN "createdAt",
DROP COLUMN "endsAt",
DROP COLUMN "gradedAt",
DROP COLUMN "gradedById",
DROP COLUMN "meetingLink",
DROP COLUMN "memberId",
DROP COLUMN "mode",
DROP COLUMN "notes",
DROP COLUMN "periodCode",
DROP COLUMN "projectId",
DROP COLUMN "rubricVersionId",
DROP COLUMN "startsAt",
DROP COLUMN "supervisorId",
ADD COLUMN     "heldAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "periodId" TEXT NOT NULL,
ADD COLUMN     "studentAttested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "studentId" TEXT NOT NULL,
ADD COLUMN     "supervisorAttested" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "agenda" SET NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'REQUESTED',
ALTER COLUMN "rubricMax" SET NOT NULL;

-- DropEnum
DROP TYPE "ConsultationStatus";

-- CreateIndex
CREATE INDEX "Consultation_studentId_periodId_idx" ON "Consultation"("studentId", "periodId");

