import { createHmac } from "crypto";

type Json = Record<string, unknown>;

const BASE_URL = process.env.E2E_BASE_URL || "https://ecrossflow.com";
const ADMIN_LOGIN = process.env.E2E_ADMIN_LOGIN || "admin";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Adm1nSuperS3cure!2026";
const USER_LOGIN = process.env.E2E_USER_LOGIN || "ceo";
const USER_PASSWORD = process.env.E2E_USER_PASSWORD || "Gginel6@$";
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET_MONCASH || process.env.PAYMENT_WEBHOOK_SECRET || "";

if (!WEBHOOK_SECRET) {
  throw new Error("PAYMENT_WEBHOOK_SECRET(_MONCASH) is required to run e2e payments tests");
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function api(
  method: string,
  path: string,
  opts?: { token?: string; body?: Json; headers?: Record<string, string> },
): Promise<{ status: number; data: Json }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(opts?.headers || {}),
  };
  if (opts?.token) headers.authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data: Json = {};
  try { data = text ? JSON.parse(text) as Json : {}; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

function webhookSignature(timestamp: number, payload: string): string {
  return createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
}

async function run() {
  console.log("[E2E] start");

  for (let i = 0; i < 20; i++) {
    try {
      const health = await api("GET", "/api/health");
      if (health.status === 200) break;
    } catch {
      // ignore until service is ready
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const adminLogin = await api("POST", "/api/auth/login", {
    body: { emailOrUsername: ADMIN_LOGIN, password: ADMIN_PASSWORD },
  });
  assert(adminLogin.status === 200, `Admin login failed: ${adminLogin.status}`);
  const adminToken = String(adminLogin.data.token || "");
  assert(adminToken, "Admin token missing");
  console.log("[E2E] admin login OK");

  const userLogin = await api("POST", "/api/auth/login", {
    body: { emailOrUsername: USER_LOGIN, password: USER_PASSWORD },
  });
  assert(userLogin.status === 200, `User login failed: ${userLogin.status}`);
  const userToken = String(userLogin.data.token || "");
  assert(userToken, "User token missing");
  console.log("[E2E] user login OK");

  const me = await api("GET", "/api/users/me", { token: userToken });
  assert(me.status === 200, `GET /users/me failed: ${me.status}`);
  const userId = String(me.data.id || "");
  assert(userId, "User id missing");

  // Reset KYC to rejected to validate withdrawal gate, then go through request/approve flow.
  const kycReject = await api("PUT", `/api/admin/users/${userId}/kyc/reject`, {
    token: adminToken,
    body: { reason: "E2E reset gate" },
  });
  assert(kycReject.status === 200, `Admin KYC reject failed: ${kycReject.status}`);

  const withdrawBlocked = await api("POST", "/api/wallet/withdraw/request-otp", {
    token: userToken,
    body: { amount: "3", currency: "USD" },
  });
  assert(withdrawBlocked.status === 403, `KYC withdraw gate failed: expected 403, got ${withdrawBlocked.status}`);
  assert(String(withdrawBlocked.data.code || "") === "KYC_REQUIRED_FOR_WITHDRAWAL", "Unexpected KYC gate code");
  console.log("[E2E] KYC gate OK");

  const kycRequest = await api("POST", "/api/users/me/kyc/request", { token: userToken, body: {} });
  assert(kycRequest.status === 200, `KYC request failed: ${kycRequest.status}`);

  const kycApprove = await api("PUT", `/api/admin/users/${userId}/kyc/approve`, {
    token: adminToken,
    body: {},
  });
  assert(kycApprove.status === 200, `Admin KYC approve failed: ${kycApprove.status}`);
  console.log("[E2E] KYC request/approve OK");

  // Ensure available funds for withdraw OTP test.
  const adjust = await api("POST", `/api/admin/users/${userId}/adjust-balance`, {
    token: adminToken,
    body: { amount: "15", note: "E2E funding" },
  });
  assert(adjust.status === 200, `Admin adjust balance failed: ${adjust.status}`);

  const withdrawAllowed = await api("POST", "/api/wallet/withdraw/request-otp", {
    token: userToken,
    body: { amount: "3", currency: "USD" },
  });
  assert(withdrawAllowed.status === 200, `Withdraw OTP should pass after KYC approval: ${withdrawAllowed.status}`);
  console.log("[E2E] withdraw after KYC approval OK");

  const walletBefore = await api("GET", "/api/wallet", { token: userToken });
  assert(walletBefore.status === 200, `Wallet before failed: ${walletBefore.status}`);
  const beforeUsd = Number(walletBefore.data.balanceUsd || 0);

  const ref = `E2E-REF-${Date.now()}`;
  const dep = await api("POST", "/api/wallet/deposit", {
    token: userToken,
    body: { amount: "9", currency: "USD", paymentMethod: "MONCASH", reference: ref },
  });
  assert(dep.status === 201, `Create deposit failed: ${dep.status}`);
  console.log("[E2E] deposit create OK");

  // invalid signature
  const badSig = await fetch(`${BASE_URL}/api/payments/webhook/moncash`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ecrossflow-timestamp": String(Math.floor(Date.now() / 1000)),
      "x-ecrossflow-signature": "sha256=deadbeef",
    },
    body: JSON.stringify({ eventId: `bad-${ref}`, referenceId: ref, status: "COMPLETED" }),
  });
  assert(badSig.status === 401, `Invalid signature must return 401, got ${badSig.status}`);

  // expired timestamp
  const oldTs = Math.floor(Date.now() / 1000) - 99999;
  const oldPayload = JSON.stringify({ eventId: `old-${ref}`, referenceId: ref, status: "COMPLETED" });
  const oldSig = webhookSignature(oldTs, oldPayload);
  const oldResp = await fetch(`${BASE_URL}/api/payments/webhook/moncash`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ecrossflow-timestamp": String(oldTs),
      "x-ecrossflow-signature": `sha256=${oldSig}`,
    },
    body: oldPayload,
  });
  assert(oldResp.status === 401, `Expired timestamp must return 401, got ${oldResp.status}`);

  // valid provider-style payload aliases (reference/state/transaction_id)
  const ts = Math.floor(Date.now() / 1000);
  const okEventId = `ok-${ref}`;
  const webhookPayload = JSON.stringify({
    eventId: okEventId,
    eventType: "DEPOSIT_SETTLED",
    reference: ref,
    state: "COMPLETED",
    transaction_id: `mc-${ref}`,
  });
  const sig = webhookSignature(ts, webhookPayload);
  const okWebhook = await fetch(`${BASE_URL}/api/payments/webhook/moncash`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ecrossflow-timestamp": String(ts),
      "x-ecrossflow-signature": `sha256=${sig}`,
    },
    body: webhookPayload,
  });
  assert(okWebhook.status === 200, `Valid webhook failed: ${okWebhook.status}`);
  const okData = await okWebhook.json() as Json;
  assert(okData.ok === true, "Webhook did not return ok=true");

  // idempotent replay
  const replay = await fetch(`${BASE_URL}/api/payments/webhook/moncash`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ecrossflow-timestamp": String(ts),
      "x-ecrossflow-signature": `sha256=${sig}`,
    },
    body: webhookPayload,
  });
  assert(replay.status === 200, `Webhook replay failed: ${replay.status}`);
  const replayData = await replay.json() as Json;
  assert(replayData.alreadyProcessed === true, "Webhook replay must be idempotent");
  console.log("[E2E] webhook auth + processing + idempotence OK");

  const walletAfter = await api("GET", "/api/wallet", { token: userToken });
  assert(walletAfter.status === 200, `Wallet after failed: ${walletAfter.status}`);
  const afterUsd = Number(walletAfter.data.balanceUsd || 0);
  assert(afterUsd >= beforeUsd + 9, `Wallet credit mismatch: before=${beforeUsd}, after=${afterUsd}`);
  console.log("[E2E] wallet credited OK");

  console.log("[E2E] ALL CHECKS PASSED");
}

run().catch((err) => {
  console.error("[E2E] FAILED:", err);
  process.exit(1);
});
