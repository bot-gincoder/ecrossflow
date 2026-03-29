import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/layout";
import { CheckCircle2, Loader2, Plus, Save, Trash2 } from "lucide-react";

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

type Scope = "deposit" | "withdraw";

const DEPOSIT_METHODS = ["MONCASH", "NATCASH", "CRYPTO", "CARD"];
const WITHDRAW_METHODS = ["MONCASH", "NATCASH", "CRYPTO"];

function methodLabel(method: string): string {
  if (method === "MONCASH") return "MonCash";
  if (method === "NATCASH") return "NatCash";
  if (method === "CRYPTO") return "Crypto";
  if (method === "CARD") return "Carte / Stripe Link";
  return method;
}

function toInt(value: string, min: number, max: number): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export default function AdminPaymentConfigPage() {
  const token = useMemo(() => localStorage.getItem("ecrossflow_token") || "", []);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/payment-config", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.message || "Chargement impossible");
        if (stop) return;
        setConfig(payload.config as PaymentConfig);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Erreur chargement");
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [token]);

  const patchMethod = (scope: Scope, method: string, patch: Partial<MethodCfg>) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const base = prev[scope]?.[method];
      if (!base) return prev;
      return {
        ...prev,
        [scope]: {
          ...prev[scope],
          [method]: {
            ...base,
            ...patch,
          },
        },
      };
    });
  };

  const patchProcessing = (scope: Scope, method: string, key: keyof Processing, raw: string) => {
    const max = key === "days" ? 365 : key === "hours" ? 23 : 59;
    const value = toInt(raw, 0, max);
    setConfig((prev) => {
      if (!prev) return prev;
      const base = prev[scope]?.[method];
      if (!base) return prev;
      return {
        ...prev,
        [scope]: {
          ...prev[scope],
          [method]: {
            ...base,
            processing: {
              ...base.processing,
              [key]: value,
            },
          },
        },
      };
    });
  };

  const patchAsset = (scope: Scope, method: string, index: number, key: keyof Asset, value: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const base = prev[scope]?.[method];
      if (!base) return prev;
      const assets = [...(base.assets || [])];
      if (!assets[index]) return prev;
      assets[index] = {
        ...assets[index],
        [key]: key === "address" ? value.trim() : value.trim().toUpperCase(),
      };
      return {
        ...prev,
        [scope]: {
          ...prev[scope],
          [method]: {
            ...base,
            assets,
          },
        },
      };
    });
  };

  const addAsset = (scope: Scope, method: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const base = prev[scope]?.[method];
      if (!base) return prev;
      return {
        ...prev,
        [scope]: {
          ...prev[scope],
          [method]: {
            ...base,
            assets: [...(base.assets || []), { symbol: "USDC", network: "POLYGON", address: "" }],
          },
        },
      };
    });
  };

  const removeAsset = (scope: Scope, method: string, index: number) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const base = prev[scope]?.[method];
      if (!base) return prev;
      const assets = [...(base.assets || [])];
      assets.splice(index, 1);
      return {
        ...prev,
        [scope]: {
          ...prev[scope],
          [method]: {
            ...base,
            assets,
          },
        },
      };
    });
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/payment-config", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.message || "Sauvegarde échouée");
      setConfig(payload.config as PaymentConfig);
      setSuccess("Configuration de paiement sauvegardée.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const renderMethod = (scope: Scope, method: string) => {
    if (!config) return null;
    const cfg = config[scope][method];
    if (!cfg) return null;

    return (
      <div key={`${scope}:${method}`} className="rounded-2xl border border-border bg-card/50 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold">{methodLabel(method)}</p>
            <p className="text-xs text-muted-foreground">{scope === "deposit" ? "Dépôt" : "Retrait"}</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => patchMethod(scope, method, { enabled: e.target.checked })}
            />
            {cfg.enabled ? "Activé" : "Désactivé"}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-xs text-muted-foreground">
            Jours
            <input
              type="number"
              value={cfg.processing.days}
              onChange={(e) => patchProcessing(scope, method, "days", e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Heures
            <input
              type="number"
              value={cfg.processing.hours}
              onChange={(e) => patchProcessing(scope, method, "hours", e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Minutes
            <input
              type="number"
              value={cfg.processing.minutes}
              onChange={(e) => patchProcessing(scope, method, "minutes", e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Secondes
            <input
              type="number"
              value={cfg.processing.seconds}
              onChange={(e) => patchProcessing(scope, method, "seconds", e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </label>
        </div>

        {(method === "MONCASH" || method === "NATCASH") && scope === "deposit" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Nom du compte
              <input
                type="text"
                value={cfg.accountName || ""}
                onChange={(e) => patchMethod(scope, method, { accountName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Numéro du compte
              <input
                type="text"
                value={cfg.accountNumber || ""}
                onChange={(e) => patchMethod(scope, method, { accountNumber: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              />
            </label>
          </div>
        )}

        {method === "CARD" && scope === "deposit" && (
          <label className="block text-xs text-muted-foreground">
            Lien de paiement carte (Stripe)
            <input
              type="url"
              value={cfg.paymentLink || ""}
              onChange={(e) => patchMethod(scope, method, { paymentLink: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="https://checkout.stripe.com/..."
            />
          </label>
        )}

        {(method === "MONCASH" || method === "NATCASH" || method === "CRYPTO") && scope === "deposit" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={Boolean(cfg.requireReference)}
                onChange={(e) => patchMethod(scope, method, { requireReference: e.target.checked })}
              />
              ID transaction requis
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={Boolean(cfg.requireScreenshot)}
                onChange={(e) => patchMethod(scope, method, { requireScreenshot: e.target.checked })}
              />
              Capture obligatoire
            </label>
          </div>
        )}

        {method === "CRYPTO" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Assets / Réseaux supportés</p>
              <button
                type="button"
                onClick={() => addAsset(scope, method)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            </div>
            <div className="space-y-2">
              {(cfg.assets || []).map((asset, index) => (
                <div key={`${scope}:${method}:asset:${index}`} className="grid grid-cols-1 gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-12">
                  <input
                    value={asset.symbol}
                    onChange={(e) => patchAsset(scope, method, index, "symbol", e.target.value)}
                    className="sm:col-span-2 rounded-lg border border-border bg-background px-2 py-2 text-xs"
                    placeholder="USDC"
                  />
                  <input
                    value={asset.network}
                    onChange={(e) => patchAsset(scope, method, index, "network", e.target.value)}
                    className="sm:col-span-3 rounded-lg border border-border bg-background px-2 py-2 text-xs"
                    placeholder="POLYGON"
                  />
                  <input
                    value={asset.address || ""}
                    onChange={(e) => patchAsset(scope, method, index, "address", e.target.value)}
                    className="sm:col-span-6 rounded-lg border border-border bg-background px-2 py-2 text-xs"
                    placeholder={scope === "deposit" ? "Adresse wallet de réception" : "(optionnel) adresse source"}
                  />
                  <button
                    type="button"
                    onClick={() => removeAsset(scope, method, index)}
                    className="sm:col-span-1 inline-flex items-center justify-center rounded-lg border border-red-500/30 text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout requireAdmin>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold">Payment Config</h1>
            <p className="text-sm text-muted-foreground">Gestion des méthodes dépôt/retrait, comptes, assets et temps de traitement.</p>
          </div>
          <button
            onClick={save}
            disabled={saving || loading || !config}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Sauvegarder
          </button>
        </motion.div>

        {loading && (
          <div className="rounded-2xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Chargement...
          </div>
        )}

        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        {success && (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            <CheckCircle2 className="mr-1 inline h-4 w-4" />
            {success}
          </div>
        )}

        {!loading && config && (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Méthodes de dépôt</h2>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {DEPOSIT_METHODS.map((method) => renderMethod("deposit", method))}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Méthodes de retrait</h2>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {WITHDRAW_METHODS.map((method) => renderMethod("withdraw", method))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
