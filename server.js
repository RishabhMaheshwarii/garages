import "dotenv/config";
import express from "express";
import prisma from "./src/lib/prisma.js";
import garageRoutes from "./src/route/garageRoutes.js";
import serviceRoutes from "./src/route/serviceRoutes.js";
import { errorHandler } from "./src/utils/http.js";

const app = express();
app.use(express.json());

// Allow the frontend to call the API from another origin (e.g. localhost during development).
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static("public"));
// On Vercel, public/ is served by the CDN and "/" reaches this function, so send it to the page.
app.get("/", (req, res) => res.redirect("/index.html"));

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/garages", garageRoutes);
app.use("/api/services", serviceRoutes);
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use(errorHandler);

// On Vercel the platform handles requests via the exported app; only listen locally.
if (!process.env.VERCEL) {
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
}

export default app;
