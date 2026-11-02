const { readUserId } = require('../utils/token');

// For API routes: 401 JSON
exports.requireAuth = (req, res, next) => {
  const id = readUserId(req);
  if (!id) return res.status(401).json({ message: 'Please log in.' });
  req.userId = id;
  next();
};

// For pages: redirect to login
exports.requirePage = (req, res, next) => {
  const id = readUserId(req);
  if (!id) return res.redirect('/login');
  req.userId = id;
  next();
};

// Logged-in users skip the login/register pages
exports.redirectIfAuthed = (req, res, next) => {
  if (readUserId(req)) return res.redirect('/dashboard');
  next();
};
