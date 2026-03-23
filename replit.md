# Ecrossflow — Pyramid Donation Platform

## Overview
Ecrossflow is a pyramid-based community donation platform ("plateforme numérique de don & bourse virtuelle") built as a full-stack monorepo.

## Architecture

### Monorepo Structure (pnpm workspaces)
- `artifacts/ecrossflow` — React+Vite frontend (previewPath `/`)
- `artifacts/api-server` — Express.js REST API (port 8080)
- `lib/db` — Drizzle ORM + PostgreSQL schema
- `lib/api-client-react` — Auto-generated React Query hooks (Orval)
- `lib/api-spec` — OpenAPI 3.0 specification
- `scripts` — Database seed scripts

### Tech Stack
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v4, Framer Motion, Zustand, Wouter
- **Backend**: Express.js, JWT auth (jsonwebtoken), bcryptjs, Drizzle ORM
- **Database**: PostgreSQL (via Replit database)
- **Auth**: JWT Bearer tokens in localStorage (`ecrossflow_token`)

## Platform Features

### 7 Progressive Pyramid Boards (F → S)
| Board | Entry Fee | Total Gain | Retirable |
|-------|-----------|------------|-----------|
| F     | $2        | $16        | $6        |
| E     | $8        | $64        | $24       |
| D     | $32       | $256       | $96       |
| C     | $128      | $1024      | $384      |
| B     | $512      | $4096      | $1536     |
| A     | $2048     | $16384     | $6143     |
| S     | $8192     | $65536     | $50000    |

8 slots per board, 8x multiplier structure.

### Multi-currency Wallet
- Supported: USD, HTG (fixed $1=140 HTG), EUR, GBP, CAD, BTC, ETH, USDT
- Payment methods: MonCash, NatCash, Bank Transfer, Crypto, PayPal

### Referral System
- Mandatory referral code at registration
- Format: ECF + 6 alphanumeric chars (e.g., ECFADMIN0)
- Admin seed code: `ECFADMIN0`

### Multi-language Support
- French (fr), English (en), Spanish (es), Haitian Creole (ht)
- Full i18n dictionary in `use-store.ts` covering: nav, wallet, dashboard, boards, auth, verify, onboarding, history, referrals, notifications, profile, common

### Fonts
- Display font: Clash Display (via Fontshare CDN)
- Body font: DM Sans (Google Fonts)
- Mono font: JetBrains Mono

### Auth Flow
1. Register with referral code → POST /api/auth/register
2. OTP sent automatically → redirect to /auth/verify-email?email=...
3. Enter 6-digit OTP → POST /api/auth/verify-email (account activated)
4. 4-step onboarding wizard → /onboarding (language → theme → profile → referral code)
5. Dashboard → /dashboard

### 4 Themes
- Light, Dark, Midnight, Gold (via CSS custom properties + class on `<html>`)

### Admin Dashboard (/admin)
- **Overview tab**: Real-time KPIs (users, active boards, pending deposits/withdrawals, platform revenue)
- **Users tab**: Searchable/filterable user list with activate/suspend/adjust-balance actions
- **Deposits tab**: Pending Moncash/Natcash deposits with screenshot preview, approve/reject with notification
- **Withdrawals tab**: Pending withdrawal requests with approve/reject (auto-refund on rejection)
- **Boards tab**: All board instances with status, slots filled, total collected, ranker username
- **Reports tab**: Platform revenue, deposits/withdrawals totals, user growth chart, board revenue breakdown with CSV export
- Alerts shown when pending deposits > 24h or withdrawals pending

### Notifications System (/notifications)
- Real-time bell icon badge showing unread count (polls every 30s)
- Notification centre: chronological list with filter tabs (Toutes/Non lues/Finance/Sécurité)
- Auto-notifications created for: deposit approved/rejected, withdrawal approved/rejected, account activated/suspended, balance adjusted
- Mark-as-read on click, mark-all-read button

## Admin Account
- Email: admin@ecrossflow.com
- Password: Admin123! (test password set for development)
- Referral Code: ECFADMIN0

## Database Schema
Tables: users, wallets, boards, board_instances, board_participants, transactions, referrals, bonuses, notifications

### Key Notes
- `requireAuth` and `requireAdmin` cast to `any` in router.use() (Express 5 type compatibility)
- JWT stored as `ecrossflow_token` in localStorage
- API base URL set in App.tsx via `setBaseUrl(window.location.origin)`

## API Routes
All routes prefixed with `/api`

### Auth
- POST `/api/auth/register` — Register (requires referralCode)
- POST `/api/auth/login` — Login
- POST `/api/auth/logout` — Logout
- GET `/api/auth/verify-referral?code=` — Validate referral code
- GET `/api/auth/check-username?username=` — Check username availability
- POST `/api/auth/send-otp` — Send email OTP (after registration, logged to console)
- POST `/api/auth/resend-otp` — Resend OTP code
- POST `/api/auth/verify-email` — Verify OTP code, activates user account

### Users
- GET `/api/users/me` — Get profile
- PUT `/api/users/me` — Update profile
- PUT `/api/users/me/settings` — Update theme/language preferences

### Boards
- GET `/api/boards` — List all boards
- GET `/api/boards/my-status` — User's board participation status
- GET `/api/boards/:boardId/instance` — Get active board instance
- POST `/api/boards/:boardId/pay` — Pay board entry fee

### Wallet
- GET `/api/wallet` — Get balance
- GET `/api/wallet/rates` — Exchange rates
- POST `/api/wallet/deposit` — Create deposit
- POST `/api/wallet/withdraw` — Create withdrawal
- POST `/api/wallet/convert` — Convert currency

### Notifications
- GET `/api/notifications` — List (filter: all/unread/financial/security, page)
- GET `/api/notifications/unread-count` — Unread badge count
- PUT `/api/notifications/:id/read` — Mark one as read
- PUT `/api/notifications/read-all` — Mark all as read

### Admin (all require ADMIN role)
- GET `/api/admin/stats` — Platform KPIs
- GET `/api/admin/users` — User list (search, status filter, pagination)
- PUT `/api/admin/users/:id/activate` — Activate user + notification
- PUT `/api/admin/users/:id/suspend` — Suspend user + notification
- POST `/api/admin/users/:id/adjust-balance` — Adjust wallet balance + notification
- GET `/api/admin/deposits/pending` — Pending Moncash/Natcash deposits
- PUT `/api/admin/deposits/:id/approve` — Approve deposit + credit wallet + notification
- PUT `/api/admin/deposits/:id/reject` — Reject deposit + notification
- GET `/api/admin/withdrawals/pending` — Pending withdrawals
- PUT `/api/admin/withdrawals/:id/approve` — Approve withdrawal + notification
- PUT `/api/admin/withdrawals/:id/reject` — Reject withdrawal + refund wallet + notification
- GET `/api/admin/boards` — All board instances (with ranker info)
- GET `/api/admin/reports` — Aggregated reports (period: 7d/30d/90d/all), includes board revenue breakdown + user growth

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (Replit managed)
- `JWT_SECRET` — JWT signing secret (defaults to dev key)
- `PORT` — Server port (Replit managed)

## Seeding
Run `pnpm --filter @workspace/scripts run seed` to create boards and admin user.
