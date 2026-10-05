-- AlterTable
ALTER TABLE "AvailabilitySlot" DROP COLUMN "bookedById",
DROP COLUMN "endsAt",
DROP COLUMN "recurrenceRule",
ADD COLUMN     "agenda" TEXT,
ADD COLUMN     "bookedByStudentId" TEXT,
ADD COLUMN     "meetingLink" TEXT,
ADD COLUMN     "minutes" INTEGER NOT NULL,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "venue" TEXT NOT NULL DEFAULT '';

-- AddForeignKey
ALTER TABLE "CriterionScore" ADD CONSTRAINT "CriterionScore_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "AssessorSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

