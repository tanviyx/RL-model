require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
require('./config/passport');
const { requirePage, redirectIfAuthed } = require('./middleware/auth');

const app = express();

// backend/ and frontend/ are sibling folders
const FRONTEND = path.join(__dirname, '..', 'frontend');
const PUBLIC = path.join(FRONTEND, 'public');   // served to everyone
const PRIVATE = path.join(FRONTEND, 'private'); // only after login

app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());
app.use(express.static(PUBLIC)); // index.html is served at "/"

// Quick check that the server and database are up
app.get('/api/health', (req, res) =>
  res.json({ server: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'not connected' })
);

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }), require('./routes/auth'));
app.use('/api/ai', rateLimit({ windowMs: 15 * 60 * 1000, max: 3000 }), require('./routes/ai')); // DQN decisions (Step 6.5)

// Pages
app.get('/login', redirectIfAuthed, (req, res) => res.sendFile(path.join(PUBLIC, 'login.html')));
app.get('/register', redirectIfAuthed, (req, res) => res.sendFile(path.join(PUBLIC, 'register.html')));
app.get('/dashboard', requirePage, (req, res) => res.sendFile(path.join(PRIVATE, 'dashboard.html')));
app.get('/simulation', requirePage, (req, res) => res.sendFile(path.join(PRIVATE, 'simulation.html')));

const port = process.env.PORT || 3000;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => app.listen(port, () => console.log(`Server running on http://localhost:${port}`)))
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
