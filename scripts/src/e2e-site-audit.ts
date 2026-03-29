import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, type BrowserContext, type Page } from "playwright";

type Collector = {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  responseErrors: string[];
};

type RouteReport = {
  route: string;
  url: string;
  status: number | null;
  title: string;
  loadMs: number;
  screenshot: string;
  collector: Collector;
  alertSnippets: string[];
  fatalError: string | null;
};

type DeviceReport = {
  device: "desktop" | "mobile";
  locale: string;
  loginOk: boolean;
  loginError: string | null;
  publicRoutes: RouteReport[];
  privateRoutes: RouteReport[];
};

function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    let v = trimmed.slice(idx + 1).trim();
    if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function envValue(key: string, fallback: string, envFile: Record<string, string>): string {
  return (process.env[key] || envFile[key] || fallback).trim();
}

function toList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function sanitizeSlug(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "route";
}

function expandTemplates(templates: string[], locale: string): string[] {
  return templates.map((tpl) => tpl.replaceAll("{locale}", locale));
}

async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

async function fillFirstVisible(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count() === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    await locator.fill(value);
    return true;
  }
  return false;
}

function setupCollectors(page: Page): { setCurrent: (collector: Collector | null) => void } {
  let current: Collector | null = null;
  page.on("console", (msg) => {
    if (!current) return;
    if (msg.type() === "error") current.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    if (!current) return;
    current.pageErrors.push(err.message);
  });
  page.on("requestfailed", (req) => {
    if (!current) return;
    const reason = req.failure()?.errorText || "FAILED";
    if (reason.includes("ERR_ABORTED")) return;
    current.requestFailures.push(`${req.method()} ${req.url()} -> ${reason}`);
  });
  page.on("response", (resp) => {
    if (!current) return;
    const status = resp.status();
    if (status >= 400) current.responseErrors.push(`${status} ${resp.url()}`);
  });
  return {
    setCurrent(collector: Collector | null) {
      current = collector;
    },
  };
}

async function login(page: Page, baseUrl: string, locale: string, loginValue: string, password: string): Promise<void> {
  const loginUrl = new URL(`/${locale}/auth/login`, baseUrl).toString();
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(350);

  const idOk = await fillFirstVisible(page, [
    "input[name='emailOrUsername']",
    "input[placeholder*='Email']",
    "input[placeholder*='utilisateur']",
    "input[type='email']",
    "input[type='text']",
  ], loginValue);
  if (!idOk) throw new Error("Champ identifiant introuvable");

  const passOk = await fillFirstVisible(page, [
    "input[name='password']",
    "input[placeholder*='Mot de passe']",
    "input[placeholder*='Password']",
    "input[type='password']",
  ], password);
  if (!passOk) throw new Error("Champ mot de passe introuvable");

  const submitCandidates = [
    "button[type='submit']",
    "button:has-text('Se connecter')",
    "button:has-text('Login')",
    "button:has-text('Sign in')",
  ];
  let clicked = false;
  for (const selector of submitCandidates) {
    const btn = page.locator(selector).first();
    if (await btn.count() === 0) continue;
    if (!(await btn.isVisible().catch(() => false))) continue;
    await btn.click();
    clicked = true;
    break;
  }
  if (!clicked) throw new Error("Bouton de connexion introuvable");

  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 60000 });
}

async function auditRoute(
  page: Page,
  collectorSetter: { setCurrent: (collector: Collector | null) => void },
  baseUrl: string,
  route: string,
  screenshotDir: string,
  prefix: string,
): Promise<RouteReport> {
  const collector: Collector = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    responseErrors: [],
  };
  collectorSetter.setCurrent(collector);
  const started = Date.now();
  let status: number | null = null;
  let fatalError: string | null = null;
  const url = new URL(route, baseUrl).toString();
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    status = resp?.status() ?? null;
  } catch (error) {
    fatalError = error instanceof Error ? error.message : String(error);
  }

  await page.waitForTimeout(900);
  const title = await page.title().catch(() => "");
  const alertSnippets = await page.evaluate(() => {
    const selectors = [
      "[role='alert']",
      "[data-error]",
      ".text-destructive",
      ".alert",
      ".error",
    ];
    const values: string[] = [];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 8);
      for (const node of nodes) {
        const text = (node.textContent || "").trim();
        if (text) values.push(text.slice(0, 220));
      }
    }
    return Array.from(new Set(values));
  }).catch(() => []);

  const shotName = `${prefix}_${sanitizeSlug(route)}.png`;
  const shotPath = path.join(screenshotDir, shotName);
  await page.screenshot({ path: shotPath, fullPage: true }).catch(() => undefined);
  collectorSetter.setCurrent(null);

  return {
    route,
    url,
    status,
    title,
    loadMs: Date.now() - started,
    screenshot: shotPath,
    collector,
    alertSnippets,
    fatalError,
  };
}

async function runDeviceAudit(
  context: BrowserContext,
  baseUrl: string,
  locale: string,
  loginValue: string,
  password: string,
  publicRoutes: string[],
  privateRoutes: string[],
  screenshotDir: string,
  device: "desktop" | "mobile",
): Promise<DeviceReport> {
  const page = await context.newPage();
  const collector = setupCollectors(page);

  const report: DeviceReport = {
    device,
    locale,
    loginOk: false,
    loginError: null,
    publicRoutes: [],
    privateRoutes: [],
  };

  for (const route of publicRoutes) {
    report.publicRoutes.push(await auditRoute(page, collector, baseUrl, route, screenshotDir, `${device}_${locale}_public`));
  }

  try {
    await login(page, baseUrl, locale, loginValue, password);
    report.loginOk = true;
  } catch (error) {
    report.loginError = error instanceof Error ? error.message : String(error);
  }

  if (report.loginOk) {
    for (const route of privateRoutes) {
      report.privateRoutes.push(await auditRoute(page, collector, baseUrl, route, screenshotDir, `${device}_${locale}_private`));
    }
  }

  await page.close();
  return report;
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "../..");
  const envPath = path.join(repoRoot, ".env");
  const envFile = fs.existsSync(envPath) ? parseDotEnv(await fsp.readFile(envPath, "utf8")) : {};

  const baseUrl = envValue("E2E_BASE_URL", "https://ecrossflow.com", envFile);
  const loginValue = envValue("E2E_ADMIN_LOGIN", envValue("ADMIN_SEED_EMAIL", "admin@ecrossflow.com", envFile), envFile);
  const password = envValue("E2E_ADMIN_PASSWORD", envValue("ADMIN_SEED_PASSWORD", "", envFile), envFile);
  if (!password) throw new Error("E2E_ADMIN_PASSWORD (or ADMIN_SEED_PASSWORD in .env) is required");

  const locales = toList(envValue("E2E_LOCALES", "fr", envFile));
  const publicTemplates = toList(envValue("E2E_PUBLIC_ROUTES", "/{locale},/{locale}/auth/login,/{locale}/auth/register", envFile));
  const privateTemplates = toList(envValue("E2E_PRIVATE_ROUTES", "/{locale}/dashboard,/{locale}/wallet,/{locale}/boards,/{locale}/referrals,/{locale}/admin,/{locale}/admin/notif-link,/{locale}/evolution", envFile));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(repoRoot, "artifacts", "e2e-output", stamp);
  const screenshotDir = path.join(outDir, "screens");
  await ensureDir(screenshotDir);

  const browser = await chromium.launch({
    headless: envValue("E2E_HEADLESS", "true", envFile).toLowerCase() !== "false",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const reports: DeviceReport[] = [];
  try {
    for (const locale of locales) {
      const publicRoutes = expandTemplates(publicTemplates, locale);
      const privateRoutes = expandTemplates(privateTemplates, locale);

      const desktopContext = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 900 },
      });
      reports.push(await runDeviceAudit(desktopContext, baseUrl, locale, loginValue, password, publicRoutes, privateRoutes, screenshotDir, "desktop"));
      await desktopContext.close();

      const mobileContext = await browser.newContext({
        ...devices["Pixel 7"],
        ignoreHTTPSErrors: true,
      });
      reports.push(await runDeviceAudit(mobileContext, baseUrl, locale, loginValue, password, publicRoutes, privateRoutes, screenshotDir, "mobile"));
      await mobileContext.close();
    }
  } finally {
    await browser.close();
  }

  const summary = {
    baseUrl,
    locales,
    generatedAt: new Date().toISOString(),
    outputDir: outDir,
    reportCount: reports.length,
    totalScreenshots: reports.reduce((sum, r) => sum + r.publicRoutes.length + r.privateRoutes.length, 0),
    totalConsoleErrors: reports.reduce((sum, r) => sum + r.publicRoutes.concat(r.privateRoutes).reduce((acc, rr) => acc + rr.collector.consoleErrors.length, 0), 0),
    totalPageErrors: reports.reduce((sum, r) => sum + r.publicRoutes.concat(r.privateRoutes).reduce((acc, rr) => acc + rr.collector.pageErrors.length, 0), 0),
    totalRequestFailures: reports.reduce((sum, r) => sum + r.publicRoutes.concat(r.privateRoutes).reduce((acc, rr) => acc + rr.collector.requestFailures.length, 0), 0),
    totalResponseErrors: reports.reduce((sum, r) => sum + r.publicRoutes.concat(r.privateRoutes).reduce((acc, rr) => acc + rr.collector.responseErrors.length, 0), 0),
  };

  await fsp.writeFile(path.join(outDir, "report.json"), JSON.stringify({ summary, reports }, null, 2), "utf8");
  await fsp.writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

  console.log("[E2E SITE AUDIT] completed");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error("[E2E SITE AUDIT] failed:", msg);
  process.exit(1);
});
