# E2E Site Audit (Playwright)

Ce script permet de tester visuellement la plateforme en mode automatisé:

- navigation pages publiques + privées
- login admin
- captures desktop + mobile
- collecte erreurs console/network/js
- rapport JSON exploitable

## Lancer

```bash
npx playwright install chromium
pnpm --filter @workspace/scripts run e2e:site-audit
```

## Variables utiles

- `E2E_BASE_URL` (défaut: `https://ecrossflow.com`)
- `E2E_ADMIN_LOGIN` (défaut: `ADMIN_SEED_EMAIL` de `.env`)
- `E2E_ADMIN_PASSWORD` (défaut: `ADMIN_SEED_PASSWORD` de `.env`)
- `E2E_LOCALES` (défaut: `fr`, ex: `fr,en,es`)
- `E2E_PUBLIC_ROUTES` (templates avec `{locale}`)
- `E2E_PRIVATE_ROUTES` (templates avec `{locale}`)
- `E2E_HEADLESS` (`true`/`false`)

## Sortie

Le script génère un dossier horodaté:

- `artifacts/e2e-output/<timestamp>/screens/*.png`
- `artifacts/e2e-output/<timestamp>/report.json`
- `artifacts/e2e-output/<timestamp>/summary.json`
