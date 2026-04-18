# ◈ Treeban

> Odaklan. Bağlantı kur. Tamamla.

Treeban; görevler arası **bağımlılık** (dependency) kurabileceğin, **gerçek zamanlı işbirliği** sunan, minimalist bir görev yöneticisidir.

## Özellikler

- 📋 **Kanban Panosu** — Yapılacak / Yapılıyor / Tamamlandı sütunları
- 🌳 **Treeban** — EU4 tarzı bağımlılık ağacı; önceki görev bitmeden sonraki kilitli kalır
- 👤 **Kullanıcı Hesapları** — Kayıt, giriş, herkese açık profil sayfası
- 🔗 **Paylaşım Linkleri** — "Sadece görüntüle" veya "düzenleyebilir" izniyle liste paylaşımı
- ⚡ **Gerçek Zamanlı** — Socket.io ile anında senkronizasyon

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Vite + Vanilla JS + CSS |
| Backend | Node.js + Express + Socket.io |
| Veritabanı | PostgreSQL (Neon) |
| Auth | JWT (HTTP-only cookie) + bcryptjs |

## Kurulum

### Gereksinimler
- Node.js 18+
- [Neon](https://neon.tech) hesabı (ücretsiz PostgreSQL)

### Backend

```bash
cd backend
cp .env.example .env   # .env dosyasını düzenle
npm install
node server.js
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Deployment

| Servis | Platform |
|--------|----------|
| Frontend | [Vercel](https://vercel.com) |
| Backend | [Railway](https://railway.app) |
| Veritabanı | [Neon](https://neon.tech) |

Detaylar için `backend/.env.example` dosyasına bak.

## Güvenlik

- Şifreler `bcryptjs` ile hash'lenir (salt rounds: 10)
- JWT'ler HTTP-only cookie olarak saklanır (XSS'e karşı)
- Tüm gizli bilgiler `.env` dosyasında tutulur — **asla Git'e commit edilmez**
- Socket.io olayları sunucu tarafında izin kontrolünden geçer

## Lisans

MIT
