const { Pool } = require('pg');

// ─── Connection ───────────────────────────────────────────────────────────────
// Set DATABASE_URL in your environment (.env or Railway/Render dashboard)
// Neon example: postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/treeban?sslmode=require
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// ─── Schema ───────────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name  TEXT NOT NULL DEFAULT '',
      bio           TEXT NOT NULL DEFAULT '',
      created_at    BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS lists (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL DEFAULT 'Untitled List',
      owner_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
      is_public  SMALLINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      list_id     TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'open',
      pos_x       FLOAT8 NOT NULL DEFAULT 0,
      pos_y       FLOAT8 NOT NULL DEFAULT 0,
      created_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS task_edges (
      id        TEXT PRIMARY KEY,
      list_id   TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id)
    );

    CREATE TABLE IF NOT EXISTS list_shares (
      id         TEXT PRIMARY KEY,
      list_id    TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      token      TEXT UNIQUE NOT NULL,
      permission TEXT NOT NULL DEFAULT 'view',
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );
  `);
  console.log('✓ Database schema ready');
}

// ─── Helper ───────────────────────────────────────────────────────────────────
async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ─── Users ────────────────────────────────────────────────────────────────────
async function createUser(id, username, email, passwordHash) {
  const rows = await q(
    'INSERT INTO users (id,username,email,password_hash,display_name) VALUES ($1,$2,$3,$4,$5) RETURNING id,username,email,display_name,bio,created_at',
    [id, username, email, passwordHash, username]
  );
  return rows[0];
}
async function getUserById(id) {
  const rows = await q('SELECT id,username,email,display_name,bio,created_at FROM users WHERE id=$1', [id]);
  return rows[0] || null;
}
async function getUserByEmail(email) {
  const rows = await q('SELECT * FROM users WHERE email=$1', [email]);
  return rows[0] || null;
}
async function getUserByUsername(username) {
  const rows = await q('SELECT id,username,display_name,bio,created_at FROM users WHERE username=$1', [username]);
  return rows[0] || null;
}
async function updateProfile(id, displayName, bio) {
  const rows = await q(
    'UPDATE users SET display_name=$1,bio=$2 WHERE id=$3 RETURNING id,username,email,display_name,bio,created_at',
    [displayName, bio, id]
  );
  return rows[0] || null;
}

// ─── Lists ────────────────────────────────────────────────────────────────────
async function createList(id, name, ownerId = null, isPublic = false) {
  const rows = await q(
    'INSERT INTO lists (id,name,owner_id,is_public) VALUES ($1,$2,$3,$4) RETURNING *',
    [id, name, ownerId, isPublic ? 1 : 0]
  );
  return rows[0];
}
async function getList(id) {
  const rows = await q('SELECT * FROM lists WHERE id=$1', [id]);
  return rows[0] || null;
}
async function renameList(id, name) {
  const rows = await q('UPDATE lists SET name=$1 WHERE id=$2 RETURNING *', [name, id]);
  return rows[0];
}
async function setListPublic(id, isPublic) {
  const rows = await q('UPDATE lists SET is_public=$1 WHERE id=$2 RETURNING *', [isPublic ? 1 : 0, id]);
  return rows[0];
}
async function getListsByOwner(ownerId) {
  return q('SELECT * FROM lists WHERE owner_id=$1 ORDER BY created_at DESC', [ownerId]);
}
async function getPublicListsByOwner(ownerId) {
  return q('SELECT * FROM lists WHERE owner_id=$1 AND is_public=1 ORDER BY created_at DESC', [ownerId]);
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
async function addTask(id, listId, title, description = '', posX = 0, posY = 0, status = 'open') {
  const safe = ['open','in_progress','done'].includes(status) ? status : 'open';
  const rows = await q(
    'INSERT INTO tasks (id,list_id,title,description,pos_x,pos_y,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [id, listId, title, description, posX, posY, safe]
  );
  return rows[0];
}
async function getTask(id) {
  const rows = await q('SELECT * FROM tasks WHERE id=$1', [id]);
  return rows[0] || null;
}
async function getTasksForList(listId) {
  return q('SELECT * FROM tasks WHERE list_id=$1 ORDER BY created_at ASC', [listId]);
}
async function updateTaskStatus(id, status) {
  const rows = await q('UPDATE tasks SET status=$1 WHERE id=$2 RETURNING *', [status, id]);
  return rows[0];
}
async function updateTaskPosition(id, posX, posY) {
  const rows = await q('UPDATE tasks SET pos_x=$1,pos_y=$2 WHERE id=$3 RETURNING *', [posX, posY, id]);
  return rows[0];
}
async function updateTaskTitle(id, title) {
  const rows = await q('UPDATE tasks SET title=$1 WHERE id=$2 RETURNING *', [title, id]);
  return rows[0];
}
async function updateTaskDescription(id, description) {
  const rows = await q('UPDATE tasks SET description=$1 WHERE id=$2 RETURNING *', [description, id]);
  return rows[0];
}
async function deleteTask(id) {
  await q('DELETE FROM tasks WHERE id=$1', [id]);
}

// ─── Edges ────────────────────────────────────────────────────────────────────
async function addEdge(id, listId, sourceId, targetId) {
  try {
    await q(
      'INSERT INTO task_edges (id,list_id,source_id,target_id) VALUES ($1,$2,$3,$4)',
      [id, listId, sourceId, targetId]
    );
    return { id, listId, sourceId, targetId };
  } catch { return null; }
}
async function removeEdge(sourceId, targetId) {
  await q('DELETE FROM task_edges WHERE source_id=$1 AND target_id=$2', [sourceId, targetId]);
}
async function getEdgesForList(listId) {
  return q('SELECT * FROM task_edges WHERE list_id=$1', [listId]);
}

// ─── Shares ───────────────────────────────────────────────────────────────────
async function createShare(id, listId, token, permission) {
  const rows = await q(
    'INSERT INTO list_shares (id,list_id,token,permission) VALUES ($1,$2,$3,$4) RETURNING *',
    [id, listId, token, permission]
  );
  return rows[0];
}
async function getShareByToken(token) {
  const rows = await q('SELECT * FROM list_shares WHERE token=$1', [token]);
  return rows[0] || null;
}
async function getSharesForList(listId) {
  return q('SELECT * FROM list_shares WHERE list_id=$1 ORDER BY created_at DESC', [listId]);
}
async function deleteShare(id) {
  await q('DELETE FROM list_shares WHERE id=$1', [id]);
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────
async function getListSnapshot(listId) {
  const [list, tasks, edges] = await Promise.all([
    getList(listId),
    getTasksForList(listId),
    getEdgesForList(listId),
  ]);
  return { list, tasks, edges };
}

module.exports = {
  initDB,
  createUser, getUserById, getUserByEmail, getUserByUsername, updateProfile,
  createList, getList, renameList, setListPublic, getListsByOwner, getPublicListsByOwner,
  addTask, getTask, getTasksForList,
  updateTaskStatus, updateTaskPosition, updateTaskTitle, updateTaskDescription, deleteTask,
  addEdge, removeEdge, getEdgesForList,
  createShare, getShareByToken, getSharesForList, deleteShare,
  getListSnapshot,
};
