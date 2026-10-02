-- Profile fields are independent of signed booking snapshots.
ALTER TABLE "Pet"
ADD COLUMN "prescreenAnswers" JSONB,
ADD COLUMN "prescreenNotes" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Account deactivation preserves booking history while invalidating sessions.
ALTER TABLE "Customer"
ADD COLUMN "deactivatedAt" TIMESTAMP(3),
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
