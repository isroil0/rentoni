-- Products no longer require a category. The column stays (and keeps its FK and
-- index) so existing categorised products are untouched; it simply becomes
-- nullable.
ALTER TABLE "products" ALTER COLUMN "category_id" DROP NOT NULL;
