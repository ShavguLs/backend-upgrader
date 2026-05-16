ALTER TABLE "Wallet"
ADD CONSTRAINT "Wallet_balance_non_negative" CHECK ("balance" >= 0);

ALTER TABLE "Deposit"
ADD CONSTRAINT "Deposit_amountRub_non_negative" CHECK ("amountRub" >= 0);

ALTER TABLE "Skin"
ADD CONSTRAINT "Skin_priceRub_non_negative" CHECK ("priceRub" >= 0);

ALTER TABLE "InventoryItem"
ADD CONSTRAINT "InventoryItem_purchasePriceRub_non_negative" CHECK ("purchasePriceRub" >= 0);

ALTER TABLE "InventoryItem"
ADD CONSTRAINT "InventoryItem_sellPriceRub_non_negative" CHECK ("sellPriceRub" >= 0);

ALTER TABLE "InventoryTransaction"
ADD CONSTRAINT "InventoryTransaction_amountRub_non_negative" CHECK ("amountRub" >= 0);
