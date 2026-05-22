-- AlterTable
ALTER TABLE "Skin" ADD COLUMN "rarityColor" TEXT;

-- Backfill known rarity values so existing rows render with correct colors
-- before the next provider sync repopulates rarityColor.
UPDATE "Skin"
SET "rarityColor" = CASE
  WHEN lower("rarity") LIKE '%consumer%' THEN '#b0c3d9'
  WHEN lower("rarity") LIKE '%industrial%' THEN '#5e98d9'
  WHEN lower("rarity") LIKE '%mil-spec%' OR lower("rarity") LIKE '%milspec%' THEN '#4b69ff'
  WHEN lower("rarity") LIKE '%restricted%' THEN '#8847ff'
  WHEN lower("rarity") LIKE '%classified%' THEN '#d32ce6'
  WHEN lower("rarity") LIKE '%covert%' THEN '#eb4b4b'
  ELSE "rarityColor"
END
WHERE "rarityColor" IS NULL;
