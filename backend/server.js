require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
require('./config/passport');
const { requirePage } = require('./middleware/auth');

const app = express();

// backend/ and frontend/ are sibling folders
const FRONTEND = path.join(__dirname, '..', 'frontend');
const FRONTEND_BUILD = path.join(FRONTEND, 'dist');

app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Quick check that the server and database are up
app.get('/api/health', (req, res) =>
  res.json({ server: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'not connected' })
);

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }), require('./routes/auth'));
app.use('/api/ai', rateLimit({ windowMs: 15 * 60 * 1000, max: 3000 }), require('./routes/ai')); // DQN decisions (Step 6.5)
app.use('/api/experiments', rateLimit({ windowMs: 15 * 60 * 1000, max: 1500 }), require('./routes/experiments')); // fixed vs AI runs (Step 6.6)
app.use('/api/history', rateLimit({ windowMs: 15 * 60 * 1000, max: 1500 }), require('./routes/history'));       // dashboard history (Step 6.7)
app.use('/api/traffic', rateLimit({ windowMs: 15 * 60 * 1000, max: 1500 }), require('./routes/traffic'));       // traffic information (Step 6.6)

app.use(express.static(FRONTEND_BUILD));

// Serve the React application for each client-side route.
app.get('/login', (req, res) => res.sendFile(path.join(FRONTEND_BUILD, 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(FRONTEND_BUILD, 'index.html')));
app.get('/dashboard', requirePage, (req, res) => res.sendFile(path.join(FRONTEND_BUILD, 'index.html')));
app.get('/simulation', requirePage, (req, res) => res.sendFile(path.join(FRONTEND_BUILD, 'index.html')));
app.get('/compare', requirePage, (req, res) => res.sendFile(path.join(FRONTEND_BUILD, 'index.html')));
app.get('*', (req, res, next) => {
  if (req.path === '/api' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(FRONTEND_BUILD, 'index.html'));
});

const port = process.env.PORT || 3000;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => require('./services/experimentRunner').failStale())
  .then(() => app.listen(port, () => console.log(`Server running on http://localhost:${port}`)))
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
