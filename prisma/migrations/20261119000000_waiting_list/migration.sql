ALTER TABLE "Submission" ADD COLUMN "waitlistedAt" TIMESTAMP(3),
ADD COLUMN "waitlistDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SubmissionRevision" ADD COLUMN "waitlistedAt" TIMESTAMP(3),
ADD COLUMN "waitlistDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "Submission_waitlistedAt_idx" ON "Submission"("waitlistedAt");

CREATE TABLE "WaitlistAlert" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "dates" TEXT[] NOT NULL,
  "remaining" JSONB NOT NULL,
  "candidateCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedBy" TEXT,
  "emailAttemptedAt" TIMESTAMP(3),
  "emailSentAt" TIMESTAMP(3),
  "emailFailed" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "WaitlistAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WaitlistAlert_eventKey_key" ON "WaitlistAlert"("eventKey");
CREATE INDEX "WaitlistAlert_acknowledgedAt_createdAt_idx" ON "WaitlistAlert"("acknowledgedAt", "createdAt");
