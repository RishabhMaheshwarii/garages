import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { boundingBox, isValidLat, isValidLng } from "../utils/geo.js";
import { HttpError, parseId } from "../utils/http.js";

const MAX_RADIUS_KM = 500;
const MAX_LIMIT = 100;
// Business rule: every service must take under 55 minutes (also enforced by a DB check).
const MAX_DURATION_MINUTES = 54;

const garageInclude = {
  services: {
    include: { service: true },
    orderBy: { service: { name: "asc" } },
  },
};

// Flatten the join table so clients see { id, name, durationMinutes }.
function formatGarage(garage) {
  const { services, ...rest } = garage;
  return {
    ...rest,
    services: services?.map((gs) => ({
      id: gs.service.id,
      name: gs.service.name,
      durationMinutes: gs.durationMinutes,
    })),
  };
}

function parseCoords(body, { partial = false } = {}) {
  const out = {};
  for (const [key, check] of [["lat", isValidLat], ["lng", isValidLng]]) {
    if (body[key] === undefined) {
      if (!partial) throw new HttpError(400, `${key} is required`);
      continue;
    }
    const v = Number(body[key]);
    if (!check(v)) throw new HttpError(400, `${key} is out of range`);
    out[key] = v;
  }
  return out;
}

function parseServiceLinks(services) {
  if (services === undefined) return undefined;
  if (!Array.isArray(services)) throw new HttpError(400, "services must be an array");
  return services.map((s) => {
    const serviceId = Number(s.serviceId);
    const durationMinutes = Number(s.durationMinutes);
    if (!Number.isInteger(serviceId)) throw new HttpError(400, "services[].serviceId must be an integer");
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > MAX_DURATION_MINUTES) {
      throw new HttpError(400, `durationMinutes must be an integer from 1 to ${MAX_DURATION_MINUTES} (under 55 minutes)`);
    }
    return { serviceId, durationMinutes };
  });
}

// GET /api/garages
export async function listGarages(req, res) {
  const garages = await prisma.garage.findMany({
    where: req.query.includeInactive === "true" ? {} : { isActive: true },
    include: garageInclude,
    orderBy: { id: "asc" },
  });
  res.json(garages.map(formatGarage));
}

// GET /api/garages/:id
export async function getGarage(req, res) {
  const garage = await prisma.garage.findUnique({
    where: { id: parseId(req.params.id) },
    include: garageInclude,
  });
  if (!garage) throw new HttpError(404, "Garage not found");
  res.json(formatGarage(garage));
}

// POST /api/garages
export async function createGarage(req, res) {
  const { name, address, phone } = req.body;
  if (!name || typeof name !== "string") throw new HttpError(400, "name is required");
  const coords = parseCoords(req.body);
  const links = parseServiceLinks(req.body.services);

  const garage = await prisma.garage.create({
    data: {
      name,
      address,
      phone,
      ...coords,
      ...(links && { services: { create: links } }),
    },
    include: garageInclude,
  });
  res.status(201).json(formatGarage(garage));
}

// PATCH /api/garages/:id  — `services`, if given, replaces the full set.
export async function updateGarage(req, res) {
  const id = parseId(req.params.id);
  const { name, address, phone, isActive } = req.body;
  const coords = parseCoords(req.body, { partial: true });
  const links = parseServiceLinks(req.body.services);

  const garage = await prisma.$transaction(async (tx) => {
    const updated = await tx.garage.update({
      where: { id },
      data: { name, address, phone, isActive, ...coords },
    });
    if (links) {
      await tx.garageService.deleteMany({ where: { garageId: id } });
      await tx.garageService.createMany({
        data: links.map((l) => ({ ...l, garageId: id })),
      });
    }
    return tx.garage.findUnique({ where: { id: updated.id }, include: garageInclude });
  });
  res.json(formatGarage(garage));
}

// DELETE /api/garages/:id
export async function deleteGarage(req, res) {
  await prisma.garage.delete({ where: { id: parseId(req.params.id) } });
  res.status(204).end();
}

// PUT /api/garages/:id/services/:serviceId  — add or update one offering
export async function upsertGarageService(req, res) {
  const garageId = parseId(req.params.id);
  const serviceId = parseId(req.params.serviceId);
  const [link] = parseServiceLinks([{ ...req.body, serviceId }]);

  const gs = await prisma.garageService.upsert({
    where: { garageId_serviceId: { garageId, serviceId } },
    create: { garageId, ...link },
    update: { durationMinutes: link.durationMinutes },
    include: { service: true },
  });
  res.json(formatGarage({ services: [gs] }).services[0]);
}

// DELETE /api/garages/:id/services/:serviceId
export async function removeGarageService(req, res) {
  await prisma.garageService.delete({
    where: {
      garageId_serviceId: {
        garageId: parseId(req.params.id),
        serviceId: parseId(req.params.serviceId),
      },
    },
  });
  res.status(204).end();
}

/**
 * GET /api/garages/nearby?lat=..&lng=..&radiusKm=10&serviceId=1&service=Oil%20Change&limit=20
 *
 * Two-stage geo search:
 *   1. Bounding-box prefilter on (lat, lng) — uses the Garage_lat_lng_idx index.
 *   2. Exact haversine distance, filtered to radius and sorted nearest-first.
 */
export async function findNearbyGarages(req, res) {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!isValidLat(lat) || !isValidLng(lng)) {
    throw new HttpError(400, "lat and lng query params are required and must be valid coordinates");
  }
  const radiusKm = req.query.radiusKm === undefined ? 10 : Number(req.query.radiusKm);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    throw new HttpError(400, `radiusKm must be between 0 and ${MAX_RADIUS_KM}`);
  }
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new HttpError(400, `limit must be an integer between 1 and ${MAX_LIMIT}`);
  }

  const { minLat, maxLat, lngRanges } = boundingBox(lat, lng, radiusKm);
  const lngFilter = Prisma.join(
    lngRanges.map(([lo, hi]) => Prisma.sql`g."lng" BETWEEN ${lo} AND ${hi}`),
    " OR ",
  );

  const serviceFilters = [];
  if (req.query.serviceId !== undefined) {
    serviceFilters.push(Prisma.sql`gs."serviceId" = ${parseId(req.query.serviceId)}`);
  }
  if (req.query.service) {
    serviceFilters.push(Prisma.sql`s."name" ILIKE ${String(req.query.service)}`);
  }
  const serviceFilter = serviceFilters.length
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "GarageService" gs
        JOIN "Service" s ON s."id" = gs."serviceId"
        WHERE gs."garageId" = g."id" AND ${Prisma.join(serviceFilters, " AND ")}
      )`
    : Prisma.empty;

  const rows = await prisma.$queryRaw`
    SELECT * FROM (
      SELECT
        g."id", g."name", g."address", g."phone", g."lat", g."lng",
        2 * 6371 * asin(least(1, sqrt(
          power(sin(radians(g."lat" - ${lat}) / 2), 2) +
          cos(radians(${lat})) * cos(radians(g."lat")) *
          power(sin(radians(g."lng" - ${lng}) / 2), 2)
        ))) AS "distanceKm"
      FROM "Garage" g
      WHERE g."isActive"
        AND g."lat" BETWEEN ${minLat} AND ${maxLat}
        AND (${lngFilter})
        ${serviceFilter}
    ) candidates
    WHERE "distanceKm" <= ${radiusKm}
    ORDER BY "distanceKm" ASC
    LIMIT ${limit}
  `;

  // Attach each garage's services in one follow-up query.
  const links = await prisma.garageService.findMany({
    where: { garageId: { in: rows.map((r) => r.id) } },
    include: { service: true },
    orderBy: { service: { name: "asc" } },
  });
  const byGarage = new Map();
  for (const l of links) {
    if (!byGarage.has(l.garageId)) byGarage.set(l.garageId, []);
    byGarage.get(l.garageId).push(l);
  }

  res.json(
    rows.map((r) => ({
      ...formatGarage({ ...r, services: byGarage.get(r.id) ?? [] }),
      distanceKm: Math.round(Number(r.distanceKm) * 1000) / 1000,
    })),
  );
}
