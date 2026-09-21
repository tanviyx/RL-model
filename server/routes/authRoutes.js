import express from "express";
import {
  register,
  login,
  logout,
  sendVerificationOtp,
  verifyEmailOtp,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";

const router = express.Router();

// ================= AUTH =================
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

// ================= EMAIL VERIFICATION (OTP) =================
router.post("/send-verification-otp", sendVerificationOtp);
router.post("/verify-email-otp", verifyEmailOtp);

// ================= PASSWORD RESET (OTP) =================
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;