CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Skin_name_trgm_idx"
ON "Skin" USING gin ("name" gin_trgm_ops)
WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS "Skin_marketHashName_trgm_idx"
ON "Skin" USING gin ("marketHashName" gin_trgm_ops)
WHERE "isActive" = true;
