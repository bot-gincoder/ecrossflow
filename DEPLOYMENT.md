# Docker Deployment (Portable Stack)

This project is fully containerized with:
- `db` (PostgreSQL 16)
- `db-init` (Drizzle schema push + seed admin/boards)
- `api` (Express API)
- `web` (Vite build served by Nginx)
- `caddy` (reverse proxy + HTTPS for your domain)

## 1) Prepare environment variables

```bash
cp .env.example .env
```

Edit `.env` and set strong values for:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ADMIN_SEED_PASSWORD`
- `DOMAIN` (production domain)
- `ACME_EMAIL` (Let's Encrypt notifications)

## 2) DNS requirements for domain

Point DNS to the server public IP:
- `A ecrossflow.com -> <SERVER_PUBLIC_IP>`
- `A www.ecrossflow.com -> <SERVER_PUBLIC_IP>` (optional)

Without correct DNS, HTTPS certificate issuance will fail.

## 3) Start stack

```bash
docker compose up -d --build
```

## 4) Verify services

```bash
docker compose ps
docker compose logs -f db-init api caddy
```

Health check from server:

```bash
curl -I http://127.0.0.1
curl -s http://127.0.0.1/api/healthz
```

## 5) Stop / update

```bash
docker compose down
docker compose pull
docker compose up -d --build
```

## Notes

- Data is persisted in Docker volumes (`ecrossflow_db_data`, `ecrossflow_caddy_*`).
- `db-init` runs once at startup and exits successfully when schema/seed are applied.
- Frontend calls API on same origin via `/api`, so no external API URL is required.
