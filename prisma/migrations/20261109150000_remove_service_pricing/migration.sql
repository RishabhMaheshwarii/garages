-- Pricing is not part of the model: remove it from garage services.
ALTER TABLE "GarageService" DROP CONSTRAINT IF EXISTS "GarageService_price_nonneg";
ALTER TABLE "GarageService" DROP COLUMN "price";
