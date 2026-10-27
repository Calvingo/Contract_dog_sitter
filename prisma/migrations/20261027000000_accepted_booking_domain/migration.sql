ALTER TABLE "Submission" ADD COLUMN "acceptedDropoffAt" TIMESTAMP(3), ADD COLUMN "acceptedPickupAt" TIMESTAMP(3), ADD COLUMN "acceptedDogs" INTEGER, ADD COLUMN "acceptedRevision" INTEGER, ADD COLUMN "acceptedDepositPolicySnapshot" JSONB, ADD COLUMN "depositPolicySnapshot" JSONB;
-- Preserve current accepted stays; pending edits recover the latest accepted revision.
UPDATE "Submission" s SET "acceptedDropoffAt"=s."dropoffAt", "acceptedPickupAt"=s."pickupAt", "acceptedDogs"=GREATEST(1,(SELECT COUNT(*)::integer FROM "SubmissionPet" p WHERE p."submissionId"=s.id)), "acceptedRevision"=s.revision WHERE s.status='ACCEPTED';
UPDATE "Submission" s SET "acceptedDropoffAt"=r."dropoffAt", "acceptedPickupAt"=r."pickupAt", "acceptedRevision"=r.revision, "acceptedDogs"=GREATEST(1, CASE WHEN jsonb_typeof(r."petsSnapshot")='array' THEN jsonb_array_length(r."petsSnapshot") ELSE 1 END)
FROM (SELECT DISTINCT ON ("submissionId") * FROM "SubmissionRevision" WHERE status='ACCEPTED' ORDER BY "submissionId", revision DESC) r
WHERE r."submissionId"=s.id AND s.status NOT IN ('ACCEPTED','CANCELLED') AND s."previouslyAcceptedAt" IS NOT NULL;
ALTER TABLE "PlatformSettings" ALTER COLUMN "holdHours" SET DEFAULT 72;
UPDATE "PlatformSettings" SET "holdHours"=72 WHERE "holdHours"=24;
-- Extend existing 24-hour operational deadlines, never shorten custom deadlines.
UPDATE "Submission" SET "holdExpiresAt"="holdExpiresAt" + INTERVAL '48 hours' WHERE "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" - COALESCE("lastEditedAt", "createdAt") BETWEEN INTERVAL '23 hours 59 minutes' AND INTERVAL '24 hours 1 minute';
ALTER TABLE "Payment" ADD COLUMN "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
UPDATE "Payment" SET "refundedAmount"=amount WHERE status='REFUNDED';
CREATE TABLE "BookingBlocklist" (email TEXT PRIMARY KEY, blocked BOOLEAN NOT NULL DEFAULT true, reason TEXT, "updatedBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "BookingBlocklistEvent" (id TEXT PRIMARY KEY, email TEXT NOT NULL, blocked BOOLEAN NOT NULL, reason TEXT, "actorEmail" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "BookingBlocklistEvent_email_createdAt_idx" ON "BookingBlocklistEvent"(email,"createdAt");

ALTER TABLE "SubmissionRevision" ADD COLUMN "agreementVersion" TEXT, ADD COLUMN "depositPolicySnapshot" JSONB;
