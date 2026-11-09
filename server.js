import "dotenv/config";
import express from "express";
import prisma from "./src/lib/prisma.js";
import garageRoutes from "./src/route/garageRoutes.js";
import serviceRoutes from "./src/route/serviceRoutes.js";
import { errorHandler } from "./src/utils/http.js";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/garages", garageRoutes);
app.use("/api/services", serviceRoutes);
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;
const server = app.listen(PORT, () => {
  console.log(`Garage API listening on http://localhost:${PORT}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
