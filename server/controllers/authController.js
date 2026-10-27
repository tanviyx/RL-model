import User from "../models/userModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { validateEmail } from "../utils/validateEmail.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Compared against when the email is unknown, so "no such user" and
// "wrong password" take about the same time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// ================= HELPERS =================
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true, // the API only serves HTTPS
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const setAuthCookie = (res, userId) =>
  res.cookie("token", generateToken(userId), COOKIE_OPTIONS);

const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });

// ================= REGISTER =================
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) {
      return fail(res, 400, "Please enter your name (2-80 characters)");
    }

    if (typeof password !== "string" || password.length < 8) {
      return fail(res, 400, "Password must be at least 8 characters");
    }
    // bcrypt only uses the first 72 bytes; refuse instead of silently truncating
    if (Buffer.byteLength(password, "utf8") > 72) {
      return fail(res, 400, "Password is too long (max 72 bytes)");
    }

    const checked = await validateEmail(email);
    if (!checked.ok) return fail(res, checked.status, checked.message);

    if (await User.findOne({ email: checked.email })) {
      return fail(res, 409, "An account with this email already exists. Please log in.");
    }

    const user = await User.create({
      name: name.trim(),
      email: checked.email,
      password: await bcrypt.hash(password, 10),
    });

    setAuthCookie(res, user._id);
    return res.status(201).json({
      success: true,
      message: "Account created",
      user: { name: user.name, email: user.email },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return fail(res, 409, "An account with this email already exists. Please log in.");
    }
    console.error("REGISTER ERROR:", error.message);
    return fail(res, 500, "Registration failed. Please try again.");
  }
};

// ================= LOGIN (email + password) =================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return fail(res, 400, "Email and password are required");
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");

    // Google-only account (no password set)
    if (user && !user.password) {
      return fail(res, 400, "This account uses Google sign-in. Please use Continue with Google.");
    }

    const matches = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
    if (!user || !matches) {
      return fail(res, 401, "Invalid email or password");
    }

    setAuthCookie(res, user._id);
    return res.json({
      success: true,
      message: "Logged in",
      user: { name: user.name, email: user.email },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error.message);
    return fail(res, 500, "Login failed. Please try again.");
  }
};

// ================= GOOGLE (login + sign up) =================
export const googleLogin = async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return fail(res, 503, "Google sign-in is not configured on the server");
  }

  try {
    const { credential } = req.body || {};
    if (typeof credential !== "string" || !credential) {
      return fail(res, 400, "A Google credential is required");
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      return fail(res, 401, "Google sign-in could not be verified");
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return fail(res, 401, "Use a Google account with a verified email address");
    }

    const email = payload.email.toLowerCase();

    let user = await User.findOne({
      $or: [{ googleId: payload.sub }, { email }],
    }).select("+password");

    if (user?.googleId && user.googleId !== payload.sub) {
      return fail(res, 409, "This email is already linked to another Google account");
    }

    if (!user) {
      user = await User.create({
        googleId: payload.sub,
        name: payload.name || email.split("@")[0],
        email,
        isVerified: true,
      });
    } else {
      // Security: a password account that was never tied to Google may have been
      // created by someone who does not own this email (we only check that the
      // domain can receive mail). Google just proved the real owner, so drop any
      // password set before that proof - otherwise the person who typed this
      // address at sign-up could still log in.
      if (!user.googleId && user.password) {
        user.password = undefined;
      }
      user.googleId = payload.sub;
      user.isVerified = true;
      if (!user.name && payload.name) user.name = payload.name;
      await user.save();
    }

    setAuthCookie(res, user._id);
    return res.json({
      success: true,
      message: "Signed in with Google",
      user: { name: user.name, email: user.email },
    });
  } catch (error) {
    console.error("GOOGLE LOGIN ERROR:", error.message);
    return fail(res, 500, "Google sign-in failed");
  }
};

// ================= LOGOUT =================
export const logout = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: COOKIE_OPTIONS.httpOnly,
    secure: COOKIE_OPTIONS.secure,
    sameSite: COOKIE_OPTIONS.sameSite,
  });
  return res.json({ success: true, message: "Logged out successfully" });
};