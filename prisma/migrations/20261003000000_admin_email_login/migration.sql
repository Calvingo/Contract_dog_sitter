CREATE TABLE "AdminLoginChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminLoginChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminLoginChallenge_email_createdAt_idx" ON "AdminLoginChallenge"("email", "createdAt");
CREATE INDEX "AdminLoginChallenge_expiresAt_idx" ON "AdminLoginChallenge"("expiresAt");
