const jwt = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET || 'treeban-change-in-production-!';
const COOKIE_NAME = 'ft_token';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,   // 30 days
  secure: process.env.NODE_ENV === 'production',
};

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try   { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

function setAuthCookie(res, userId, username) {
  const token = signToken({ userId, username });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTS);
}

// Express middleware
function requireAuth(req, res, next) {
  const user = verifyToken(req.cookies?.[COOKIE_NAME]);
  if (!user) return res.status(401).json({ error: 'Not logged in.' });
  req.user = user;
  next();
}

function optionalAuth(req, res, next) {
  req.user = verifyToken(req.cookies?.[COOKIE_NAME]) || null;
  next();
}

// Socket.io helper – extract user from cookie header
function getUserFromSocket(socket) {
  const raw = socket.handshake.headers.cookie || '';
  const match = raw.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifyToken(match[1]);
}

module.exports = {
  COOKIE_NAME,
  signToken, verifyToken,
  setAuthCookie, clearAuthCookie,
  requireAuth, optionalAuth,
  getUserFromSocket,
};
