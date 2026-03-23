import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { History, ArrowDownCircle, ArrowUpCircle, Zap, Award, Filter, RefreshCcw, Download, Calendar, LucideIcon } from 'lucide-react';
import { useGetTransactions } from '@workspace/api-client-react';
import type { Transaction } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { Link } from 'wouter';

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

function exportToCSV(transactions: Transaction[]) {
  const headers = ['Date', 'Type', 'Montant', 'Devise', 'Montant USD', 'Statut', 'Méthode', 'Board', 'Description'];
  const rows = transactions.map((tx: Transaction) => [
    new Date(tx.createdAt).toLocaleString(),
    tx.type,
    tx.amount,
    tx.currency,
    tx.amountUsd,
    tx.status,
    tx.paymentMethod || 'SYSTEM',
    tx.fromBoard || '',
    tx.description || '',
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ecrossflow-historique-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAYMENT_METHODS = [
  { value: 'MONCASH', label: 'MonCash' },
  { value: 'NATCASH', label: 'NatCash' },
  { value: 'CARD', label: 'Carte' },
  { value: 'BANK_TRANSFER', label: 'Virement' },
  { value: 'CRYPTO', label: 'Crypto' },
  { value: 'PAYPAL', label: 'PayPal' },
  { value: 'SYSTEM', label: 'Système' },
];

export default function HistoryPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGetTransactions({
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    paymentMethod: paymentMethodFilter || undefined,
    amountMin: amountMin ? parseFloat(amountMin) : undefined,
    amountMax: amountMax ? parseFloat(amountMax) : undefined,
    page,
    limit: 20,
  });

  const { data: allData } = useGetTransactions({
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    paymentMethod: paymentMethodFilter || undefined,
    amountMin: amountMin ? parseFloat(amountMin) : undefined,
    amountMax: amountMax ? parseFloat(amountMax) : undefined,
    page: 1,
    limit: 1000,
  });

  const transactions = data?.transactions || [];
  const allTransactions = allData?.transactions || [];
  const totalPages = data?.totalPages || 1;

  const hasFilters = typeFilter || statusFilter || dateFrom || dateTo || paymentMethodFilter || amountMin || amountMax;

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Historique</h1>
            <p className="text-muted-foreground mt-1">Toutes vos transactions</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/history/report">
              <a className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border hover:bg-muted text-sm font-medium transition-colors">
                📊 Rapport
              </a>
            </Link>
            <button
              onClick={() => exportToCSV(allTransactions)}
              disabled={allTransactions.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 text-sm font-medium transition-colors disabled:opacity-40"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </motion.div>

        {/* Type Filters */}
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
              onClick={() => { setTypeFilter(typeFilter === type ? '' : type); setPage(1); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${typeFilter === type ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-muted'}`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${showFilters || hasFilters ? 'bg-primary/10 border-primary/20 text-primary border' : 'bg-card border border-border hover:bg-muted'}`}
          >
            <Filter className="w-4 h-4" /> Filtres
            {hasFilters && <span className="w-2 h-2 bg-primary rounded-full" />}
          </button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="bg-card/40 border border-border rounded-2xl p-4 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Statut</label>
                <select
                  value={statusFilter}
                  onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Tous</option>
                  <option value="COMPLETED">Complété</option>
                  <option value="PENDING">En attente</option>
                  <option value="PROCESSING">En traitement</option>
                  <option value="CANCELLED">Annulé</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Méthode de paiement</label>
                <select
                  value={paymentMethodFilter}
                  onChange={e => { setPaymentMethodFilter(e.target.value); setPage(1); }}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Toutes</option>
                  {PAYMENT_METHODS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  <Calendar className="inline w-3 h-3 mr-1" /> Date début
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  <Calendar className="inline w-3 h-3 mr-1" /> Date fin
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setPage(1); }}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Montant min (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountMin}
                  onChange={e => { setAmountMin(e.target.value); setPage(1); }}
                  placeholder="0.00"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Montant max (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountMax}
                  onChange={e => { setAmountMax(e.target.value); setPage(1); }}
                  placeholder="999999"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => { setTypeFilter(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setPaymentMethodFilter(''); setAmountMin(''); setAmountMax(''); setPage(1); }}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
              >
                Réinitialiser les filtres
              </button>
            </div>
          </motion.div>
        )}

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
              {hasFilters && <p className="text-sm mt-1">Essayez de modifier vos filtres</p>}
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
                      {new Date(tx.createdAt).toLocaleString('fr-FR')} · {tx.paymentMethod || 'SYSTEM'}
                      {tx.fromBoard && ` · Board ${tx.fromBoard}`}
                    </p>
                    {tx.description && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 max-w-xs truncate">{tx.description}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold font-display ${isIncoming ? 'text-primary' : 'text-red-400'}`}>
                    {isIncoming ? '+' : '-'}${typeof tx.amountUsd === 'number' ? tx.amountUsd.toFixed(2) : tx.amountUsd}
                  </p>
                  {tx.currency !== 'USD' && (
                    <p className="text-xs text-muted-foreground">{typeof tx.amount === 'number' ? tx.amount.toFixed(2) : tx.amount} {tx.currency}</p>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[tx.status] || 'bg-muted text-muted-foreground'}`}>
                    {tx.status === 'COMPLETED' ? 'Complété' : tx.status === 'PENDING' ? 'En attente' : tx.status === 'PROCESSING' ? 'En traitement' : tx.status}
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
              className="px-4 py-2 rounded-xl bg-card border border-border disabled:opacity-40 hover:bg-muted transition-colors"
            >
              ← Précédent
            </button>
            <span className="px-4 py-2 text-sm text-muted-foreground">Page {page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-xl bg-card border border-border disabled:opacity-40 hover:bg-muted transition-colors"
            >
              Suivant →
            </button>
          </div>
        )}

        {/* Link to Report (mobile) */}
        <div className="sm:hidden">
          <Link href="/history/report">
            <a className="flex items-center justify-center gap-2 py-3 rounded-xl bg-card border border-border text-sm font-medium hover:bg-muted transition-colors">
              📊 Voir le rapport détaillé
            </a>
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
