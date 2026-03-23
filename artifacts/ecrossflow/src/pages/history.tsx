import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { History, ArrowDownCircle, ArrowUpCircle, Zap, Award, Filter, RefreshCcw, LucideIcon } from 'lucide-react';
import { useGetTransactions } from '@workspace/api-client-react';
import type { Transaction } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';

const TYPE_ICONS: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  DEPOSIT: { icon: ArrowDownCircle, label: 'Dépôt', color: 'text-emerald-400' },
  WITHDRAWAL: { icon: ArrowUpCircle, label: 'Retrait', color: 'text-red-400' },
  BOARD_PAYMENT: { icon: Zap, label: 'Paiement Board', color: 'text-yellow-400' },
  BOARD_RECEIPT: { icon: Award, label: 'Gain Board', color: 'text-primary' },
  REFERRAL_BONUS: { icon: Award, label: 'Bonus Parrainage', color: 'text-violet-400' },
  SYSTEM_FEE: { icon: Filter, label: 'Frais Système', color: 'text-muted-foreground' },
};

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-primary/10 text-primary',
  PENDING: 'bg-yellow-500/10 text-yellow-400',
  PROCESSING: 'bg-blue-500/10 text-blue-400',
  CANCELLED: 'bg-red-500/10 text-red-400',
};

export default function HistoryPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGetTransactions({
    type: typeFilter || undefined,
    page,
    limit: 20,
  });

  const transactions = data?.transactions || [];
  const totalPages = data?.totalPages || 1;

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-bold">Historique</h1>
          <p className="text-muted-foreground mt-1">Toutes vos transactions</p>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setTypeFilter(''); setPage(1); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${!typeFilter ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-muted'}`}
          >
            Toutes
          </button>
          {Object.entries(TYPE_ICONS).map(([type, { label }]) => (
            <button
              key={type}
              onClick={() => { setTypeFilter(type); setPage(1); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${typeFilter === type ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Transactions List */}
        <div className="space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <RefreshCcw className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
          {!isLoading && transactions.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucune transaction trouvée</p>
            </div>
          )}
          {transactions.map((tx: Transaction, idx: number) => {
            const typeInfo = TYPE_ICONS[tx.type] || { icon: Filter, label: tx.type, color: 'text-muted-foreground' };
            const Icon = typeInfo.icon;
            const isIncoming = ['DEPOSIT', 'BOARD_RECEIPT', 'REFERRAL_BONUS'].includes(tx.type);

            return (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="flex items-center justify-between bg-card/50 border border-border/50 rounded-2xl px-5 py-4 hover:bg-card transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-muted/50 ${typeInfo.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">{typeInfo.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleString()} · {tx.paymentMethod || 'SYSTEM'}
                      {tx.fromBoard && ` · Board ${tx.fromBoard}`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold font-display ${isIncoming ? 'text-primary' : 'text-red-400'}`}>
                    {isIncoming ? '+' : '-'}${tx.amountUsd?.toFixed(2)}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[tx.status] || 'bg-muted text-muted-foreground'}`}>
                    {tx.status}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 pt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl bg-card border border-border disabled:opacity-40"
            >
              ← Précédent
            </button>
            <span className="px-4 py-2 text-sm text-muted-foreground">Page {page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-xl bg-card border border-border disabled:opacity-40"
            >
              Suivant →
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
