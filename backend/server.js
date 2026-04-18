require('dotenv').config();
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt       = require('bcryptjs');
const crypto       = require('crypto');
function uuidv4()  { return crypto.randomUUID(); }

const db   = require('./database');
const auth = require('./auth');

const app = express();
const ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({ origin: [ORIGIN, 'http://localhost:5174'], credentials: true }));
app.use(express.json());
app.use(cookieParser());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: [ORIGIN, 'http://localhost:5174'], credentials: true, methods: ['GET','POST'] },
});

// ══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password)
      return res.status(400).json({ error: 'All fields are required.' });
    if (username.length < 3 || username.length > 30 || !/^[a-zA-Z0-9_]+$/.test(username))
      return res.status(400).json({ error: 'Username must be 3-30 chars, alphanumeric or underscore.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (await db.getUserByEmail(email))
      return res.status(409).json({ error: 'Email is already in use.' });
    const id   = uuidv4().replace(/-/g,'').slice(0,16);
    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(id, username, email, hash);
    auth.setAuthCookie(res, user.id, user.username);
    res.json({ user: publicUser(user) });
  } catch (e) {
    if (e.message?.includes('unique') || e.code === '23505')
      return res.status(409).json({ error: 'Username or email is already taken.' });
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });
    const row = await db.getUserByEmail(email);
    if (!row) return res.status(401).json({ error: 'Invalid email or password.' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok)  return res.status(401).json({ error: 'Invalid email or password.' });
    auth.setAuthCookie(res, row.id, row.username);
    const user = await db.getUserById(row.id);
    res.json({ user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

app.post('/api/auth/logout', (req, res) => {
  auth.clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', auth.optionalAuth, async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const user = await db.getUserById(req.user.userId);
  res.json({ user: user ? publicUser(user) : null });
});

app.patch('/api/auth/me', auth.requireAuth, async (req, res) => {
  try {
    const { displayName, bio } = req.body || {};
    const user = await db.updateProfile(req.user.userId, displayName || '', bio || '');
    res.json({ user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

// ══════════════════════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════════════════════

app.get('/api/users/:username', async (req, res) => {
  const u = await db.getUserByUsername(req.params.username);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: u });
});

app.get('/api/users/:username/lists', async (req, res) => {
  const u = await db.getUserByUsername(req.params.username);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  const lists = await db.getPublicListsByOwner(u.id);
  res.json({ lists });
});

// ══════════════════════════════════════════════════════════════════════════
// LISTS
// ══════════════════════════════════════════════════════════════════════════

app.post('/api/lists', auth.requireAuth, async (req, res) => {
  try {
    const id   = uuidv4().replace(/-/g,'').slice(0,12);
    const name = req.body.name || 'Untitled List';
    const list = await db.createList(id, name, req.user.userId, !!req.body.isPublic);
    res.json(list);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

app.get('/api/lists', auth.requireAuth, async (req, res) => {
  const lists = await db.getListsByOwner(req.user.userId);
  res.json({ lists });
});

app.get('/api/lists/:id', auth.optionalAuth, async (req, res) => {
  const snap = await db.getListSnapshot(req.params.id);
  if (!snap.list) return res.status(404).json({ error: 'List not found.' });
  const perm = await resolvePermission(snap.list, req.user, req.query.share);
  if (!perm)   return res.status(403).json({ error: 'You do not have permission to access this list.' });
  res.json({ ...snap, permission: perm });
});

app.patch('/api/lists/:id', auth.requireAuth, async (req, res) => {
  const list = await db.getList(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found.' });
  if (list.owner_id !== req.user.userId) return res.status(403).json({ error: 'Only the owner can edit.' });
  if (req.body.name !== undefined)     await db.renameList(list.id, req.body.name);
  if (req.body.isPublic !== undefined) await db.setListPublic(list.id, req.body.isPublic);
  res.json(await db.getList(list.id));
});

// ── Shares ──────────────────────────────────────────────────────────────────

app.post('/api/lists/:id/shares', auth.requireAuth, async (req, res) => {
  try {
    const list = await db.getList(req.params.id);
    if (!list) return res.status(404).json({ error: 'List not found.' });
    if (list.owner_id !== req.user.userId) return res.status(403).json({ error: 'Only the owner can share.' });
    const permission = ['view','edit'].includes(req.body.permission) ? req.body.permission : 'view';
    const shareId = uuidv4().replace(/-/g,'').slice(0,12);
    const token   = uuidv4().replace(/-/g,'');
    const share   = await db.createShare(shareId, list.id, token, permission);
    res.json(share);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

app.get('/api/lists/:id/shares', auth.requireAuth, async (req, res) => {
  const list = await db.getList(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found.' });
  if (list.owner_id !== req.user.userId) return res.status(403).json({ error: 'Unauthorized.' });
  res.json({ shares: await db.getSharesForList(list.id) });
});

app.delete('/api/shares/:shareId', auth.requireAuth, async (req, res) => {
  await db.deleteShare(req.params.shareId);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function publicUser(u) {
  return { id: u.id, username: u.username, displayName: u.display_name, bio: u.bio, createdAt: u.created_at };
}

async function resolvePermission(list, jwtUser, shareToken) {
  if (jwtUser && list.owner_id === jwtUser.userId) return 'owner';
  if (shareToken) {
    const share = await db.getShareByToken(shareToken);
    if (share && share.list_id === list.id) return share.permission;
  }
  if (list.is_public) return 'view';
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// SOCKET.IO
// ══════════════════════════════════════════════════════════════════════════

const socketMeta = {};

function broadcastUsers(listId) {
  const users = {};
  Object.entries(socketMeta).forEach(([sid, m]) => {
    if (m.listId === listId) users[sid] = { name: m.name, permission: m.permission };
  });
  io.to(listId).emit('users_update', users);
}

io.on('connection', (socket) => {
  const jwtUser = auth.getUserFromSocket(socket);

  socket.on('join_list', async ({ listId, shareToken, userName } = {}) => {
    if (!listId) return;
    try {
      const list = await db.getList(listId);
      if (!list) return socket.emit('error_event', 'List not found.');
      const perm = await resolvePermission(list, jwtUser, shareToken);
      if (!perm)  return socket.emit('error_event', 'You do not have permission to access this list.');

      let displayName = userName || 'Misafir';
      if (jwtUser) {
        const u = await db.getUserById(jwtUser.userId);
        displayName = u?.display_name || u?.username || jwtUser.username;
      }

      socket.join(listId);
      socketMeta[socket.id] = { listId, name: displayName, permission: perm };
      socket.emit('init', { ...(await db.getListSnapshot(listId)), permission: perm });
      broadcastUsers(listId);
    } catch (e) { console.error(e); }
  });

  socket.on('disconnect', () => {
    const m = socketMeta[socket.id];
    delete socketMeta[socket.id];
    if (m) broadcastUsers(m.listId);
  });

  function canEdit(listId) {
    const m = socketMeta[socket.id];
    return m && m.listId === listId && m.permission !== 'view';
  }

  // ── List ────────────────────────────────────────────────────────────────
  socket.on('rename_list', async ({ listId, name }) => {
    if (!canEdit(listId)) return;
    const list = await db.renameList(listId, name);
    io.to(listId).emit('list_renamed', list);
  });

  socket.on('set_list_public', async ({ listId, isPublic }) => {
    const m = socketMeta[socket.id];
    if (!m || m.permission !== 'owner') return;
    await db.setListPublic(listId, isPublic);
    io.to(listId).emit('list_visibility_changed', { listId, isPublic });
  });

  // ── Tasks ───────────────────────────────────────────────────────────────
  socket.on('add_task', async ({ listId, title, description, posX, posY, status }) => {
    if (!canEdit(listId)) return;
    const id   = uuidv4().replace(/-/g,'').slice(0,12);
    const task = await db.addTask(id, listId, title, description||'', posX||0, posY||0, status||'open');
    io.to(listId).emit('task_added', task);
  });

  socket.on('update_task_status', async ({ listId, taskId, status }) => {
    if (!canEdit(listId)) return;
    const task = await db.updateTaskStatus(taskId, status);
    io.to(listId).emit('task_status_updated', task);
  });

  socket.on('update_task_position', async ({ listId, taskId, posX, posY }) => {
    if (!canEdit(listId)) return;
    const task = await db.updateTaskPosition(taskId, posX, posY);
    socket.to(listId).emit('task_position_updated', task);
  });

  socket.on('update_task_title', async ({ listId, taskId, title }) => {
    if (!canEdit(listId)) return;
    const task = await db.updateTaskTitle(taskId, title);
    io.to(listId).emit('task_title_updated', task);
  });

  socket.on('update_task_description', async ({ listId, taskId, description }) => {
    if (!canEdit(listId)) return;
    const task = await db.updateTaskDescription(taskId, description);
    io.to(listId).emit('task_description_updated', task);
  });

  socket.on('delete_task', async ({ listId, taskId }) => {
    if (!canEdit(listId)) return;
    await db.deleteTask(taskId);
    io.to(listId).emit('task_deleted', { taskId });
  });

  // ── Edges ───────────────────────────────────────────────────────────────
  socket.on('add_edge', async ({ listId, sourceId, targetId }) => {
    if (!canEdit(listId)) return;
    const id   = uuidv4().replace(/-/g,'').slice(0,12);
    const edge = await db.addEdge(id, listId, sourceId, targetId);
    if (edge) io.to(listId).emit('edge_added', { id, listId, sourceId, targetId });
  });

  socket.on('remove_edge', async ({ listId, sourceId, targetId }) => {
    if (!canEdit(listId)) return;
    await db.removeEdge(sourceId, targetId);
    io.to(listId).emit('edge_removed', { sourceId, targetId });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3001;

db.initDB()
  .then(() => {
    server.listen(PORT, () => console.log(`Treeban backend → http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('❌ Database init failed:', err.message);
    process.exit(1);
  });
