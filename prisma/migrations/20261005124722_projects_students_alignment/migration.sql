/*
  Warnings:

  - You are about to drop the column `courseId` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `cycleId` on the `Project` table. All the data in the column will be lost.
  - The `state` column on the `Project` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `programmeId` on the `StudentProfile` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_courseId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_cycleId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_supervisorId_fkey";

-- DropForeignKey
ALTER TABLE "StudentProfile" DROP CONSTRAINT "StudentProfile_programmeId_fkey";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "courseId",
DROP COLUMN "cycleId",
ADD COLUMN     "contributionFiled" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "ethicsStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "memberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
DROP COLUMN "state",
ADD COLUMN     "state" TEXT NOT NULL DEFAULT 'REGISTERED';

-- AlterTable
ALTER TABLE "StudentProfile" DROP COLUMN "programmeId",
ADD COLUMN     "courseCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "otherNames" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "programmeName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "surname" TEXT NOT NULL DEFAULT '';
