ALTER TYPE "SubmissionStatus" ADD VALUE 'NEEDS_REVIEW';

ALTER TABLE "Submission"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastEditedAt" TIMESTAMP(3),
  ADD COLUMN "previouslyAcceptedAt" TIMESTAMP(3);

CREATE TABLE "SubmissionEditToken" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionEditToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubmissionRevision" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" "SubmissionStatus" NOT NULL,
  "quotedBreakdown" JSONB NOT NULL,
  "quotedTotal" DECIMAL(10,2) NOT NULL,
  "prescreenAnswers" JSONB NOT NULL,
  "prescreenNotes" TEXT,
  "signatureData" TEXT NOT NULL,
  "customerSnapshot" JSONB NOT NULL,
  "petSnapshot" JSONB NOT NULL,
  "dropoffAt" TIMESTAMP(3) NOT NULL,
  "pickupAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Submission_revision_idx" ON "Submission"("revision");
CREATE UNIQUE INDEX "SubmissionEditToken_tokenHash_key" ON "SubmissionEditToken"("tokenHash");
CREATE INDEX "SubmissionEditToken_submissionId_idx" ON "SubmissionEditToken"("submissionId");
CREATE INDEX "SubmissionEditToken_expiresAt_idx" ON "SubmissionEditToken"("expiresAt");
CREATE UNIQUE INDEX "SubmissionRevision_submissionId_revision_key" ON "SubmissionRevision"("submissionId", "revision");
CREATE INDEX "SubmissionRevision_submissionId_idx" ON "SubmissionRevision"("submissionId");

ALTER TABLE "SubmissionEditToken" ADD CONSTRAINT "SubmissionEditToken_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionRevision" ADD CONSTRAINT "SubmissionRevision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
