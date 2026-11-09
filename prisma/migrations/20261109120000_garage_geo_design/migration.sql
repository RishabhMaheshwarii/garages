-- AlterTable
ALTER TABLE "Garage" ADD COLUMN     "address" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT,
-- Backfill existing rows, then drop the default (Prisma's @updatedAt sets it client-side).
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Garage" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GarageService" ADD COLUMN     "price" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "description" TEXT;

-- CreateIndex
CREATE INDEX "Garage_lat_lng_idx" ON "Garage"("lat", "lng");

-- CreateIndex
CREATE INDEX "GarageService_serviceId_idx" ON "GarageService"("serviceId");

-- Data integrity (not expressible in Prisma schema; enforced by the DB)
ALTER TABLE "Garage" ADD CONSTRAINT "Garage_lat_range" CHECK ("lat" BETWEEN -90 AND 90);
ALTER TABLE "Garage" ADD CONSTRAINT "Garage_lng_range" CHECK ("lng" BETWEEN -180 AND 180);
ALTER TABLE "GarageService" ADD CONSTRAINT "GarageService_duration_positive" CHECK ("durationMinutes" > 0);
ALTER TABLE "GarageService" ADD CONSTRAINT "GarageService_price_nonneg" CHECK ("price" IS NULL OR "price" >= 0);
