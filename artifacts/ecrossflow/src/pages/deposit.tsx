import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/layout";
import { ArrowDownCircle, CheckCircle2, Copy, Loader2, Upload } from "lucide-react";
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

async function imageFileToCompressedDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const maxWidth = 1400;
  const scale = bmp.width > maxWidth ? maxWidth / bmp.width : 1;
  const width = Math.max(1, Math.round(bmp.width * scale));
  const height = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Impossible de traiter l'image.");
  }
  ctx.drawImage(bmp, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

export default function DepositPage() {
  const { t } = useAppStore();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState("MONCASH");
  const [amount, setAmount] = useState("2");
  const [currency, setCurrency] = useState("USD");
  const [reference, setReference] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceFileName, setEvidenceFileName] = useState("");
  const [cryptoAsset, setCryptoAsset] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedKey, setCopiedKey] = useState("");

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
        if (!res.ok) throw new Error(payload?.message || t("deposit.error_load_config"));
        if (stop) return;
        setConfig(payload.config as PaymentConfig);
        const enabled = Object.entries((payload.config as PaymentConfig).deposit)
          .filter(([, cfg]) => cfg.enabled)
          .map(([k]) => k);
        if (enabled.length) {
          setMethod(enabled[0] || "MONCASH");
          const firstCrypto = (payload.config as PaymentConfig).deposit.CRYPTO?.assets?.[0];
          if (firstCrypto) setCryptoAsset(`${firstCrypto.symbol}_${firstCrypto.network}`);
        }
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : t("deposit.error_loading"));
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [token]);

  const methods = Object.entries(config?.deposit || {}).filter(([, cfg]) => cfg.enabled);
  const activeCfg = config?.deposit?.[method];
  const cryptoAssets = activeCfg?.assets || [];

  useEffect(() => {
    if (method === "CRYPTO") {
      setCurrency("USD");
    }
  }, [method]);

  const copyValue = async (value: string, key: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 1200);
    } catch {
      setCopiedKey("");
    }
  };

  const onUpload = async (file?: File) => {
    if (!file) return;
    setEvidenceFileName(file.name);
    try {
      const compressed = await imageFileToCompressedDataUrl(file);
      setEvidenceUrl(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => setEvidenceUrl(String(ev.target?.result || ""));
      reader.readAsDataURL(file);
    }
  };

  const submitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const amountNum = Number.parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError(t("deposit.error_invalid_amount"));
      return;
    }
    if (amountNum < 2) {
      setError(t("deposit.error_min_amount"));
      return;
    }
    if (method !== "CARD" && activeCfg?.requireReference && !reference.trim()) {
      setError(t("deposit.error_reference_required"));
      return;
    }
    if (method !== "CARD" && activeCfg?.requireScreenshot && !evidenceUrl) {
      setError(t("deposit.error_receipt_required"));
      return;
    }
    if (method === "CARD") return;

    setBusy(true);
    try {
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountNum,
          currency,
          paymentMethod: method,
          reference: reference.trim() || undefined,
          evidenceUrl: evidenceUrl || undefined,
          ...(method === "CRYPTO" ? { cryptoAsset } : {}),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.message || t("deposit.error_rejected"));
      setSuccess(t("deposit.success_submitted"));
      setReference("");
      setEvidenceUrl("");
      setEvidenceFileName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deposit.error_generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-bold">{t("deposit.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("deposit.subtitle")}</p>
        </motion.div>

        {loading && (
          <div className="rounded-2xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        )}

        {!loading && (
          <form onSubmit={submitDeposit} className="rounded-3xl border border-border bg-card/50 p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {methods.map(([key]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMethod(key)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    method === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(`deposit.method.${key.toLowerCase()}`)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("wallet.amount")}</label>
                <input
                  type="number"
                  step="0.01"
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
                  disabled={method === "CRYPTO"}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                >
                  <option value="USD">USD</option>
                  {method !== "CRYPTO" && <option value="HTG">HTG</option>}
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/40 p-4 text-sm">
              <p className="font-semibold mb-2">{t("deposit.instructions")} {t(`deposit.method.${method.toLowerCase()}`)}</p>
              <p className="text-muted-foreground mb-2">
                {t("deposit.processing_eta")}: <span className="text-foreground">{fmtTime(activeCfg?.processing)}</span>
              </p>
              {method === "MONCASH" || method === "NATCASH" ? (
                <div className="space-y-1 text-sm">
                  <p className="mb-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    {t("deposit.mobile_money_hint").replace("{method}", method === "MONCASH" ? "MonCash" : "NatCash")}
                  </p>
                  <p>{t("deposit.account_name")}: <span className="font-medium">{activeCfg?.accountName || "-"}</span></p>
                  <div className="flex items-center gap-2">
                    <p>{t("deposit.account_number")}: <span className="font-mono">{activeCfg?.accountNumber || "-"}</span></p>
                    {activeCfg?.accountNumber ? (
                      <button
                        type="button"
                        onClick={() => copyValue(String(activeCfg.accountNumber || ""), `${method}:number`)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-foreground hover:border-primary/50"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedKey === `${method}:number` ? t("referrals.copied") : t("referrals.copy_code")}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {method === "CRYPTO" ? (
                <div className="space-y-2">
                  <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    {t("deposit.crypto_warning")}
                  </p>
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
                  {cryptoAssets.find((a) => `${a.symbol}_${a.network}` === cryptoAsset)?.address && (
                    <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
                      <p className="text-xs text-muted-foreground">{t("deposit.address")}</p>
                      <div className="mt-1 flex items-start gap-2">
                        <p className="break-all font-mono text-xs">
                          {cryptoAssets.find((a) => `${a.symbol}_${a.network}` === cryptoAsset)?.address}
                        </p>
                        <button
                          type="button"
                          onClick={() => copyValue(String(cryptoAssets.find((a) => `${a.symbol}_${a.network}` === cryptoAsset)?.address || ""), `${method}:address`)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-foreground hover:border-primary/50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedKey === `${method}:address` ? t("referrals.copied") : t("referrals.copy_link")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              {method === "CARD" ? (
                <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
                  <p className="text-base font-semibold mb-1">{t("deposit.card_title")}</p>
                  <p className="text-sm text-muted-foreground mb-2">{t("deposit.card_text")}</p>
                  {activeCfg?.paymentLink ? (
                    <a
                      href={activeCfg.paymentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-4 py-2 text-sm font-semibold text-black"
                    >
                      {t("deposit.card_button")}
                    </a>
                  ) : (
                    <p className="text-xs text-yellow-300">{t("deposit.card_link_missing")}</p>
                  )}
                </div>
              ) : null}
            </div>

            {method !== "CARD" && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("deposit.reference_label")}</label>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={t("deposit.reference_placeholder")}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("deposit.receipt_label")}</label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-background px-3 py-3 text-sm">
                    <Upload className="h-4 w-4" />
                    {evidenceFileName || t("deposit.upload_receipt")}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
                  </label>
                </div>
              </>
            )}

            {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
            {success && (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
                {success}
              </div>
            )}

            {method !== "CARD" && (
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownCircle className="h-4 w-4" />}
                {t("deposit.submit")}
              </button>
            )}
          </form>
        )}
      </div>
    </AppLayout>
  );
}
