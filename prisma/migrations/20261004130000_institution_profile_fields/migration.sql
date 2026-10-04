-- Align Institution with the working-store profile (identity fields, singleton id)
ALTER TABLE "Institution" ADD COLUMN "location" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Institution" ADD COLUMN "productName" TEXT NOT NULL DEFAULT 'Research Chain';
ALTER TABLE "Institution" ADD COLUMN "monogram" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Institution" ADD COLUMN "accentColor" TEXT NOT NULL DEFAULT '#2E5AC8';
ALTER TABLE "Institution" ADD COLUMN "logo" JSONB;
ALTER TABLE "Institution" ADD COLUMN "configuredAt" TIMESTAMP(3);

ALTER TABLE "Institution" ALTER COLUMN "name" SET DEFAULT '';
ALTER TABLE "Institution" ALTER COLUMN "faculty" SET DEFAULT '';
ALTER TABLE "Institution" ALTER COLUMN "department" SET DEFAULT '';
ALTER TABLE "Institution" ALTER COLUMN "id" SET DEFAULT 'default';
