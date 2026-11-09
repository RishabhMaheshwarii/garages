import prisma from "../lib/prisma.js";
import { HttpError, parseId } from "../utils/http.js";

// GET /api/services
export async function listServices(req, res) {
  const services = await prisma.service.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { garages: true } } },
  });
  res.json(
    services.map(({ _count, ...s }) => ({ ...s, garageCount: _count.garages })),
  );
}

// GET /api/services/:id
export async function getService(req, res) {
  const service = await prisma.service.findUnique({ where: { id: parseId(req.params.id) } });
  if (!service) throw new HttpError(404, "Service not found");
  res.json(service);
}

// POST /api/services
export async function createService(req, res) {
  const { name, description } = req.body;
  if (!name || typeof name !== "string") throw new HttpError(400, "name is required");
  const service = await prisma.service.create({ data: { name: name.trim(), description } });
  res.status(201).json(service);
}

// PATCH /api/services/:id
export async function updateService(req, res) {
  const { name, description } = req.body;
  const service = await prisma.service.update({
    where: { id: parseId(req.params.id) },
    data: { name: name?.trim(), description },
  });
  res.json(service);
}

// DELETE /api/services/:id
export async function deleteService(req, res) {
  await prisma.service.delete({ where: { id: parseId(req.params.id) } });
  res.status(204).end();
}
