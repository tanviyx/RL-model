import express from "express";
const router = express.Router();

import {
  logTraffic,
  getComparison,
  getRLSignal,
  getFixedSignal,
  updateLive,   // 🔥 ADD
  getLive       // 🔥 ADD
} from "../controllers/trafficController.js";

// ================= RL SIGNAL =================
router.post("/rl", getRLSignal);

// ================= FIXED SIGNAL =================
router.post("/fixed", getFixedSignal);

// ================= PYTHON → NODE =================
router.post("/log", logTraffic);

// ================= LIVE (PYTHON → NODE → UI) =================
router.post("/live", updateLive);   // 🔥 NEW
router.get("/live", getLive);       // 🔥 NEW

// ================= COMPARISON =================
router.get("/compare", getComparison);
export default router;