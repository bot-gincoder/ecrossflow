import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/layout";
import { ArrowUpCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useAppStore } from "@/hooks/use-store";

type Processing = { days: number; hours: number; minutes: number; seconds: number };
type Asset = { symbol: string; network: string; address?: string };
type MethodCfg = {
  enabled: boolean;
  accountName?: string;
  accountNumber?: string;
  paymentLink?: string;
  requireReference?: boolean;
  requireScreenshot?: boolean;
  processing: Processing;
  assets?: Asset[];
};
type PaymentConfig = {
  deposit: Record<string, MethodCfg>;
  withdraw: Record<string, MethodCfg>;
};

function fmtTime(p?: Processing): string {
  if (!p) return "0j 0h 0m 0s";
  return `${p.days}j ${p.hours}h ${p.minutes}m ${p.seconds}s`;
}

export default function WithdrawPage() {
  const { t } = useAppStore();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState("MONCASH");
  const [amount, setAmount] = useState("3");
  const [currency, setCurrency] = useState("USD");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [cryptoAsset, setCryptoAsset] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const token = useMemo(() => localStorage.getItem("ecrossflow_token") || "", []);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/wallet/payment-config", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.message || t("withdraw.error_load_config"));
        if (stop) return;
        const nextConfig = payload.config as PaymentConfig;
        setConfig(nextConfig);
        const enabled = Object.entries(nextConfig.withdraw).filter(([, cfg]) => cfg.enabled).map(([k]) => k);
        if (enabled.length) {
          setMethod(enabled[0] || "MONCASH");
          const firstCrypto = nextConfig.withdraw.CRYPTO?.assets?.[0];
          if (firstCrypto) setCryptoAsset(`${firstCrypto.symbol}_${firstCrypto.network}`);
        }
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : t("withdraw.error_loading"));
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [token]);

  const methods = Object.entries(config?.withdraw || {}).filter(([, cfg]) => cfg.enabled);
  const activeCfg = config?.withdraw?.[method];
  const cryptoAssets = activeCfg?.assets || [];

  const submitWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const amountNum = Number.parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError(t("withdraw.error_invalid_amount"));
      return;
    }

    if (method === "MONCASH" || method === "NATCASH") {
      if (!recipientName.trim() || !recipientPhone.trim()) {
        setError(t("withdraw.error_recipient_required"));
        return;
      }
    }

    if (method === "CRYPTO") {
      if (!destinationAddress.trim()) {
        setError(t("withdraw.error_destination_required"));
        return;
      }
      if (!cryptoAsset) {
        setError(t("withdraw.error_crypto_required"));
        return;
      }
    }

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        amount: amountNum,
        currency,
        paymentMethod: method,
      };
      if (method === "CRYPTO") {
        payload.cryptoAsset = cryptoAsset;
        payload.destinationAddress = destinationAddress.trim();
      } else {
        payload.recipientName = recipientName.trim();
        payload.recipientPhone = recipientPhone.trim();
        payload.destination = `${recipientName.trim()} (${recipientPhone.trim()})`;
      }

      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = await res.json();
      if (!res.ok) throw new Error(responsePayload?.message || t("withdraw.error_rejected"));

      setSuccess(t("withdraw.success_submitted"));
      setRecipientName("");
      setRecipientPhone("");
      setDestinationAddress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("withdraw.error_generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-bold">{t("withdraw.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("withdraw.subtitle")}</p>
        </motion.div>

        {loading && (
          <div className="rounded-2xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        )}

        {!loading && (
          <form onSubmit={submitWithdraw} className="rounded-3xl border border-border bg-card/50 p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {methods.map(([key]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMethod(key)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    method === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(`withdraw.method.${key.toLowerCase()}`)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("wallet.amount")}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("wallet.currency")}</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                >
                  <option value="USD">USD</option>
                  <option value="HTG">HTG</option>
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/40 p-4 text-sm">
              <p className="font-semibold mb-1">{t("withdraw.processing_title")}</p>
              <p className="text-muted-foreground">{fmtTime(activeCfg?.processing)}</p>
            </div>

            {(method === "MONCASH" || method === "NATCASH") && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("withdraw.recipient_name")}</label>
                  <input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                    placeholder={t("withdraw.recipient_name_placeholder")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("withdraw.recipient_phone")}</label>
                  <input
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                    placeholder={t("withdraw.recipient_phone_placeholder")}
                  />
                </div>
              </div>
            )}

            {method === "CRYPTO" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("withdraw.crypto_network")}</label>
                  <select
                    value={cryptoAsset}
                    onChange={(e) => setCryptoAsset(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  >
                    {cryptoAssets.map((a) => {
                      const key = `${a.symbol}_${a.network}`;
                      return <option key={key} value={key}>{a.symbol} ({a.network})</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("withdraw.destination_address")}</label>
                  <input
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                    placeholder={t("withdraw.destination_placeholder")}
                  />
                </div>
              </div>
            )}

            {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
            {success && (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
              {t("withdraw.submit")}
            </button>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
