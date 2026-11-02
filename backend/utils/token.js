const jwt = require('jsonwebtoken');

const WEEK = 7 * 24 * 60 * 60 * 1000;

exports.setAuthCookie = (res, user) => {
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: WEEK,
  });
};

exports.readUserId = (req) => {
  try {
    return jwt.verify(req.cookies.token, process.env.JWT_SECRET).sub;
  } catch {
    return null;
  }
};
