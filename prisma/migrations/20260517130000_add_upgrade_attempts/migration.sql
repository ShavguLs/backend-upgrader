-- CreateTable
CREATE TABLE "UpgradeAttempt" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sourceInventoryItemId" INTEGER NOT NULL,
    "targetSkinId" INTEGER NOT NULL,
    "wonInventoryItemId" INTEGER,
    "sourceValueRub" DECIMAL(18,2) NOT NULL,
    "targetPriceRub" DECIMAL(18,2) NOT NULL,
    "displayedChancePercent" DECIMAL(7,4) NOT NULL,
    "effectiveChancePercent" DECIMAL(7,4) NOT NULL,
    "houseEdgePercent" DECIMAL(7,4) NOT NULL,
    "rollPercent" DECIMAL(7,4) NOT NULL,
    "result" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpgradeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UpgradeAttempt_userId_createdAt_idx" ON "UpgradeAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UpgradeAttempt_sourceInventoryItemId_idx" ON "UpgradeAttempt"("sourceInventoryItemId");

-- CreateIndex
CREATE INDEX "UpgradeAttempt_targetSkinId_idx" ON "UpgradeAttempt"("targetSkinId");

-- CreateIndex
CREATE INDEX "UpgradeAttempt_wonInventoryItemId_idx" ON "UpgradeAttempt"("wonInventoryItemId");

-- AddForeignKey
ALTER TABLE "UpgradeAttempt" ADD CONSTRAINT "UpgradeAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpgradeAttempt" ADD CONSTRAINT "UpgradeAttempt_sourceInventoryItemId_fkey" FOREIGN KEY ("sourceInventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpgradeAttempt" ADD CONSTRAINT "UpgradeAttempt_targetSkinId_fkey" FOREIGN KEY ("targetSkinId") REFERENCES "Skin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpgradeAttempt" ADD CONSTRAINT "UpgradeAttempt_wonInventoryItemId_fkey" FOREIGN KEY ("wonInventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
