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

### 4 Themes
- Light, Dark, Midnight, Gold (via CSS custom properties + class on `<html>`)

### Admin Dashboard
- User management (activate/suspend)
- Pending deposits approval/rejection
- Platform statistics

## Admin Account
- Email: admin@ecrossflow.com
- Password: Admin@123456
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

### Transactions, Referrals, Notifications, Admin
Standard CRUD endpoints as per OpenAPI spec.

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (Replit managed)
- `JWT_SECRET` — JWT signing secret (defaults to dev key)
- `PORT` — Server port (Replit managed)

## Seeding
Run `pnpm --filter @workspace/scripts run seed` to create boards and admin user.
