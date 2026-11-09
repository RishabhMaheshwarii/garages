import { Router } from "express";
import {
  createGarage,
  deleteGarage,
  findNearbyGarages,
  getGarage,
  listGarages,
  removeGarageService,
  updateGarage,
  upsertGarageService,
} from "../controller/garageController.js";

const router = Router();

// /nearby must come before /:id
router.get("/nearby", findNearbyGarages);
router.get("/", listGarages);
router.post("/", createGarage);
router.get("/:id", getGarage);
router.patch("/:id", updateGarage);
router.delete("/:id", deleteGarage);
router.put("/:id/services/:serviceId", upsertGarageService);
router.delete("/:id/services/:serviceId", removeGarageService);

export default router;
