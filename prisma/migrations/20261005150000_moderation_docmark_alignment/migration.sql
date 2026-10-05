-- DropForeignKey
ALTER TABLE "DocumentationMark" DROP CONSTRAINT "DocumentationMark_memberId_fkey";

-- DropForeignKey
ALTER TABLE "Moderation" DROP CONSTRAINT "Moderation_nominationId_fkey";

-- DropIndex
DROP INDEX "DocumentationMark_memberId_key";

-- DropIndex
DROP INDEX "Moderation_nominationId_key";

-- AlterTable
ALTER TABLE "DocumentationMark" DROP COLUMN "markedAt",
DROP COLUMN "markedById",
DROP COLUMN "memberId",
DROP COLUMN "moderatedAt",
DROP COLUMN "moderatedRawTotal",
DROP COLUMN "moderationNote",
DROP COLUMN "moderatorId",
DROP COLUMN "rubricVersionId",
ADD COLUMN     "agreedRawTotal" INTEGER,
ADD COLUMN     "markedBy" TEXT NOT NULL,
ADD COLUMN     "moderatedBy" TEXT,
ADD COLUMN     "studentId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Moderation" DROP COLUMN "nominationId",
ADD COLUMN     "component" TEXT NOT NULL,
ADD COLUMN     "studentId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationMark_studentId_key" ON "DocumentationMark"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Moderation_studentId_component_key" ON "Moderation"("studentId", "component");

