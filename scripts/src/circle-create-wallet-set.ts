import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

function resolveEnvPath(): string {
  const cwdEnv = resolve(process.cwd(), ".env");
  if (existsSync(cwdEnv)) return cwdEnv;
  return resolve(process.cwd(), "..", ".env");
}

function getEnv(raw: string, key: string): string {
  const match = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
  return (match?.[1] || "").trim();
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

async function main() {
  const envPath = resolveEnvPath();
  const envRaw = readFileSync(envPath, "utf8");
  const apiKey = getEnv(envRaw, "CIRCLE_API_KEY");
  const entitySecret = getEnv(envRaw, "CIRCLE_ENTITY_SECRET");
  const baseUrl = getEnv(envRaw, "CIRCLE_API_BASE") || "https://api.circle.com";
  const walletSetName = process.argv[2] || `Ecrossflow Wallet Set ${new Date().toISOString().slice(0, 10)}`;

  if (!apiKey) throw new Error("CIRCLE_API_KEY is missing in .env");
  if (!entitySecret) throw new Error("CIRCLE_ENTITY_SECRET is missing in .env");

  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
    baseUrl,
  });

  const response = await client.createWalletSet({ name: walletSetName });
  const walletSetId = String(response.data?.walletSet?.id || "").trim();
  if (!walletSetId) throw new Error("Wallet set creation succeeded but no walletSetId returned.");

  const nextEnv = upsertEnvKey(envRaw, "CIRCLE_WALLET_SET_ID", walletSetId);
  writeFileSync(envPath, nextEnv.endsWith("\n") ? nextEnv : `${nextEnv}\n`);

  console.log("Circle wallet set created.");
  console.log(`- Name: ${walletSetName}`);
  console.log(`- CIRCLE_WALLET_SET_ID saved to ${envPath}`);
}

main().catch((error) => {
  console.error("Failed to create Circle wallet set.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
