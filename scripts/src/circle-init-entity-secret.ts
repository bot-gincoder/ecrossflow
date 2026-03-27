import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { constants, publicEncrypt, randomBytes } from "node:crypto";
import {
  generateEntitySecretCiphertext,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";

function resolveEnvPath(): string {
  const cwdEnv = resolve(process.cwd(), ".env");
  if (existsSync(cwdEnv)) return cwdEnv;
  return resolve(process.cwd(), "..", ".env");
}

function parseEnv(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    map.set(key, value);
  }
  return map;
}

function upsertEnvKey(raw: string, key: string, value: string): string {
  const lines = raw.split(/\r?\n/);
  let updated = false;
  const next = lines.map((line) => {
    const idx = line.indexOf("=");
    if (idx <= 0) return line;
    const existing = line.slice(0, idx).trim();
    if (existing !== key) return line;
    updated = true;
    return `${key}=${value}`;
  });
  if (!updated) next.push(`${key}=${value}`);
  return next.join("\n");
}

function mask(secret: string): string {
  if (secret.length < 8) return "****";
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

async function getCirclePublicKey(apiKey: string, baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/w3s/config/entity/publicKey`, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
    },
  });
  const json = (await res.json()) as { data?: { publicKey?: string }; message?: string };
  if (!res.ok || !json?.data?.publicKey) {
    throw new Error(`CIRCLE_PUBLIC_KEY_FAILED:${res.status}:${json?.message || "UNKNOWN"}`);
  }
  return json.data.publicKey;
}

function encryptEntitySecret(entitySecret: string, publicKeyPem: string): string {
  const encrypted = publicEncrypt(
    {
      key: publicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(entitySecret, "hex"),
  );
  return encrypted.toString("base64");
}

async function registerEntitySecretViaRest(args: {
  apiKey: string;
  baseUrl: string;
  entitySecretCiphertext: string;
}): Promise<string> {
  const res = await fetch(`${args.baseUrl.replace(/\/+$/, "")}/v1/w3s/config/entity/entitySecret`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({ entitySecretCiphertext: args.entitySecretCiphertext }),
  });
  const json = (await res.json()) as { data?: { recoveryFile?: string }; message?: string };
  if (!res.ok) {
    throw new Error(`CIRCLE_REGISTER_SECRET_FAILED:${res.status}:${json?.message || "UNKNOWN"}`);
  }
  return String(json?.data?.recoveryFile || "");
}

async function main() {
  const force = process.argv.includes("--force");
  const envPath = resolveEnvPath();
  const envRaw = readFileSync(envPath, "utf8");
  const envMap = parseEnv(envRaw);

  const apiKey = (envMap.get("CIRCLE_API_KEY") || "").trim();
  const baseUrl = (envMap.get("CIRCLE_API_BASE") || "https://api.circle.com").trim();
  const existing = (envMap.get("CIRCLE_ENTITY_SECRET") || "").trim();

  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY is missing in .env");
  }
  if (existing && !force) {
    console.log("CIRCLE_ENTITY_SECRET already exists. Use --force to rotate it.");
    return;
  }

  const entitySecret = randomBytes(32).toString("hex");

  const rootDir = resolve(envPath, "..");
  const secretDir = resolve(rootDir, ".circle-secrets");
  mkdirSync(secretDir, { recursive: true });
  try {
    chmodSync(secretDir, 0o700);
  } catch {
    // no-op on filesystems not supporting chmod
  }

  let entitySecretCiphertext = "";
  let recoveryFile = "";
  try {
    await registerEntitySecretCiphertext({
      apiKey,
      baseUrl,
      entitySecret,
      recoveryFileDownloadPath: secretDir,
    });
    entitySecretCiphertext = await generateEntitySecretCiphertext({
      apiKey,
      baseUrl,
      entitySecret,
    });
  } catch (sdkError) {
    const message = sdkError instanceof Error ? sdkError.message : String(sdkError);
    if (!message.toLowerCase().includes("malformed api key")) throw sdkError;
    const publicKey = await getCirclePublicKey(apiKey, baseUrl);
    entitySecretCiphertext = encryptEntitySecret(entitySecret, publicKey);
    recoveryFile = await registerEntitySecretViaRest({
      apiKey,
      baseUrl,
      entitySecretCiphertext,
    });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const secretFile = resolve(secretDir, `entity_secret_${stamp}.txt`);
  writeFileSync(
    secretFile,
    [
      "# Keep this file private.",
      `generated_at=${new Date().toISOString()}`,
      `circle_api_base=${baseUrl}`,
      `CIRCLE_ENTITY_SECRET=${entitySecret}`,
      recoveryFile ? `circle_recovery_file_b64=${recoveryFile}` : "",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  let nextEnv = envRaw;
  nextEnv = upsertEnvKey(nextEnv, "CIRCLE_ENTITY_SECRET", entitySecret);
  nextEnv = upsertEnvKey(nextEnv, "CIRCLE_ENTITY_SECRET_CIPHERTEXT", entitySecretCiphertext);
  writeFileSync(envPath, nextEnv.endsWith("\n") ? nextEnv : `${nextEnv}\n`);

  console.log("Circle entity secret registered and saved.");
  console.log(`- .env updated at: ${envPath}`);
  console.log(`- Secret file: ${secretFile}`);
  console.log(`- Secret fingerprint: ${mask(entitySecret)}`);
}

main().catch((error) => {
  console.error("Failed to initialize Circle entity secret.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
