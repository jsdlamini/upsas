-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('STUDENT', 'SUPERVISOR', 'ASSESSOR', 'MODERATOR', 'COORDINATOR', 'EXTERNAL_EXAMINER', 'ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "ProjectState" AS ENUM ('REGISTERED', 'TOPIC_SELECTED', 'AGREEMENT_SIGNED', 'PROPOSAL_DEVELOPMENT', 'ETHICS_SUBMITTED', 'ETHICS_NOT_REQUIRED', 'ETHICS_APPROVED', 'P1_NOMINATED', 'P1_PRESENTED', 'IMPLEMENTATION', 'P2_NOMINATED', 'P2_PRESENTED', 'DOCUMENTATION_SUBMITTED', 'SUPERVISOR_MARKED', 'MODERATED', 'GRADED', 'PUBLISHED', 'ARCHIVED', 'WITHDRAWN', 'DEFERRED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW_STUDENT', 'NO_SHOW_SUPERVISOR', 'CANCELLED');

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "faculty" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Mbabane',
    "studentIdRegex" TEXT NOT NULL DEFAULT '^[0-9]{9}$',
    "staffEmailDomain" TEXT NOT NULL DEFAULT 'uniswa.sz',
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicCycle" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AcademicCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentPeriod" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Programme" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'argon2id',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mustChange" BOOLEAN NOT NULL DEFAULT false,
    "compromisedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TotpCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "recoveryHashes" TEXT[],

    CONSTRAINT "TotpCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RoleCode" NOT NULL,
    "cycleId" TEXT,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "researchAreas" TEXT[],
    "supervisionCapacity" INTEGER NOT NULL DEFAULT 8,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prerequisites" TEXT,
    "expectedOutputs" TEXT,
    "tags" TEXT[],
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "groupSuitable" BOOLEAN NOT NULL DEFAULT true,
    "studentProposed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicPreference" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "topicId" TEXT,
    "supervisorId" TEXT,
    "title" TEXT NOT NULL,
    "state" "ProjectState" NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "contributionStatement" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateTransition" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromState" "ProjectState" NOT NULL,
    "toState" "ProjectState" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StateTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "topicTitle" TEXT NOT NULL,
    "supervisorName" TEXT NOT NULL,
    "pdfPath" TEXT,
    "contentHash" TEXT NOT NULL,
    "supersedesId" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementSignature" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signerRole" "RoleCode" NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "AgreementSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'IN_PERSON',
    "recurrenceRule" TEXT,
    "bookedById" TEXT,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "periodCode" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'IN_PERSON',
    "meetingLink" TEXT,
    "agenda" TEXT,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "rawTotal" INTEGER,
    "rubricVersionId" TEXT,
    "rubricMax" INTEGER,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attestation" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" "RoleCode" NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "sessionCode" TEXT,
    "supersedesId" TEXT,
    "supersedeReason" TEXT,

    CONSTRAINT "Attestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueOn" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "carriedFromId" TEXT,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "consultationId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableVersion" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "scanEngine" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverableVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EthicsApplication" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "justification" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "reference" TEXT,
    "documentId" TEXT,

    CONSTRAINT "EthicsApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rubric" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provisional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Rubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricVersion" (
    "id" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "maxTotal" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RubricVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricCriterion" (
    "id" TEXT NOT NULL,
    "rubricVersionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "maxMark" INTEGER NOT NULL,
    "descriptors" JSONB,

    CONSTRAINT "RubricCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationSession" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "componentKey" TEXT NOT NULL,
    "serialNo" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PresentationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationNomination" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "projectId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "componentKey" TEXT NOT NULL,
    "nominatedById" TEXT NOT NULL,
    "nominatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readinessNote" TEXT,
    "declinedReason" TEXT,

    CONSTRAINT "PresentationNomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessorSheet" (
    "id" TEXT NOT NULL,
    "nominationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "rubricVersionId" TEXT NOT NULL,
    "rawTotal" INTEGER,
    "rubricMax" INTEGER NOT NULL,
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "attestation" TEXT,
    "unlockedById" TEXT,
    "unlockedAt" TIMESTAMP(3),

    CONSTRAINT "AssessorSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionScore" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "mark" INTEGER,
    "comment" TEXT,

    CONSTRAINT "CriterionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Moderation" (
    "id" TEXT NOT NULL,
    "nominationId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "agreedPercentage" DECIMAL(6,3) NOT NULL,
    "moderatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Moderation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationMark" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "rubricVersionId" TEXT NOT NULL,
    "rawTotal" INTEGER NOT NULL,
    "rubricMax" INTEGER NOT NULL,
    "markedById" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderatorId" TEXT,
    "moderatedRawTotal" INTEGER,
    "moderationNote" TEXT,
    "moderatedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentationMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentConfig" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "profileCode" TEXT NOT NULL,
    "profileLabel" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkSnapshot" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "finalMark" DECIMAL(6,3),
    "grade" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "supersedesId" TEXT,
    "supersedeReason" TEXT,
    "computedById" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarkSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorRole" "RoleCode",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "previousHash" TEXT NOT NULL,
    "entryHash" TEXT NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicCycle_institutionId_label_key" ON "AcademicCycle"("institutionId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentPeriod_cycleId_code_key" ON "AssessmentPeriod"("cycleId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Programme_institutionId_code_key" ON "Programme"("institutionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordCredential_userId_key" ON "PasswordCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TotpCredential_userId_key" ON "TotpCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_userId_role_cycleId_key" ON "RoleAssignment"("userId", "role", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_studentNumber_key" ON "StudentProfile"("studentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_staffNumber_key" ON "StaffProfile"("staffNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TopicPreference_studentId_rank_key" ON "TopicPreference"("studentId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "TopicPreference_studentId_topicId_key" ON "TopicPreference"("studentId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_studentId_key" ON "ProjectMember"("projectId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_projectId_version_key" ON "Agreement"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AgreementSignature_agreementId_signerId_key" ON "AgreementSignature"("agreementId", "signerId");

-- CreateIndex
CREATE INDEX "Consultation_memberId_periodCode_status_idx" ON "Consultation"("memberId", "periodCode", "status");

-- CreateIndex
CREATE INDEX "Attestation_consultationId_actorId_idx" ON "Attestation"("consultationId", "actorId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableVersion_deliverableId_version_key" ON "DeliverableVersion"("deliverableId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Rubric_code_key" ON "Rubric"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RubricVersion_rubricId_version_key" ON "RubricVersion"("rubricId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RubricCriterion_rubricVersionId_ordinal_key" ON "RubricCriterion"("rubricVersionId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "PresentationSession_cycleId_componentKey_serialNo_key" ON "PresentationSession"("cycleId", "componentKey", "serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "PresentationNomination_memberId_componentKey_key" ON "PresentationNomination"("memberId", "componentKey");

-- CreateIndex
CREATE UNIQUE INDEX "AssessorSheet_nominationId_assessorId_key" ON "AssessorSheet"("nominationId", "assessorId");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionScore_sheetId_criterionId_key" ON "CriterionScore"("sheetId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "Moderation_nominationId_key" ON "Moderation"("nominationId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationMark_memberId_key" ON "DocumentationMark"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentConfig_cycleId_profileCode_version_key" ON "AssessmentConfig"("cycleId", "profileCode", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MarkSnapshot_supersedesId_key" ON "MarkSnapshot"("supersedesId");

-- CreateIndex
CREATE INDEX "MarkSnapshot_memberId_computedAt_idx" ON "MarkSnapshot"("memberId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_sequence_key" ON "AuditEvent"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_entryHash_key" ON "AuditEvent"("entryHash");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_occurredAt_idx" ON "AuditEvent"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "AcademicCycle" ADD CONSTRAINT "AcademicCycle_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentPeriod" ADD CONSTRAINT "AssessmentPeriod_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AcademicCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TotpCredential" ADD CONSTRAINT "TotpCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicPreference" ADD CONSTRAINT "TopicPreference_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicPreference" ADD CONSTRAINT "TopicPreference_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AcademicCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StateTransition" ADD CONSTRAINT "StateTransition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementSignature" ADD CONSTRAINT "AgreementSignature_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ProjectMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableVersion" ADD CONSTRAINT "DeliverableVersion_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EthicsApplication" ADD CONSTRAINT "EthicsApplication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricVersion" ADD CONSTRAINT "RubricVersion_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_rubricVersionId_fkey" FOREIGN KEY ("rubricVersionId") REFERENCES "RubricVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSession" ADD CONSTRAINT "PresentationSession_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AcademicCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationNomination" ADD CONSTRAINT "PresentationNomination_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PresentationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationNomination" ADD CONSTRAINT "PresentationNomination_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationNomination" ADD CONSTRAINT "PresentationNomination_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ProjectMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessorSheet" ADD CONSTRAINT "AssessorSheet_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "PresentationNomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessorSheet" ADD CONSTRAINT "AssessorSheet_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ProjectMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessorSheet" ADD CONSTRAINT "AssessorSheet_rubricVersionId_fkey" FOREIGN KEY ("rubricVersionId") REFERENCES "RubricVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionScore" ADD CONSTRAINT "CriterionScore_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "AssessorSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionScore" ADD CONSTRAINT "CriterionScore_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "RubricCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moderation" ADD CONSTRAINT "Moderation_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "PresentationNomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationMark" ADD CONSTRAINT "DocumentationMark_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ProjectMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentConfig" ADD CONSTRAINT "AssessmentConfig_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AcademicCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkSnapshot" ADD CONSTRAINT "MarkSnapshot_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ProjectMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkSnapshot" ADD CONSTRAINT "MarkSnapshot_configId_fkey" FOREIGN KEY ("configId") REFERENCES "AssessmentConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
