import { Router } from "express";
import {
  createService,
  deleteService,
  getService,
  listServices,
  updateService,
} from "../controller/serviceController.js";

const router = Router();

router.get("/", listServices);
router.post("/", createService);
router.get("/:id", getService);
router.patch("/:id", updateService);
router.delete("/:id", deleteService);

export default router;
