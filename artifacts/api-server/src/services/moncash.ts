import { createHash } from "crypto";

type JsonObject = Record<string, unknown>;

const DEFAULT_API_BASE = "https://sandbox.moncashbutton.digicelgroup.com/Api";
const DEFAULT_GATEWAY_BASE = "https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware";

let cachedToken: { value: string; expiresAt: number } | null = null;

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

function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length === 8) return `509${digits}`;
  return digits;
}

function getApiBase(): string {
  return (process.env.MONCASH_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
}

function getGatewayBase(): string {
  return (process.env.MONCASH_GATEWAY_BASE || DEFAULT_GATEWAY_BASE).replace(/\/+$/, "");
}

function getCredentials() {
  const clientId = (process.env.MONCASH_CLIENT_ID || "").trim();
  const clientSecret = (process.env.MONCASH_CLIENT_SECRET || "").trim();
  return { clientId, clientSecret };
}

export function isMoncashConfigured(): boolean {
  const { clientId, clientSecret } = getCredentials();
  return Boolean(clientId && clientSecret);
}

export function isMoncashAutoDepositEnabled(): boolean {
  return envBool("MONCASH_AUTO_DEPOSIT_ENABLED", false) && isMoncashConfigured();
}

export function isMoncashAutoWithdrawEnabled(): boolean {
  return envBool("MONCASH_AUTO_WITHDRAW_ENABLED", false) && isMoncashConfigured();
}

export function evaluateAutoPayoutPilot(args: {
  userId: string;
  amountUsd: number;
  paymentMethod: string | null;
  currency: string;
}): { allowed: boolean; reason?: string } {
  if (!envBool("PAYOUT_PILOT_ENABLED", false)) {
    return { allowed: true };
  }

  const maxUsd = Number.parseFloat(process.env.PAYOUT_PILOT_MAX_USD || "50");
  if (Number.isFinite(maxUsd) && maxUsd > 0 && args.amountUsd > maxUsd) {
    return { allowed: false, reason: `Pilot max exceeded (${args.amountUsd} > ${maxUsd})` };
  }

  const allowedUsers = String(process.env.PAYOUT_PILOT_ALLOWED_USERS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (allowedUsers.length && !allowedUsers.includes(args.userId)) {
    return { allowed: false, reason: "User is not allowlisted for pilot auto-payout" };
  }

  const allowedMethods = String(process.env.PAYOUT_PILOT_ALLOWED_METHODS || "MONCASH")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  if (args.paymentMethod && allowedMethods.length && !allowedMethods.includes(args.paymentMethod.toUpperCase())) {
    return { allowed: false, reason: `Payment method ${args.paymentMethod} is not allowlisted for pilot auto-payout` };
  }

  const allowedCurrencies = String(process.env.PAYOUT_PILOT_ALLOWED_CURRENCIES || "HTG")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  if (allowedCurrencies.length && !allowedCurrencies.includes(args.currency.toUpperCase())) {
    return { allowed: false, reason: `Currency ${args.currency} is not allowlisted for pilot auto-payout` };
  }

  return { allowed: true };
}

async function parseBody(res: Response): Promise<JsonObject> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    return { raw: text };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = envNumber("MONCASH_TIMEOUT_MS", 10000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAccessToken(forceRefresh = false): Promise<string> {
  if (!isMoncashConfigured()) {
    throw new Error("MONCASH_NOT_CONFIGURED");
  }

  const now = Date.now();
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > now + 15000) {
    return cachedToken.value;
  }

  const { clientId, clientSecret } = getCredentials();
  const apiBase = getApiBase();
  const tokenUrl = `${apiBase}/oauth/token`;
  const basicToken = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetchWithTimeout(tokenUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${basicToken}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "scope=read,write&grant_type=client_credentials",
  });

  const payload = await parseBody(res);
  if (!res.ok) {
    throw new Error(`MONCASH_AUTH_FAILED:${res.status}:${String(payload.message || payload.error || "UNKNOWN")}`);
  }

  const token = String(payload.access_token || "");
  const expiresIn = Number.parseInt(String(payload.expires_in || "59"), 10);
  if (!token) throw new Error("MONCASH_AUTH_TOKEN_MISSING");

  cachedToken = {
    value: token,
    expiresAt: now + (Number.isFinite(expiresIn) ? expiresIn : 59) * 1000,
  };
  return token;
}

async function moncashRequest(path: string, body?: JsonObject, method = "POST"): Promise<{ status: number; data: JsonObject }> {
  const apiBase = getApiBase();
  const doCall = async (token: string) => {
    const res = await fetchWithTimeout(`${apiBase}${path}`, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await parseBody(res);
    return { status: res.status, data };
  };

  let token = await fetchAccessToken(false);
  let response = await doCall(token);
  if (response.status === 401 || response.status === 403) {
    token = await fetchAccessToken(true);
    response = await doCall(token);
  }
  return response;
}

export async function moncashCreatePayment(orderId: string, amount: number): Promise<{
  checkoutUrl: string;
  paymentToken: string;
  raw: JsonObject;
}> {
  const response = await moncashRequest("/v1/CreatePayment", {
    amount,
    orderId,
  });
  const tokenObj = response.data.payment_token as Record<string, unknown> | undefined;
  const paymentToken = String(tokenObj?.token || "");
  if (response.status !== 202 || !paymentToken) {
    throw new Error(`MONCASH_CREATE_PAYMENT_FAILED:${response.status}:${String(response.data.message || response.data.error || "UNKNOWN")}`);
  }
  return {
    checkoutUrl: `${getGatewayBase()}/Payment/Redirect?token=${encodeURIComponent(paymentToken)}`,
    paymentToken,
    raw: response.data,
  };
}

export async function moncashRetrieveOrderPayment(orderId: string): Promise<{
  successful: boolean;
  transactionId: string | null;
  payer: string | null;
  message: string | null;
  amount: number | null;
  raw: JsonObject;
}> {
  const response = await moncashRequest("/v1/RetrieveOrderPayment", { orderId });
  const payment = response.data.payment as Record<string, unknown> | undefined;
  const message = payment?.message ? String(payment.message) : null;
  const successful = response.status === 200 && (message || "").toLowerCase().includes("successful");
  const amountRaw = payment?.cost;
  const amount = amountRaw === undefined || amountRaw === null ? null : Number.parseFloat(String(amountRaw));
  return {
    successful,
    transactionId: payment?.transaction_id ? String(payment.transaction_id) : null,
    payer: payment?.payer ? String(payment.payer) : null,
    message,
    amount: Number.isFinite(amount || NaN) ? amount : null,
    raw: response.data,
  };
}

export async function moncashTransfer(args: {
  reference: string;
  receiver: string;
  amount: number;
  description: string;
}): Promise<{
  successful: boolean;
  transactionId: string | null;
  message: string | null;
  raw: JsonObject;
}> {
  const receiver = normalizePhone(args.receiver);
  const response = await moncashRequest("/v1/Transfert", {
    amount: args.amount,
    receiver,
    desc: args.description,
    reference: args.reference,
  });
  const transfer = response.data.transfer as Record<string, unknown> | undefined;
  const message = transfer?.message ? String(transfer.message) : String(response.data.message || "");
  const successful = response.status === 200 && (message || "").toLowerCase().includes("successful");
  return {
    successful,
    transactionId: transfer?.transaction_id ? String(transfer.transaction_id) : null,
    message: message || null,
    raw: response.data,
  };
}

export async function moncashPrefundedStatus(reference: string): Promise<{
  statusCode: number;
  transStatus: string | null;
  raw: JsonObject;
}> {
  const response = await moncashRequest("/v1/PrefundedTransactionStatus", { reference });
  return {
    statusCode: response.status,
    transStatus: response.data.transStatus ? String(response.data.transStatus) : null,
    raw: response.data,
  };
}

export async function moncashPrefundedBalance(): Promise<{
  statusCode: number;
  balance: number | null;
  raw: JsonObject;
}> {
  const response = await moncashRequest("/v1/PrefundedBalance", undefined, "GET");
  const balanceObj = response.data.balance as Record<string, unknown> | undefined;
  const balanceRaw = balanceObj?.balance;
  const balance = balanceRaw === undefined || balanceRaw === null ? null : Number.parseFloat(String(balanceRaw));
  return {
    statusCode: response.status,
    balance: Number.isFinite(balance || NaN) ? balance : null,
    raw: response.data,
  };
}

export function moncashReferenceForWithdrawal(txId: string): string {
  return `WDR-${createHash("sha1").update(txId).digest("hex").slice(0, 20).toUpperCase()}`;
}
