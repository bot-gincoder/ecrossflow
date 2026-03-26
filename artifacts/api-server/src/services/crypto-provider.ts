import { createHmac, timingSafeEqual } from "crypto";

type JsonObject = Record<string, unknown>;

export type CryptoAssetKey = "MATIC_POLYGON";
export type CryptoWithdrawMode = "AUTO" | "SEMI_AUTO";
export type CryptoDepositProvider = "NOWPAYMENTS" | "OXAPAY";

type CryptoAssetDef = {
  key: CryptoAssetKey;
  label: "MATIC (POLYGON)";
  ticker: "MATIC";
  network: "POLYGON";
  nowCurrency: "maticmainnet";
  oxaCurrency: "POL";
  oxaNetwork: "Polygon Network";
};

export const CRYPTO_ASSET_DEFS: Record<CryptoAssetKey, CryptoAssetDef> = {
  MATIC_POLYGON: {
    key: "MATIC_POLYGON",
    label: "MATIC (POLYGON)",
    ticker: "MATIC",
    network: "POLYGON",
    nowCurrency: "maticmainnet",
    oxaCurrency: "POL",
    oxaNetwork: "Polygon Network",
  },
};

const DEFAULT_API_BASE = "https://api.nowpayments.io";
const DEFAULT_OXAPAY_API_BASE = "https://api.oxapay.com";
let cachedPayoutToken: { value: string; expiresAt: number } | null = null;

function envBool(key: string, fallback = false): boolean {
  const raw = process.env[key];
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCsvUpper(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
}

function sanitizeBaseUrl(raw: string | undefined, fallback: string): string {
  const value = String(raw || fallback).trim();
  return (value || fallback).replace(/\/+$/, "");
}

function getApiBase(): string {
  return sanitizeBaseUrl(process.env.NOWPAYMENTS_API_BASE, DEFAULT_API_BASE);
}

function getApiKey(): string {
  return String(process.env.NOWPAYMENTS_API_KEY || "").trim();
}

function getOxaPayApiBase(): string {
  return sanitizeBaseUrl(process.env.OXAPAY_API_BASE, DEFAULT_OXAPAY_API_BASE);
}

function getOxaPayMerchantApiKey(): string {
  return String(process.env.OXAPAY_MERCHANT_API_KEY || "").trim();
}

function getIpnSecret(): string {
  return String(
    process.env.NOWPAYMENTS_IPN_SECRET
      || process.env.PAYMENT_WEBHOOK_SECRET_CRYPTO
      || process.env.PAYMENT_WEBHOOK_SECRET
      || "",
  ).trim();
}

function getOxaPayCallbackToken(): string {
  return String(process.env.OXAPAY_CALLBACK_TOKEN || "").trim();
}

function getPayoutEmail(): string {
  return String(process.env.NOWPAYMENTS_PAYOUT_EMAIL || "").trim();
}

function getPayoutPassword(): string {
  return String(process.env.NOWPAYMENTS_PAYOUT_PASSWORD || "").trim();
}

function normalizeToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_");
}

function parseAssetAlias(raw: string): CryptoAssetKey | null {
  const token = normalizeToken(raw);
  const aliases: Record<string, CryptoAssetKey> = {
    MATIC: "MATIC_POLYGON",
    POLYGON: "MATIC_POLYGON",
    MATIC_POLYGON: "MATIC_POLYGON",
    MATICMAINNET: "MATIC_POLYGON",
    POLYGON_MATIC: "MATIC_POLYGON",
    // Accept user wording and map it to Polygon-native route.
    BNB_POLYGON: "MATIC_POLYGON",
  };
  return aliases[token] || null;
}

function defaultAsset(): CryptoAssetKey {
  const envDefault = parseAssetAlias(String(process.env.CRYPTO_DEFAULT_ASSET || process.env.CRYPTO_DEFAULT_USDT_ASSET || ""));
  if (envDefault) return envDefault;
  return "MATIC_POLYGON";
}

function fallbackAssetByCurrency(currencyRaw: unknown): CryptoAssetKey | null {
  const currency = String(currencyRaw || "").trim().toUpperCase();
  if (currency === "MATIC") return defaultAsset();
  return null;
}

function parseAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

async function parseJsonResponse(res: Response): Promise<JsonObject> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    return { raw: text };
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round6(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = envNumber("NOWPAYMENTS_TIMEOUT_MS", 10000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function nowpaymentsRequest(args: {
  method: "GET" | "POST";
  path: string;
  body?: JsonObject;
  withApiKey?: boolean;
  bearerToken?: string;
}): Promise<{ status: number; data: JsonObject }> {
  const apiBase = getApiBase();
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (args.withApiKey !== false) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("CRYPTO_DEPOSIT_NOT_CONFIGURED");
    headers["x-api-key"] = apiKey;
  }

  if (args.bearerToken) {
    headers.authorization = `Bearer ${args.bearerToken}`;
  }

  if (args.body) {
    headers["content-type"] = "application/json";
  }

  const res = await fetchWithTimeout(`${apiBase}${args.path}`, {
    method: args.method,
    headers,
    ...(args.body ? { body: JSON.stringify(args.body) } : {}),
  });
  const data = await parseJsonResponse(res);
  return { status: res.status, data };
}

async function oxaPayRequest(args: {
  method: "GET" | "POST";
  path: string;
  body?: JsonObject;
}): Promise<{ status: number; data: JsonObject }> {
  const apiBase = getOxaPayApiBase();
  const key = getOxaPayMerchantApiKey();
  if (!key) throw new Error("OXAPAY_DEPOSIT_NOT_CONFIGURED");

  const headers: Record<string, string> = {
    accept: "application/json",
    merchant_api_key: key,
  };
  if (args.body) headers["content-type"] = "application/json";

  const res = await fetchWithTimeout(`${apiBase}${args.path}`, {
    method: args.method,
    headers,
    ...(args.body ? { body: JSON.stringify(args.body) } : {}),
  });
  const data = await parseJsonResponse(res);
  return { status: res.status, data };
}

function getAppUrl(): string | null {
  const raw = String(process.env.APP_URL || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return raw.replace(/\/+$/, "");
}

function buildWebhookUrl(): string | null {
  const appUrl = getAppUrl();
  if (!appUrl) return null;
  const base = `${appUrl}/api/payments/webhook/crypto`;
  const provider = getCryptoDepositProvider();
  if (provider !== "OXAPAY") return base;
  const token = getOxaPayCallbackToken();
  const params = new URLSearchParams({ provider: "OXAPAY" });
  if (token) params.set("token", token);
  return `${base}?${params.toString()}`;
}

async function getPayoutJwtToken(forceRefresh = false): Promise<string> {
  const email = getPayoutEmail();
  const password = getPayoutPassword();
  if (!email || !password) throw new Error("CRYPTO_PAYOUT_NOT_CONFIGURED");

  const now = Date.now();
  if (!forceRefresh && cachedPayoutToken && cachedPayoutToken.expiresAt > now + 15_000) {
    return cachedPayoutToken.value;
  }

  const auth = await nowpaymentsRequest({
    method: "POST",
    path: "/v1/auth",
    withApiKey: false,
    body: { email, password },
  });

  if (auth.status !== 200) {
    throw new Error(`NOWPAYMENTS_AUTH_FAILED:${auth.status}:${String(auth.data.message || auth.data.code || "UNKNOWN")}`);
  }

  const token = String(auth.data.token || "").trim();
  if (!token) throw new Error("NOWPAYMENTS_AUTH_TOKEN_MISSING");

  cachedPayoutToken = {
    value: token,
    expiresAt: now + 4 * 60 * 1000,
  };
  return token;
}

export function getCryptoWithdrawMode(): CryptoWithdrawMode {
  const raw = String(process.env.CRYPTO_WITHDRAW_MODE || "SEMI_AUTO").trim().toUpperCase();
  if (raw === "AUTO") return "AUTO";
  return "SEMI_AUTO";
}

export function getCryptoDepositProvider(): CryptoDepositProvider {
  const mode = String(process.env.CRYPTO_DEPOSIT_PROVIDER || "AUTO").trim().toUpperCase();
  const oxaReady = Boolean(getOxaPayMerchantApiKey());
  const nowReady = Boolean(getApiKey());
  if (mode === "OXAPAY") return "OXAPAY";
  if (mode === "NOWPAYMENTS") return "NOWPAYMENTS";
  if (oxaReady) return "OXAPAY";
  return "NOWPAYMENTS";
}

export function isCryptoDepositConfigured(): boolean {
  const provider = getCryptoDepositProvider();
  if (provider === "OXAPAY") return Boolean(getOxaPayMerchantApiKey());
  return Boolean(getApiKey());
}

export function isCryptoPayoutConfigured(): boolean {
  return Boolean(getApiKey() && getPayoutEmail() && getPayoutPassword());
}

export function getNowpaymentsIpnSecret(): string {
  return getIpnSecret();
}

export function getAllowedCryptoAssets(): CryptoAssetKey[] {
  const fromEnv = parseCsvUpper(
    String(process.env.CRYPTO_ALLOWED_ASSETS || "MATIC_POLYGON"),
  )
    .map((token) => parseAssetAlias(token))
    .filter((asset): asset is CryptoAssetKey => Boolean(asset));

  const deduped = Array.from(new Set(fromEnv));
  if (!deduped.length) return ["MATIC_POLYGON"];
  return deduped;
}

export function isCryptoAssetAllowed(asset: CryptoAssetKey): boolean {
  return getAllowedCryptoAssets().includes(asset);
}

export function resolveCryptoAsset(rawAsset: unknown, currencyRaw?: unknown): CryptoAssetKey | null {
  const fromInput = rawAsset ? parseAssetAlias(String(rawAsset)) : null;
  const candidate = fromInput || fallbackAssetByCurrency(currencyRaw);
  if (!candidate) return null;
  return isCryptoAssetAllowed(candidate) ? candidate : null;
}

export function getCryptoAssetMeta(asset: CryptoAssetKey): CryptoAssetDef {
  return CRYPTO_ASSET_DEFS[asset];
}

export type CreatedCryptoDeposit = {
  provider: CryptoDepositProvider;
  paymentId: string;
  paymentStatus: string;
  payAddress: string;
  payAmount: number | null;
  payCurrency: string;
  network: string | null;
  expiresAt: string | null;
  raw: JsonObject;
};

export async function createCustodialCryptoDeposit(args: {
  referenceId: string;
  amountUsd: number;
  description: string;
  asset: CryptoAssetKey;
}): Promise<CreatedCryptoDeposit> {
  const providerMode = String(process.env.CRYPTO_DEPOSIT_PROVIDER || "AUTO").trim().toUpperCase();
  const provider = getCryptoDepositProvider();
  if (!isCryptoDepositConfigured()) throw new Error(`${provider}_DEPOSIT_NOT_CONFIGURED`);
  const assetMeta = getCryptoAssetMeta(args.asset);
  const webhookUrl = buildWebhookUrl();

  if (provider === "OXAPAY") {
    try {
      const body: JsonObject = {
        amount: round2(args.amountUsd),
        currency: "USD",
        pay_currency: assetMeta.oxaCurrency,
        network: assetMeta.oxaNetwork,
        lifetime: envNumber("OXAPAY_PAYMENT_LIFETIME_MINUTES", 60),
        fee_paid_by_payer: envBool("OXAPAY_FEE_PAID_BY_PAYER", true) ? 1 : 0,
        under_paid_coverage: envNumber("OXAPAY_UNDERPAID_COVERAGE_PERCENT", 0),
        order_id: args.referenceId,
        description: args.description,
      };
      if (webhookUrl) body.callback_url = webhookUrl;

      const response = await oxaPayRequest({
        method: "POST",
        path: "/v1/payment/white-label",
        body,
      });
      if (response.status !== 200) {
        throw new Error(`OXAPAY_CREATE_PAYMENT_FAILED:${response.status}:${String(response.data.message || (response.data.error as JsonObject | undefined)?.message || "UNKNOWN")}`);
      }
      const data = (response.data.data && typeof response.data.data === "object")
        ? response.data.data as JsonObject
        : response.data;
      const paymentId = String(data.track_id || "").trim();
      const payAddress = String(data.address || "").trim();
      if (!paymentId || !payAddress) {
        throw new Error("OXAPAY_CREATE_PAYMENT_INVALID_RESPONSE");
      }
      return {
        provider: "OXAPAY",
        paymentId,
        paymentStatus: String(data.status || "waiting").toLowerCase(),
        payAddress,
        payAmount: parseAmount(data.pay_amount as string | number | null | undefined),
        payCurrency: String(data.pay_currency || assetMeta.oxaCurrency),
        network: data.network ? String(data.network) : assetMeta.oxaNetwork,
        expiresAt: data.expired_at ? new Date(Number(data.expired_at) * 1000).toISOString() : null,
        raw: response.data,
      };
    } catch (error) {
      const canFallbackNow = providerMode === "AUTO" && Boolean(getApiKey());
      if (!canFallbackNow) throw error;
    }
  }

  const body: JsonObject = {
    price_amount: round2(args.amountUsd),
    price_currency: "usd",
    pay_currency: assetMeta.nowCurrency,
    order_id: args.referenceId,
    order_description: args.description,
    is_fixed_rate: envBool("NOWPAYMENTS_FIXED_RATE", true),
    is_fee_paid_by_user: envBool("NOWPAYMENTS_FEE_PAID_BY_USER", false),
  };
  if (webhookUrl) body.ipn_callback_url = webhookUrl;

  const response = await nowpaymentsRequest({
    method: "POST",
    path: "/v1/payment",
    body,
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`NOWPAYMENTS_CREATE_PAYMENT_FAILED:${response.status}:${String(response.data.message || response.data.code || "UNKNOWN")}`);
  }

  const paymentId = String(response.data.payment_id || "").trim();
  const payAddress = String(response.data.pay_address || "").trim();
  if (!paymentId || !payAddress) {
    throw new Error("NOWPAYMENTS_CREATE_PAYMENT_INVALID_RESPONSE");
  }

  return {
    provider: "NOWPAYMENTS",
    paymentId,
    paymentStatus: String(response.data.payment_status || "waiting").toLowerCase(),
    payAddress,
    payAmount: parseAmount(response.data.pay_amount as string | number | null | undefined),
    payCurrency: String(response.data.pay_currency || assetMeta.nowCurrency),
    network: response.data.network ? String(response.data.network) : null,
    expiresAt: response.data.expiration_estimate_date ? String(response.data.expiration_estimate_date) : null,
    raw: response.data,
  };
}

export async function getCustodialCryptoDepositStatus(args: { paymentId: string; provider?: CryptoDepositProvider }): Promise<JsonObject> {
  const provider = args.provider || getCryptoDepositProvider();
  if (!isCryptoDepositConfigured()) throw new Error(`${provider}_DEPOSIT_NOT_CONFIGURED`);
  const normalized = String(args.paymentId || "").trim();
  if (!normalized) throw new Error(`${provider}_PAYMENT_ID_REQUIRED`);

  if (provider === "OXAPAY") {
    const response = await oxaPayRequest({
      method: "GET",
      path: `/v1/payment/${encodeURIComponent(normalized)}`,
    });
    if (response.status !== 200) {
      throw new Error(`OXAPAY_GET_PAYMENT_FAILED:${response.status}:${String(response.data.message || (response.data.error as JsonObject | undefined)?.message || "UNKNOWN")}`);
    }
    return response.data;
  }

  const response = await nowpaymentsRequest({
    method: "GET",
    path: `/v1/payment/${encodeURIComponent(normalized)}`,
  });

  if (response.status !== 200) {
    throw new Error(`NOWPAYMENTS_GET_PAYMENT_FAILED:${response.status}:${String(response.data.message || response.data.code || "UNKNOWN")}`);
  }

  return response.data;
}

export type CreatedCryptoPayout = {
  payoutId: string;
  withdrawalId: string;
  status: string;
  raw: JsonObject;
};

export async function createCustodialCryptoPayout(args: {
  referenceId: string;
  asset: CryptoAssetKey;
  destination: string;
  amount: number;
  description: string;
  extraId?: string;
}): Promise<CreatedCryptoPayout> {
  if (!isCryptoPayoutConfigured()) throw new Error("CRYPTO_PAYOUT_NOT_CONFIGURED");

  const token = await getPayoutJwtToken(false);
  const assetMeta = getCryptoAssetMeta(args.asset);
  const webhookUrl = buildWebhookUrl();

  const withdrawal: JsonObject = {
    address: args.destination,
    currency: assetMeta.nowCurrency,
    amount: round6(args.amount),
    unique_external_id: args.referenceId,
    payout_description: args.description,
  };
  if (args.extraId) withdrawal.extra_id = args.extraId;
  if (webhookUrl) withdrawal.ipn_callback_url = webhookUrl;

  const body: JsonObject = {
    withdrawals: [withdrawal],
  };
  if (webhookUrl) body.ipn_callback_url = webhookUrl;

  let response = await nowpaymentsRequest({
    method: "POST",
    path: "/v1/payout",
    body,
    bearerToken: token,
  });

  if (response.status === 401 || response.status === 403) {
    const refreshed = await getPayoutJwtToken(true);
    response = await nowpaymentsRequest({
      method: "POST",
      path: "/v1/payout",
      body,
      bearerToken: refreshed,
    });
  }

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`NOWPAYMENTS_CREATE_PAYOUT_FAILED:${response.status}:${String(response.data.message || response.data.code || "UNKNOWN")}`);
  }

  const payoutId = String(response.data.id || "").trim();
  const withdrawalsRaw = Array.isArray(response.data.withdrawals) ? response.data.withdrawals : [];
  const withdrawalRow = (withdrawalsRaw.find((w) => String((w as JsonObject).unique_external_id || "") === args.referenceId)
    || withdrawalsRaw[0]) as JsonObject | undefined;

  if (!payoutId || !withdrawalRow) {
    throw new Error("NOWPAYMENTS_CREATE_PAYOUT_INVALID_RESPONSE");
  }

  const withdrawalId = String(withdrawalRow.id || "").trim();
  if (!withdrawalId) throw new Error("NOWPAYMENTS_PAYOUT_WITHDRAWAL_ID_MISSING");

  return {
    payoutId,
    withdrawalId,
    status: String(withdrawalRow.status || "waiting").toLowerCase(),
    raw: response.data,
  };
}

function mapDepositStatus(raw: string): "COMPLETED" | "FAILED" | "CANCELLED" | null {
  const status = raw.trim().toLowerCase();
  if (!status) return null;
  if (status === "finished") return "COMPLETED";
  if (status === "failed") return "FAILED";
  if (status === "refunded" || status === "expired") return "CANCELLED";
  return null;
}

function mapPayoutStatus(raw: string): "COMPLETED" | "FAILED" | "CANCELLED" | null {
  const status = raw.trim().toLowerCase();
  if (!status) return null;
  if (status === "finished") return "COMPLETED";
  if (status === "failed") return "FAILED";
  if (status === "rejected") return "CANCELLED";
  return null;
}

export type CanonicalNowpaymentsEvent = {
  eventId: string;
  eventType: "NOWPAYMENTS_PAYMENT" | "NOWPAYMENTS_PAYOUT";
  referenceId: string;
  providerTxId: string;
  rawStatus: string;
  status: "COMPLETED" | "FAILED" | "CANCELLED" | null;
};

export type CanonicalOxaPayEvent = {
  eventId: string;
  eventType: "OXAPAY_PAYMENT";
  referenceId: string;
  providerTxId: string;
  rawStatus: string;
  status: "COMPLETED" | "FAILED" | "CANCELLED" | null;
};

export function canonicalizeNowpaymentsEvent(payload: JsonObject): CanonicalNowpaymentsEvent | null {
  const paymentId = String(payload.payment_id || "").trim();
  const paymentRef = String(payload.order_id || payload.reference_id || "").trim();
  const paymentStatus = String(payload.payment_status || payload.status || "").trim().toLowerCase();

  if (paymentId || paymentRef) {
    if (!paymentId || !paymentRef || !paymentStatus) return null;
    return {
      eventId: `np:payment:${paymentId}:${paymentStatus}`,
      eventType: "NOWPAYMENTS_PAYMENT",
      referenceId: paymentRef,
      providerTxId: paymentId,
      rawStatus: paymentStatus,
      status: mapDepositStatus(paymentStatus),
    };
  }

  const withdrawalId = String(payload.id || payload.withdrawal_id || "").trim();
  const payoutRef = String(payload.unique_external_id || payload.reference_id || payload.order_id || "").trim();
  const payoutStatus = String(payload.status || "").trim().toLowerCase();

  if (!withdrawalId || !payoutRef || !payoutStatus) return null;

  return {
    eventId: `np:payout:${withdrawalId}:${payoutStatus}`,
    eventType: "NOWPAYMENTS_PAYOUT",
    referenceId: payoutRef,
    providerTxId: withdrawalId,
    rawStatus: payoutStatus,
    status: mapPayoutStatus(payoutStatus),
  };
}

export function verifyNowpaymentsSignature(payload: JsonObject, providedSignatureRaw: string): boolean {
  const secret = getIpnSecret();
  if (!secret) return false;
  const providedSignature = String(providedSignatureRaw || "").trim().toLowerCase();
  if (!providedSignature) return false;

  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  const expected = createHmac("sha512", secret).update(sorted).digest("hex").toLowerCase();

  const a = Buffer.from(expected);
  const b = Buffer.from(providedSignature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function mapOxaPayDepositStatus(raw: string): "COMPLETED" | "FAILED" | "CANCELLED" | null {
  const status = raw.trim().toLowerCase();
  if (!status) return null;
  if (status === "paid" || status === "manual_accept") return "COMPLETED";
  if (status === "refunded") return "FAILED";
  if (status === "expired" || status === "canceled") return "CANCELLED";
  return null;
}

export function canonicalizeOxaPayEvent(payload: JsonObject): CanonicalOxaPayEvent | null {
  const data = (payload.data && typeof payload.data === "object")
    ? payload.data as JsonObject
    : payload;
  const providerTxId = String(data.track_id || payload.track_id || "").trim();
  const referenceId = String(data.order_id || payload.order_id || payload.reference_id || "").trim();
  const rawStatus = String(data.status || payload.status || "").trim().toLowerCase();
  if (!providerTxId || !referenceId || !rawStatus) return null;
  return {
    eventId: `oxapay:payment:${providerTxId}:${rawStatus}`,
    eventType: "OXAPAY_PAYMENT",
    referenceId,
    providerTxId,
    rawStatus,
    status: mapOxaPayDepositStatus(rawStatus),
  };
}

export function verifyOxaPayCallbackToken(providedToken: string | null | undefined): boolean {
  const expected = getOxaPayCallbackToken();
  if (!expected) return true;
  return String(providedToken || "").trim() === expected;
}
