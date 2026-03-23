import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Award, Zap, Users, CheckCircle2, Circle } from 'lucide-react';
import { useGetTransactionReport, useGetTransactions } from '@workspace/api-client-react';
import type { Transaction, FinancialReportBoardProgressItem } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { Link } from 'wouter';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const DONUT_COLORS = ['#00FFB2', '#D4AF37', '#ef4444', '#8b5cf6', '#f59e0b', '#06b6d4'];

function StatCard({ label, value, icon: Icon, color, delta }: {
  label: string; value: string; icon: React.ElementType; color: string; delta?: string
}) {
  return (
    <div className={`bg-card/50 border border-border rounded-2xl p-5`}>
      <Icon className={`w-5 h-5 mb-3 ${color}`} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-display font-bold mt-1 ${color}`}>{value}</p>
      {delta && <p className="text-xs text-muted-foreground mt-1">{delta}</p>}
    </div>
  );
}

function buildBalanceSeries(transactions: Transaction[]) {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  let balance = 0;
  const series: { date: string; solde: number }[] = [];
  const seen = new Set<string>();

  for (const tx of sorted) {
    const date = new Date(tx.createdAt).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
    const isIncoming = ['DEPOSIT', 'BOARD_RECEIPT', 'REFERRAL_BONUS'].includes(tx.type);
    balance += isIncoming ? (tx.amountUsd as number) : -(tx.amountUsd as number);
    const key = date;
    const existing = series.find(s => s.date === key);
    if (existing) {
      existing.solde = parseFloat(balance.toFixed(2));
    } else {
      series.push({ date, solde: parseFloat(balance.toFixed(2)) });
    }
  }
  return series;
}

function buildMonthlyBars(transactions: Transaction[]) {
  const map: Record<string, { entrées: number; sorties: number }> = {};

  for (const tx of transactions) {
    const month = new Date(tx.createdAt).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    if (!map[month]) map[month] = { entrées: 0, sorties: 0 };
    const isIncoming = ['DEPOSIT', 'BOARD_RECEIPT', 'REFERRAL_BONUS'].includes(tx.type);
    if (isIncoming) map[month].entrées += tx.amountUsd as number;
    else map[month].sorties += tx.amountUsd as number;
  }

  return Object.entries(map).map(([name, vals]) => ({
    name,
    entrées: parseFloat(vals.entrées.toFixed(2)),
    sorties: parseFloat(vals.sorties.toFixed(2)),
  }));
}

function buildDonut(report: { totalDeposited: number; totalReceived: number; totalPaid: number; totalWithdrawn: number; systemFees: number; referralBonuses: number }) {
  return [
    { name: 'Dépôts', value: report.totalDeposited },
    { name: 'Gains Boards', value: report.totalReceived },
    { name: 'Paiements Boards', value: report.totalPaid },
    { name: 'Retraits', value: report.totalWithdrawn },
    { name: 'Frais', value: report.systemFees },
    { name: 'Bonus Parrainage', value: report.referralBonuses },
  ].filter(d => d.value > 0);
}

export default function HistoryReport() {
  const { data: report } = useGetTransactionReport();
  const { data: txData } = useGetTransactions({ limit: 500, page: 1 });

  const allTxs = txData?.transactions || [];
  const balanceSeries = buildBalanceSeries(allTxs);
  const monthlyBars = buildMonthlyBars(allTxs);
  const donutData = report ? buildDonut(report) : [];

  return (
    <AppLayout>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
          <Link href="/history">
            <a className="p-2 rounded-xl hover:bg-muted/40 transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </a>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold">Rapport Financier</h1>
            <p className="text-muted-foreground mt-1">Résumé complet de votre activité</p>
          </div>
        </motion.div>

        {/* Summary Stats */}
        {report && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Total Déposé" value={`$${report.totalDeposited.toFixed(2)}`} icon={TrendingUp} color="text-emerald-400" />
            <StatCard label="Total Retiré" value={`$${report.totalWithdrawn.toFixed(2)}`} icon={TrendingDown} color="text-red-400" />
            <StatCard label="Gains Boards" value={`$${report.totalReceived.toFixed(2)}`} icon={Award} color="text-primary" />
            <StatCard label="Paiements Boards" value={`$${report.totalPaid.toFixed(2)}`} icon={Zap} color="text-yellow-400" />
            <StatCard label="Bonus Parrainage" value={`$${report.referralBonuses.toFixed(2)}`} icon={Users} color="text-violet-400" />
            <StatCard
              label="Profit Net"
              value={`$${report.netProfit.toFixed(2)}`}
              icon={DollarSign}
              color={report.netProfit >= 0 ? 'text-primary' : 'text-red-400'}
              delta={report.netProfit >= 0 ? '✓ Bénéficiaire' : '↓ En déficit'}
            />
          </div>
        )}

        {/* Balance Line Chart */}
        {balanceSeries.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card/40 border border-border rounded-2xl p-6"
          >
            <h2 className="text-lg font-display font-bold mb-4">Évolution du Solde</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={balanceSeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }}
                  formatter={(v: number) => [`$${v.toFixed(2)}`, 'Solde']}
                />
                <Line type="monotone" dataKey="solde" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Monthly Bars */}
        {monthlyBars.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-card/40 border border-border rounded-2xl p-6"
          >
            <h2 className="text-lg font-display font-bold mb-4">Entrées / Sorties par Mois</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyBars} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }}
                  formatter={(v: number) => `$${v.toFixed(2)}`}
                />
                <Legend />
                <Bar dataKey="entrées" fill="#00FFB2" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sorties" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Donut Distribution */}
        {donutData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-card/40 border border-border rounded-2xl p-6"
          >
            <h2 className="text-lg font-display font-bold mb-4">Répartition des Transactions</h2>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <ResponsiveContainer width={220} height={220}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }}
                    formatter={(v: number) => `$${v.toFixed(2)}`}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {donutData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="text-sm">{entry.name}</span>
                    </div>
                    <span className="font-bold font-display text-sm">${entry.value.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Board Progression */}
        {report && report.boardProgress && report.boardProgress.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-card/40 border border-border rounded-2xl p-6"
          >
            <h2 className="text-lg font-display font-bold mb-4">Progression dans les Boards</h2>
            <div className="space-y-3">
              {(report.boardProgress as FinancialReportBoardProgressItem[]).map((bp, i) => {
                const BOARD_COLORS_PROG: Record<string, string> = {
                  F: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
                  E: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
                  D: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
                  C: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
                  B: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
                  A: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                  S: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
                };
                const colorClass = BOARD_COLORS_PROG[bp.boardId] || 'text-primary bg-primary/10 border-primary/20';
                const isActive = bp.hasParticipated;
                const isCompleted = bp.completedParticipations > 0;
                return (
                  <div key={bp.boardId + i} className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${isActive ? colorClass : 'bg-muted/10 border-border text-muted-foreground'}`}>
                    <div className="flex items-center gap-2 w-16">
                      {isCompleted ? (
                        <CheckCircle2 className={`w-5 h-5 ${isActive ? '' : 'text-muted-foreground'}`} />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span className="font-display font-bold text-base">{bp.boardId}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span>Entrée : <strong>${bp.entryFee.toFixed(0)}</strong></span>
                        <span className="text-muted-foreground">·</span>
                        <span>Gain : <strong>${bp.withdrawable.toFixed(0)}</strong></span>
                      </div>
                      {isActive && (
                        <div className="text-xs mt-0.5 text-muted-foreground">
                          {bp.totalParticipations} participation{bp.totalParticipations > 1 ? 's' : ''} · {bp.completedParticipations} complétées · ${bp.totalAmountPaid} payés
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${isCompleted ? 'bg-emerald-500/20 text-emerald-400' : isActive ? 'bg-yellow-500/20 text-yellow-400' : 'bg-muted/20 text-muted-foreground'}`}>
                        {isCompleted ? 'Complété' : isActive ? 'Actif' : 'Non rejoint'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {allTxs.length === 0 && !report && (
          <div className="text-center py-16 text-muted-foreground">
            <p>Aucune donnée disponible pour le rapport</p>
            <p className="text-sm mt-1">Effectuez des transactions pour voir vos statistiques</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
