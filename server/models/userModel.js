import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // bcrypt hash. Absent for accounts created through Google. Never returned by default.
    password: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    // true only when a Google-verified email proved ownership of the address
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;