-- String primary keys for the working-store models (strategy A: keep readable ids)
ALTER TABLE "Topic" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Topic" ADD COLUMN "proposedBy" TEXT;
ALTER TABLE "Topic" ADD COLUMN "acceptedAt" TIMESTAMP(3);

ALTER TABLE "TopicPreference" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "ProjectMember" ALTER COLUMN "id" DROP DEFAULT;
