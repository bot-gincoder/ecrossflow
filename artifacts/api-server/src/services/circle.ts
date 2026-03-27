import { constants, publicEncrypt, randomUUID } from "crypto";

type JsonObject = Record<string, unknown>;

export type CircleAsset = {
  asset: string;
  network: string;
  blockchain: string;
};

const DEFAULT_CIRCLE_BASE = "https://api.circle.com";
const CIRCLE_USDC_ASSET = "USDC";
const CIRCLE_POLYGON_NETWORK = "POLYGON";
const CIRCLE_ASSETS: CircleAsset[] = [
  { asset: CIRCLE_USDC_ASSET, network: CIRCLE_POLYGON_NETWORK, blockchain: CIRCLE_POLYGON_NETWORK },
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

function getEntitySecret(): string {
  return env("CIRCLE_ENTITY_SECRET");
}

function getDefaultBlockchain(): string {
  return env("CIRCLE_DEFAULT_BLOCKCHAIN") || CIRCLE_POLYGON_NETWORK;
}

export function isCircleConfigured(): boolean {
  return Boolean(getApiKey() && getWalletSetId() && (getEntitySecretCiphertext() || getEntitySecret()));
}

export function isCirclePrimary(): boolean {
  return envBool("CIRCLE_ENABLED", false);
}

export function listCircleSupportedAssets(): CircleAsset[] {
  return CIRCLE_ASSETS;
}

export function getCircleAllowedAsset(): string {
  return CIRCLE_USDC_ASSET;
}

export function getCircleAllowedNetwork(): string {
  return CIRCLE_POLYGON_NETWORK;
}

export function isCircleAllowedRail(asset: string, network: string): boolean {
  return asset.trim().toUpperCase() === CIRCLE_USDC_ASSET && network.trim().toUpperCase() === CIRCLE_POLYGON_NETWORK;
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

let cachedCirclePublicKey: string | null = null;

async function resolveEntitySecretCiphertext(): Promise<string> {
  const configuredCipher = getEntitySecretCiphertext();
  if (configuredCipher) return configuredCipher;
  const entitySecret = getEntitySecret();
  if (!entitySecret) throw new Error("CIRCLE_ENTITY_SECRET_MISSING");
  if (!/^[a-fA-F0-9]{64}$/.test(entitySecret)) throw new Error("CIRCLE_ENTITY_SECRET_INVALID_FORMAT");

  if (!cachedCirclePublicKey) {
    const response = await circleRequest({ method: "GET", path: "/v1/w3s/config/entity/publicKey" });
    const data = (response.data.data && typeof response.data.data === "object")
      ? response.data.data as JsonObject
      : response.data;
    const publicKey = String(data.publicKey || "").trim();
    if (!publicKey) throw new Error("CIRCLE_PUBLIC_KEY_MISSING");
    cachedCirclePublicKey = publicKey;
  }

  const encrypted = publicEncrypt({
    key: cachedCirclePublicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, Buffer.from(entitySecret, "hex"));
  return encrypted.toString("base64");
}

export async function createCircleWallet(args: {
  idempotencyKey?: string;
  blockchain?: string;
}): Promise<{ circleWalletId: string; address: string; network: string; raw: JsonObject }> {
  const walletSetId = getWalletSetId();
  const entitySecretCiphertext = await resolveEntitySecretCiphertext();
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
  const entitySecretCiphertext = await resolveEntitySecretCiphertext();
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
  if (!isCircleAllowedRail(asset, network)) return null;
  const rawMap = env("CIRCLE_TOKEN_ID_MAP_JSON");
  if (!rawMap) return env("CIRCLE_USDC_POLYGON_TOKEN_ID") || null;
  try {
    const map = JSON.parse(rawMap) as Record<string, string>;
    const key = `${CIRCLE_USDC_ASSET}:${CIRCLE_POLYGON_NETWORK}`;
    return map[key] || env("CIRCLE_USDC_POLYGON_TOKEN_ID") || null;
  } catch {
    return env("CIRCLE_USDC_POLYGON_TOKEN_ID") || null;
  }
}
