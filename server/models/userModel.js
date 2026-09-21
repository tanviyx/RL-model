import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // ================= EMAIL VERIFICATION (OTP) =================
    isVerified: { type: Boolean, default: false },
    verificationOtp: { type: String, default: null },
    verificationOtpExpireAt: { type: Date, default: null },

    // ================= RESET PASSWORD (OTP) =================
    resetPasswordOtp: { type: String, default: null },
    resetPasswordOtpExpireAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;