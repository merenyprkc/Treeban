# ◈ Treeban

> Focus. Connect. Complete.

**Treeban** is a minimalist task manager that allows you to create **dependencies** between tasks and offers **real-time collaboration**.

🚀 **Live App:** [https://treeban.vercel.app](https://treeban.vercel.app)

## Features

- 📋 **Kanban Board** — To Do / In Progress / Done columns
- 🌳 **Tree View** — Dependency tree; a task remains locked until its prerequisite is completed
- 👤 **User Accounts** — Registration, login, public profile page
- 🔗 **Share Links** — List sharing with "view only" or "can edit" permissions
- ⚡ **Real-Time** — Instant synchronization with Socket.io

## Technology Stack

| Layer | Technology |
|--------|-----------|
| Frontend | Vite + Vanilla JS + CSS |
| Backend | Node.js + Express + Socket.io |
| Database | PostgreSQL (Neon) |
| Auth | JWT (HTTP-only cookie) + bcryptjs |

## Security

- Passwords are hashed with `bcryptjs` (salt rounds: 10)
- JWTs are stored as HTTP-only cookies (protection against XSS)
- All confidential information is stored in the `.env` file — **never committed to Git**
- Socket.io events pass through server-side permission checks

## License

Proprietary / All Rights Reserved
