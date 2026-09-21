import User from "../models/userModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import transporter from "../config/nodemailer.js";

// ================= JWT =================
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// ================= REGISTER =================
export const register = async (req, res) => {
  console.log("REGISTER HIT:", req.body); // ✅ DEBUG

  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      verificationOtp: hashedOtp,
      verificationOtpExpireAt: Date.now() + 10 * 60 * 1000,
      isVerified: false,
    });





    // ✅ SAFE EMAIL SEND (won’t crash register)
    try {
      await transporter.sendMail({
        from: `"Your App" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Verify Your Email",
        html: `
          <h2>Hello ${name}</h2>
          <p>Your verification OTP is:</p>
          <h1>${otp}</h1>
          <p>This OTP expires in 10 minutes.</p>
        `,
      });
      console.log("✅ Email sent");
    } catch (mailError) {
      console.log("❌ EMAIL ERROR:", mailError.message);
    }

    return res.status(201).json({
      success: true,
      message: "Registered successfully. Please verify your email using OTP.",
    });

  } catch (error) {
    console.log("❌ REGISTER ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error during registration",
    });
  }
};

// ================= LOGIN =================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = generateToken(user._id);

    res.cookie("token", token, {
      httpOnly: true,
      secure: false, // (later change to true in production HTTPS)
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: "Login successful",
    });

  } catch (error) {
    console.log("LOGIN ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ================= LOGOUT =================
export const logout = async (req, res) => {
  res.clearCookie("token");
  return res.json({ success: true, message: "Logged out successfully" });
};

// ================= SEND VERIFICATION OTP =================
export const sendVerificationOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.json({
        success: false,
        message: "User already verified",
      });
    }

    const otp = crypto.randomInt(100000, 999999).toString();

    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    user.verificationOtp = hashedOtp;
    user.verificationOtpExpireAt = Date.now() + 10 * 60 * 1000;

    await user.save();

    try {
      await transporter.sendMail({
        from: `"Your App" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Email Verification OTP",
        html: `<h2>Your OTP is: ${otp}</h2>`,
      });
    } catch (mailError) {
      console.log("EMAIL ERROR:", mailError.message);
    }

    return res.json({
      success: true,
      message: "Verification OTP sent to email",
    });

  } catch (error) {
    console.log("SEND OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ================= VERIFY EMAIL OTP =================
export const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user.verificationOtp) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    if (
      user.verificationOtp !== hashedOtp ||
      user.verificationOtpExpireAt < Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    user.isVerified = true;
    user.verificationOtp = undefined;
    user.verificationOtpExpireAt = undefined;

    await user.save();

    return res.json({
      success: true,
      message: "Email verified successfully",
    });

  } catch (error) {
    console.log("VERIFY OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ================= FORGOT PASSWORD =================
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = crypto.randomInt(100000, 999999).toString();

    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    user.resetPasswordOtp = hashedOtp;
    user.resetPasswordOtpExpireAt = Date.now() + 10 * 60 * 1000;

    await user.save();

    try {
      await transporter.sendMail({
        from: `"Your App" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Reset Password OTP",
        html: `<h2>${otp}</h2>`,
      });
    } catch (mailError) {
      console.log("EMAIL ERROR:", mailError.message);
    }

    return res.json({
      success: true,
      message: "Reset OTP sent to email",
    });

  } catch (error) {
    console.log("FORGOT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ================= RESET PASSWORD =================
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user.resetPasswordOtp) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    if (
      user.resetPasswordOtp !== hashedOtp ||
      user.resetPasswordOtpExpireAt < Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpireAt = undefined;

    await user.save();

    return res.json({
      success: true,
      message: "Password reset successful",
    });

  } catch (error) {
    console.log("RESET ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};