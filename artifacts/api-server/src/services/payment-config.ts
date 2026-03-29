export type ProcessingTime = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export type CryptoAssetConfig = {
  symbol: string;
  network: string;
  address?: string;
};

export type PaymentMethodConfig = {
  enabled: boolean;
  accountName?: string;
  accountNumber?: string;
  paymentLink?: string;
  requireReference?: boolean;
  requireScreenshot?: boolean;
  processing: ProcessingTime;
  assets?: CryptoAssetConfig[];
};

export type PaymentRuntimeConfig = {
  deposit: Record<string, PaymentMethodConfig>;
  withdraw: Record<string, PaymentMethodConfig>;
};

const BASE_TIME: ProcessingTime = { days: 0, hours: 0, minutes: 30, seconds: 0 };
const WITHDRAW_TIME: ProcessingTime = { days: 0, hours: 4, minutes: 0, seconds: 0 };

export const PAYMENT_RUNTIME_DEFAULTS: PaymentRuntimeConfig = {
  deposit: {
    MONCASH: {
      enabled: true,
      accountName: "Ecrossflow",
      accountNumber: "+509 3777-8888",
      requireReference: true,
      requireScreenshot: true,
      processing: { ...BASE_TIME },
    },
    NATCASH: {
      enabled: true,
      accountName: "Ecrossflow",
      accountNumber: "+509 2222-9999",
      requireReference: true,
      requireScreenshot: true,
      processing: { ...BASE_TIME },
    },
    CRYPTO: {
      enabled: true,
      requireReference: true,
      requireScreenshot: true,
      processing: { ...BASE_TIME },
      assets: [
        { symbol: "USDC", network: "POLYGON", address: "" },
      ],
    },
    CARD: {
      enabled: true,
      paymentLink: "",
      requireReference: false,
      requireScreenshot: false,
      processing: { ...BASE_TIME },
    },
  },
  withdraw: {
    MONCASH: {
      enabled: true,
      processing: { ...WITHDRAW_TIME },
    },
    NATCASH: {
      enabled: true,
      processing: { ...WITHDRAW_TIME },
    },
    CRYPTO: {
      enabled: true,
      processing: { ...WITHDRAW_TIME },
      assets: [
        { symbol: "USDC", network: "POLYGON" },
      ],
    },
  },
};

function sanitizeNumber(value: unknown, min: number, max: number): number {
  const n = Number.parseInt(String(value ?? "0"), 10);
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function sanitizeTime(value: unknown, fallback: ProcessingTime): ProcessingTime {
  if (!value || typeof value !== "object") return { ...fallback };
  const row = value as Record<string, unknown>;
  return {
    days: sanitizeNumber(row.days, 0, 365),
    hours: sanitizeNumber(row.hours, 0, 23),
    minutes: sanitizeNumber(row.minutes, 0, 59),
    seconds: sanitizeNumber(row.seconds, 0, 59),
  };
}

function sanitizeAssets(value: unknown, fallback: CryptoAssetConfig[] = []): CryptoAssetConfig[] {
  if (!Array.isArray(value)) return [...fallback];
  const out = value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const symbol = String(item.symbol || "").trim().toUpperCase();
      const network = String(item.network || "").trim().toUpperCase();
      const address = String(item.address || "").trim();
      if (!symbol || !network) return null;
      return { symbol, network, ...(address ? { address } : {}) };
    })
    .filter((x): x is CryptoAssetConfig => Boolean(x));
  return out.length ? out : [...fallback];
}

function mergeMethod(base: PaymentMethodConfig, incoming: unknown): PaymentMethodConfig {
  if (!incoming || typeof incoming !== "object") {
    return {
      ...base,
      processing: { ...base.processing },
      assets: base.assets ? [...base.assets] : undefined,
    };
  }
  const row = incoming as Record<string, unknown>;
  return {
    ...base,
    enabled: typeof row.enabled === "boolean" ? row.enabled : base.enabled,
    accountName: typeof row.accountName === "string" ? row.accountName.trim() : base.accountName,
    accountNumber: typeof row.accountNumber === "string" ? row.accountNumber.trim() : base.accountNumber,
    paymentLink: typeof row.paymentLink === "string" ? row.paymentLink.trim() : base.paymentLink,
    requireReference: typeof row.requireReference === "boolean" ? row.requireReference : base.requireReference,
    requireScreenshot: typeof row.requireScreenshot === "boolean" ? row.requireScreenshot : base.requireScreenshot,
    processing: sanitizeTime(row.processing, base.processing),
    assets: sanitizeAssets(row.assets, base.assets || []),
  };
}

export function normalizePaymentRuntimeConfig(raw: unknown): PaymentRuntimeConfig {
  if (!raw || typeof raw !== "object") return structuredClone(PAYMENT_RUNTIME_DEFAULTS);
  const obj = raw as Record<string, unknown>;
  const depositRaw = (obj.deposit && typeof obj.deposit === "object") ? obj.deposit as Record<string, unknown> : {};
  const withdrawRaw = (obj.withdraw && typeof obj.withdraw === "object") ? obj.withdraw as Record<string, unknown> : {};

  const deposit = Object.entries(PAYMENT_RUNTIME_DEFAULTS.deposit).reduce<Record<string, PaymentMethodConfig>>((acc, [method, base]) => {
    acc[method] = mergeMethod(base, depositRaw[method]);
    return acc;
  }, {});

  const withdraw = Object.entries(PAYMENT_RUNTIME_DEFAULTS.withdraw).reduce<Record<string, PaymentMethodConfig>>((acc, [method, base]) => {
    acc[method] = mergeMethod(base, withdrawRaw[method]);
    return acc;
  }, {});

  return { deposit, withdraw };
}

export function enabledDepositMethods(config: PaymentRuntimeConfig): string[] {
  return Object.entries(config.deposit)
    .filter(([, cfg]) => cfg.enabled)
    .map(([name]) => name.toUpperCase());
}

export function enabledWithdrawMethods(config: PaymentRuntimeConfig): string[] {
  return Object.entries(config.withdraw)
    .filter(([, cfg]) => cfg.enabled)
    .map(([name]) => name.toUpperCase());
}
