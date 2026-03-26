import { randomUUID } from "crypto";

type JsonObject = Record<string, unknown>;

export type CircleAsset = {
  asset: string;
  network: string;
  blockchain: string;
};

const DEFAULT_CIRCLE_BASE = "https://api.circle.com";

// Commonly used Circle-supported rails for wallet UX.
const CIRCLE_ASSETS: CircleAsset[] = [
  { asset: "USDC", network: "ETH-SEPOLIA", blockchain: "ETH-SEPOLIA" },
  { asset: "USDC", network: "AVAX-FUJI", blockchain: "AVAX-FUJI" },
  { asset: "USDC", network: "MATIC-AMOY", blockchain: "MATIC-AMOY" },
  { asset: "USDC", network: "ARB-SEPOLIA", blockchain: "ARB-SEPOLIA" },
  { asset: "USDC", network: "OP-SEPOLIA", blockchain: "OP-SEPOLIA" },
  { asset: "USDC", network: "BASE-SEPOLIA", blockchain: "BASE-SEPOLIA" },
  { asset: "USDC", network: "SOL-DEVNET", blockchain: "SOL-DEVNET" },
  { asset: "EURC", network: "ETH-SEPOLIA", blockchain: "ETH-SEPOLIA" },
  { asset: "EURC", network: "BASE-SEPOLIA", blockchain: "BASE-SEPOLIA" },
];

function env(key: string): string {
  return String(process.env[key] || "").trim();
}

function envBool(key: string, fallback = false): boolean {
  const raw = env(key).toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function getCircleBase(): string {
  const raw = env("CIRCLE_API_BASE");
  return (raw || DEFAULT_CIRCLE_BASE).replace(/\/+$/, "");
}

function getApiKey(): string {
  return env("CIRCLE_API_KEY");
}

function getWalletSetId(): string {
  return env("CIRCLE_WALLET_SET_ID");
}

function getEntitySecretCiphertext(): string {
  return env("CIRCLE_ENTITY_SECRET_CIPHERTEXT");
}

function getDefaultBlockchain(): string {
  return env("CIRCLE_DEFAULT_BLOCKCHAIN") || "MATIC-AMOY";
}

export function isCircleConfigured(): boolean {
  return Boolean(getApiKey() && getWalletSetId() && getEntitySecretCiphertext());
}

export function isCirclePrimary(): boolean {
  return envBool("CIRCLE_ENABLED", false);
}

export function listCircleSupportedAssets(): CircleAsset[] {
  const raw = env("CIRCLE_SUPPORTED_ASSETS_JSON");
  if (!raw) return CIRCLE_ASSETS;
  try {
    const parsed = JSON.parse(raw) as CircleAsset[];
    return Array.isArray(parsed) && parsed.length ? parsed : CIRCLE_ASSETS;
  } catch {
    return CIRCLE_ASSETS;
  }
}

async function circleRequest(args: {
  method: "GET" | "POST";
  path: string;
  body?: JsonObject;
}): Promise<{ status: number; data: JsonObject }> {
  const key = getApiKey();
  if (!key) throw new Error("CIRCLE_NOT_CONFIGURED");
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${key}`,
  };
  if (args.body) headers["content-type"] = "application/json";

  const res = await fetch(`${getCircleBase()}${args.path}`, {
    method: args.method,
    headers,
    ...(args.body ? { body: JSON.stringify(args.body) } : {}),
  });
  const text = await res.text();
  let data: JsonObject = {};
  if (text) {
    try {
      data = JSON.parse(text) as JsonObject;
    } catch {
      data = { raw: text };
    }
  }
  return { status: res.status, data };
}

export async function createCircleWallet(args: {
  idempotencyKey?: string;
  blockchain?: string;
}): Promise<{ circleWalletId: string; address: string; network: string; raw: JsonObject }> {
  const walletSetId = getWalletSetId();
  const entitySecretCiphertext = getEntitySecretCiphertext();
  if (!walletSetId || !entitySecretCiphertext) throw new Error("CIRCLE_NOT_CONFIGURED");

  const blockchain = args.blockchain || getDefaultBlockchain();
  const body: JsonObject = {
    idempotencyKey: args.idempotencyKey || randomUUID(),
    walletSetId,
    blockchains: [blockchain],
    accountType: env("CIRCLE_ACCOUNT_TYPE") || "SCA",
    count: 1,
    entitySecretCiphertext,
  };

  const response = await circleRequest({
    method: "POST",
    path: "/v1/w3s/developer/wallets",
    body,
  });
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`CIRCLE_CREATE_WALLET_FAILED:${response.status}:${String(response.data.message || response.data.code || "UNKNOWN")}`);
  }

  const data = (response.data.data && typeof response.data.data === "object")
    ? response.data.data as JsonObject
    : response.data;
  const wallets = Array.isArray(data.wallets) ? data.wallets as JsonObject[] : [];
  const first = wallets[0] || {};
  const circleWalletId = String(first.id || "").trim();
  const address = String(first.address || "").trim();
  if (!circleWalletId || !address) throw new Error("CIRCLE_CREATE_WALLET_INVALID_RESPONSE");

  return { circleWalletId, address, network: blockchain, raw: response.data };
}

export async function createCircleTransfer(args: {
  walletId: string;
  destinationAddress: string;
  amount: string;
  tokenId: string;
  idempotencyKey?: string;
}): Promise<{ transferId: string; state: string; raw: JsonObject }> {
  const entitySecretCiphertext = getEntitySecretCiphertext();
  if (!entitySecretCiphertext) throw new Error("CIRCLE_NOT_CONFIGURED");

  const body: JsonObject = {
    idempotencyKey: args.idempotencyKey || randomUUID(),
    walletId: args.walletId,
    destinationAddress: args.destinationAddress,
    amounts: [args.amount],
    tokenId: args.tokenId,
    entitySecretCiphertext,
    fee: { type: env("CIRCLE_FEE_MODE") || "MEDIUM" },
  };

  const response = await circleRequest({
    method: "POST",
    path: "/v1/w3s/developer/transactions/transfer",
    body,
  });
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`CIRCLE_CREATE_TRANSFER_FAILED:${response.status}:${String(response.data.message || response.data.code || "UNKNOWN")}`);
  }

  const data = (response.data.data && typeof response.data.data === "object")
    ? response.data.data as JsonObject
    : response.data;
  const transferId = String(data.id || "").trim();
  if (!transferId) throw new Error("CIRCLE_CREATE_TRANSFER_INVALID_RESPONSE");
  return { transferId, state: String(data.state || "PENDING"), raw: response.data };
}

export function resolveCircleTokenId(asset: string, network: string): string | null {
  const rawMap = env("CIRCLE_TOKEN_ID_MAP_JSON");
  if (!rawMap) return null;
  try {
    const map = JSON.parse(rawMap) as Record<string, string>;
    const key = `${asset.toUpperCase()}:${network.toUpperCase()}`;
    return map[key] || null;
  } catch {
    return null;
  }
}
