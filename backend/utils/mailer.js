const nodemailer = require('nodemailer');
const User = require('../models/User');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let transporter;
function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

// Sends once per user. Never throws, so a mail problem can't block sign-in.
exports.sendWelcomeEmail = async (user) => {
  if (user.welcomeEmailSent) return;
  const t = getTransporter();
  if (!t) {
    console.warn(`[mail] SMTP not configured, skipped welcome email for ${user.email}`);
    return;
  }
  try {
    await t.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'Welcome to SmartSignal',
      text: `Hi ${user.name},\n\nWelcome to SmartSignal. Your account is ready: log in to explore adaptive traffic signal control with a Deep Q-Network.\n\n- The SmartSignal team`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px">
        <h2>Welcome, ${esc(user.name)}!</h2>
        <p>Your SmartSignal account is ready. Log in to explore adaptive traffic signal control powered by a Deep Q-Network.</p>
        <p style="color:#666;font-size:13px">If you didn’t create this account, you can ignore this email.</p></div>`,
    });
    await User.updateOne({ _id: user._id }, { welcomeEmailSent: true });
  } catch (err) {
    console.error('[mail] welcome email failed:', err.message);
  }
};
