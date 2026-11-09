import { Prisma } from "@prisma/client";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, `Invalid id: ${value}`);
  return id;
}

// Express error handler: maps HttpError and common Prisma errors to responses.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return res.status(404).json({ error: "Not found" });
    if (err.code === "P2002") return res.status(409).json({ error: "Already exists" });
    if (err.code === "P2003") return res.status(400).json({ error: "Referenced record does not exist" });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}