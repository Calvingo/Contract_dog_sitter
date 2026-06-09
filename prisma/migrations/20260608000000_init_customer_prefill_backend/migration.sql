CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'MEET_GREET_REQUESTED', 'CANCELLED');
CREATE TYPE "DecisionAction" AS ENUM ('ACCEPT', 'REJECT', 'MEET_GREET');
CREATE TYPE "EmailType" AS ENUM ('CUSTOMER_RECEIPT', 'ADMIN_NOTIFICATION', 'DECISION_ACCEPT', 'DECISION_REJECT', 'DECISION_MEET_GREET', 'LOGIN_LINK');
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED');

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "backupContact" TEXT NOT NULL,
  "wechatId" TEXT,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pet" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "breed" TEXT NOT NULL,
  "weightLb" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Submission" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "petId" TEXT NOT NULL,
  "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "firstTimeBooking" TEXT NOT NULL,
  "dropoffAt" TIMESTAMP(3) NOT NULL,
  "pickupAt" TIMESTAMP(3) NOT NULL,
  "quotedTotal" DECIMAL(10,2) NOT NULL,
  "quotedBreakdown" JSONB NOT NULL,
  "prescreenAnswers" JSONB NOT NULL,
  "prescreenNotes" TEXT,
  "agreementVersion" TEXT NOT NULL DEFAULT '2026-05',
  "agreedAt" TIMESTAMP(3) NOT NULL,
  "signatureData" TEXT NOT NULL,
  "customerSnapshot" JSONB NOT NULL,
  "petSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DecisionEvent" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "action" "DecisionAction" NOT NULL,
  "actorEmail" TEXT,
  "message" TEXT,
  "emailSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DecisionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailLog" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT,
  "type" "EmailType" NOT NULL,
  "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" "EmailStatus" NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoginToken" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE INDEX "Customer_email_idx" ON "Customer"("email");
CREATE UNIQUE INDEX "Pet_customerId_name_key" ON "Pet"("customerId", "name");
CREATE INDEX "Pet_customerId_idx" ON "Pet"("customerId");
CREATE INDEX "Submission_customerId_idx" ON "Submission"("customerId");
CREATE INDEX "Submission_petId_idx" ON "Submission"("petId");
CREATE INDEX "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt");
CREATE INDEX "DecisionEvent_submissionId_idx" ON "DecisionEvent"("submissionId");
CREATE INDEX "EmailLog_submissionId_idx" ON "EmailLog"("submissionId");
CREATE INDEX "EmailLog_type_createdAt_idx" ON "EmailLog"("type", "createdAt");
CREATE UNIQUE INDEX "LoginToken_tokenHash_key" ON "LoginToken"("tokenHash");
CREATE INDEX "LoginToken_email_idx" ON "LoginToken"("email");
CREATE INDEX "LoginToken_expiresAt_idx" ON "LoginToken"("expiresAt");

ALTER TABLE "Pet" ADD CONSTRAINT "Pet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisionEvent" ADD CONSTRAINT "DecisionEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
