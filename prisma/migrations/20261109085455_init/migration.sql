-- CreateTable
CREATE TABLE "Garage" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Garage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarageService" (
    "garageId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,

    CONSTRAINT "GarageService_pkey" PRIMARY KEY ("garageId","serviceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_name_key" ON "Service"("name");

-- AddForeignKey
ALTER TABLE "GarageService" ADD CONSTRAINT "GarageService_garageId_fkey" FOREIGN KEY ("garageId") REFERENCES "Garage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarageService" ADD CONSTRAINT "GarageService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
