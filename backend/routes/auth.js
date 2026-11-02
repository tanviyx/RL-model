const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');
const { setAuthCookie } = require('../utils/token');
const { requireAuth } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../utils/mailer');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12); // keeps login timing similar for unknown emails

// 1) Register with name, email, password
router.post('/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (name.length < 2 || name.length > 60) return res.status(400).json({ message: 'Enter your name (2–60 characters).' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
      return res.status(400).json({ message: 'Password must be 8–72 characters with at least one letter and one number.' });

    const existing = await User.findOne({ email }).select('+passwordHash');
    if (existing) {
      return res.status(409).json({
        message: existing.passwordHash
          ? 'This email is already registered. Log in instead.'
          : 'This email is already registered with Google. Use Continue with Google.',
      });
    }

    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    setAuthCookie(res, user);
    sendWelcomeEmail(user); // new user: welcome mail (not awaited)
    res.status(201).json({ redirect: '/dashboard' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'This email is already registered.' });
    console.error(err);
    res.status(500).json({ message: 'Server error. Try again.' });
  }
});

// Login with email + password
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ message: 'Enter your email and password.' });

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (!user.passwordHash)
      return res.status(400).json({ message: 'This account uses Google. Use Continue with Google.' });
    if (!(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ message: 'Invalid email or password.' });

    setAuthCookie(res, user); // returning user: no welcome mail
    res.json({ redirect: '/dashboard' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error. Try again.' });
  }
});

// 2) Continue with Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=google' }),
  (req, res) => {
    const { user, isNew } = req.user;
    setAuthCookie(res, user);
    if (isNew) sendWelcomeEmail(user); // only brand-new accounts get the welcome mail
    res.redirect('/dashboard');
  }
);

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ message: 'Please log in.' });
  res.json({ name: user.name, email: user.email, avatar: user.avatar });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ redirect: '/login' });
});

module.exports = router;
