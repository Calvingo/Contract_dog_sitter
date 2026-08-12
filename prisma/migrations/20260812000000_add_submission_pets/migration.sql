ALTER TABLE "SubmissionRevision" ADD COLUMN "petsSnapshot" JSONB;

CREATE TABLE "SubmissionPet" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "petId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "petSnapshot" JSONB NOT NULL,
  "prescreenAnswers" JSONB NOT NULL,
  "prescreenNotes" TEXT,
  "quotedBreakdown" JSONB NOT NULL,
  "quotedTotal" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubmissionPet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubmissionPet_submissionId_position_key" ON "SubmissionPet"("submissionId", "position");
CREATE INDEX "SubmissionPet_submissionId_idx" ON "SubmissionPet"("submissionId");
CREATE INDEX "SubmissionPet_petId_idx" ON "SubmissionPet"("petId");

ALTER TABLE "SubmissionPet" ADD CONSTRAINT "SubmissionPet_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionPet" ADD CONSTRAINT "SubmissionPet_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "SubmissionPet" (
  "id", "submissionId", "petId", "position", "petSnapshot", "prescreenAnswers",
  "prescreenNotes", "quotedBreakdown", "quotedTotal", "createdAt", "updatedAt"
)
SELECT
  'legacy_' || "id", "id", "petId", 1, "petSnapshot", "prescreenAnswers",
  "prescreenNotes", "quotedBreakdown", "quotedTotal", "createdAt", "updatedAt"
FROM "Submission";
