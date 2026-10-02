CREATE TABLE "MarketingSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "postalAddress" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingSettings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketingTest" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENDING',
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingTest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketingTest_campaignId_createdAt_idx" ON "MarketingTest"("campaignId", "createdAt");
