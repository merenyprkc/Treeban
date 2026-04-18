import { io } from 'socket.io-client';

// ══════════════════════════════════════════════════════════════════════════════
// Global state
// ══════════════════════════════════════════════════════════════════════════════
const app = {
  user:       null,   // current logged-in user (from /api/auth/me)
  list:       null,   // currently open list metadata
  tasks:      {},
  edges:      [],
  view:       'kanban',
  permission: null,   // 'owner' | 'edit' | 'view'
  socket:     null,
  mySocketId: null,
  connectMode:   false,
  connectSource: null,
  dragState:     null,
  activeModalTaskId: null,
  pendingAddStatus:  'open',
  pendingAddTreePos: null,
  _pendingDeps:      null,
};

const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const $ = id => document.getElementById(id);
const api = async (method, path, body) => {
  const r = await fetch(path, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};

// ══════════════════════════════════════════════════════════════════════════════
// ROUTING  (hash-based SPA)
// ══════════════════════════════════════════════════════════════════════════════
async function boot() {
  // Check auth state once
  const { user } = await api('GET', '/api/auth/me');
  app.user = user;
  route();
}

function route() {
  const hash = location.hash || '#/';
  const [base, ...rest] = hash.slice(1).split('/').filter(Boolean);

  hideAllPages();

  if (!base || base === '') {
    // Root: if logged in → dashboard, else landing
    if (app.user) return showDashboard();
    return showLanding();
  }
  if (base === 'login')    return showLogin();
  if (base === 'register') return showRegister();
  if (base === 'dashboard') return showDashboard();
  if (base === 'profile')   return showProfile(rest[0]);
  if (base === 'list')      return showList(rest[0]);
  // Unknown → landing
  showLanding();
}

window.addEventListener('hashchange', route);

function hideAllPages() {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
}
function showPage(id) {
  $(id)?.classList.remove('hidden');
}
function navigate(hash) {
  location.hash = hash;
}

// ══════════════════════════════════════════════════════════════════════════════
// LANDING
// ══════════════════════════════════════════════════════════════════════════════
function showLanding() {
  if (app.user) return navigate('#/dashboard');
  showPage('page-landing');
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════
function showLogin() {
  showPage('page-login');
}
function showRegister() {
  showPage('page-register');
}

$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = $('login-error');
  errEl.classList.add('hidden');
  const { user, error } = await api('POST', '/api/auth/login', {
    email:    $('login-email').value.trim(),
    password: $('login-password').value,
  });
  if (error) { errEl.textContent = error; errEl.classList.remove('hidden'); return; }
  app.user = user;
  navigate('#/dashboard');
});

$('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = $('reg-error');
  errEl.classList.add('hidden');
  const { user, error } = await api('POST', '/api/auth/register', {
    username: $('reg-username').value.trim(),
    email:    $('reg-email').value.trim(),
    password: $('reg-password').value,
  });
  if (error) { errEl.textContent = error; errEl.classList.remove('hidden'); return; }
  app.user = user;
  navigate('#/dashboard');
});

$('btn-logout').addEventListener('click', async () => {
  await api('POST', '/api/auth/logout');
  app.user = null;
  navigate('#/');
});

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
async function showDashboard() {
  if (!app.user) { navigate('#/login'); return; }
  showPage('page-dashboard');
  $('dash-profile-link').href = `#/profile/${app.user.username}`;
  $('dash-profile-link').textContent = (app.user.displayName || app.user.username)[0].toUpperCase();
  $('dash-sub-text').textContent = `Hoş geldin, ${app.user.displayName || app.user.username}`;

  const { lists } = await api('GET', '/api/lists');
  renderDashLists(lists || []);
}

function renderDashLists(lists) {
  const container = $('dash-lists');
  const empty     = $('dash-empty');
  container.innerHTML = '';
  if (!lists.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  lists.forEach(list => {
    const card = document.createElement('a');
    card.className = 'list-card';
    card.href      = `#/list/${list.id}`;
    const initial  = (list.name || '?')[0].toUpperCase();
    card.innerHTML = `
      <div class="list-card-icon">${initial}</div>
      <div class="list-card-info">
        <div class="list-card-name">${escHtml(list.name)}</div>
        <div class="list-card-meta">
          <span class="list-card-badge ${list.is_public ? 'badge-public' : 'badge-private'}">
            ${list.is_public ? '◉ Herkese Açık' : '◎ Özel'}
          </span>
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="color:var(--txt-3)"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    `;
    container.appendChild(card);
  });
}

// New list modal
$('btn-new-list').addEventListener('click', () => { $('new-list-modal').classList.remove('hidden'); setTimeout(() => $('new-list-name').focus(), 50); });
$('btn-new-list-close').addEventListener('click', () => $('new-list-modal').classList.add('hidden'));
$('new-list-modal').addEventListener('click', e => { if (e.target === $('new-list-modal')) $('new-list-modal').classList.add('hidden'); });

$('btn-create-list').addEventListener('click', async () => {
  const name     = $('new-list-name').value.trim() || 'Yeni Liste';
  const isPublic = $('new-list-public').checked;
  const list = await api('POST', '/api/lists', { name, isPublic });
  $('new-list-modal').classList.add('hidden');
  if (list.id) navigate(`#/list/${list.id}`);
});
$('new-list-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-create-list').click(); });

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════════════════════════
async function showProfile(username) {
  if (!username) { navigate('#/'); return; }
  showPage('page-profile');

  // Nav actions
  const nav = $('profile-nav-actions');
  nav.innerHTML = '';
  if (app.user) {
    nav.innerHTML = `<a href="#/dashboard" class="btn btn-ghost btn-sm">Dashboard</a>`;
  } else {
    nav.innerHTML = `<a href="#/login" class="btn btn-ghost btn-sm">Giriş Yap</a><a href="#/register" class="btn btn-primary btn-sm">Üye Ol</a>`;
  }

  const { user, error } = await api('GET', `/api/users/${username}`);
  if (error || !user) {
    $('profile-username').textContent    = 'Kullanıcı bulunamadı';
    $('profile-displayname').textContent = '';
    return;
  }

  $('profile-avatar').textContent      = (user.displayName || user.username)[0].toUpperCase();
  $('profile-username').textContent    = '@' + user.username;
  $('profile-displayname').textContent = user.displayName || user.username;
  $('profile-bio').textContent         = user.bio || '';

  // Show edit button if it's me
  const editWrap = $('profile-edit-btn-wrap');
  if (app.user && app.user.username === username) {
    editWrap.classList.remove('hidden');
    $('edit-displayname').value = user.displayName || '';
    $('edit-bio').value         = user.bio || '';
  } else {
    editWrap.classList.add('hidden');
  }

  // Public lists
  const { lists } = await api('GET', `/api/users/${username}/lists`);
  const container = $('profile-lists');
  const empty     = $('profile-empty');
  container.innerHTML = '';
  if (!lists || !lists.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  lists.forEach(list => {
    const card = document.createElement('a');
    card.className = 'list-card';
    card.href      = `#/list/${list.id}`;
    card.innerHTML = `
      <div class="list-card-icon">${(list.name||'?')[0].toUpperCase()}</div>
      <div class="list-card-info">
        <div class="list-card-name">${escHtml(list.name)}</div>
        <div class="list-card-meta"><span class="list-card-badge badge-public">◉ Herkese Açık</span></div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Edit profile modal
$('btn-edit-profile')?.addEventListener('click', () => { $('edit-profile-modal').classList.remove('hidden'); });
$('btn-edit-profile-close').addEventListener('click', () => $('edit-profile-modal').classList.add('hidden'));
$('edit-profile-modal').addEventListener('click', e => { if (e.target === $('edit-profile-modal')) $('edit-profile-modal').classList.add('hidden'); });

$('btn-save-profile').addEventListener('click', async () => {
  const errEl = $('edit-profile-error');
  errEl.classList.add('hidden');
  const { user, error } = await api('PATCH', '/api/auth/me', {
    displayName: $('edit-displayname').value.trim(),
    bio:         $('edit-bio').value.trim(),
  });
  if (error) { errEl.textContent = error; errEl.classList.remove('hidden'); return; }
  app.user = user;
  $('edit-profile-modal').classList.add('hidden');
  // Refresh profile view
  showProfile(user.username);
});

// ══════════════════════════════════════════════════════════════════════════════
// LIST VIEW  (kanban + tree + socket.io)
// ══════════════════════════════════════════════════════════════════════════════
async function showList(listId) {
  if (!listId) { navigate('#/'); return; }

  // Tear down old socket if any
  if (app.socket) { app.socket.disconnect(); app.socket = null; }

  // Reset state
  Object.assign(app, { tasks: {}, edges: [], view: 'kanban', permission: null, connectMode: false, connectSource: null, activeModalTaskId: null });

  // Get share token from URL if present
  const params    = new URLSearchParams(location.search);
  const shareToken = params.get('share');

  showPage('page-list');
  setupKanbanDrag();
  connectSocket(listId, shareToken);
}

function setPermissionUI(perm) {
  app.permission = perm;
  // Badge
  const badge = $('permission-badge');
  badge.className = `perm-badge perm-${perm === 'owner' ? 'owner' : perm === 'edit' ? 'edit-badge' : 'view-badge'}`;
  badge.textContent = perm === 'owner' ? '◈ Sahip' : perm === 'edit' ? '✎ Düzenleyebilir' : '👁 Yalnızca Görüntüle';

  // Show/hide edit UI
  if (perm === 'view') {
    document.body.classList.add('view-mode');
    // Disable inputs
    $('sidebar-list-name').contentEditable = 'false';
    $('modal-task-title').readOnly  = true;
    $('modal-task-desc').readOnly   = true;
  } else {
    document.body.classList.remove('view-mode');
    $('sidebar-list-name').contentEditable = perm === 'owner' || perm === 'edit' ? 'true' : 'false';
    $('modal-task-title').readOnly  = false;
    $('modal-task-desc').readOnly   = false;
  }

  // Share settings only for owner
  $('share-section').style.display = perm === 'owner' ? '' : 'none';
}

// ── Socket connection ─────────────────────────────────────────────────────
function connectSocket(listId, shareToken) {
  const socket = io({ path: '/socket.io', withCredentials: true });
  app.socket = socket;

  socket.on('connect', () => {
    app.mySocketId = socket.id;
    setConnBadge('connected');
    socket.emit('join_list', { listId, shareToken, userName: app.user?.displayName || app.user?.username });
  });
  socket.on('disconnect',    () => setConnBadge('disconnected'));
  socket.on('connect_error', () => setConnBadge('disconnected'));

  socket.on('error_event', msg => {
    alert(msg);
    navigate('#/dashboard');
  });

  socket.on('init', snap => {
    app.tasks  = {};
    snap.tasks.forEach(t => (app.tasks[t.id] = t));
    app.edges  = snap.edges.map(e => ({ id: e.id, sourceId: e.source_id, targetId: e.target_id }));
    app.list   = snap.list;
    $('sidebar-list-name').textContent = snap.list.name;
    $('kanban-view-title').textContent = snap.list.name;
    setPermissionUI(snap.permission);
    renderAll();
    if (app.permission === 'owner') loadShareLinks();
  });

  socket.on('list_renamed',  list => { $('sidebar-list-name').textContent = list.name; $('kanban-view-title').textContent = list.name; });
  socket.on('list_visibility_changed', ({ isPublic }) => { if (app.list) app.list.is_public = isPublic; $('share-public-toggle').checked = !!isPublic; });

  socket.on('task_added', task => {
    app.tasks[task.id] = task;
    const deps = app._pendingDeps; app._pendingDeps = null;
    if (deps?.length) deps.forEach(srcId => socket.emit('add_edge', { listId: app.list.id, sourceId: srcId, targetId: task.id }));
    renderAll();
    if (app.view === 'tree') autoLayout();
  });
  socket.on('task_status_updated', task => { app.tasks[task.id] = task; renderAll(); if (app.activeModalTaskId === task.id) refreshTaskModal(task.id); });
  socket.on('task_position_updated', task => { if (app.tasks[task.id]) { app.tasks[task.id].pos_x = task.pos_x; app.tasks[task.id].pos_y = task.pos_y; } nudgeNodePos(task.id, task.pos_x, task.pos_y); drawEdges(); });
  socket.on('task_title_updated', task => { app.tasks[task.id] = task; renderAll(); if (app.activeModalTaskId === task.id) refreshTaskModal(task.id); });
  socket.on('task_description_updated', task => { app.tasks[task.id] = task; if (app.activeModalTaskId === task.id) refreshTaskModal(task.id); });
  socket.on('task_deleted', ({ taskId }) => { delete app.tasks[taskId]; app.edges = app.edges.filter(e => e.sourceId !== taskId && e.targetId !== taskId); if (app.activeModalTaskId === taskId) closeTaskModal(); renderAll(); });
  socket.on('edge_added', edge => { if (!app.edges.find(e => e.id === edge.id)) app.edges.push({ id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId }); renderAll(); if (app.activeModalTaskId) refreshTaskModal(app.activeModalTaskId); });
  socket.on('edge_removed', ({ sourceId, targetId }) => { app.edges = app.edges.filter(e => !(e.sourceId === sourceId && e.targetId === targetId)); renderAll(); if (app.activeModalTaskId) refreshTaskModal(app.activeModalTaskId); });
  socket.on('users_update', renderUsers);
}

function setConnBadge(s) {
  const b = $('connection-badge');
  b.className = `conn-badge conn-${s}`;
  b.textContent = s === 'connected' ? 'Bağlı' : s === 'connecting' ? 'Bağlanıyor…' : 'Bağlantı kesildi';
}

// ── Lock logic ────────────────────────────────────────────────────────────
function computeLocked() {
  const locked = new Set();
  app.edges.forEach(({ sourceId, targetId }) => {
    if (app.tasks[sourceId]?.status !== 'done') locked.add(targetId);
  });
  return locked;
}

// ── Render all ────────────────────────────────────────────────────────────
function renderAll() { renderKanban(); if (app.view === 'tree') renderTree(); }

// ══════════════════════════════════════════════════════════════════════════════
// KANBAN
// ══════════════════════════════════════════════════════════════════════════════
function renderKanban() {
  const locked = computeLocked();
  const cols   = { open: $('cards-open'), in_progress: $('cards-in_progress'), done: $('cards-done') };
  const counts = { open: 0, in_progress: 0, done: 0 };
  Object.values(cols).forEach(c => (c.innerHTML = ''));

  Object.values(app.tasks).sort((a, b) => a.created_at - b.created_at).forEach(task => {
    const s = task.status || 'open';
    counts[s] = (counts[s] || 0) + 1;
    const isLocked = locked.has(task.id);
    const depCount = app.edges.filter(e => e.targetId === task.id).length;

    const card = document.createElement('div');
    card.className   = 'kanban-card' + (isLocked ? ' locked' : '');
    card.dataset.id  = task.id;
    card.dataset.status = s;
    card.draggable   = true;
    card.innerHTML   = `
      <div class="kanban-card-title">${escHtml(task.title)}</div>
      <div class="kanban-card-meta">
        ${depCount > 0 ? `<span class="dep-count">⇢ ${depCount}</span>` : ''}
        ${task.description ? '<span title="Açıklama var">✎</span>' : ''}
        ${isLocked ? '<span title="Bağımlılık bitmedi">🔒</span>' : ''}
      </div>`;
    card.addEventListener('click', () => openTaskModal(task.id));
    card.addEventListener('dragstart', e => { e.dataTransfer.setData('taskId', task.id); setTimeout(() => (card.style.opacity = '0.4'), 0); });
    card.addEventListener('dragend',   () => { card.style.opacity = ''; });
    (cols[s] || cols.open).appendChild(card);
  });
  Object.keys(counts).forEach(s => { const el = $('count-' + s); if (el) el.textContent = counts[s] || 0; });
}

function setupKanbanDrag() {
  document.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover',  e  => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', e => {
      e.preventDefault(); col.classList.remove('drag-over');
      if (app.permission === 'view') return;
      const taskId = e.dataTransfer.getData('taskId');
      const ns     = col.dataset.status;
      if (taskId && ns && app.tasks[taskId] && app.tasks[taskId].status !== ns)
        app.socket.emit('update_task_status', { listId: app.list.id, taskId, status: ns });
    });
  });
}

document.querySelectorAll('.btn-col-add').forEach(btn => {
  btn.addEventListener('click', () => { app.pendingAddStatus = btn.dataset.col || 'open'; openAddModal(null); });
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-LAYOUT
// ══════════════════════════════════════════════════════════════════════════════
function autoLayout() {
  const tasks = Object.values(app.tasks);
  if (!tasks.length) return;
  const NODE_GAP_X = 185, NODE_GAP_Y = 195, NODE_W = 152, PAD_Y = 60;
  const canvas_w = $('tree-canvas').clientWidth || 900;

  const childMap = {}, inDeg = {};
  tasks.forEach(t => { childMap[t.id] = []; inDeg[t.id] = 0; });
  app.edges.forEach(({ sourceId, targetId }) => {
    if (childMap[sourceId]) childMap[sourceId].push(targetId);
    if (inDeg[targetId] !== undefined) inDeg[targetId]++;
  });

  const level = {};
  const queue = tasks.filter(t => inDeg[t.id] === 0).map(t => t.id);
  queue.forEach(id => (level[id] = 0));
  const visited = new Set(queue);
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    (childMap[id] || []).forEach(cid => {
      level[cid] = Math.max(level[cid] || 0, (level[id] || 0) + 1);
      if (!visited.has(cid)) { visited.add(cid); queue.push(cid); }
    });
  }
  tasks.forEach(t => { if (level[t.id] === undefined) level[t.id] = 0; });

  const byLevel = {};
  tasks.forEach(t => { const l = level[t.id]; if (!byLevel[l]) byLevel[l] = []; byLevel[l].push(t.id); });

  Object.entries(byLevel).sort(([a], [b]) => +a - +b).forEach(([lvl, ids]) => {
    const rowW   = ids.length * NODE_W + (ids.length - 1) * (NODE_GAP_X - NODE_W);
    const startX = Math.max(20, (canvas_w - rowW) / 2);
    ids.forEach((id, i) => {
      const posX = startX + i * NODE_GAP_X, posY = PAD_Y + +lvl * NODE_GAP_Y;
      app.tasks[id] = { ...app.tasks[id], pos_x: posX, pos_y: posY };
      app.socket?.emit('update_task_position', { listId: app.list.id, taskId: id, posX, posY });
    });
  });
  renderTree();
}

$('btn-auto-layout').addEventListener('click', autoLayout);

// ══════════════════════════════════════════════════════════════════════════════
// TREE
// ══════════════════════════════════════════════════════════════════════════════
const nodesContainer = $('nodes-container');
const edgesSvg       = $('edges-svg');
const treeCanvas     = $('tree-canvas');

function renderTree() {
  const locked = computeLocked();
  nodesContainer.querySelectorAll('.tree-node').forEach(n => { if (!app.tasks[n.dataset.id]) n.remove(); });
  Object.values(app.tasks).forEach(task => {
    const isLocked = locked.has(task.id);
    let node = nodesContainer.querySelector(`.tree-node[data-id="${task.id}"]`);
    if (!node) { node = createTreeNode(task); nodesContainer.appendChild(node); }
    if (!app.dragState || app.dragState !== task.id) { node.style.left = task.pos_x + 'px'; node.style.top = task.pos_y + 'px'; }
    node.className = ['tree-node', `status-${task.status||'open'}`, isLocked?'locked':'', app.connectSource===task.id?'connect-source':''].filter(Boolean).join(' ');
    node.querySelector('.node-avatar').textContent = (task.title||'?')[0].toUpperCase();
    node.querySelector('.node-title').textContent  = task.title;
    node.querySelectorAll('.nsb').forEach(b => b.classList.toggle('active', b.dataset.s === (task.status||'open')));
  });
  drawEdges();
}

function createTreeNode(task) {
  const node = document.createElement('div');
  node.dataset.id = task.id;
  node.style.cssText = `left:${task.pos_x}px;top:${task.pos_y}px`;
  const canEdit = () => app.permission !== 'view';
  node.innerHTML = `
    <div class="node-avatar">${(task.title||'?')[0].toUpperCase()}</div>
    <div class="node-title">${escHtml(task.title)}</div>
    <div class="node-status-row">
      <button class="nsb" data-s="open">Yapılacak</button>
      <button class="nsb" data-s="in_progress">Yapılıyor</button>
      <button class="nsb" data-s="done">✓ Bitti</button>
    </div>
    <div class="node-actions">
      <button class="node-btn node-open-btn">↗ Detay</button>
      <button class="node-btn node-connect-btn">⇢</button>
    </div>`;
  node.addEventListener('mousedown', onNodeMouseDown);
  node.querySelectorAll('.nsb').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); if (!canEdit()) return; app.socket.emit('update_task_status', { listId: app.list.id, taskId: task.id, status: btn.dataset.s }); });
  });
  node.querySelector('.node-open-btn').addEventListener('click', e => { e.stopPropagation(); openTaskModal(task.id); });
  node.querySelector('.node-connect-btn').addEventListener('click', e => { e.stopPropagation(); if (!canEdit()) return; handleConnectClick(task.id); });
  node.addEventListener('click', () => {
    if (app.connectMode && app.connectSource && app.connectSource !== task.id) {
      app.socket.emit('add_edge', { listId: app.list.id, sourceId: app.connectSource, targetId: task.id });
      exitConnectMode();
    }
  });
  return node;
}

function onNodeMouseDown(e) {
  if (e.target.closest('button')) return;
  const node = e.currentTarget, taskId = node.dataset.id;
  const sx = e.clientX - node.offsetLeft, sy = e.clientY - node.offsetTop;
  app.dragState = taskId; node.style.cursor = 'grabbing';
  const onMove = ev => { node.style.left = (ev.clientX-sx)+'px'; node.style.top = (ev.clientY-sy)+'px'; drawEdges(); };
  const onUp   = ev => {
    const x = ev.clientX-sx, y = ev.clientY-sy;
    app.tasks[taskId] = { ...app.tasks[taskId], pos_x: x, pos_y: y };
    if (app.permission !== 'view') app.socket.emit('update_task_position', { listId: app.list.id, taskId, posX: x, posY: y });
    app.dragState = null; node.style.cursor = '';
    document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
}

function nudgeNodePos(id, x, y) {
  const n = nodesContainer.querySelector(`.tree-node[data-id="${id}"]`);
  if (n && app.dragState !== id) { n.style.left = x+'px'; n.style.top = y+'px'; }
}

function drawEdges() {
  edgesSvg.querySelectorAll('.edge-line').forEach(l => l.remove());
  const locked = computeLocked();
  const rect   = treeCanvas.getBoundingClientRect();
  app.edges.forEach(({ sourceId, targetId }) => {
    const sN = nodesContainer.querySelector(`.tree-node[data-id="${sourceId}"]`);
    const tN = nodesContainer.querySelector(`.tree-node[data-id="${targetId}"]`);
    if (!sN || !tN) return;
    const sR = sN.getBoundingClientRect(), tR = tN.getBoundingClientRect();
    const ox = rect.left, oy = rect.top;
    const x1 = sR.left-ox+sR.width/2, y1 = sR.bottom-oy;
    const x2 = tR.left-ox+tR.width/2, y2 = tR.top-oy;
    const ctrl = Math.max(55, Math.abs(y2-y1)*.42);
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',`M${x1},${y1} C${x1},${y1+ctrl} ${x2},${y2-ctrl} ${x2},${y2}`);
    const srcDone = app.tasks[sourceId]?.status==='done', isLocked = locked.has(targetId);
    path.setAttribute('class', isLocked ? 'edge-line locked-edge' : srcDone ? 'edge-line done-edge' : 'edge-line');
    edgesSvg.appendChild(path);
  });
}

function handleConnectClick(id) {
  if (!app.connectMode) { app.connectMode=true; app.connectSource=id; renderTree(); $('tree-connect-hint').textContent=`"${app.tasks[id]?.title}" → hedef düğüme tıkla`; $('btn-cancel-connect').classList.remove('hidden'); }
  else if (app.connectSource===id) exitConnectMode();
}
function exitConnectMode() {
  app.connectMode=false; app.connectSource=null;
  $('btn-cancel-connect').classList.add('hidden');
  $('tree-connect-hint').textContent='Bağlantı için ⇢ tıkla, ardından hedef düğüme tıkla.';
  nodesContainer.querySelectorAll('.connect-source').forEach(n=>n.classList.remove('connect-source'));
}
$('btn-cancel-connect').addEventListener('click', exitConnectMode);

// View toggle
$('view-toggle').querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.view; app.view = v;
    $('view-toggle').querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view===v));
    $('kanban-view').classList.toggle('hidden', v!=='kanban');
    $('tree-view').classList.toggle('hidden',   v!=='tree');
    if (v==='tree') { renderTree(); autoLayout(); } else renderKanban();
  });
});

// Sidebar list name
let nameDebounce;
$('sidebar-list-name').addEventListener('input', () => {
  clearTimeout(nameDebounce);
  nameDebounce = setTimeout(() => { if (app.permission==='view') return; app.socket?.emit('rename_list', { listId: app.list?.id, name: $('sidebar-list-name').textContent.trim()||'Liste' }); }, 700);
});

// Users
function renderUsers(users) {
  const ul = $('users-list'); ul.innerHTML = '';
  Object.entries(users).forEach(([sid, info]) => {
    const chip = document.createElement('div'); chip.className = 'user-chip';
    const isMe = sid === app.mySocketId;
    chip.innerHTML = `<span class="user-dot ${isMe?'me':''}"></span>${escHtml(info.name||'Misafir')}${isMe?' <span style="color:var(--txt-3);font-size:10px">(sen)</span>':''}`;
    ul.appendChild(chip);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TASK DETAIL MODAL
// ══════════════════════════════════════════════════════════════════════════════
function openTaskModal(id) { app.activeModalTaskId=id; refreshTaskModal(id); $('task-modal').classList.remove('hidden'); }
function refreshTaskModal(id) {
  const task = app.tasks[id]; if (!task) return;
  $('modal-task-title').value = task.title;
  $('modal-task-desc').value  = task.description||'';
  const labels = { open:'Yapılacak', in_progress:'Yapılıyor', done:'Tamamlandı' };
  $('modal-status-badge').textContent = labels[task.status]||'Yapılacak';
  $('modal-status-badge').className   = `status-badge status-${task.status||'open'}`;
  document.querySelectorAll('.status-cycle-btn').forEach(b => b.classList.toggle('active', b.dataset.status===(task.status||'open')));
  const deps = app.edges.filter(e => e.targetId===id);
  $('modal-deps-list').innerHTML = '';
  if (!deps.length) { $('modal-deps-list').innerHTML='<span style="font-size:12px;color:var(--txt-3)">Bağımlılık yok</span>'; }
  else deps.forEach(dep => {
    const src = app.tasks[dep.sourceId]; if (!src) return;
    const chip = document.createElement('div'); chip.className='dep-chip';
    chip.innerHTML = `${escHtml(src.title)}<button class="dep-chip-remove" data-src="${dep.sourceId}" data-tgt="${id}">×</button>`;
    chip.querySelector('.dep-chip-remove').addEventListener('click', () => { if (app.permission==='view') return; app.socket.emit('remove_edge',{listId:app.list.id,sourceId:dep.sourceId,targetId:id}); });
    $('modal-deps-list').appendChild(chip);
  });
}
function closeTaskModal() { $('task-modal').classList.add('hidden'); app.activeModalTaskId=null; }
$('btn-modal-close').addEventListener('click', closeTaskModal);
$('task-modal').addEventListener('click', e => { if (e.target===$('task-modal')) closeTaskModal(); });

let titleDebounce, descDebounce;
$('modal-task-title').addEventListener('input', () => { clearTimeout(titleDebounce); titleDebounce=setTimeout(()=>{ if (!app.activeModalTaskId||app.permission==='view') return; app.socket.emit('update_task_title',{listId:app.list.id,taskId:app.activeModalTaskId,title:$('modal-task-title').value.trim()||'Görev'}); },600); });
$('modal-task-desc').addEventListener('input',  () => { clearTimeout(descDebounce);  descDebounce =setTimeout(()=>{ if (!app.activeModalTaskId||app.permission==='view') return; app.socket.emit('update_task_description',{listId:app.list.id,taskId:app.activeModalTaskId,description:$('modal-task-desc').value}); },800); });
document.querySelectorAll('.status-cycle-btn').forEach(btn => btn.addEventListener('click',()=>{ if (!app.activeModalTaskId||app.permission==='view') return; app.socket.emit('update_task_status',{listId:app.list.id,taskId:app.activeModalTaskId,status:btn.dataset.status}); }));
$('btn-modal-delete').addEventListener('click', ()=>{ if (!app.activeModalTaskId||!confirm('Sil?')) return; app.socket.emit('delete_task',{listId:app.list.id,taskId:app.activeModalTaskId}); closeTaskModal(); });

// ══════════════════════════════════════════════════════════════════════════════
// ADD TASK MODAL
// ══════════════════════════════════════════════════════════════════════════════
function openAddModal(treePos) {
  app.pendingAddTreePos = treePos;
  $('new-task-title').value = ''; $('new-task-desc').value = '';
  const tasks = Object.values(app.tasks);
  if (tasks.length) {
    $('dep-picker-section').classList.remove('hidden');
    $('dep-picker-list').innerHTML = '';
    tasks.sort((a,b)=>a.created_at-b.created_at).forEach(t => {
      const item = document.createElement('label'); item.className='dep-picker-item';
      item.innerHTML=`<input type="checkbox" value="${t.id}"/><span class="dep-picker-item-label">${escHtml(t.title)}</span>`;
      $('dep-picker-list').appendChild(item);
    });
  } else $('dep-picker-section').classList.add('hidden');
  $('add-task-modal').classList.remove('hidden');
  setTimeout(()=>$('new-task-title').focus(),50);
}
function closeAddModal() { $('add-task-modal').classList.add('hidden'); app.pendingAddTreePos=null; }
function smartPos() { const tasks=Object.values(app.tasks); if (!tasks.length) return {x:80,y:80}; const l=tasks[tasks.length-1]; return {x:l.pos_x+20,y:l.pos_y+175}; }
function doCreateTask() {
  const title = $('new-task-title').value.trim(); if (!title) { $('new-task-title').focus(); return; }
  const pos = app.pendingAddTreePos||smartPos();
  app._pendingDeps = [...$('dep-picker-list').querySelectorAll('input:checked')].map(c=>c.value);
  app.socket.emit('add_task',{listId:app.list.id,title,description:$('new-task-desc').value.trim(),posX:pos.x,posY:pos.y,status:app.pendingAddStatus||'open'});
  closeAddModal();
}
$('btn-add-task-kanban').addEventListener('click', ()=>{ app.pendingAddStatus='open'; openAddModal(null); });
$('btn-add-task-tree').addEventListener('click',   ()=>{ const r=$('tree-canvas').getBoundingClientRect(); openAddModal({x:r.width/2-76+(Math.random()*60-30),y:r.height/2-80+(Math.random()*60-30)}); });
$('btn-add-modal-close').addEventListener('click', closeAddModal);
$('add-task-modal').addEventListener('click', e=>{ if (e.target===$('add-task-modal')) closeAddModal(); });
$('btn-create-task').addEventListener('click', doCreateTask);
$('new-task-title').addEventListener('keydown', e=>{ if (e.key==='Enter') doCreateTask(); });

// ══════════════════════════════════════════════════════════════════════════════
// SHARE SETTINGS (owner only)
// ══════════════════════════════════════════════════════════════════════════════
async function loadShareLinks() {
  if (!app.list) return;
  const { shares } = await api('GET', `/api/lists/${app.list.id}/shares`);
  renderShareLinks(shares||[]);
  $('share-public-toggle').checked = !!app.list.is_public;
}

function renderShareLinks(shares) {
  const container = $('share-links-modal-list'); if (!container) return;
  container.innerHTML = '';
  if (!shares.length) { container.innerHTML='<div style="font-size:12px;color:var(--txt-3);padding:8px 0">Henüz paylaşım bağlantısı yok.</div>'; return; }
  shares.forEach(s => {
    const url  = `${location.origin}/?list=${app.list.id}&share=${s.token}`;
    const item = document.createElement('div'); item.className='share-link-item';
    item.innerHTML = `
      <span class="share-perm-tag ${s.permission==='edit'?'perm-edit':'perm-view'}">${s.permission==='edit'?'Düzenle':'Görüntüle'}</span>
      <span class="share-link-url">${url}</span>
      <button class="share-link-copy-btn" data-url="${url}">Kopyala</button>
      <button class="share-link-del-btn" data-id="${s.id}" title="Sil">×</button>`;
    item.querySelector('.share-link-copy-btn').addEventListener('click', e => { navigator.clipboard.writeText(e.target.dataset.url); e.target.textContent='✓'; setTimeout(()=>e.target.textContent='Kopyala',1500); });
    item.querySelector('.share-link-del-btn').addEventListener('click', async e => { await api('DELETE',`/api/shares/${e.target.dataset.id}`); loadShareLinks(); });
    container.appendChild(item);
  });
}

$('btn-share-settings').addEventListener('click', async () => {
  $('share-modal').classList.remove('hidden');
  await loadShareLinks();
});
$('btn-share-modal-close').addEventListener('click', ()=>$('share-modal').classList.add('hidden'));
$('share-modal').addEventListener('click', e=>{ if (e.target===$('share-modal')) $('share-modal').classList.add('hidden'); });

$('share-public-toggle').addEventListener('change', () => {
  if (!app.list) return;
  app.socket?.emit('set_list_public',{listId:app.list.id,isPublic:$('share-public-toggle').checked});
});

$('btn-create-share').addEventListener('click', async () => {
  const perm = $('share-perm-select').value;
  await api('POST',`/api/lists/${app.list.id}/shares`,{permission:perm});
  await loadShareLinks();
});

// ══════════════════════════════════════════════════════════════════════════════
// KEYBOARD
// ══════════════════════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key==='Escape') { closeTaskModal(); closeAddModal(); exitConnectMode(); $('share-modal').classList.add('hidden'); $('new-list-modal').classList.add('hidden'); $('edit-profile-modal').classList.add('hidden'); }
});

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════
// If URL has ?list= param, redirect to hash route
(function handleDirectLink() {
  const params = new URLSearchParams(location.search);
  const listId = params.get('list');
  if (listId) {
    // Keep share token in search params, navigate to list hash
    navigate(`#/list/${listId}`);
  }
})();

boot();
