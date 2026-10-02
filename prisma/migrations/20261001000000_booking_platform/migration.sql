-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REPORTED', 'VERIFIED', 'REJECTED', 'REFUNDED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "emailMarketingOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingConsentUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "smsMarketingOptIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancellationRequestedAt" TIMESTAMP(3),
ADD COLUMN     "holdExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultCapacity" INTEGER NOT NULL DEFAULT 17,
    "holdHours" INTEGER NOT NULL DEFAULT 24,
    "includePickupDay" BOOLEAN NOT NULL DEFAULT true,
    "zelleRecipient" TEXT NOT NULL DEFAULT '',
    "zelleName" TEXT NOT NULL DEFAULT '',
    "venmoUsername" TEXT NOT NULL DEFAULT '',
    "venmoName" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCapacity" (
    "date" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCapacity_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payerName" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REPORTED',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingConsentEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "emailOptIn" BOOLEAN NOT NULL,
    "smsOptIn" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'account-preferences-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_submissionId_status_idx" ON "Payment"("submissionId", "status");

-- CreateIndex
CREATE INDEX "MarketingConsentEvent_customerId_createdAt_idx" ON "MarketingConsentEvent"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingConsentEvent" ADD CONSTRAINT "MarketingConsentEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
