-- DropIndex
DROP INDEX "User_username_key";

-- AlterTable
ALTER TABLE "AcademicCycle" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "ActionItem" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Agreement" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "AgreementSignature" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "AssessmentConfig" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "AssessmentPeriod" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "AssessorSheet" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Attestation" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "AvailabilitySlot" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "CriterionScore" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Deliverable" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "DocumentationMark" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "EmailSettings" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Enrolment" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "EthicsApplication" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Extension" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "MarkSnapshot" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "MeetingRequest" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Moderation" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "PresentationNomination" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "PresentationSession" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Programme" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Publication" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "ResetTicket" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Rubric" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "RubricCriterion" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "RubricVersion" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "StateTransition" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "TopicPreference" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default';

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMP(3),

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_username_key" ON "User"("tenantId", "username");


-- Backfill: tenant #1 is the existing single-tenant institution.
INSERT INTO "Tenant" ("id", "name") VALUES ('default', 'Research Chain')
  ON CONFLICT ("id") DO NOTHING;
