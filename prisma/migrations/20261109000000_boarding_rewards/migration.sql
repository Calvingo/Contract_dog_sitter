BEGIN;
CREATE TYPE "RewardState" AS ENUM ('NONE', 'HELD', 'USED', 'RECONFIRM');
ALTER TABLE "Submission" ADD COLUMN "rewardState" "RewardState" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "rewardRequestId" TEXT;
CREATE UNIQUE INDEX "Submission_customerId_rewardRequestId_key" ON "Submission" ("customerId", "rewardRequestId");
ALTER TABLE "SubmissionPet" ADD COLUMN "lateDropoffAt" TIMESTAMP(3), ADD COLUMN "earlyPickupAt" TIMESTAMP(3);
-- Some installations already have this column from the earlier payment workflow.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "offlineReference" TEXT,
  ADD CONSTRAINT "Payment_refund_within_receipt" CHECK ("refundedAmount" >= 0 AND ("refundedAmount" = 0 OR "refundedAmount" <= "amount"));
CREATE UNIQUE INDEX "Payment_submissionId_offlineReference_key" ON "Payment" ("submissionId", "offlineReference");
-- Older REFUNDED rows replaced a verified receipt in full. They already net to zero.
COMMIT;
