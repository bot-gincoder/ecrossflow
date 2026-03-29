import React from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Wallet, ArrowDownCircle, ArrowUpCircle, DollarSign, Clock, Shield } from "lucide-react";
import { useGetWallet } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { useAppStore } from "@/hooks/use-store";

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: React.ElementType;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-2 text-2xl font-display font-bold">${value.toFixed(2)}</p>
    </div>
  );
}

export default function WalletPage() {
  const { t } = useAppStore();
  const { data: wallet } = useGetWallet();
  const available = Number(wallet?.balanceUsd || 0);
  const pending = Number(wallet?.balancePending || 0);
  const blocked = Number(wallet?.balanceReserved || 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-bold">{t("wallet.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("wallet.subtitle")}</p>
        </motion.div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard label={t("wallet.available")} value={available} tone="text-primary border-primary/30 bg-primary/10" icon={Wallet} />
          <StatCard label={t("wallet.pending")} value={pending} tone="text-yellow-300 border-yellow-500/30 bg-yellow-500/10" icon={Clock} />
          <StatCard label={t("wallet.blocked")} value={blocked} tone="text-violet-300 border-violet-500/30 bg-violet-500/10" icon={DollarSign} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link href="/deposit" className="group rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 to-primary/5 p-6 transition hover:border-primary/60">
            <div className="mb-4 inline-flex rounded-2xl border border-primary/30 bg-primary/15 p-3 text-primary">
              <ArrowDownCircle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-display font-bold">{t("wallet.deposit_now")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("wallet.deposit_desc")}
            </p>
            <p className="mt-4 text-sm font-semibold text-primary group-hover:translate-x-0.5 transition">{t("wallet.open_deposit")}</p>
          </Link>

          <Link href="/withdraw" className="group rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-6 transition hover:border-cyan-300/70">
            <div className="mb-4 inline-flex rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-3 text-cyan-300">
              <ArrowUpCircle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-display font-bold">{t("wallet.withdraw_fast")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("wallet.withdraw_desc")}
            </p>
            <p className="mt-4 text-sm font-semibold text-cyan-300 group-hover:translate-x-0.5 transition">{t("wallet.withdraw_now")}</p>
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-card/50 p-4 text-sm text-muted-foreground">
          <div className="mb-1 flex items-center gap-2 text-foreground">
            <Shield className="h-4 w-4 text-primary" />
            {t("wallet.security_title")}
          </div>
          {t("wallet.security_desc")}
        </div>
      </div>
    </AppLayout>
  );
}
