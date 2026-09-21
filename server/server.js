import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import https from "https";
import fs from "fs";
import { Server } from "socket.io";

import connectDB from "./config/mongodb.js";
import authRoutes from "./routes/authRoutes.js";
import trafficRoutes from "./routes/trafficRoutes.js";
import userAuth from "./middleware/userAuth.js";
import { initializeSimulation } from "./services/trafficSim.js";

dotenv.config();

// ✅ CREATE APP FIRST
const app = express();

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(cookieParser());

// ✅ FIXED CORS (IMPORTANT)
app.use(
  cors({
    origin: ["https://localhost:5173"],
    credentials: true,
  })
);

// ================= ROUTES =================
app.use("/api/auth", authRoutes);
app.use("/api/traffic", trafficRoutes);

// Protected route
app.get("/api/auth/check", userAuth, (req, res) => {
  res.json({ success: true, userId: req.userId });
});

// ================= HTTPS CERT =================
const options = {
  key: fs.readFileSync("/app/certs/localhost-key.pem"),   // ✅ FIXED
  cert: fs.readFileSync("/app/certs/localhost.pem"),      // ✅ FIXED
};

// ================= CREATE HTTPS SERVER =================
const httpsServer = https.createServer(options, app);

// ================= SOCKET.IO =================
const io = new Server(httpsServer, {
  cors: {
    origin: ["https://localhost:5173"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("🟢 SOCKET CONNECTED:", socket.id);
});

// ================= START RL SIM =================
initializeSimulation(io);

// ================= PORT =================
const PORT = process.env.PORT || 5000;

// ================= START SERVER =================
connectDB()
  .then(() => {
    httpsServer.listen(PORT, () => {
      console.log(`🚀 HTTPS Server running on https://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("DB failed:", err.message);
    httpsServer.listen(PORT, () => {
      console.log(`⚠️ Server running without DB on https://localhost:${PORT}`);
    });
  });