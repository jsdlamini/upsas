-- DropForeignKey
ALTER TABLE "Deliverable" DROP CONSTRAINT "Deliverable_projectId_fkey";

-- DropForeignKey
ALTER TABLE "DeliverableVersion" DROP CONSTRAINT "DeliverableVersion_deliverableId_fkey";

-- AlterTable
ALTER TABLE "Deliverable" DROP COLUMN "consultationId",
DROP COLUMN "createdAt",
ADD COLUMN     "byteSize" INTEGER NOT NULL,
ADD COLUMN     "mediaType" TEXT NOT NULL,
ADD COLUMN     "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "sha256" TEXT NOT NULL,
ADD COLUMN     "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "uploadedById" TEXT NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL;

-- DropTable
DROP TABLE "DeliverableVersion";

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_projectId_title_version_key" ON "Deliverable"("projectId", "title", "version");

