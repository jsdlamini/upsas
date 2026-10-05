-- AddForeignKey
ALTER TABLE "CriterionScore" ADD CONSTRAINT "CriterionScore_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "AssessorSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

