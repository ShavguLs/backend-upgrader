-- CreateTable
CREATE TABLE "Skin" (
    "id" SERIAL NOT NULL,
    "marketHashName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weapon" TEXT,
    "category" TEXT,
    "rarity" TEXT,
    "exterior" TEXT,
    "imageUrl" TEXT,
    "priceRub" DECIMAL(18,2) NOT NULL,
    "provider" TEXT,
    "providerItemId" TEXT,
    "providerRawData" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "skinId" INTEGER NOT NULL,
    "purchasePriceRub" DECIMAL(18,2) NOT NULL,
    "sellPriceRub" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'owned',
    "source" TEXT NOT NULL DEFAULT 'purchase',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "inventoryItemId" INTEGER,
    "type" TEXT NOT NULL,
    "amountRub" DECIMAL(18,2) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Skin_marketHashName_key" ON "Skin"("marketHashName");

-- CreateIndex
CREATE INDEX "Skin_isActive_priceRub_idx" ON "Skin"("isActive", "priceRub");

-- CreateIndex
CREATE INDEX "Skin_weapon_idx" ON "Skin"("weapon");

-- CreateIndex
CREATE INDEX "Skin_rarity_idx" ON "Skin"("rarity");

-- CreateIndex
CREATE INDEX "Skin_exterior_idx" ON "Skin"("exterior");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_status_idx" ON "InventoryItem"("userId", "status");

-- CreateIndex
CREATE INDEX "InventoryItem_skinId_idx" ON "InventoryItem"("skinId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_userId_createdAt_idx" ON "InventoryTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_inventoryItemId_idx" ON "InventoryTransaction"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_skinId_fkey" FOREIGN KEY ("skinId") REFERENCES "Skin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
