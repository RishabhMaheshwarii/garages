import prisma from "../src/lib/prisma.js";

// Service catalogue: duration in minutes (must be < 55), the same at every garage. No pricing.
const services = [
  { name: "Oil Change", description: "Engine oil and filter replacement", base: 30 },
  { name: "Brake Repair", description: "Pads, discs and brake fluid", base: 45 },
  { name: "Tyre Replacement", description: "Tyre fitting and balancing", base: 40 },
  { name: "General Service", description: "Full periodic inspection and service", base: 50 },
  { name: "AC Repair", description: "Air-conditioning diagnostics and regas", base: 45 },
  { name: "Value added", description: "value added services", base: 25 },
  { name: "Detailing", description: "ppf", base: 50 },
  { name: "Wheel Alignment", description: "Wheel alignment and balancing", base: 30 },
  { name: "Battery Replacement", description: "Battery check and replacement", base: 20 },
  { name: "Car Wash", description: "Exterior wash and interior vacuum", base: 25 },
];

// Garages across Delhi. Every garage offers every service.
const garages = [
  { name: "delhi 1", address: "Connaught Place, New Delhi", lat: 28.6315, lng: 77.2167 },
  { name: "delhi 2", address: "Jhandewalan Extension, Karol Bagh, New Delhi", lat: 28.6442, lng: 77.2005 },
  { name: "delhi 3", address: "Lajpat Nagar, New Delhi", lat: 28.5677, lng: 77.2433 },
  { name: "delhi 4", address: "Saket, New Delhi", lat: 28.5245, lng: 77.2066 },
  { name: "delhi 5", address: "Dwarka, New Delhi", lat: 28.5921, lng: 77.046 },
  { name: "delhi 6", address: "Rohini, New Delhi", lat: 28.7495, lng: 77.0565 },
  { name: "delhi 7", address: "Janakpuri, New Delhi", lat: 28.6219, lng: 77.0878 },
  { name: "delhi 8", address: "Mayur Vihar, New Delhi", lat: 28.6077, lng: 77.294 },
  { name: "delhi 9", address: "Vasant Kunj, New Delhi", lat: 28.5293, lng: 77.153 },
  { name: "delhi 10", address: "Pitampura, New Delhi", lat: 28.699, lng: 77.1384 },
];



async function main() {
  // Insert only missing rows: upsert (INSERT ... ON CONFLICT) burns an id on every run.
  const existingServices = new Set((await prisma.service.findMany({ select: { name: true } })).map((s) => s.name));
  const missingServices = services.filter((s) => !existingServices.has(s.name));
  if (missingServices.length) {
    await prisma.service.createMany({
      data: missingServices.map(({ name, description }) => ({ name, description })),
    });
  }
  const serviceIds = Object.fromEntries((await prisma.service.findMany()).map((s) => [s.name, s.id]));

  for (const g of garages) {
    if (await prisma.garage.findFirst({ where: { name: g.name } })) continue;
    await prisma.garage.create({
      data: {
        ...g,
        services: {
          create: services.map((s) => ({ serviceId: serviceIds[s.name], durationMinutes: s.base })),
        },
      },
    });
  }
  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
