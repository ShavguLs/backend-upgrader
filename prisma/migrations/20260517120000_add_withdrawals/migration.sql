-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "steamTradeUrl" TEXT,
  ADD COLUMN "steamTradePartner" TEXT,
  ADD COLUMN "steamTradeToken" TEXT,
  ADD COLUMN "steamTradeUrlVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "inventoryItemId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "provider" TEXT NOT NULL DEFAULT 'waxpeer',
    "providerProjectId" TEXT NOT NULL,
    "providerTradeId" TEXT,
    "providerListingId" TEXT,
    "providerPrice" INTEGER,
    "providerStatus" INTEGER,
    "steamTradeUrl" TEXT NOT NULL,
    "errorMessage" TEXT,
    "providerRawData" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalRequest_providerProjectId_key" ON "WithdrawalRequest"("providerProjectId");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_userId_status_idx" ON "WithdrawalRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_inventoryItemId_idx" ON "WithdrawalRequest"("inventoryItemId");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_lastCheckedAt_idx" ON "WithdrawalRequest"("status", "lastCheckedAt");

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
