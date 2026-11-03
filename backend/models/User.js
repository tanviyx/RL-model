const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false }, // absent for Google-only accounts
    googleId: { type: String, index: true, sparse: true },
    avatar: String,
    welcomeEmailSent: { type: Boolean, default: false },
    lastLoginAt: Date,                                // set on every successful login (password or Google)
    loginCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
